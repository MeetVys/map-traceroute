"""Test-only capturer. Emits RawPackets from a file or HTTP trigger."""
from __future__ import annotations

import json
import os
import threading
import time
from typing import Callable

from .capturer import RawPacket


class FakeCapturer:
    def __init__(self, on_packet: Callable[[RawPacket], None]) -> None:
        self._on_packet = on_packet
        self._running = False
        self._thread: threading.Thread | None = None

    def start(self) -> None:
        if self._running:
            return
        self._running = True
        path = os.environ.get("MT_TEST_PACKETS")
        if path:
            self._thread = threading.Thread(
                target=self._replay_file, args=(path,), daemon=True, name="test-capturer"
            )
            self._thread.start()

    def stop(self) -> None:
        self._running = False

    def is_running(self) -> bool:
        return self._running

    def inject(self, raw: RawPacket) -> None:
        self._on_packet(raw)

    def _replay_file(self, path: str) -> None:
        with open(path) as f:
            lines = [line.strip() for line in f if line.strip()]
        start = time.time()
        for line in lines:
            if not self._running:
                return
            rec = json.loads(line)
            delay = float(rec.get("ts_offset", 0.0))
            elapsed = time.time() - start
            if delay > elapsed:
                time.sleep(delay - elapsed)
            raw = RawPacket(
                ts=time.time(),
                src_ip=rec["src_ip"],
                dst_ip=rec["dst_ip"],
                direction=rec["direction"],
                proto=rec["proto"],
                length=int(rec["length"]),
            )
            self._on_packet(raw)
