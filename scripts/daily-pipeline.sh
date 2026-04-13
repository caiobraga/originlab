#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

echo "[daily-pipeline] $(date -Is) starting"

# Run sequentially (wait for each to finish)
npm run scrape:all
npm run db:sync
npm run db:populate-documents-from-pdfs

echo "[daily-pipeline] $(date -Is) done"
