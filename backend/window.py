from __future__ import annotations

import asyncio
import time
from collections import deque
from dataclasses import dataclass
from typing import Awaitable, Callable, Deque


@dataclass(frozen=True)
class WindowedPacket:
    id: str
    ts: float
    direction: str
    src_ip: str
    dst_ip: str
    src_lat: float
    src_lng: float
    dst_lat: float
    dst_lng: float
    proto: str
    length: int


class WindowManager:
    def __init__(
        self,
        window_seconds: float,
        max_size: int,
        on_expire: Callable[[str], Awaitable[None]],
        tick_seconds: float = 0.1,
    ) -> None:
        self._window = window_seconds
        self._max = max_size
        self._on_expire = on_expire
        self._tick = tick_seconds
        self._packets: Deque[WindowedPacket] = deque()
        self._lock = asyncio.Lock()

    async def add(self, p: WindowedPacket) -> None:
        async with self._lock:
            self._packets.append(p)
            while len(self._packets) > self._max:
                old = self._packets.popleft()
                await self._on_expire(old.id)

    async def run_expiry(self) -> None:
        while True:
            await asyncio.sleep(self._tick)
            cutoff = time.time() - self._window
            expired: list[str] = []
            async with self._lock:
                while self._packets and self._packets[0].ts < cutoff:
                    expired.append(self._packets.popleft().id)
            for pid in expired:
                await self._on_expire(pid)

    def snapshot(self) -> list[WindowedPacket]:
        return list(self._packets)

    def size(self) -> int:
        return len(self._packets)
