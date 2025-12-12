#!/bin/bash
cd "$(dirname "$0")/output"
rm -f *.png *.html *.csv 2>/dev/null
echo "✅ Arquivos PNG, HTML e CSV removidos"
ls -1 | head -20

