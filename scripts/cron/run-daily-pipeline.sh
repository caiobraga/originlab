#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/../.."

# Prevent overlapping runs (e.g. slow scrape)
mkdir -p .tmp
exec 9>.tmp/daily-pipeline.lock
if ! flock -n 9; then
  echo "[cron] $(date -Is) daily-pipeline already running; skipping"
  exit 0
fi

echo "[cron] $(date -Is) triggering daily pipeline"
exec ./scripts/daily-pipeline.sh
