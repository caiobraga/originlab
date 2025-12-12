#!/bin/bash

echo "📦 Instalando dependências do projeto..."
cd "$(dirname "$0")/.."

echo "🔧 Instalando puppeteer..."
npm install puppeteer@^23.11.1 --save-dev --legacy-peer-deps

echo "✅ Instalação concluída!"
echo ""
echo "🚀 Agora você pode executar:"
echo "   npm run scrape:sigfapes"

