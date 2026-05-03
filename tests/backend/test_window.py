from __future__ import annotations

import asyncio
import time

from backend.window import WindowedPacket, WindowManager


def mk(pid: str = "a", ts: float | None = None) -> WindowedPacket:
    return WindowedPacket(
        id=pid,
        ts=ts if ts is not None else time.time(),
        direction="out",
        src_ip="1.1.1.1",
        dst_ip="8.8.8.8",
        src_lat=0.0,
        src_lng=0.0,
        dst_lat=0.0,
        dst_lng=0.0,
        proto="tcp",
        length=100,
    )


async def test_add_then_snapshot():
    evicted: list[str] = []

    async def on_exp(pid: str):
        evicted.append(pid)

    w = WindowManager(5.0, 100, on_exp)
    await w.add(mk("a"))
    snap = w.snapshot()
    assert [p.id for p in snap] == ["a"]
    assert w.size() == 1
    assert evicted == []


async def test_max_size_evicts_oldest():
    evicted: list[str] = []

    async def on_exp(pid: str):
        evicted.append(pid)

    w = WindowManager(5.0, 2, on_exp)
    await w.add(mk("a"))
    await w.add(mk("b"))
    await w.add(mk("c"))
    assert w.size() == 2
    assert evicted == ["a"]
    assert [p.id for p in w.snapshot()] == ["b", "c"]


async def test_expiry_drops_old_packets():
    evicted: list[str] = []

    async def on_exp(pid: str):
        evicted.append(pid)

    w = WindowManager(0.2, 100, on_exp, tick_seconds=0.05)
    await w.add(mk("a"))
    task = asyncio.create_task(w.run_expiry())
    await asyncio.sleep(0.35)
    task.cancel()
    try:
        await task
    except asyncio.CancelledError:
        pass
    assert evicted == ["a"]
    assert w.size() == 0


async def test_expiry_keeps_recent():
    evicted: list[str] = []

    async def on_exp(pid: str):
        evicted.append(pid)

    w = WindowManager(5.0, 100, on_exp, tick_seconds=0.05)
    await w.add(mk("a"))
    task = asyncio.create_task(w.run_expiry())
    await asyncio.sleep(0.15)
    task.cancel()
    try:
        await task
    except asyncio.CancelledError:
        pass
    assert evicted == []
    assert w.size() == 1


async def test_snapshot_is_copy():
    async def on_exp(_pid: str):
        pass

    w = WindowManager(5.0, 100, on_exp)
    await w.add(mk("a"))
    snap = w.snapshot()
    snap.clear()
    assert w.size() == 1


async def test_concurrent_add_and_expire():
    evicted: list[str] = []

    async def on_exp(pid: str):
        evicted.append(pid)

    w = WindowManager(5.0, 1000, on_exp, tick_seconds=0.02)
    task = asyncio.create_task(w.run_expiry())
    await asyncio.gather(*(w.add(mk(f"p{i}")) for i in range(50)))
    await asyncio.sleep(0.05)
    task.cancel()
    try:
        await task
    except asyncio.CancelledError:
        pass
    assert w.size() == 50
