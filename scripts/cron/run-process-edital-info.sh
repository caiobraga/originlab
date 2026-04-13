#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/../.."

# Prevent overlapping runs (this job can be frequent)
mkdir -p .tmp
exec 9>.tmp/process-edital-info.lock
if ! flock -n 9; then
  echo "[cron] $(date -Is) api:process-edital-info already running; skipping"
  exit 0
fi

echo "[cron] $(date -Is) running api:process-edital-info"
exec npm run api:process-edital-info
