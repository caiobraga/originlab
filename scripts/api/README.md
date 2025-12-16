# API Interna - Processamento de Informações dos Editais

Esta API interna processa informações fixas de cada edital que não dependem da relação com o usuário.

## 📋 Informações Processadas

Para cada edital, a API extrai e padroniza as seguintes informações:

1. **Valor por Projeto** - Valor disponível por projeto/bolsa
2. **Prazo de Inscrição** - Prazo para inscrição no edital
3. **Localização** - Região/local onde o edital é válido
4. **Vagas** - Número de vagas/projetos disponíveis

## 🔧 Como Funciona

1. **Busca todos os editais** do banco de dados
2. **Para cada edital:**
   - Busca os IDs dos PDFs relacionados
   - Para cada informação (valor, prazo, localização, vagas):
     - Envia uma requisição POST ao webhook n8n com:
       - `field`: nome do campo a extrair
       - `file_ids`: lista de IDs dos PDFs
   - Recebe e padroniza as respostas
   - Salva no banco de dados

## 🚀 Como Usar

### 1. Executar a Migration

Primeiro, execute a migration para adicionar os novos campos:

```sql
-- Execute no Supabase SQL Editor ou via psql
\i scripts/db/migration-add-edital-fields.sql
```

### 2. Configurar Variáveis de Ambiente

Certifique-se de ter as seguintes variáveis configuradas no `.env.local`:

```env
VITE_SUPABASE_URL=https://seu-projeto.supabase.co
VITE_SUPABASE_SERVICE_ROLE_KEY=sua-chave-service-role

# Usar n8n (padrão - recomendado devido aos limites de quota)
N8N_WEBHOOK_URL=https://n8n.srv652789.hstgr.cloud/webhook/789b0959-b90f-40e8-afe8-03aa8e486b43

# Delays para evitar rate limiting (em milissegundos)
API_REQUEST_DELAY_MS=3000      # Delay entre requisições de campos (padrão: 3000ms)
DELAY_BETWEEN_EDITAIS_MS=10000 # Delay entre processamento de editais (padrão: 10000ms)

# Ou usar API Local (opcional - ATENÇÃO: limites muito restritivos!)
# USE_LOCAL_API=true
# LOCAL_API_URL=http://localhost:3000/api/extract-edital-info
# GEMINI_API_KEY=AIzaSyARNPj2fdFb4RSnuI39gO0TGwWzgNXxisk
# GEMINI_MODEL=gemini-2.5-flash  # 7 RPM, 19 RPD (requests per day)

# Opcional: Pular editais já processados nas últimas 24h
SKIP_PROCESSED=true
```

**ℹ️ Sobre a API:**
- **n8n (padrão)**: Usa o webhook do n8n
  - Configure `N8N_WEBHOOK_URL` (já configurado por padrão)
  - O workflow precisa estar **ativo** no n8n para funcionar
- **API Local (opcional)**: Usa o Google Gemini diretamente
  - Configure `USE_LOCAL_API=true` e `GEMINI_API_KEY`
  - Certifique-se de que o servidor está rodando (`npm run dev` ou `npm start`)

### 3. Executar o Script

```bash
npm run api:process-edital-info
```

Ou diretamente:

```bash
tsx scripts/api/processEditalInfo.ts
```

## 📊 Formato das Requisições

Cada requisição ao webhook segue este formato:

```json
{
  "field": "valor_projeto",  // ou "prazo_inscricao", "localizacao", "vagas"
  "file_ids": ["uuid1", "uuid2", ...]
}
```

## 📥 Formato Esperado da Resposta

O script aceita diferentes formatos de resposta:

- **String simples**: retornado diretamente
- **JSON com array**: `[{"output": "valor"}]` - extrai o campo `output`
- **JSON com objeto**: `{"output": "valor"}` ou `{"result": "valor"}` - extrai o primeiro campo encontrado

## 🔄 Quando Executar

Execute este script sempre que:
- Adicionar novos editais ao banco
- Atualizar os PDFs de um edital
- Quiser reprocessar todas as informações

## ⚠️ Valores Default

Se uma informação não for encontrada nos PDFs, o sistema usa valores default:
- **Valor por Projeto**: "Não informado"
- **Prazo de Inscrição**: "Não informado"
- **Localização**: "Não informado"
- **Vagas**: "Não informado"

## 📝 Campos no Banco de Dados

Os seguintes campos são adicionados à tabela `editais`:

- `valor_projeto` (TEXT) - Valor por projeto padronizado
- `prazo_inscricao` (TEXT) - Prazo de inscrição padronizado
- `localizacao` (TEXT) - Localização padronizada
- `vagas` (TEXT) - Número de vagas padronizado
- `informacoes_processadas_em` (TIMESTAMP) - Data/hora do último processamento

## 🐛 Troubleshooting

### Erro: "Variáveis de ambiente não encontradas"
- Verifique se o arquivo `.env.local` existe na raiz do projeto
- Confirme que as variáveis estão com os nomes corretos

### Erro: "Nenhum PDF encontrado"
- O edital precisa ter PDFs associados na tabela `edital_pdfs`
- Execute primeiro o script de sincronização: `npm run db:sync`

### Erro de conexão com webhook
- Verifique se a URL do webhook está correta
- Confirme que o webhook n8n está configurado para aceitar requisições POST
- Verifique as configurações de CORS no n8n

