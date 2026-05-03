# Map Traceroute — Testing: Low-Level Design

See [TEST_HLD.md](./TEST_HLD.md) for the overall strategy. This doc specifies **each test case**: inputs, assertions, and fixtures.

---

## 1. Tooling and layout

### 1.1 Python deps (dev)

`backend/requirements-dev.txt`:

```
pytest==8.*
pytest-asyncio==0.24.*
pytest-cov==5.*
httpx==0.27.*          # TestClient WS support
maxminddb-writer==0.3.*   # for building tiny.mmdb
```

### 1.2 Frontend deps (dev)

Added to `frontend/package.json`:

```json
"devDependencies": {
  "vitest": "^2.0.0",
  "@testing-library/react": "^16.0.0",
  "@testing-library/jest-dom": "^6.4.0",
  "jsdom": "^25.0.0"
}
```

`vitest.config.ts` next to `vite.config.ts`: `test: { environment: "jsdom", globals: true }`.

### 1.3 Pytest config

`pyproject.toml` (root):

```toml
[tool.pytest.ini_options]
asyncio_mode = "auto"
testpaths = ["tests/backend"]
pythonpath = ["."]
```

### 1.4 Layout recap

```
tests/
├── backend/
│   ├── conftest.py
│   ├── test_net.py
│   ├── test_geo.py
│   ├── test_capturer.py
│   ├── test_window.py
│   └── test_ws_integration.py
├── frontend/              # vitest picks up *.test.ts(x)
├── e2e/
│   ├── playwright.config.ts
│   ├── fake_capturer.py
│   └── smoke.spec.ts
├── fixtures/
│   ├── tiny.mmdb
│   └── packets.jsonl
└── build_tiny_mmdb.py
```

---

## 2. Fixtures

### 2.1 `tiny.mmdb`

Built once by `tests/build_tiny_mmdb.py`, committed to repo (tiny — <5 KB).

Entries:

| IP | city | country | lat | lng |
|----|------|---------|-----|-----|
| `1.1.1.1` | San Francisco | US | 37.77 | -122.41 |
| `8.8.8.8` | Mountain View | US | 37.39 | -122.08 |
| `151.101.1.69` | London | GB | 51.50 | -0.12 |
| `2606:4700::1111` | San Francisco | US | 37.77 | -122.41 |

Schema matches DB-IP: `{ "city": {"names": {"en": ...}}, "country": {"names": {"en": ...}}, "location": {"latitude": ..., "longitude": ...} }`.

If DB-IP's actual schema differs, `build_tiny_mmdb.py` is updated once; everything downstream keeps working.

### 2.2 `packets.jsonl`

Newline-delimited JSON, one `RawPacket` per line. Used by `fake_capturer.py`:

```json
{"ts_offset": 0.0, "src_ip": "192.168.1.10", "dst_ip": "1.1.1.1", "direction": "out", "proto": "tcp", "length": 512}
{"ts_offset": 0.1, "src_ip": "8.8.8.8", "dst_ip": "192.168.1.10", "direction": "in", "proto": "udp", "length": 80}
{"ts_offset": 0.2, "src_ip": "192.168.1.10", "dst_ip": "151.101.1.69", "direction": "out", "proto": "tcp", "length": 1460}
```

`ts_offset` is added to `time.time()` at injection time.

### 2.3 `conftest.py` (backend)

```python
import pytest
from backend.geo import GeoResolver

@pytest.fixture
def geo():
    g = GeoResolver("tests/fixtures/tiny.mmdb")
    yield g
    g.close()
```

---

## 3. Backend unit tests

### 3.1 `test_net.py`

| Test | Assertion |
|------|-----------|
| `test_local_ips_non_empty` | `get_local_ips()` returns a set with at least one entry. |
| `test_includes_loopback` | `"127.0.0.1"` is in the set (sanity — all Macs have it). |
| `test_stable_across_calls` | Two successive calls return the same set (no flakiness). |

### 3.2 `test_geo.py`

