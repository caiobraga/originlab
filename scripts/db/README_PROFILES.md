# Migration: Tabela de Perfis de Usuários

Esta migration cria a tabela `profiles` para armazenar informações adicionais dos usuários (CPF, CNPJ, Lattes ID, tipo de usuário).

## Como Executar

### Via Supabase Dashboard (Recomendado)

1. Acesse o Supabase Dashboard do seu projeto
2. Vá em **SQL Editor**
3. Copie e cole o conteúdo do arquivo `migration-add-profiles-table.sql`
4. Execute a query

### Via CLI do Supabase

```bash
supabase db push
```

Ou execute diretamente:

```bash
psql -h <seu-host> -U postgres -d postgres -f scripts/db/migration-add-profiles-table.sql
```

## O que a Migration Faz

1. **Cria a tabela `profiles`** com os campos:
   - `user_id` (UUID, referência ao auth.users)
   - `cpf` (VARCHAR(11))
   - `cnpj` (VARCHAR(14))
   - `lattes_id` (VARCHAR(16))
   - `user_type` (pesquisador, pessoa-empresa, ambos)
   - `has_cnpj` (BOOLEAN)

2. **Cria índices** para melhor performance

3. **Configura RLS (Row Level Security)** para que usuários só vejam/editam seu próprio perfil

4. **Cria trigger** para atualizar `atualizado_em` automaticamente

## Após Executar a Migration

Os dados do perfil agora serão salvos na tabela `profiles` ao invés de apenas no `user_metadata` do Supabase Auth.

O código já está atualizado para:
- Salvar na tabela `profiles` quando criar/atualizar perfil
- Buscar da tabela `profiles` quando ler o perfil
- Usar `user_metadata` como fallback se a tabela não existir ou houver erro

## Migração de Dados Existentes

Se você já tem usuários com dados em `user_metadata`, você pode migrar executando:

```sql
-- Script para migrar dados existentes de user_metadata para a tabela profiles
INSERT INTO profiles (user_id, cpf, cnpj, lattes_id, user_type, has_cnpj)
SELECT 
  id as user_id,
  raw_user_meta_data->'profile'->>'cpf' as cpf,
  raw_user_meta_data->'profile'->>'cnpj' as cnpj,
  raw_user_meta_data->'profile'->>'lattesId' as lattes_id,
  COALESCE(raw_user_meta_data->'profile'->>'userType', 'pesquisador') as user_type,
  COALESCE((raw_user_meta_data->'profile'->>'hasCnpj')::boolean, false) as has_cnpj
FROM auth.users
WHERE raw_user_meta_data->'profile' IS NOT NULL
ON CONFLICT (user_id) DO NOTHING;
```


