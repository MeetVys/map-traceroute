from __future__ import annotations

import asyncio
import logging
import os
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Any
from uuid import uuid4

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles

from . import config
from .capturer import Capturer, RawPacket
from .geo import GeoPoint, GeoResolver
from .public_ip import fetch_public_ip
from .window import WindowedPacket, WindowManager

# E2E hook: if MT_TEST_MODE=1, swap in a controllable capturer and bypass sudo.
TEST_MODE = os.environ.get("MT_TEST_MODE") == "1"

logging.basicConfig(level=config.LOG_LEVEL)
log = logging.getLogger("map-traceroute")

DIST = Path(config.FRONTEND_DIST)


class Hub:
    def __init__(self) -> None:
        self.clients: set[WebSocket] = set()
        self.geo: GeoResolver | None = None
        self.window: WindowManager | None = None
        self.capturer: Capturer | None = None
        self.raw_queue: asyncio.Queue[RawPacket] | None = None
        self.loop: asyncio.AbstractEventLoop | None = None
        self.local_geo: GeoPoint | None = None

    async def broadcast(self, msg: dict[str, Any]) -> None:
        dead: list[WebSocket] = []
        for ws in list(self.clients):
            try:
                await ws.send_json(msg)
            except Exception:
                dead.append(ws)
        for ws in dead:
            self.clients.discard(ws)

    async def broadcast_expire(self, packet_id: str) -> None:
        await self.broadcast({"type": "expire", "data": {"id": packet_id}})


hub = Hub()


def _resolve_local_geo(geo: GeoResolver) -> GeoPoint | None:
    if TEST_MODE:
        # In tests, callers set hub.local_geo directly or rely on public IPs.
        return None
    ip = fetch_public_ip()
    if not ip:
        return None
    return geo.resolve(ip)


def _packet_to_dto(p: WindowedPacket) -> dict[str, Any]:
    return {
        "id": p.id,
        "ts": p.ts,
        "direction": p.direction,
        "proto": p.proto,
        "length": p.length,
        "src": {
            "ip": p.src_ip, "lat": p.src_lat, "lng": p.src_lng,
            "city": p.src_city, "country": p.src_country, "local": p.src_local,
        },
        "dst": {
            "ip": p.dst_ip, "lat": p.dst_lat, "lng": p.dst_lng,
            "city": p.dst_city, "country": p.dst_country, "local": p.dst_local,
        },
    }


def _on_raw_packet(raw: RawPacket) -> None:
    """Called from capturer thread. Hands off to asyncio loop."""
    loop = hub.loop
    q = hub.raw_queue
    if loop is None or q is None:
        return
    try:
        asyncio.run_coroutine_threadsafe(q.put(raw), loop)
    except Exception as e:
        log.debug("enqueue failed: %s", e)


async def _drain_queue() -> None:
    assert hub.raw_queue is not None
    assert hub.geo is not None
    assert hub.window is not None
    while True:
        raw = await hub.raw_queue.get()
        src = hub.local_geo if raw.src_local else hub.geo.resolve(raw.src_ip)
        dst = hub.local_geo if raw.dst_local else hub.geo.resolve(raw.dst_ip)
        if src is None or dst is None:
            continue
        p = WindowedPacket(
            id=uuid4().hex,
            ts=raw.ts,
            direction=raw.direction,
            src_ip=raw.src_ip,
            dst_ip=raw.dst_ip,
            src_lat=src.lat,
            src_lng=src.lng,
            src_city=src.city,
            src_country=src.country,
            src_local=raw.src_local,
            dst_lat=dst.lat,
            dst_lng=dst.lng,
            dst_city=dst.city,
            dst_country=dst.country,
            dst_local=raw.dst_local,
            proto=raw.proto,
            length=raw.length,
        )
        await hub.window.add(p)
        await hub.broadcast({"type": "packet", "data": _packet_to_dto(p)})


@asynccontextmanager
async def lifespan(app: FastAPI):
    if not Path(config.GEOIP_DB_PATH).exists():
        log.error("geo DB missing at %s — run run.sh to download", config.GEOIP_DB_PATH)
        raise SystemExit(2)
    hub.loop = asyncio.get_running_loop()
    hub.geo = GeoResolver(config.GEOIP_DB_PATH)
    hub.window = WindowManager(
        config.WINDOW_SECONDS,
        config.MAX_PACKETS_IN_FLIGHT,
        hub.broadcast_expire,
        config.EXPIRY_TICK_SECONDS,
    )
    if TEST_MODE:
        from .fake_capturer import FakeCapturer
        hub.capturer = FakeCapturer(on_packet=_on_raw_packet)
    else:
        hub.capturer = Capturer(on_packet=_on_raw_packet)
    hub.raw_queue = asyncio.Queue(maxsize=5000)
    # Resolve the user's public IP once so LAN-side packets still render.
    hub.local_geo = _resolve_local_geo(hub.geo)
    if hub.local_geo is None:
        log.warning("could not determine local geo — local-side packets will be dropped")
    else:
        log.info(
            "local geo: %s, %s (%.2f, %.2f)",
            hub.local_geo.city, hub.local_geo.country,
            hub.local_geo.lat, hub.local_geo.lng,
        )
    expiry_task = asyncio.create_task(hub.window.run_expiry())
    drain_task = asyncio.create_task(_drain_queue())
    log.info("server ready on port %d (root=%s)", config.PORT, os.geteuid() == 0)
    try:
        yield
    finally:
        if hub.capturer and hub.capturer.is_running():
            hub.capturer.stop()
        expiry_task.cancel()
        drain_task.cancel()
        if hub.geo:
            hub.geo.close()


app = FastAPI(lifespan=lifespan)


@app.get("/")
async def index() -> FileResponse:
    idx = DIST / "index.html"
    if not idx.exists():
        return JSONResponse(
            {"error": "frontend not built", "hint": "run `cd frontend && npm run build`"},
            status_code=503,
        )
    return FileResponse(idx)


@app.get("/countries.geojson")
async def countries() -> FileResponse:
    return FileResponse(DIST / "countries.geojson")


@app.websocket("/ws")
async def ws_endpoint(ws: WebSocket) -> None:
    await ws.accept()
    hub.clients.add(ws)
    try:
        if hub.window:
            snap = [_packet_to_dto(p) for p in hub.window.snapshot()]
            await ws.send_json({"type": "snapshot", "data": snap})
        await ws.send_json(
            {"type": "status", "data": {"capturing": bool(hub.capturer and hub.capturer.is_running())}}
        )
        while True:
            msg = await ws.receive_json()
            t = msg.get("type")
            if t == "start":
                if not TEST_MODE and os.geteuid() != 0:
                    await ws.send_json(
                        {"type": "error", "data": {"code": "no_sudo", "message": "run with sudo"}}
                    )
                elif hub.capturer:
                    hub.capturer.start()
            elif t == "stop":
                if hub.capturer:
                    hub.capturer.stop()
            await hub.broadcast(
                {
                    "type": "status",
                    "data": {"capturing": bool(hub.capturer and hub.capturer.is_running())},
                }
            )
    except WebSocketDisconnect:
        pass
    finally:
        hub.clients.discard(ws)


if (DIST / "assets").exists():
    app.mount("/assets", StaticFiles(directory=str(DIST / "assets")), name="assets")
