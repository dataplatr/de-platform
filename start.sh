#!/usr/bin/env bash
# Start both frontend (Vite) and backend (FastAPI) in parallel.
# Vite proxy forwards /api/* → http://localhost:8000 — no CORS, no ngrok needed.
#
# Usage:
#   ./start.sh           # start both
#   ./start.sh backend   # backend only
#   ./start.sh frontend  # frontend only

set -e
ROOT="$(cd "$(dirname "$0")" && pwd)"

start_backend() {
  echo "▶ Backend  → http://localhost:8000  (docs: http://localhost:8000/docs)"
  cd "$ROOT/backend"
  conda run -n next uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
}

start_frontend() {
  echo "▶ Frontend → http://localhost:5173"
  cd "$ROOT/frontend"
  npm run dev
}

case "${1:-both}" in
  backend)  start_backend ;;
  frontend) start_frontend ;;
  both)
    start_backend &
    BACKEND_PID=$!
    start_frontend &
    FRONTEND_PID=$!
    trap "kill $BACKEND_PID $FRONTEND_PID 2>/dev/null" EXIT
    wait
    ;;
esac
