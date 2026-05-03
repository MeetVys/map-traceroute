from __future__ import annotations

import threading
import time
from typing import Callable

import pytest
from fastapi.testclient import TestClient

from backend import main as main_module
from backend.capturer import RawPacket
from tests.backend.conftest import DEFAULT_RECORDS, FakeReader


class FakeCapturer:
    """Stand-in for Capturer — exposes `inject` for tests."""

    _instances: list["FakeCapturer"] = []

    def __init__(self, on_packet: Callable[[RawPacket], None]) -> None:
        self._on_packet = on_packet
        self._running = False
        FakeCapturer._instances.append(self)

    def start(self) -> None:
        self._running = True

    def stop(self) -> None:
        self._running = False

    def is_running(self) -> bool:
        return self._running

    def inject(self, raw: RawPacket) -> None:
        self._on_packet(raw)


@pytest.fixture(autouse=True)
def reset_fake_capturer():
    FakeCapturer._instances.clear()
    yield
    FakeCapturer._instances.clear()


@pytest.fixture
def client(monkeypatch):
    monkeypatch.setattr(main_module, "Capturer", FakeCapturer)
    monkeypatch.setattr(main_module, "GeoResolver", lambda path: _FakeGeo())
    monkeypatch.setattr(main_module.os, "geteuid", lambda: 0)
    # Skip GeoIP DB existence check
    monkeypatch.setattr(main_module.Path, "exists", lambda self: True)
    with TestClient(main_module.app) as c:
        yield c


class _FakeGeo:
    def __init__(self) -> None:
        from backend.geo import GeoResolver

        self._inner = GeoResolver(db_path="(fake)", reader=FakeReader(DEFAULT_RECORDS))

    def resolve(self, ip: str):
        return self._inner.resolve(ip)

    def close(self) -> None:
        pass


def _get_fake_capturer(timeout: float = 1.0) -> FakeCapturer:
    deadline = time.time() + timeout
    while time.time() < deadline:
        if FakeCapturer._instances:
            return FakeCapturer._instances[-1]
        time.sleep(0.01)
    raise RuntimeError("FakeCapturer never instantiated")


def _recv_until(ws, expected_type: str, timeout: float = 2.0) -> dict:
    deadline = time.time() + timeout
    while time.time() < deadline:
        msg = ws.receive_json()
        if msg.get("type") == expected_type:
            return msg
    raise AssertionError(f"did not receive {expected_type!r} within {timeout}s")


def test_handshake_sends_snapshot_and_status(client):
    with client.websocket_connect("/ws") as ws:
        snap = ws.receive_json()
        status = ws.receive_json()
    assert snap == {"type": "snapshot", "data": []}
    assert status["type"] == "status"
    assert status["data"]["capturing"] is False


def test_start_flips_status(client):
    with client.websocket_connect("/ws") as ws:
        ws.receive_json()  # snapshot
        ws.receive_json()  # initial status
        ws.send_json({"type": "start"})
        status = _recv_until(ws, "status")
        assert status["data"]["capturing"] is True


def test_packet_broadcast(client):
    with client.websocket_connect("/ws") as ws:
        ws.receive_json()
        ws.receive_json()
        ws.send_json({"type": "start"})
        _recv_until(ws, "status")

        cap = _get_fake_capturer()
        cap.inject(
            RawPacket(
                ts=time.time(),
                src_ip="192.168.1.10",  # private — will be dropped by geo
                dst_ip="1.1.1.1",
                direction="out",
                proto="tcp",
                length=100,
            )
        )
        # Private src → geo None → drop. Next inject both routable:
        cap.inject(
            RawPacket(
                ts=time.time(),
                src_ip="8.8.8.8",
                dst_ip="1.1.1.1",
                direction="in",
                proto="tcp",
                length=100,
            )
        )
        msg = _recv_until(ws, "packet")
        assert msg["data"]["src"]["ip"] == "8.8.8.8"
        assert msg["data"]["dst"]["ip"] == "1.1.1.1"
        assert msg["data"]["src"]["lat"] == 37.39
        assert msg["data"]["dst"]["lng"] == -122.41


def test_packet_unknown_ip_dropped(client):
    with client.websocket_connect("/ws") as ws:
        ws.receive_json()
        ws.receive_json()
        ws.send_json({"type": "start"})
        _recv_until(ws, "status")

        cap = _get_fake_capturer()
        cap.inject(
            RawPacket(
                ts=time.time(),
                src_ip="203.0.113.5",  # unknown
                dst_ip="1.1.1.1",
                direction="in",
                proto="tcp",
                length=100,
            )
        )
        # Wait briefly; no packet message should arrive. We can't easily
        # prove negative over WS; use a short timeout expecting failure.
        import queue

        got: queue.Queue = queue.Queue()

        def drain():
            try:
                got.put(ws.receive_json())
            except Exception as e:
                got.put(e)

        t = threading.Thread(target=drain, daemon=True)
        t.start()
        t.join(timeout=0.3)
        assert got.empty(), f"unexpected message: {got.get_nowait()}"


def test_no_sudo_error(client, monkeypatch):
    monkeypatch.setattr(main_module.os, "geteuid", lambda: 1000)
    with client.websocket_connect("/ws") as ws:
        ws.receive_json()
        ws.receive_json()
        ws.send_json({"type": "start"})
        err = _recv_until(ws, "error")
        assert err["data"]["code"] == "no_sudo"


def test_stop_sets_status_false(client):
    with client.websocket_connect("/ws") as ws:
        ws.receive_json()
        ws.receive_json()
        ws.send_json({"type": "start"})
        _recv_until(ws, "status")
        ws.send_json({"type": "stop"})
        status = _recv_until(ws, "status")
        assert status["data"]["capturing"] is False