| Test | Input | Expected |
|------|-------|----------|
| `test_known_ipv4` | `1.1.1.1` | `GeoPoint(37.77, -122.41, "San Francisco", "US")` |
| `test_known_ipv6` | `2606:4700::1111` | Non-None, `country == "US"` |
| `test_private_ip_none` | `192.168.1.1` | `None` (skipped before lookup) |
| `test_loopback_none` | `127.0.0.1` | `None` |
| `test_invalid_string_none` | `"not-an-ip"` | `None` |
| `test_unknown_ip_none` | `"203.0.113.99"` | `None` (not in tiny.mmdb) |
| `test_cache_hit` | call `resolve("1.1.1.1")` twice | second call doesn't re-open DB (assert via `resolve.cache_info().hits >= 1`) |

### 3.3 `test_capturer.py`

We do **not** run `sniff()`. We construct Scapy packets and feed them to `Capturer._handle` directly.

```python
from scapy.layers.inet import IP, TCP, UDP
from backend.capturer import Capturer
```

Helper:

```python
def make_capturer(local_ips={"192.168.1.10"}):
    captured = []
    c = Capturer(on_packet=captured.append)
    c._local_ips = local_ips
    return c, captured
```

| Test | Input | Expected |
|------|-------|----------|
| `test_outbound_packet` | `IP(src="192.168.1.10", dst="1.1.1.1")/TCP()` | one packet captured, `direction == "out"`, `proto == "tcp"` |
| `test_inbound_packet` | `IP(src="1.1.1.1", dst="192.168.1.10")/UDP()` | one captured, `direction == "in"`, `proto == "udp"` |
| `test_loopback_dropped` | `IP(src="127.0.0.1", dst="127.0.0.1")/TCP()` | nothing captured |
| `test_private_both_ends_dropped` | `IP(src="192.168.1.10", dst="10.0.0.5")/TCP()` | nothing captured |
| `test_multicast_dropped` | `IP(src="192.168.1.10", dst="224.0.0.1")/UDP()` | nothing captured |
| `test_no_ip_layer_dropped` | bare Ethernet frame | nothing captured |
| `test_ipv6_outbound` | `IPv6(src="fd00::1", dst="2606:4700::1111")/TCP()` with `fd00::1` in local_ips (but `fd00::/7` is private — should drop) | nothing captured |
| `test_icmp_proto` | `IP/ICMP` | `proto == "icmp"` |
| `test_start_stop_idempotent` | call `start()` twice, then `stop()` | no crash, `is_running()` returns False after stop |

### 3.4 `test_window.py`

All async. Uses `pytest-asyncio`.

Helper:

```python
def mk(id="a", ts=None): 
    return WindowedPacket(id=id, ts=ts or time.time(), direction="out",
                          src_ip="1", dst_ip="2", src_lat=0, src_lng=0,
                          dst_lat=0, dst_lng=0, proto="tcp", length=100)
```

| Test | Setup | Action | Assertion |
|------|-------|--------|-----------|
| `test_add_then_snapshot` | new `WindowManager(5, 100, cb)` | `add(mk("a"))` | `snapshot()` == `[a]`, `size() == 1` |
| `test_max_size_evicts_oldest` | `WindowManager(5, 2, cb)` | `add` three packets | `size() == 2`, oldest id passed to `cb` |
| `test_expiry_drops_old_packets` | `WindowManager(0.2, 100, cb, tick=0.05)` | add 1 packet, start `run_expiry` task, `sleep(0.35)` | packet expired, `cb` called with its id |
| `test_expiry_keeps_recent` | `WindowManager(5, 100, cb, tick=0.05)` | add 1 packet, wait 0.1s | still in snapshot |
| `test_concurrent_add_and_expire` | 10 concurrent `add()` coroutines while `run_expiry` ticks | No exception, `size() <= 10` |
| `test_snapshot_is_copy` | add packet, mutate returned list | internal deque unchanged |

### 3.5 `test_ws_integration.py`

Uses `fastapi.testclient.TestClient` (which supports WebSockets via `httpx`).

**Setup per test:**

```python
from fastapi.testclient import TestClient
from backend.main import app, hub

@pytest.fixture
def client(monkeypatch, tmp_path):
    # Swap geo DB to tiny.mmdb via config
    monkeypatch.setattr("backend.config.GEOIP_DB_PATH", "tests/fixtures/tiny.mmdb")
    # Install a fake capturer that we control
    monkeypatch.setattr("backend.main.Capturer", FakeCapturer)
    # Pretend we're root so `start` doesn't short-circuit
    monkeypatch.setattr("os.geteuid", lambda: 0)
    with TestClient(app) as c:
        yield c
```

