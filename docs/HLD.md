# Map Traceroute — High-Level Design

See [SPEC.md](./SPEC.md) for product scope.

## Overview

Everything runs on the user's machine. There are three parts: a **packet capturer**, a **web server**, and a **browser UI**. They all start from one command.

## Components

| Component | Responsibility |
|-----------|----------------|
| **Packet capturer** | Sniffs live network packets. Extracts source IP, destination IP, and timestamp. |
| **Geo resolver** | Turns an IP into `{lat, lng, city, country}`. Uses a local IP-to-geo database so no external calls are made. |
| **Window manager** | Holds captured packets in memory. Drops anything older than 5 seconds. Runs continuously after Start — does not stop when capture stops. |
| **Web server** | Serves the UI and streams packet events to the browser over WebSocket. Exposes `start` and `stop` controls. |
| **Browser UI** | Renders the world map (arcs colored by protocol, height by direction) **and a live packet list** below it, both driven by the same packet stream. Start / Stop buttons. |

## Data flow

```
  NIC
   |  (raw packets)
   v
[Packet capturer] --ip--> [Geo resolver] --{src,dst,ts,latlng}--> [Window manager]
                                                                        |
                                                              (stream on WS)
                                                                        v
                                                                  [Web server]
                                                                        |
                                                                        v
                                                                  [Browser UI]
                                                                  (map + list)
```

The packet list and the map are fed from the **same** in-memory `Map<id, PacketState>` on the client. No extra server stream or duplicated state.

## Packet event (server -> UI)

```json
{
  "id": "uuid",
  "ts": 1714761600.123,
  "direction": "in | out",
  "proto": "tcp | udp | icmp | other",
  "length": 1460,
  "src": {
    "ip": "1.2.3.4", "lat": 37.77, "lng": -122.41,
    "city": "San Francisco", "country": "US", "local": false
  },
  "dst": {
    "ip": "5.6.7.8", "lat": 51.50, "lng": -0.12,
    "city": "London", "country": "GB", "local": false
  }
}
```

`city` and `country` come from the geo DB (`null` if missing). `local: true` marks the user's own machine — the list shows `(local)` instead of a city.

## Control messages (UI -> server)

- `start` — begin capture.
- `stop` — end capture. Window manager keeps expiring lines until empty.

## Lifecycle

1. User runs the single setup command.
2. Command installs deps, requests packet-capture permission if needed, starts the web server, opens the browser to `localhost:<port>`.
3. User clicks **Start**. Capturer begins. Events stream to the UI. Lines animate on the map.
4. User clicks **Stop**. Capturer halts. Existing lines fade out over the next 5 seconds.
5. User closes the browser / kills the process to exit.

## Tech stack

**Target OS:** macOS.

### Backend (capturer + server)

| Part | Choice | Why |
|------|--------|-----|
| Language | **Python 3** | User preference. |
| Packet capture | **Scapy** | Pure Python, works on macOS via BPF. Needs `sudo` for raw capture. |
| Web server | **FastAPI** + **uvicorn** | Async, native WebSocket support, serves static files. |
| Geo lookup | **geoip2** + **MaxMind GeoLite2-City** (local `.mmdb`) | Offline, free, fast. No external calls. |

### Frontend (UI)

| Part | Choice | Why |
|------|--------|-----|
| Framework | **React** + **TypeScript** | User preference. |
| Build tool | **Vite** | Fast, zero-config. |
| Map rendering | **deck.gl `ArcLayer`** | Purpose-built for animated source → destination arcs. GPU-accelerated. |
| Base map | **deck.gl `GeoJsonLayer`** with a bundled country-outline GeoJSON (Natural Earth) | No tiles, no tokens, no external services at runtime. The GeoJSON ships with the repo. |
| Transport | Native browser **WebSocket** | No extra lib needed. |

### Packaging and run

- **Single command:** `./run.sh` (or `make run`) at repo root.
- The script: creates a Python venv, installs backend deps, downloads the GeoLite2 DB if missing, builds the React app once into `dist/`, starts `uvicorn` (which serves `dist/` + `/ws`), and opens the browser to `http://localhost:<port>`.
- Backend is started via `sudo` (required for packet capture on macOS).
