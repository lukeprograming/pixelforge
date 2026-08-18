#!/bin/bash
set -euo pipefail
cd /root/pixelforge
LOG=/var/log/pixelforge-sync.log

echo "[$(date -u +%FT%TZ)] checking for updates..." >> "$LOG"

git fetch origin main >> "$LOG" 2>&1
LOCAL_REV=$(git rev-parse HEAD)
REMOTE_REV=$(git rev-parse origin/main)

if [ "$LOCAL_REV" = "$REMOTE_REV" ]; then
  echo "[$(date -u +%FT%TZ)] no changes, skip" >> "$LOG"
  exit 0
fi

# só atualiza se origin/main for de fato um avanço (fast-forward) a partir do
# HEAD local -- protege o VPS de ser rebaixado se alguém empurrar por engano
# um estado antigo, ou reescrever o histórico remoto (force-push divergente)
if ! git merge-base --is-ancestor "$LOCAL_REV" "$REMOTE_REV"; then
  echo "[$(date -u +%FT%TZ)] WARNING: origin/main ($REMOTE_REV) nao e um avanco do HEAD local ($LOCAL_REV) -- nao e fast-forward, pulando por seguranca (possivel push de versao antiga ou historico reescrito)" >> "$LOG"
  exit 0
fi

echo "[$(date -u +%FT%TZ)] updating $LOCAL_REV -> $REMOTE_REV" >> "$LOG"
git reset --hard origin/main >> "$LOG" 2>&1
/root/pixelforge/backend/.venv/bin/pip install -q -r backend/requirements.txt >> "$LOG" 2>&1
systemctl restart pixelforge.service
sleep 2
if systemctl is-active --quiet pixelforge.service; then
  echo "[$(date -u +%FT%TZ)] restarted OK" >> "$LOG"
else
  echo "[$(date -u +%FT%TZ)] WARNING: service not active after restart!" >> "$LOG"
fi
