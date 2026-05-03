# Map Traceroute

A local tool that captures your computer's network packets in real time and draws animated arcs between source and destination on a world map. Incoming and outgoing packets, 5-second moving window.

macOS only.

## Run

```bash
./run.sh
```

That one command:

1. Creates a Python venv and installs deps.
2. Downloads the DB-IP City Lite geo database (~50 MB, monthly, CC-BY 4.0).
3. Downloads a country-outline GeoJSON (Natural Earth, public domain).
4. Builds the React UI.
5. Starts the server under `sudo` (packet capture needs root).
6. Opens `http://localhost:8765` in your browser.

You'll be prompted for your password once (for `sudo`). Click **Start** to begin capture.

## Agent prompt

Paste this into Claude Code (or any capable coding agent) from an empty directory:

```
Clone https://github.com/<your>/map-traceroute, cd into it, and run
./run.sh. If anything fails (missing python3, missing node, missing
curl, download errors, port in use on 8765, etc.) diagnose and fix
it, then re-run. Once the server is up, confirm the UI loads at
http://localhost:8765 and tell me it's ready. Do not modify any
source files unless required to fix a runtime error.
```

## Docs

- [SPEC.md](./SPEC.md) — product scope
- [HLD.md](./HLD.md) — high-level design
- [LLD.md](./LLD.md) — low-level design

## Attribution

Geo data by [DB-IP](https://db-ip.com) (CC-BY 4.0). Country outlines from [Natural Earth](https://www.naturalearthdata.com/) (public domain).
