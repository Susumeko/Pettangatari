#!/usr/bin/env sh
set -eu

cd "$(dirname "$0")"

PETTANGATARI_BACKEND_PORT="${PETTANGATARI_BACKEND_PORT:-3210}"
PETTANGATARI_FRONTEND_PORT="${PETTANGATARI_FRONTEND_PORT:-5173}"

echo "[Pettangatari] Preparing dev launch..."

if ! command -v npm >/dev/null 2>&1; then
  echo "[Pettangatari] npm was not found. Install Node.js 20+ and retry."
  exit 1
fi

if [ ! -d "node_modules" ]; then
  echo "[Pettangatari] Installing dependencies..."
  npm install || {
    echo "[Pettangatari] Dependency installation failed."
    exit 1
  }
fi

stop_port() {
  port="$1"
  pids=""

  if command -v lsof >/dev/null 2>&1; then
    pids="$(lsof -tiTCP:"$port" -sTCP:LISTEN 2>/dev/null || true)"
  elif command -v fuser >/dev/null 2>&1; then
    pids="$(fuser "$port"/tcp 2>/dev/null || true)"
  fi

  if [ -n "$pids" ]; then
    for pid in $pids; do
      echo "[Pettangatari] Stopping old process $pid on port $port..."
      kill "$pid" 2>/dev/null || true
    done
  fi
}

echo "[Pettangatari] Checking for existing dev servers..."
stop_port "$PETTANGATARI_BACKEND_PORT"
stop_port "$PETTANGATARI_FRONTEND_PORT"

if command -v uuidgen >/dev/null 2>&1; then
  PETTANGATARI_SHUTDOWN_TOKEN="$(uuidgen | tr -d '-' | tr '[:upper:]' '[:lower:]')"
elif [ -r /proc/sys/kernel/random/uuid ]; then
  PETTANGATARI_SHUTDOWN_TOKEN="$(tr -d '-' < /proc/sys/kernel/random/uuid)"
else
  PETTANGATARI_SHUTDOWN_TOKEN="$(date +%s%N)"
fi

export PETTANGATARI_SHUTDOWN_TOKEN
export PORT="$PETTANGATARI_BACKEND_PORT"
export PETTANGATARI_HOST="127.0.0.1"
export FRONTEND_PORT="$PETTANGATARI_FRONTEND_PORT"
export FRONTEND_HOST="127.0.0.1"

open_url() {
  url="$1"
  if command -v open >/dev/null 2>&1; then
    open "$url" >/dev/null 2>&1 || true
  elif command -v xdg-open >/dev/null 2>&1; then
    xdg-open "$url" >/dev/null 2>&1 || true
  fi
}

echo "[Pettangatari] Opening browser..."
(sleep 2 && open_url "http://localhost:$PETTANGATARI_FRONTEND_PORT") &

echo "[Pettangatari] Starting dev servers."
echo "[Pettangatari] Frontend: http://localhost:$PETTANGATARI_FRONTEND_PORT"
echo "[Pettangatari] Backend API: http://localhost:$PETTANGATARI_BACKEND_PORT"
npm run dev
