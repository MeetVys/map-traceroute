#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"

E2E=0
for arg in "$@"; do
  [ "$arg" = "--e2e" ] && E2E=1
done

# Python
if [ ! -d .venv ]; then
  python3 -m venv .venv
  .venv/bin/pip install -q -r backend/requirements.txt -r backend/requirements-dev.txt
fi

echo "▶ backend tests"
.venv/bin/pytest tests/backend --no-header -q

echo
echo "▶ frontend tests"
pushd frontend >/dev/null
if [ ! -d node_modules ]; then
  npm install
fi
npm run test -- --run
popd >/dev/null

if [ $E2E -eq 1 ]; then
  echo
  echo "▶ e2e tests"
  if [ ! -f data/dbip-city-lite.mmdb ]; then
    echo "  geo DB missing — run ./run.sh once to download, then re-run with --e2e"
    exit 1
  fi
  .venv/bin/pytest tests/e2e --no-header -q
fi

echo
echo "✓ all tests passed"
