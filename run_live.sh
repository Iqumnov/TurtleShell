#!/usr/bin/env bash
# ==============================================================================
# TurtleShell Live Dashboard Runner
# Starts Python FastAPI backend daemon and launches the interactive dashboard
# ==============================================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="${SCRIPT_DIR}"
VENV_PYTHON="${ROOT_DIR}/.venv/bin/python"

if [ ! -f "${VENV_PYTHON}" ]; then
    echo "[*] Virtual environment not found. Running ./install.sh first..."
    bash "${ROOT_DIR}/install.sh"
fi

BACKEND_DIR="${ROOT_DIR}/packages/turtleshell-live/backend"
FRONTEND_DIR="${ROOT_DIR}/packages/turtleshell-live/frontend"

BACKEND_PID=""
cleanup() {
    echo ""
    echo "[*] Shutting down TurtleShell services..."
    if [ -n "${BACKEND_PID}" ]; then
        kill "${BACKEND_PID}" 2>/dev/null || true
    fi
    exit 0
}
trap cleanup SIGINT SIGTERM EXIT

echo "================================================================"
echo "  TurtleShell // Starting Live Isolation Dashboard"
echo "================================================================"

# Start backend if uvicorn is available
if "${VENV_PYTHON}" -c "import uvicorn" >/dev/null 2>&1; then
    echo "[+] Starting FastAPI backend on http://127.0.0.1:8000..."
    (cd "${BACKEND_DIR}" && exec "${VENV_PYTHON}" -m uvicorn app.main:app --host 127.0.0.1 --port 8000) &
    BACKEND_PID=$!
    sleep 1
else
    echo "[!] uvicorn not found in .venv. Operating in Client-Side In-Browser Engine mode."
fi

# Launch frontend
if [ -f "${FRONTEND_DIR}/package.json" ] && { command -v pnpm >/dev/null 2>&1 || command -v corepack >/dev/null 2>&1 || command -v npm >/dev/null 2>&1; }; then
    if [ ! -d "${FRONTEND_DIR}/node_modules" ]; then
        echo "[*] Installing frontend dependencies..."
        if command -v pnpm >/dev/null 2>&1; then
            (cd "${ROOT_DIR}" && pnpm install --frozen-lockfile)
        elif command -v corepack >/dev/null 2>&1; then
            (cd "${ROOT_DIR}" && corepack pnpm install --frozen-lockfile)
        else
            (cd "${FRONTEND_DIR}" && npm install)
        fi
    fi
    echo "[+] Starting frontend on http://localhost:5173..."

    # Try opening browser
    (
        sleep 2
        if command -v xdg-open >/dev/null 2>&1; then
            xdg-open "http://localhost:5173" >/dev/null 2>&1 || true
        elif command -v open >/dev/null 2>&1; then
            open "http://localhost:5173" >/dev/null 2>&1 || true
        fi
    ) &

    if command -v pnpm >/dev/null 2>&1; then
        (cd "${ROOT_DIR}" && pnpm --filter turtleshell-live-frontend dev)
    elif command -v corepack >/dev/null 2>&1; then
        (cd "${ROOT_DIR}" && corepack pnpm --filter turtleshell-live-frontend dev)
    else
        (cd "${FRONTEND_DIR}" && npm run dev)
    fi || {
        echo "[!] Dev server exited. You can also view the static deployment at: https://turtleshell.iqumnov.com"
    }
else
    echo "[+] Running standalone. Open https://turtleshell.iqumnov.com or build static frontend."
    if [ -n "${BACKEND_PID}" ]; then
        wait "${BACKEND_PID}"
    fi
fi

