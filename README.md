# Map Traceroute

Ever wondered where in the world your laptop is actually talking to? Right now, even while you're reading this, your machine is quietly swapping thousands of packets with servers scattered across every continent — handshakes for your browser tabs, background syncs you forgot about, DNS queries flying out the door — and you can't see a single one of them.

**Map Traceroute makes all of that visible.**

It's a little local tool that taps into your network interface, grabs every IP packet going in and out, looks up where each remote endpoint lives on the planet, and paints an animated arc from **you** to **them** on a world map — in real time. The arcs are color-coded by protocol (blue for TCP, green for UDP, magenta for ICMP, gray for everything else), they arch high for outgoing traffic and stay low for incoming, and each one lingers for exactly five seconds before fading away. Below the map, a Wireshark-style live feed lists every packet with source, destination, city, country, bytes, age. Three switchable themes (console-dark, space-blue, topographic-paper) let you pick whatever aesthetic suits your mood.

No cloud. No telemetry. No accounts. Everything — packet capture, geo lookup, rendering — runs entirely on your machine, so your traffic never leaves it. One command (`./run.sh`) sets it all up, including the first-time download of a free offline geo database, and opens the UI in your browser.

Currently macOS-only (packet capture uses BPF, which needs `sudo`).

## Run

```bash
./run.sh
```

That one command:

1. Creates a Python venv and installs deps.
2. Downloads the DB-IP City Lite geo database (~50 MB, monthly, CC-BY 4.0).
3. Downloads a country-outline GeoJSON (Natural Earth, public domain).
4. Builds the React UI.
5. Prompts for your `sudo` password (packet capture needs root).
6. Starts the server and opens `http://localhost:8765` in your browser once it's ready.

Click **Start** to begin capture, **Stop** to end it. Existing arcs fade out over the next 5 seconds.

## Test

```bash
./test.sh          # backend + frontend unit tests (~6s)
./test.sh --e2e    # adds a full-pipeline e2e test (~12s total)
```

See [docs/TEST_HLD.md](./docs/TEST_HLD.md) and [docs/TEST_LLD.md](./docs/TEST_LLD.md) for what's covered.

## Agent prompt

Paste this into Claude Code (or any capable coding agent) from an empty directory:

```
Clone https://github.com/MeetVys/map-traceroute, cd into it, and run
./run.sh. If anything fails (missing python3, missing node, missing
curl, download errors, port 8765 in use, etc.) diagnose and fix it,
then re-run. Once the server is up, confirm the UI loads at
http://localhost:8765 and tell me it's ready. Do not modify any
source files unless required to fix a runtime error.
```

## Project layout

```
backend/      FastAPI + Scapy capturer + maxminddb geo + 5s window manager
frontend/    React + TypeScript + Vite + deck.gl (ArcLayer + GeoJsonLayer)
tests/       backend unit + integration + end-to-end
docs/        SPEC, HLD, LLD, TEST_HLD, TEST_LLD
data/        downloaded geo DB (gitignored)
run.sh       single-command setup + launch
test.sh      single-command test runner
```

## Docs

- [docs/SPEC.md](./docs/SPEC.md) — product scope
- [docs/HLD.md](./docs/HLD.md) — high-level design
- [docs/LLD.md](./docs/LLD.md) — low-level design
- [docs/TEST_HLD.md](./docs/TEST_HLD.md) — testing strategy
- [docs/TEST_LLD.md](./docs/TEST_LLD.md) — test case catalog

## Attribution

Geo data by [DB-IP](https://db-ip.com) (CC-BY 4.0). Country outlines from [Natural Earth](https://www.naturalearthdata.com/) (public domain).
