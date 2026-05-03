# Map Traceroute — Low-Level Design

See [SPEC.md](./SPEC.md) for product scope and [HLD.md](./HLD.md) for the high-level design.

Target OS: **macOS**. Backend: **Python 3**. Frontend: **React + TypeScript + Vite**.

---

## 1. Repo layout

```
map-traceroute/
├── SPEC.md
├── HLD.md
├── LLD.md
├── README.md
├── run.sh
├── backend/
│   ├── requirements.txt
│   ├── main.py
│   ├── capturer.py
│   ├── geo.py
│   ├── window.py
│   ├── net.py
│   └── config.py
├── frontend/
│   ├── package.json
│   ├── vite.config.ts
│   ├── tsconfig.json
│   ├── index.html
│   ├── public/
│   │   └── countries.geojson
│   └── src/
│       ├── main.tsx
│       ├── App.tsx
│       ├── Map.tsx
│       ├── Controls.tsx
│       ├── PacketList.tsx
│       ├── PacketRow.tsx
│       ├── ws.ts
│       └── types.ts
└── data/
    └── dbip-city-lite.mmdb      # downloaded by run.sh, gitignored
```

---

## 2. Backend

### 2.1 Process and threading model

```
 main thread (asyncio)
   ├── FastAPI / uvicorn event loop
   ├── WebSocket handlers (one per client)
   ├── WindowManager expiry task (async)
   └── Bridge: asyncio.Queue  <---  thread-safe put from capturer
                                   ^
                                   |
 capturer thread (blocking, Scapy)
   └── scapy.sniff(..., prn=on_packet)
```

- Scapy's `sniff()` is blocking, so the capturer runs in a **dedicated OS thread**.
- The capturer thread calls `asyncio.run_coroutine_threadsafe(queue.put(...), loop)` to hand packets to the asyncio side.
- The expiry task runs inside the asyncio loop, uses `asyncio.sleep(0.1)`, and pushes `expire` events to connected WebSockets.
- On `stop`, capturer thread is signaled to exit; the expiry task keeps running until the window is empty.

### 2.2 `config.py`

```python
PORT = 8765
WINDOW_SECONDS = 5.0
EXPIRY_TICK_SECONDS = 0.1          # how often expiry task wakes
MAX_PACKETS_IN_FLIGHT = 2000       # safety cap
GEOIP_DB_PATH = "data/dbip-city-lite.mmdb"
FRONTEND_DIST = "frontend/dist"
LOG_LEVEL = "INFO"
```

### 2.3 `net.py` — local IP discovery

```python
def get_local_ips() -> set[str]:
    """Returns every IPv4/IPv6 address bound to a non-loopback interface."""
```

- Uses `psutil.net_if_addrs()`.
- Cached at capturer start; re-read if sniff restarts.
- Used to decide packet direction.

### 2.4 `capturer.py`

```python
from dataclasses import dataclass
from typing import Callable

@dataclass(frozen=True)
class RawPacket:
    ts: float          # epoch seconds, from packet metadata
    src_ip: str
    dst_ip: str
    src_local: bool    # true if src_ip is one of our interface IPs
    dst_local: bool    # true if dst_ip is one of our interface IPs
    direction: str     # "in" | "out"
    proto: str         # "tcp" | "udp" | "icmp" | "other"
    length: int        # bytes

class Capturer:
    def __init__(self, on_packet: Callable[[RawPacket], None]): ...
    def start(self) -> None: ...       # spawns sniff thread
    def stop(self) -> None: ...        # signals thread to exit, joins
    def is_running(self) -> bool: ...
```

**Scapy call:**

```python
sniff(
    prn=self._handle,
    store=False,
    filter="ip or ip6",          # BPF filter
    stop_filter=lambda _: self._stop.is_set(),
)
```

