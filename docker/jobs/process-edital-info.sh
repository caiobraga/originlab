#!/usr/bin/env bash
set -euo pipefail

cd /app

# Prevent overlapping 30-min runs
exec 9>/tmp/originlab_process_edital_info.lock
if ! flock -n 9; then
  echo "[process-edital-info] already running; skipping"
  exit 0
fi

echo "[process-edital-info] $(date -Is) starting"
pnpm run api:process-edital-info
echo "[process-edital-info] $(date -Is) done"

