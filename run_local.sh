#!/usr/bin/env bash
# Sobe o PixelForge localmente (venv em backend/.venv) e abre em uma janela
# de app no navegador. VPS (forgegrid.com.br) continua intocada -- isto é
# só a instância local, em localhost.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND="$ROOT/backend"
VENV_PY="$BACKEND/.venv/bin/python3"
PORT=8000
URL="http://127.0.0.1:$PORT"
LOG="$ROOT/local_server.log"
PIDFILE="$ROOT/local_server.pid"

if [ ! -x "$VENV_PY" ]; then
  echo "Venv não encontrado em $BACKEND/.venv -- rode:"
  echo "  cd $BACKEND && python3 -m venv .venv && ./.venv/bin/pip install -r requirements.txt"
  exit 1
fi

is_up() {
  curl -sf -o /dev/null "$URL/api/sprites/meta"
}

if ! is_up; then
  echo "Subindo servidor local em $URL ..."
  cd "$BACKEND"
  nohup "$VENV_PY" -m uvicorn app.main:app --host 127.0.0.1 --port "$PORT" \
    > "$LOG" 2>&1 &
  echo $! > "$PIDFILE"
  for _ in $(seq 1 30); do
    is_up && break
    sleep 0.3
  done
  if ! is_up; then
    echo "Servidor não subiu -- veja $LOG"
    exit 1
  fi
fi

# Abre em janela de "app" (sem barra de endereço) se houver um navegador
# baseado em Chromium; senão cai pro navegador padrão via xdg-open.
for browser in google-chrome-stable google-chrome chromium chromium-browser brave-browser microsoft-edge-stable; do
  if command -v "$browser" >/dev/null 2>&1; then
    exec "$browser" --app="$URL" --new-window
  fi
done

exec xdg-open "$URL"
