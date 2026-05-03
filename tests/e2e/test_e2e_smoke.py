"""End-to-end smoke test.

Boots a real uvicorn server with MT_TEST_MODE=1 (swaps Capturer for a
replay-from-file FakeCapturer), connects a real WebSocket client, verifies
the full pipeline: start -> packet events -> expire events -> stop.

Skipped if the geo DB is missing (download takes ~50 MB).
"""
from __future__ import annotations

import json
import os
import socket
import subprocess
import sys
import time
from pathlib import Path

import httpx
import pytest

ROOT = Path(__file__).resolve().parents[2]
GEO_DB = ROOT / "data" / "dbip-city-lite.mmdb"
PACKETS = ROOT / "tests" / "fixtures" / "packets.jsonl"


pytestmark = pytest.mark.skipif(
    not GEO_DB.exists(),
    reason="geo DB missing — run ./run.sh once to download, then re-run e2e",
)


def _free_port() -> int:
    s = socket.socket()
    s.bind(("127.0.0.1", 0))
    port = s.getsockname()[1]
    s.close()
    return port


@pytest.fixture
def server():
    port = _free_port()
    env = {
        **os.environ,
        "MT_TEST_MODE": "1",
        "MT_TEST_PACKETS": str(PACKETS),
        "PYTHONPATH": str(ROOT),
    }
    proc = subprocess.Popen(
        [
            sys.executable,
            "-m",
            "uvicorn",
            "backend.main:app",
            "--host",
            "127.0.0.1",
            "--port",
            str(port),
            "--log-level",
            "warning",
        ],
        env=env,
        cwd=str(ROOT),
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
    )
    # Wait for server readiness
    deadline = time.time() + 10.0
    while time.time() < deadline:
        try:
            with socket.create_connection(("127.0.0.1", port), timeout=0.2):
                break
        except OSError:
            time.sleep(0.1)
    else:
        proc.terminate()
        raise RuntimeError("server never came up")
    try:
        yield port
    finally:
        proc.terminate()
        try:
            proc.wait(timeout=3)
        except subprocess.TimeoutExpired:
            proc.kill()


def _ws_url(port: int) -> str:
    return f"ws://127.0.0.1:{port}/ws"


def _recv(ws, timeout=3.0):
    ws.settimeout(timeout)
    import websockets.sync.client as _  # noqa
    return json.loads(ws.recv())


@pytest.mark.timeout(20)
def test_full_pipeline_start_packets_expire_stop(server):
    from websockets.sync.client import connect

    port = server
    msgs: list[dict] = []
    with connect(_ws_url(port), open_timeout=5) as ws:
        # handshake: snapshot + initial status
        snap = json.loads(ws.recv())
        assert snap["type"] == "snapshot"
        init_status = json.loads(ws.recv())
        assert init_status["type"] == "status"

        ws.send(json.dumps({"type": "start"}))

        deadline = time.time() + 5.0
        packet_ids: set[str] = set()
        while time.time() < deadline and len(packet_ids) < 3:
            try:
                raw = ws.recv(timeout=1.0)
            except TimeoutError:
                continue
            m = json.loads(raw)
            msgs.append(m)
            if m["type"] == "packet":
                packet_ids.add(m["data"]["id"])

        assert len(packet_ids) == 3, f"expected 3 packets, got {len(packet_ids)}: {msgs}"

        # packets in fixture use 1.1.1.1, 8.8.8.8, 151.101.1.69 — all known to DB-IP
        for m in msgs:
            if m["type"] == "packet":
                d = m["data"]
                assert isinstance(d["src"]["lat"], float)
                assert isinstance(d["dst"]["lng"], float)
                assert d["src"]["ip"] in {"1.1.1.1", "8.8.8.8", "151.101.1.69"}

        # Stop capture; expiry should still fire for all 3 within ~5-6s
        ws.send(json.dumps({"type": "stop"}))

        expired: set[str] = set()
        deadline = time.time() + 8.0
        while time.time() < deadline and expired != packet_ids:
            try:
                raw = ws.recv(timeout=1.0)
            except TimeoutError:
                continue
            m = json.loads(raw)
            if m["type"] == "expire":
                expired.add(m["data"]["id"])

        assert expired == packet_ids, f"not all packets expired: {expired} vs {packet_ids}"
