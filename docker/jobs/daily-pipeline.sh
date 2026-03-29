#!/usr/bin/env bash
set -euo pipefail

cd /app

# Prevent overlaps (e.g., slow scrape)
exec 9>/tmp/originlab_daily.lock
if ! flock -n 9; then
  echo "[daily] already running; skipping"
  exit 0
fi

echo "[daily] $(date -Is) starting"

# User asked: scrape-all -> db:snc -> db:populate-documents-from-pdfs
# In this repo the scripts are: scrape:all -> db:sync -> db:populate-documents-from-pdfs
pnpm run scrape:all
pnpm run db:sync
pnpm run db:populate-documents-from-pdfs

echo "[daily] $(date -Is) done"

