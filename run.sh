
#!/usr/bin/env bash

# CyberCraft - Backend + Frontend Launcher

set -u

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_DIR="$PROJECT_DIR/backend"
FRONTEND_DIR="$PROJECT_DIR/frontend"

PYTHON="$BACKEND_DIR/.venv/bin/python"

BACKEND_PID=""
FRONTEND_PID=""
CLEANED=0

cleanup() {
    if [[ "$CLEANED" -eq 1 ]]; then
        return
    fi

    CLEANED=1
    echo ""
    echo "Stopping CyberCraft..."

    [[ -n "$BACKEND_PID" ]] && kill "$BACKEND_PID" 2>/dev/null || true
    [[ -n "$FRONTEND_PID" ]] && kill "$FRONTEND_PID" 2>/dev/null || true

    wait 2>/dev/null || true
    echo "CyberCraft stopped."
}

trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

# Check project directories
if [[ ! -d "$BACKEND_DIR" || ! -d "$FRONTEND_DIR" ]]; then
    echo "ERROR: Backend or Frontend directory not found."
    exit 1
fi

# Check Python executable inside virtual environment
if [[ ! -x "$PYTHON" ]]; then
    echo "ERROR: Python not found in backend/.venv"
    echo "Check: ls -la backend/.venv/bin/python*"
    exit 1
fi

# Check frontend dependencies
if [[ ! -d "$FRONTEND_DIR/node_modules" ]]; then
    echo "Installing frontend dependencies..."
    (cd "$FRONTEND_DIR" && npm install) || exit 1
fi

echo "Starting CyberCraft Backend..."

(
    cd "$BACKEND_DIR" || exit 1
    exec "$PYTHON" -m uvicorn app.main:app \
        --reload \
        --host 127.0.0.1 \
        --port 8000
) &

BACKEND_PID=$!

# Wait for backend startup
sleep 3

if ! kill -0 "$BACKEND_PID" 2>/dev/null; then
    echo "ERROR: Backend failed to start."
    exit 1
fi

echo "Starting CyberCraft Frontend..."

(
    cd "$FRONTEND_DIR" || exit 1
    exec npm run dev -- --host 127.0.0.1
) &

FRONTEND_PID=$!

echo ""
echo "===================================="
echo "       CYBERCRAFT IS RUNNING"
echo "===================================="
echo "Backend:  http://127.0.0.1:8000"
echo "API Docs: http://127.0.0.1:8000/docs"
echo "Frontend: http://127.0.0.1:5173"
echo "===================================="
echo "Press CTRL+C to stop both servers."

wait
