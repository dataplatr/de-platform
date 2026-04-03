#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
#  Lakeflow Designer — launcher
#
#  Usage:  ./run.sh
#
#  Edit config.env to change ports. That's the only file you ever need to touch.
# ─────────────────────────────────────────────────────────────────────────────
set -e

ROOT="$(cd "$(dirname "$0")" && pwd)"
cd "$ROOT"

# ── Load config ───────────────────────────────────────────────────────────────
if [ -f config.env ]; then
    set -a
    # shellcheck source=config.env
    source config.env
    set +a
fi
FRONTEND_PORT=${FRONTEND_PORT:-3000}
BACKEND_PORT=${BACKEND_PORT:-8000}

# ── Check Docker is running ───────────────────────────────────────────────────
if ! docker info > /dev/null 2>&1; then
    echo ""
    echo "  ERROR: Docker is not running."
    echo ""
    echo "  Please open Docker Desktop and wait for the whale icon"
    echo "  in the menu bar to stop animating, then run this again."
    echo ""
    exit 1
fi

# ── Ctrl+C handler ────────────────────────────────────────────────────────────
cleanup() {
    echo ""
    echo "  Stopping Lakeflow Designer..."
    docker compose down
    echo ""
    echo "  All stopped. Ports ${FRONTEND_PORT} and ${BACKEND_PORT} are now free."
    echo ""
    exit 0
}
trap cleanup INT TERM

# # ── Banner ────────────────────────────────────────────────────────────────────
# echo ""
# echo "  ┌──────────────────────────────────────────────┐"
# echo "  │           Lakeflow Designer                  │"
# echo "  ├──────────────────────────────────────────────┤"
# echo "  │                                              │"
# echo "  │  App   →  http://localhost:${FRONTEND_PORT}  │"
# echo "  │  API   →  http://localhost:${BACKEND_PORT}   │"
# echo "  │                                              │"
# echo "  │  First run takes ~2 min (building images).   │"
# echo "  │  Subsequent runs start in seconds.           │"
# echo "  │                                              │"
# echo "  │  Press Ctrl+C to stop.                       │"
# echo "  └──────────────────────────────────────────────┘"
# echo ""

# ── Start ─────────────────────────────────────────────────────────────────────
docker compose up --build

# docker compose exited on its own — clean up
cleanup