**Direction rule:**
- `src_ip ∈ local_ips` → `out`
- `dst_ip ∈ local_ips` → `in`
- Neither or both → skip (shouldn't happen on endpoint).

**Filter rules (drop early, before geo lookup):**
- Loopback: `127.0.0.0/8`, `::1`
- Link-local: `169.254.0.0/16`, `fe80::/10`
- Multicast: `224.0.0.0/4`, `ff00::/8`
- Private ranges: `10/8`, `172.16/12`, `192.168/16`, `fc00::/7` (these have no geo)

Drops are silent (debug log only).

### 2.5 `geo.py`

```python
from dataclasses import dataclass
from functools import lru_cache
from typing import Optional

@dataclass(frozen=True)
class GeoPoint:
    lat: float
    lng: float
    city: Optional[str]
    country: Optional[str]

class GeoResolver:
    def __init__(self, db_path: str): ...
    @lru_cache(maxsize=10_000)
    def resolve(self, ip: str) -> Optional[GeoPoint]: ...
    def close(self) -> None: ...
```

- Backed by `maxminddb.open_database()` (DB-IP Lite uses MaxMind `.mmdb` format).
- Returns `None` for private/reserved IPs (checked via `ipaddress.ip_address().is_global`).
- Returns `None` on lookup miss — caller drops the packet.
- Raises at startup if DB file is missing.
- **Attribution:** UI must show a small "Geo data by DB-IP" credit (CC-BY 4.0 requirement).

### 2.6 `window.py`

```python
from dataclasses import dataclass
from collections import deque
from typing import Callable, Awaitable

@dataclass(frozen=True)
class WindowedPacket:
    id: str              # uuid4 hex
    ts: float
    direction: str       # "in" | "out"
    src_ip: str
    dst_ip: str
    src_lat: float
    src_lng: float
    src_city: Optional[str]
    src_country: Optional[str]
    src_local: bool
    dst_lat: float
    dst_lng: float
    dst_city: Optional[str]
    dst_country: Optional[str]
    dst_local: bool
    proto: str
    length: int

class WindowManager:
    def __init__(
        self,
        window_seconds: float,
        max_size: int,
        on_expire: Callable[[str], Awaitable[None]],
    ): ...

    async def add(self, p: WindowedPacket) -> None: ...
    async def run_expiry(self) -> None:
        """Long-running coroutine. Awakens every EXPIRY_TICK_SECONDS,
        pops packets with ts < now - window_seconds, calls on_expire(id)."""
    def snapshot(self) -> list[WindowedPacket]:
        """Returns current live packets (for new WS clients joining mid-session)."""
    def size(self) -> int: ...
```

- Internal storage: `collections.deque[WindowedPacket]` ordered by insertion (= by `ts`, since `time.time()` is monotonic within capture).
- `max_size` enforced on `add` by popping head until under cap (drops oldest, emits `expire`).
- `run_expiry` continues running even when capturer is stopped — drains the window naturally.

### Local-side geo

The user's interface IP is typically a private LAN address (e.g. `192.168.x.x`), which the geo DB cannot resolve. Without a fix, every packet the user sends/receives is dropped because `src` or `dst` `GeoPoint` is `None`.

Fix: at server startup, call `ipinfo.io/json` (or `ifconfig.me`) **once** to learn the user's public IP, then resolve its geo via the local DB. Cache the result in `hub.local_geo: GeoPoint | None`.

When the drain loop sees a packet where one side is local (flagged by `capturer` via `src_local` / `dst_local`), it substitutes `hub.local_geo` for that side's lat/lng/city/country, and sets `src_local` / `dst_local` = `true` in the DTO so the UI can show `(local)` in the list.

If the one-time lookup fails (offline, no public IP), fall back to `(0, 0)` so the arc still renders; the list still shows `(local)`.

### 2.7 `main.py` — FastAPI app

#### Routes

| Method | Path | Purpose |
|--------|------|---------|
| `GET` | `/` | Serves `frontend/dist/index.html` |
| `GET` | `/assets/*` | Static assets from Vite build |
| `GET` | `/countries.geojson` | Bundled country outlines |
| `WS`  | `/ws` | Bidirectional event stream |

#### Startup

```python
@app.on_event("startup")
async def startup():
    app.state.geo = GeoResolver(GEOIP_DB_PATH)
    app.state.window = WindowManager(WINDOW_SECONDS, MAX_PACKETS_IN_FLIGHT, broadcast_expire)
    app.state.capturer = Capturer(on_packet=thread_safe_enqueue)
    app.state.clients = set()
    app.state.queue = asyncio.Queue()
    asyncio.create_task(app.state.window.run_expiry())
    asyncio.create_task(drain_queue())
```

#### Drain loop

```python
async def drain_queue():
    while True:
        raw = await app.state.queue.get()
        # Resolve each side. If the side is the user's own machine,
        # substitute hub.local_geo instead of the DB lookup (LAN IPs won't resolve).
        src = hub.local_geo if raw.src_local else hub.geo.resolve(raw.src_ip)
        dst = hub.local_geo if raw.dst_local else hub.geo.resolve(raw.dst_ip)
        if src is None or dst is None:
            continue
        p = WindowedPacket(
            id=uuid4().hex,
            ts=raw.ts,
            src_ip=raw.src_ip, src_lat=src.lat, src_lng=src.lng,
            src_city=src.city, src_country=src.country, src_local=raw.src_local,
            dst_ip=raw.dst_ip, dst_lat=dst.lat, dst_lng=dst.lng,
            dst_city=dst.city, dst_country=dst.country, dst_local=raw.dst_local,
            direction=raw.direction, proto=raw.proto, length=raw.length,
        )
        await app.state.window.add(p)
        await broadcast_packet(p)
```

`raw.src_local` / `raw.dst_local` come from the capturer's `local_ips` check; the capturer attaches those flags to `RawPacket`.

#### Broadcast helpers

```python
async def broadcast_packet(p: WindowedPacket):
    msg = {"type": "packet", "data": p_to_dict(p)}
    dead = []
    for ws in app.state.clients:
        try: await ws.send_json(msg)
        except: dead.append(ws)
    app.state.clients -= set(dead)

async def broadcast_expire(packet_id: str):
    # same shape, "type": "expire"
```

#### WebSocket handler

```python
@app.websocket("/ws")
async def ws(ws: WebSocket):
    await ws.accept()
    app.state.clients.add(ws)
    # send snapshot so late joiners see current state
    await ws.send_json({"type": "snapshot", "data": [...]})
    try:
        while True:
            msg = await ws.receive_json()
            if msg["type"] == "start": app.state.capturer.start()
            elif msg["type"] == "stop": app.state.capturer.stop()
            # echo status
            await ws.send_json({"type": "status", "data": {"capturing": app.state.capturer.is_running()}})
    except WebSocketDisconnect:
        app.state.clients.discard(ws)
```

### 2.8 WebSocket message schemas

**Client → Server**

```json
{ "type": "start" }
{ "type": "stop" }
```

**Server → Client**

```json
{ "type": "status", "data": { "capturing": true } }

{ "type": "snapshot", "data": [ <PacketDTO>, ... ] }

{ "type": "packet", "data": <PacketDTO> }

{ "type": "expire", "data": { "id": "abc123..." } }

{ "type": "error", "data": { "code": "no_sudo", "message": "..." } }
```

**`PacketDTO`:**

```json
{
  "id": "uuid-hex",
  "ts": 1714761600.123,
  "direction": "in",
  "proto": "tcp",
  "length": 1460,
  "src": {
    "ip": "1.2.3.4", "lat": 37.77, "lng": -122.41,
    "city": "SF", "country": "US", "local": false
  },
  "dst": {
    "ip": "192.168.1.10", "lat": 37.39, "lng": -122.08,
    "city": "Mountain View", "country": "US", "local": true
  }
}
```

`local: true` on a side means the IP belongs to the user's own machine. The UI shows `(local)` for that side in the packet list instead of the city/country.

### 2.9 Error handling

| Condition | Where | Behavior |
|-----------|-------|----------|
| Not running as root | capturer start | Emit `error {code: "no_sudo"}`, UI shows "restart with sudo". |
| Missing geo DB | startup | Log + exit with code 2. `run.sh` handles download. |
| No packets for 10s after Start | drain loop watchdog | Emit `status {capturing: true, warning: "silent"}`. |
| Client WS disconnect | broadcast | Remove from `clients` set. |
| Queue backpressure | drain loop | If `queue.qsize() > 1000`, drop oldest + log warning. |
| Unknown IP (private / no geo) | drain loop | Drop silently. |

### 2.10 `requirements.txt`

```
fastapi==0.115.*
uvicorn[standard]==0.32.*
scapy==2.6.*
maxminddb==2.6.*
psutil==6.1.*
```

---

## 3. Frontend

### 3.1 `src/types.ts`

```ts
export type Direction = "in" | "out";

export type GeoRef = {
  ip: string;
  lat: number;
  lng: number;
  city?: string;
  country?: string;
  local: boolean;
};

export type PacketDTO = {
  id: string;
  ts: number;
  direction: Direction;
  proto: string;
  length: number;
  src: GeoRef;
  dst: GeoRef;
};

export type ServerMsg =
  | { type: "status"; data: { capturing: boolean; warning?: string } }
  | { type: "snapshot"; data: PacketDTO[] }
  | { type: "packet"; data: PacketDTO }
  | { type: "expire"; data: { id: string } }
  | { type: "error"; data: { code: string; message: string } };

export type ClientMsg = { type: "start" } | { type: "stop" };
```

### 3.2 `src/ws.ts`

```ts
export class WSClient {
  private ws?: WebSocket;
  private url: string;
  private handlers: ((m: ServerMsg) => void)[] = [];
  private reconnectDelay = 500;

  connect(): void { /* open, onmessage -> dispatch, onclose -> retry with backoff */ }
  send(msg: ClientMsg): void { this.ws?.send(JSON.stringify(msg)); }
  onMessage(h: (m: ServerMsg) => void): void { this.handlers.push(h); }
}
```

- Reconnect: exponential backoff capped at 5s.
- URL: `ws://localhost:${PORT}/ws`, port injected at build time via `import.meta.env`.

### 3.3 `src/App.tsx` — state shape

```ts
type PacketState = PacketDTO & {
  addedAt: number;        // performance.now() when received
  expiredAt?: number;     // set when "expire" arrives
};

type AppState = {
  capturing: boolean;
  packets: Map<string, PacketState>;
  warning?: string;
  error?: string;
};
```

- On `packet` → `packets.set(p.id, {...p, addedAt: performance.now()})`.
- On `expire` → set `expiredAt`, keep for 500ms fade, then delete.
- On `snapshot` → bulk replace.
- Render prop to `<Map>` + `<Controls>`.

### 3.4 `src/Controls.tsx`

- Two buttons: **Start** (disabled if `capturing`) / **Stop** (disabled if `!capturing`).
- Small status chip: `● capturing` / `○ stopped`.
- Packet counter: `packets.size`.
- Calls `ws.send({type: "start" | "stop"})`.

### 3.5 `src/Map.tsx` — deck.gl

```ts
<DeckGL
  initialViewState={{ longitude: 0, latitude: 20, zoom: 1.2 }}
  controller={true}
  layers={[countriesLayer, arcsLayer]}
/>
```

**`countriesLayer`** — static:

```ts
new GeoJsonLayer({
  id: "countries",
  data: "/countries.geojson",
  stroked: true, filled: true,
  getFillColor: [20, 25, 40], getLineColor: [60, 70, 90],
  lineWidthMinPixels: 0.5,
});
```

**`arcsLayer`** — rebuilt every frame from `packets`:

```ts
new ArcLayer({
  id: "arcs",
  data: Array.from(packets.values()),
  getSourcePosition: p => [p.src.lng, p.src.lat],
  getTargetPosition: p => [p.dst.lng, p.dst.lat],
  getSourceColor: p => colorFor(p.direction, alpha(p)),
  getTargetColor: p => colorFor(p.direction, alpha(p)),
  getHeight: 0.4,
  getWidth: 2,
  updateTriggers: { getSourceColor: [tick], getTargetColor: [tick] },
});
```

### 3.6 Animation model

Three phases per packet, driven by a single `requestAnimationFrame` loop that bumps a `tick` state each frame:

| Phase | Duration | Visual |
|-------|----------|--------|
| **Grow** | 400ms from `addedAt` | Arc draws from source to destination (controlled via `getTargetPosition` interpolation from src→dst). |
| **Live** | until `expiredAt` | Full arc at full alpha. |
| **Fade** | 500ms after `expiredAt` | Alpha 1 → 0. Then removed from `Map`. |

```ts
function alpha(p: PacketState): number {
  const now = performance.now();
  if (p.expiredAt) {
    const t = (now - p.expiredAt) / 500;
    return Math.max(0, 1 - t);
  }
  return 1;
}

function growProgress(p: PacketState): number {
  const t = (performance.now() - p.addedAt) / 400;
  return Math.min(1, t);
}
```

The actual grown endpoint = `lerp(src, dst, growProgress(p))`.

### 3.7 Colors

- Outgoing (`out`): `[80, 200, 255]` — cyan.
- Incoming (`in`):  `[255, 160, 80]` — amber.
- Alpha = `alpha(p) * 255`.

### 3.8 Performance caps

- Hard cap: render max 500 arcs. If `packets.size > 500`, drop oldest from render list (not from state — state is server-authoritative).
- Single `requestAnimationFrame` loop; do not re-render React every frame. The deck.gl layer reads from a ref and animates via `updateTriggers`.

### 3.9 `PacketList.tsx` — live packet list

Docked to the bottom of the viewport, fixed height `~240px`, scrollable body.

**Layout:**

```
┌ Live packets (last 5s)                           N active ┐
├ dir │ source              │ destination          │ proto  bytes  age ┤
│ ↑ out│ 192.168.1.10       │ 1.1.1.1              │ tcp    1460  0.1 │
│      │ (local)            │ Sydney, AU           │                  │
│ ↓ in │ 151.101.1.69       │ 192.168.1.10         │ tcp     512  0.4 │
│      │ London, GB         │ (local)              │                  │
└───────────────────────────────────────────────────────────┘
```

**Data source:** the same `Map<id, PacketState>` the map renders from. No new WebSocket state.

**Behavior:**

- Sort by `ts` descending (newest on top).
- Row uses `direction` glyph + matching color (cyan for `out`, amber for `in`).
- Source / destination cell shows the IP on line 1, and either `(local)` or `"city, country"` on line 2. If `city` or `country` is missing, fall back to `"Unknown"`.
- `age` cell updates live at ~4 Hz (driven by the same rAF tick as the map).
- On `expiredAt`, the row fades opacity 1 → 0 over 500 ms, then the row unmounts.
- **Virtualization:** render only the first 200 rows; beyond that, show `"+ N more hidden"` footer. Prevents DOM blowup during traffic bursts.

**Props:**

```ts
type Props = {
  packets: Map<string, PacketState>;
  tick: number;   // re-render trigger from App's rAF loop
};
```

### 3.10 `PacketRow.tsx`

Memoized (`React.memo`) per-packet row. Re-renders only when:

- `expiredAt` becomes set (for fade), or
- The `ageBucket` (seconds, integer) changes.

Age is recomputed from `performance.now() - addedAt` on every render but the component is guarded by a cheap comparator so rows whose age bucket hasn't changed are skipped.

### 3.9 `package.json`

```json
{
  "scripts": {
    "dev": "vite",
    "build": "tsc && vite build",
    "preview": "vite preview"
  },
  "dependencies": {
    "react": "^18",
    "react-dom": "^18",
    "deck.gl": "^9",
    "@deck.gl/react": "^9",
    "@deck.gl/layers": "^9",
    "@deck.gl/geo-layers": "^9"
  },
  "devDependencies": {
    "vite": "^5",
    "@vitejs/plugin-react": "^4",
    "typescript": "^5"
  }
}
```

---

## 4. Cross-cutting

### 4.1 Direction detection (backend)

- At capturer start: `local_ips = get_local_ips()`.
- Per packet: classify using set membership on `src_ip` and `dst_ip`.
- Re-query `local_ips` on every `start` (interfaces may have changed).

### 4.2 Filter rules (backend)

Dropped before geo lookup:

```
loopback:     127.0.0.0/8, ::1
link-local:   169.254.0.0/16, fe80::/10
multicast:    224.0.0.0/4, ff00::/8
private:      10/8, 172.16/12, 192.168/16, fc00::/7
broadcast:    255.255.255.255
```

Implementation: `ipaddress.ip_address(ip).is_global`.

### 4.3 Error surfaces

| Source | Detection | UI response |
|--------|-----------|-------------|
| Not running as root | `PermissionError` from Scapy | Toast: "Run with sudo. See README." |
| Geo DB missing | Startup exception | Run.sh aborts with instructions. |
| No packets in 10s | Watchdog in drain loop | Small warning: "capturing but no traffic yet". |
| WS disconnect | `onclose` | Auto-reconnect indicator. |

### 4.4 Configuration

All knobs live in `backend/config.py`. No runtime config file needed.

Frontend reads `VITE_WS_PORT` at build time via `import.meta.env.VITE_WS_PORT`.

---

## 5. `run.sh` (outline)

```bash
#!/usr/bin/env bash
set -euo pipefail

# 1. Python venv
python3 -m venv .venv
source .venv/bin/activate
pip install -q -r backend/requirements.txt

# 2. Geo DB (DB-IP Lite, CC-BY 4.0, no signup)
mkdir -p data
if [ ! -f data/dbip-city-lite.mmdb ]; then
  echo "Downloading DB-IP City Lite..."
  MONTH=$(date +%Y-%m)
  curl -fL -o data/dbip-city-lite.mmdb.gz \
    "https://download.db-ip.com/free/dbip-city-lite-${MONTH}.mmdb.gz"
  gunzip -f data/dbip-city-lite.mmdb.gz
fi

# 3. Frontend build (no sudo)
pushd frontend
npm install
npm run build
popd

# 4. Start server under sudo (packet capture requires it)
sudo -E .venv/bin/python -m uvicorn backend.main:app --host 127.0.0.1 --port 8765 &
SERVER_PID=$!

# 5. Open browser
sleep 1
open "http://localhost:8765"

wait $SERVER_PID
```

Clean exit on Ctrl+C: `trap 'kill $SERVER_PID' INT TERM`.

---

## 6. Decisions locked

- **Geo DB:** DB-IP City Lite (CC-BY 4.0, no signup, monthly `.mmdb` download). Attribution credit required in UI.
- **Root privilege:** `run.sh` launches the Python server via `sudo`. One password prompt per run. Accepted as v1 UX.
- **IPv6:** Scapy filter and DB-IP both support it. No extra code; test as part of vertical slice.
- **Local geo:** One-shot `ipinfo.io/json` lookup at startup to get the user's public IP, then resolved via the local DB. Cached in `hub.local_geo`. Used whenever a side is flagged `local`.
