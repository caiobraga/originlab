# Programa de Referência - Setup do Banco de Dados

Para o Programa de Referência funcionar completamente, execute a migration no Supabase:

## Executar Migration

1. Acesse o [Supabase Dashboard](https://supabase.com/dashboard) do seu projeto
2. Vá em **SQL Editor**
3. Copie e execute o conteúdo de `migration-add-referrals.sql`

Ou via linha de comando:

```bash
psql $DATABASE_URL -f scripts/db/migration-add-referrals.sql
```

## O que a migration adiciona

- **profiles.referral_code**: Código único de 8 caracteres por usuário
- **Tabela referrals**: Registra indicações (referrer → referred) com ganhos de R$ 50 por conversão

## Fluxo

1. Usuário A acessa `/referencia`, faz login e obtém seu link: `https://seu-site.com/ref/abc123xy`
2. Usuário B clica no link → visita `/ref/abc123xy` → código é armazenado no localStorage → redireciona para `/cadastro`
3. Usuário B se cadastra → ao criar conta, o sistema verifica o código e registra a indicação
4. Usuário A recebe R$ 50 em créditos (quando a tabela referrals existir)
