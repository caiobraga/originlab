#!/bin/bash

# Script para copiar configurações do Supabase do unifap para originlab

if [ ! -f "../unifap/.env.local" ]; then
    echo "❌ Arquivo ../unifap/.env.local não encontrado"
    exit 1
fi

echo "📋 Lendo configurações do unifap..."

# Extrair valores do .env.local do unifap
SUPABASE_URL=$(grep "^NEXT_PUBLIC_SUPABASE_URL=" ../unifap/.env.local | cut -d "=" -f2- | sed 's/^[[:space:]]*//;s/[[:space:]]*$//' | sed "s/^['\"]//;s/['\"]$//")
SUPABASE_KEY=$(grep "^NEXT_PUBLIC_SUPABASE_ANON_KEY=" ../unifap/.env.local | cut -d "=" -f2- | sed 's/^[[:space:]]*//;s/[[:space:]]*$//' | sed "s/^['\"]//;s/['\"]$//")

if [ -z "$SUPABASE_URL" ] || [ -z "$SUPABASE_KEY" ]; then
    echo "❌ Não foi possível encontrar as configurações do Supabase no unifap"
    echo "   Verifique se o arquivo ../unifap/.env.local contém:"
    echo "   NEXT_PUBLIC_SUPABASE_URL=..."
    echo "   NEXT_PUBLIC_SUPABASE_ANON_KEY=..."
    exit 1
fi

echo "✅ Configurações encontradas!"
echo "   URL: ${SUPABASE_URL:0:30}..."
echo "   KEY: ${SUPABASE_KEY:0:30}..."

# Criar .env.local no originlab
cat > .env.local << EOF
# App Configuration
VITE_APP_TITLE=Origem.Lab
VITE_APP_LOGO=/favicon.ico

# Supabase Configuration (copiado do unifap)
VITE_SUPABASE_URL=$SUPABASE_URL
VITE_SUPABASE_ANON_KEY=$SUPABASE_KEY

# Analytics (Optional - leave empty if not using)
VITE_ANALYTICS_ENDPOINT=
VITE_ANALYTICS_WEBSITE_ID=
EOF

echo "✅ Arquivo .env.local criado no originlab!"
echo ""
echo "📝 Conteúdo do arquivo:"
cat .env.local

