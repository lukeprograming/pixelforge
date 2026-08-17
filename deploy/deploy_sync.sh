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