`FakeCapturer` exposes an `inject(RawPacket)` helper that calls the `on_packet` callback.

| Test | Steps | Assertion |
|------|-------|-----------|
| `test_handshake_sends_snapshot_and_status` | Connect | First two messages: `{type: "snapshot", data: []}` then `{type: "status", data: {capturing: false}}` |
| `test_start_flips_status` | Connect, send `{type: "start"}` | Receives `{type: "status", data: {capturing: true}}` |
| `test_packet_broadcast` | Start, inject packet with known IPs | Receives `{type: "packet", data: {...}}` with correct lat/lng from tiny.mmdb |
| `test_packet_unknown_ip_dropped` | Start, inject packet with `203.0.113.1` | No `packet` message within 100ms |
| `test_expire_broadcast` | Inject packet with `ts = now - 6` | Within `tick+ε`, receives `{type: "expire", data: {id: ...}}` |
| `test_stop_keeps_expiry_running` | Inject, send `stop`, wait window | Status becomes false, but `expire` still fires |
| `test_second_client_snapshot` | Client A connects + injects 1 packet. Client B connects. | Client B's snapshot contains that packet |
| `test_no_sudo_error` | `monkeypatch os.geteuid -> 1000`, send `start` | Receives `{type: "error", data: {code: "no_sudo"}}` |

Timeouts: each WS `receive_json()` wrapped with a 2s limit.

---

## 4. Frontend unit tests

### 4.1 `ws.test.ts`

Uses `vi.useFakeTimers()` + a hand-rolled mock WebSocket installed on `globalThis`.

| Test | Assertion |
|------|-----------|
| `opens on connect` | `new WSClient(url).connect()` → mock WebSocket constructor called with `url` |
| `dispatches messages` | Handler receives parsed `ServerMsg` object |
| `send before open is noop` | No throw, no send recorded |
| `reconnects on close` | After `onclose`, new WS created after 500ms (advance timers) |
| `backoff doubles, capped at 5s` | Close 4x → delays 500, 1000, 2000, 4000; 5th close → 5000 (capped) |
| `close() stops reconnect` | `close()` then fake `onclose` → no new WS |

### 4.2 `Controls.test.tsx`

Renders with RTL.

| Test | Assertion |
|------|-----------|
| `start enabled when stopped` | Start button not disabled; Stop is disabled |
| `start disabled when capturing` | Given `capturing={true}` |
| `clicking start calls onStart` | `userEvent.click(getByText("Start"))` → mock fired |
| `packet count renders` | `getByText(/packets: 42/)` |
| `status indicator changes` | Shows `"● capturing"` or `"○ stopped"` |

### 4.3 `App.test.tsx`

Mocks `WSClient` module so we can push messages manually.

| Test | Flow | Assertion |
|------|------|-----------|
| `packet adds to state` | Emit `{type:"packet", data: dto}` | `packets` map has that id, counter shows 1 |
| `expire sets expiredAt` | Emit packet, then `{type:"expire", data:{id}}` | `packetsRef` entry has `expiredAt` defined |
| `gc removes faded` | Emit packet + expire, advance time > 500ms | `packetsRef.size === 0` |
| `status toggles button` | Emit `{type:"status", data:{capturing:true}}` | Start disabled |
| `start click sends start` | Click Start | `ws.send` called with `{type:"start"}` |
| `error message renders` | Emit `{type:"error", data:{message:"x"}}` | `getByText("x")` |

### 4.4 `Map.test.ts` (pure functions only)

Only the helpers — deck.gl render is not tested (WebGL in jsdom is not useful).

| Test | Assertion |
|------|-----------|
| `lerp(0, 10, 0.5) === 5` | basic |
| `colorWithAlpha no expiredAt` | alpha = 255 |
| `colorWithAlpha mid-fade` | given `expiredAt = now - 250`, `FADE_MS = 500` → alpha ≈ 128 |
| `colorWithAlpha past fade` | alpha = 0 |
| `colorWithAlpha out vs in` | `out` uses cyan base, `in` uses amber base |

