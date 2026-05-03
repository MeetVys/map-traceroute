#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")"

# 1. Python venv
if [ ! -d .venv ]; then
  python3 -m venv .venv
fi
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

# 3. Country outlines (Natural Earth via world-atlas, public domain)
if [ ! -s frontend/public/countries.geojson ] || [ "$(wc -c < frontend/public/countries.geojson)" -lt 1000 ]; then
  echo "Downloading country outlines..."
  curl -fL -o frontend/public/countries.geojson \
    "https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_110m_admin_0_countries.geojson"
fi

# 4. Frontend build (no sudo)
pushd frontend >/dev/null
if [ ! -d node_modules ]; then
  npm install
fi
npm run build
popd >/dev/null

# 5. Start server under sudo (packet capture needs root on macOS)
trap 'kill $SERVER_PID 2>/dev/null || true' INT TERM
sudo -E .venv/bin/python -m uvicorn backend.main:app \
  --host 127.0.0.1 --port 8765 &
SERVER_PID=$!

sleep 1
open "http://localhost:8765" || true

wait $SERVER_PID
