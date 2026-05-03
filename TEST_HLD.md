# Map Traceroute — Testing: High-Level Design

See [SPEC.md](./SPEC.md), [HLD.md](./HLD.md), [LLD.md](./LLD.md) for product and design. This doc covers only **how we test**.

## Goals

- Each backend component has **unit tests** that run in milliseconds, no network, no root.
- The WebSocket layer has **integration tests** that exercise `start` / `stop` / `packet` / `expire` end-to-end against a fake capturer.
- The frontend has **component tests** for state transitions and render output.
- A single **end-to-end smoke test** boots the full stack (real server, headless browser, fake packet injector) and verifies an arc appears on the map.
- One command runs everything: `./test.sh`.

## Test pyramid

```
                  ┌──────────────┐
                  │  e2e (1-2)   │   Playwright + fake packet injector
                  └──────────────┘
              ┌──────────────────────┐
              │  integration (~10)   │   FastAPI TestClient + asyncio
              └──────────────────────┘
        ┌──────────────────────────────────┐
        │  unit — backend (~30)            │   pytest
        │  unit — frontend (~15)           │   vitest + RTL
        └──────────────────────────────────┘
```

Numbers are targets, not quotas.

## What each layer covers

### Unit — backend (pytest)

Pure-logic tests, no sockets, no root, no real `.mmdb`.

| Module | Covered by |
|--------|-----------|
| `net.py` | Returns a non-empty set. Skips loopback interface name variants. |
| `geo.py` | Fixture `.mmdb` (tiny, hand-built). Private IPs → `None`. Unknown IPs → `None`. Known IPs → `GeoPoint`. LRU cache is used. |
| `capturer.py` | Direction classification (local→remote = `out`, remote→local = `in`). Private/loopback filter. Proto detection. No actual `sniff()` — we call `_handle` directly with crafted Scapy packets. |
| `window.py` | `add` + `run_expiry` drops packets older than window. `max_size` evicts oldest. `snapshot` returns insertion order. `on_expire` callback fires once per expired packet. |

### Unit — frontend (vitest + React Testing Library)

| Module | Covered by |
|--------|-----------|
| `ws.ts` | Reconnects on close. `send()` before open is a no-op. Messages dispatched to all handlers. |
| `App.tsx` | `packet` message adds to map. `expire` sets `expiredAt`. GC deletes faded packets. `status` updates button state. |
| `Controls.tsx` | Start disabled when capturing. Stop disabled when not. Click fires the right callback. |
| `Map.tsx` | `colorWithAlpha` ramps 1→0 over fade window. `lerp` endpoints during grow. |

### Integration — backend

FastAPI's `TestClient` + a stub `Capturer` that we drive from the test.

| Scenario | Assertion |
|----------|-----------|
| Client connects | Receives `snapshot` (empty) + `status {capturing: false}`. |
| Client sends `start` without root | Receives `error {code: "no_sudo"}` (simulate via monkeypatch). |
| Stub capturer emits a raw packet | Client receives `packet` with matching geo. |
| Wait > `WINDOW_SECONDS` | Client receives `expire` for that packet id. |
| Client sends `stop` | `status {capturing: false}`. Expiry continues. |
| Second client connects mid-session | Gets correct `snapshot` of live packets. |

### End-to-end (Playwright)

Boots the real uvicorn server on a random port with:
- `Capturer` swapped for a **fake injector** that emits crafted `RawPacket`s from a file.
- Real `GeoResolver` pointed at a test `.mmdb`.
- Real frontend (Vite `build` artifact).

One test: inject 3 packets → open the page → click Start → within 2s the DOM contains 3 `canvas` draws (or, more reliably, the WS client has received 3 `packet` messages). Click Stop → within `WINDOW_SECONDS + 1s` the packet count returns to 0.

This avoids needing `sudo` in CI or dev while still proving the full pipeline works.

## Test doubles and fixtures

| Name | Purpose |
|------|---------|
| `tests/fixtures/tiny.mmdb` | 2-3 known IPs for `geo.py` tests. Built once via a `scripts/build_test_mmdb.py`. |
| `FakeCapturer` | Implements the same `start`/`stop`/`is_running` surface as `Capturer` but emits packets programmatically. Used by integration and e2e. |
| `scapy` packet builders | `IP(src=..., dst=...)/TCP()` constructed in-test for `capturer._handle` inputs. No sniffing. |
| Time control | `freezegun` or `asyncio.sleep` shims for expiry tests so they run in <50ms. |

## What we do NOT test

- Real Scapy `sniff()` on a real NIC — needs root, not hermetic.
- Real DB-IP download — network-dependent, flaky.
- Real browser rendering pixels — deck.gl/WebGL render is trusted.
- macOS permissions flow — manual check.

## Layout

```
tests/
├── backend/
│   ├── conftest.py
│   ├── test_net.py
│   ├── test_geo.py
│   ├── test_capturer.py
│   ├── test_window.py
│   └── test_ws_integration.py
├── frontend/
│   ├── ws.test.ts
│   ├── App.test.tsx
│   ├── Controls.test.tsx
│   └── Map.test.ts
├── e2e/
│   ├── playwright.config.ts
│   ├── fake_capturer.py
│   └── smoke.spec.ts
├── fixtures/
│   ├── tiny.mmdb
│   └── packets.jsonl
└── README.md
```

## Test runner

Single entry point `./test.sh`:

1. `pytest tests/backend` (unit + integration)
2. `cd frontend && npm run test -- --run` (vitest)
3. `cd tests/e2e && npx playwright test` (e2e, only if `--e2e` flag)

CI would run all three. Local dev runs #1 + #2 by default (fast), #3 on demand.

## Tooling

| Layer | Tool | Why |
|-------|------|-----|
| Backend unit + integration | **pytest** + **pytest-asyncio** | Standard Python. Async support. |
| Backend WS | **fastapi.testclient.TestClient** | Built-in WS support. No real sockets. |
| Frontend unit | **vitest** + **@testing-library/react** | Native Vite integration, fast. |
| E2E | **Playwright** | Runs headless Chromium, WS support, screenshot diffs if needed. |
| Coverage | **pytest-cov** + **vitest --coverage** | Per-file coverage report. |

Coverage target: **80%** backend line coverage. Frontend coverage is advisory (UI).

## What a developer runs

| Intent | Command |
|--------|---------|
| Fast check before commit | `./test.sh` (backend + frontend unit) |
| Full validation | `./test.sh --e2e` |
| Single backend test | `pytest tests/backend/test_window.py -k expiry` |
| Single frontend test | `cd frontend && npm run test -- Controls` |
