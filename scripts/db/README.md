# Banco de Dados e Storage

## Configuração Inicial

### 1. Criar Tabelas

Execute o SQL em `schema.sql` no Supabase SQL Editor:

```sql
-- Copie e cole o conteúdo completo de scripts/db/schema.sql
```

Isso criará:
- Tabela `editais` - Armazena informações dos editais
- Tabela `edital_pdfs` - Armazena referências aos PDFs
- Índices para performance
- Triggers para atualização automática de timestamps

### 2. Criar Bucket no Storage

O bucket `edital-pdfs` será criado automaticamente na primeira execução.

**Configurações recomendadas:**
- Nome: `edital-pdfs`
- Público: `true` (para acesso direto aos PDFs)
- Limite de tamanho: `50MB`
- Tipos permitidos: `application/pdf`

Para criar manualmente:
1. Acesse Supabase Dashboard → Storage
2. Clique em "New bucket"
3. Configure conforme acima

### 3. Variáveis de Ambiente

Adicione ao `.env.local`:

```env
# URL do projeto Supabase
VITE_SUPABASE_URL=https://seu-projeto.supabase.co

# Chave anon (para frontend)
VITE_SUPABASE_ANON_KEY=sua-chave-anon

# Chave service role (para scripts - OBRIGATÓRIA para uploads)
SUPABASE_SERVICE_ROLE_KEY=sua-chave-service-role
```

**Importante**: A `SUPABASE_SERVICE_ROLE_KEY` é necessária para:
- Upload de arquivos
- Operações administrativas
- Bypass de RLS (Row Level Security)

## Estrutura das Tabelas

### `editais`

| Campo | Tipo | Descrição |
|-------|------|-----------|
| `id` | UUID | Chave primária |
| `numero` | TEXT | Número do edital (ex: "10/2025") |
| `titulo` | TEXT | Título do edital (obrigatório) |
| `descricao` | TEXT | Descrição completa |
| `data_publicacao` | DATE | Data de publicação |
| `data_encerramento` | DATE | Data de encerramento |
| `status` | TEXT | Status (ex: "Ativo", "Encerrado") |
| `valor` | TEXT | Valor do edital |
| `area` | TEXT | Área de atuação |
| `orgao` | TEXT | Órgão responsável |
| `fonte` | TEXT | Fonte do scraper (obrigatório) |
| `link` | TEXT | URL do edital |
| `processado_em` | TIMESTAMP | Quando foi processado |
| `criado_em` | TIMESTAMP | Quando foi criado |
| `atualizado_em` | TIMESTAMP | Última atualização |

**Constraint único**: `(numero, fonte)` - evita duplicatas.

### `edital_pdfs`

| Campo | Tipo | Descrição |
|-------|------|-----------|
| `id` | UUID | Chave primária |
| `edital_id` | UUID | Referência ao edital (FK) |
| `nome_arquivo` | TEXT | Nome do arquivo |
| `caminho_storage` | TEXT | Caminho no storage (único) |
| `url_original` | TEXT | URL original do PDF |
| `tamanho_bytes` | BIGINT | Tamanho do arquivo |
| `tipo_mime` | TEXT | Tipo MIME (padrão: application/pdf) |
| `criado_em` | TIMESTAMP | Quando foi criado |

**Constraint único**: `caminho_storage` - evita duplicatas no storage.

## Como Funciona

### Sincronização (`sync.ts`)

1. Carrega editais de `scripts/output/editais.json`
2. Para cada edital:
   - Converte formato JSON → formato banco
   - Faz `UPSERT` na tabela `editais` (atualiza se existir)
   - Faz upload dos PDFs para o storage
   - Salva referências na tabela `edital_pdfs`

### Upload de PDFs (`storage.ts`)

1. Para cada PDF do edital:
   - Lê arquivo local de `scripts/output/pdfs/`
   - Faz upload para `edital-pdfs/{fonte}/{numero}/{nome_arquivo}.pdf`
   - Salva referência na tabela `edital_pdfs`
   - Obtém URL pública do arquivo

## Consultas Úteis

### Listar todos os editais

```sql
SELECT * FROM editais ORDER BY criado_em DESC;
```

### Listar editais por fonte

```sql
SELECT * FROM editais WHERE fonte = 'sigfapes';
```

### Listar editais ativos

```sql
SELECT * FROM editais WHERE status = 'Ativo' ORDER BY data_encerramento;
```

### Listar PDFs de um edital

```sql
SELECT 
  e.titulo,
  p.nome_arquivo,
  p.caminho_storage,
  p.tamanho_bytes
FROM edital_pdfs p
JOIN editais e ON e.id = p.edital_id
WHERE e.numero = '10/2025' AND e.fonte = 'sigfapes';
```

### Obter URL pública de um PDF

```sql
SELECT 
  e.titulo,
  p.nome_arquivo,
  'https://seu-projeto.supabase.co/storage/v1/object/public/edital-pdfs/' || p.caminho_storage as url_publica
FROM edital_pdfs p
JOIN editais e ON e.id = p.edital_id
WHERE e.id = 'uuid-do-edital';
```

## Migração para Nova Conta Supabase

Se você precisa migrar para uma nova conta Supabase, consulte o guia completo:

📖 **[MIGRATION_GUIDE.md](./MIGRATION_GUIDE.md)** - Guia completo de migração

**Resumo rápido:**
1. Exporte dados do banco antigo (`export-data.sql` ou CSV)
2. Crie schema no novo banco (`schema.sql`)
3. Importe dados (`import-data.sql` ou CSV)
4. Migre Storage (PDFs) - veja `migrate-storage.md`
5. Atualize variáveis de ambiente (`.env.local`)

## Troubleshooting

### Erro: "permission denied" ao fazer upload

- Verifique se está usando `SUPABASE_SERVICE_ROLE_KEY` (não a chave anon)
- Verifique se o bucket existe e está configurado corretamente
- Verifique as políticas de acesso do bucket no Supabase Dashboard

### Erro: "bucket not found"

- O sistema tentará criar automaticamente
- Se falhar, crie manualmente no Supabase Dashboard
- Certifique-se de que o nome é exatamente `edital-pdfs`

### PDFs não aparecem no storage

- Verifique se os arquivos existem em `scripts/output/pdfs/`
- Verifique os logs do script para erros de upload
- Verifique o tamanho dos arquivos (limite: 50MB)

### Duplicatas no banco

- O sistema usa `UPSERT` com constraint único `(numero, fonte)`
- Se houver duplicatas, verifique se o constraint foi criado corretamente
- Execute: `SELECT numero, fonte, COUNT(*) FROM editais GROUP BY numero, fonte HAVING COUNT(*) > 1;`