Expose `lerp` and `colorWithAlpha` as named exports (small refactor to `Map.tsx`).

---

## 5. End-to-end test

### 5.1 `tests/e2e/fake_capturer.py`

```python
class FakeCapturer:
    def __init__(self, on_packet):
        self._on_packet = on_packet
        self._running = False
    def start(self):
        self._running = True
        # read packets.jsonl, schedule injections via a thread
    def stop(self): self._running = False
    def is_running(self): return self._running
    def inject(self, raw): self._on_packet(raw)
```

### 5.2 Launcher

`tests/e2e/run_server.py` — starts uvicorn with:

```python
import os
os.environ["MT_TEST_MODE"] = "1"
# backend/main.py checks MT_TEST_MODE and swaps Capturer -> FakeCapturer,
# and os.geteuid -> lambda: 0
```

### 5.3 `smoke.spec.ts`

```ts
test("capture flow end-to-end", async ({ page }) => {
  await page.goto("http://localhost:8765");
  await page.click("text=Start");
  // wait for packet count to reach 3
  await expect(page.locator("text=/packets: 3/")).toBeVisible({ timeout: 3000 });
  await page.click("text=Stop");
  // after 5s window, count drops to 0
  await expect(page.locator("text=/packets: 0/")).toBeVisible({ timeout: 7000 });
});
```

### 5.4 Playwright config

Global setup: spawn `python tests/e2e/run_server.py` before tests, kill after. Use a random free port, inject into the page URL via env var.

---

## 6. `test.sh`

```bash
#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"

E2E=0
for arg in "$@"; do
  [ "$arg" = "--e2e" ] && E2E=1
done

# Backend
source .venv/bin/activate 2>/dev/null || {
  python3 -m venv .venv
  source .venv/bin/activate
  pip install -q -r backend/requirements.txt -r backend/requirements-dev.txt
}
pytest tests/backend --cov=backend --cov-report=term-missing

# Frontend
pushd frontend >/dev/null
[ -d node_modules ] || npm install
npm run test -- --run
popd >/dev/null

# E2E (opt-in)
if [ $E2E -eq 1 ]; then
  pushd tests/e2e >/dev/null
  npx playwright install chromium --with-deps
  npx playwright test
  popd >/dev/null
fi

echo "✓ all tests passed"
```

---

## 7. Coverage and thresholds

- Backend: **fail CI if coverage < 80%** (per `pytest-cov --cov-fail-under=80`).
- Frontend: coverage reported, no hard threshold.

## 8. What each test file looks like (skeleton)

For reference, `tests/backend/test_window.py`:

```python
import asyncio
import time
import pytest
from backend.window import WindowManager, WindowedPacket

def mk(pid="a", ts=None):
    return WindowedPacket(id=pid, ts=ts or time.time(), direction="out",
                          src_ip="1.1.1.1", dst_ip="8.8.8.8",
                          src_lat=0, src_lng=0, dst_lat=0, dst_lng=0,
                          proto="tcp", length=100)

async def test_max_size_evicts_oldest():
    evicted = []
    async def on_exp(pid): evicted.append(pid)
    w = WindowManager(5.0, 2, on_exp)
    await w.add(mk("a")); await w.add(mk("b")); await w.add(mk("c"))
    assert w.size() == 2
    assert evicted == ["a"]

async def test_expiry_drops_old_packets():
    evicted = []
    async def on_exp(pid): evicted.append(pid)
    w = WindowManager(0.2, 100, on_exp, tick_seconds=0.05)
    await w.add(mk("a"))
    task = asyncio.create_task(w.run_expiry())
    await asyncio.sleep(0.35)
    task.cancel()
    assert evicted == ["a"]
    assert w.size() == 0
```

Same pattern for every test file. Real implementations go in the next step.

---

## 9. Not yet in scope

- **Load testing** (1000s of packets/sec) — add later if needed.
- **Cross-browser e2e** — chromium only for v1.
- **Fuzz / property tests** on geo and capturer — nice to have.
- **Screenshot regression** on the map — deferred; visual output is hard to assert meaningfully.
