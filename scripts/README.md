# Scripts de Web Scraping

Sistema modular para extrair editais de múltiplas fontes e sincronizar com o banco de dados Supabase.

## Estrutura

```
scripts/
├── types.ts                    # Interface comum para todos os scrapers
├── orchestrator.ts             # Orquestrador que executa múltiplos scrapers
├── run-all.ts                  # Script principal (executa tudo)
├── scrape-sigfapes.ts          # Scraper original do SIGFAPES
├── scrapers/
│   ├── index.ts                # Exporta todos os scrapers
│   ├── sigfapes-scraper.ts     # Wrapper do scraper SIGFAPES
│   └── example-scraper.ts      # Exemplo de como criar novo scraper
└── db/
    ├── schema.sql              # SQL para criar tabelas no Supabase
    ├── sync.ts                 # Sincronização com banco de dados
    └── storage.ts              # Upload de PDFs para Supabase Storage
```

## Como Usar

### Executar todos os scrapers

```bash
npm run scrape:all
```

Este comando:
1. Executa todos os scrapers registrados
2. Consolida os resultados em `scripts/output/editais.json`
3. Sincroniza com o banco de dados Supabase
4. Faz upload dos PDFs para o Supabase Storage

### Executar apenas um scraper específico

```bash
npm run scrape:sigfapes
```

### Sincronizar manualmente com o banco

```bash
npm run db:sync
```

## Configuração

### Variáveis de Ambiente

Crie um arquivo `.env.local` na raiz do projeto com:

```env
VITE_SUPABASE_URL=https://seu-projeto.supabase.co
VITE_SUPABASE_ANON_KEY=sua-chave-anon
SUPABASE_SERVICE_ROLE_KEY=sua-chave-service-role
```

**Importante**: Para upload de arquivos e operações administrativas, você precisa da `SUPABASE_SERVICE_ROLE_KEY` (não a chave anon).

### Banco de Dados

**Opção 1: Criar tabelas do zero (recomendado se não há dados)**
Execute o SQL em `scripts/db/schema.sql` no Supabase SQL Editor:

```sql
-- Copie e cole o conteúdo de scripts/db/schema.sql
```

**Opção 2: Adicionar colunas faltantes (se a tabela já existe)**
Se você já tem a tabela mas falta a coluna `status` ou outras, execute:

```sql
-- Copie e cole o conteúdo de scripts/db/migration.sql
```

**Opção 3: Recriar tabelas (apaga dados existentes!)**
Se quiser recriar tudo do zero:

```sql
-- Copie e cole o conteúdo de scripts/db/fix-schema.sql
-- ATENÇÃO: Isso apaga todos os dados existentes!
```

### Storage

O sistema criará automaticamente o bucket `edital-pdfs` no Supabase Storage na primeira execução.

Para criar manualmente:
1. Acesse o Supabase Dashboard
2. Vá em Storage
3. Crie um bucket chamado `edital-pdfs`
4. Configure como público (public: true)
5. Limite de tamanho: 50MB
6. Tipos permitidos: `application/pdf`

## Criando um Novo Scraper

1. **Copie o exemplo:**
   ```bash
   cp scripts/scrapers/example-scraper.ts scripts/scrapers/seu-scraper.ts
   ```

2. **Implemente a interface `Scraper`:**
   ```typescript
   import { Scraper, Edital } from '../types';

   export class SeuScraper implements Scraper {
     readonly name = 'seu-scraper';
     
     async scrape(): Promise<Edital[]> {
       // Sua lógica aqui
       return [];
     }
     
     async cleanup(): Promise<void> {
       // Limpar recursos
     }
   }
   ```

3. **Registre o scraper em `scripts/scrapers/index.ts`:**
   ```typescript
   import { SeuScraper } from './seu-scraper';
   
   export const scrapers: Scraper[] = [
     new SigfapesScraper(),
     new SeuScraper(), // Adicione aqui
   ];
   ```

## Formato de Dados

Todos os scrapers devem retornar editais no seguinte formato:

```typescript
interface Edital {
  numero?: string;              // Ex: "10/2025"
  titulo?: string;               // Título do edital
  descricao?: string;            // Descrição completa
  dataPublicacao?: string;       // Formato: "DD/MM/YYYY"
  dataEncerramento?: string;     // Formato: "DD/MM/YYYY"
  status?: string;               // Ex: "Ativo", "Encerrado"
  valor?: string;                 // Ex: "R$ 100.000,00"
  area?: string;                  // Área de atuação
  orgao?: string;                // Órgão responsável
  fonte?: string;                // Nome do scraper (preenchido automaticamente)
  link?: string;                  // URL do edital
  pdfUrls?: string[];            // URLs originais dos PDFs
  pdfPaths?: string[];           // Caminhos locais dos PDFs
  processadoEm?: string;         // ISO timestamp (preenchido automaticamente)
}
```

## Estrutura do Banco de Dados

### Tabela `editais`

Armazena informações sobre os editais.

- `id` (UUID): Chave primária
- `numero` (TEXT): Número do edital
- `titulo` (TEXT): Título (obrigatório)
- `descricao` (TEXT): Descrição completa
- `data_publicacao` (DATE): Data de publicação
- `data_encerramento` (DATE): Data de encerramento
- `status` (TEXT): Status do edital
- `valor` (TEXT): Valor do edital
- `area` (TEXT): Área de atuação
- `orgao` (TEXT): Órgão responsável
- `fonte` (TEXT): Fonte do scraper (obrigatório)
- `link` (TEXT): URL do edital
- `processado_em` (TIMESTAMP): Quando foi processado
- `criado_em` (TIMESTAMP): Quando foi criado
- `atualizado_em` (TIMESTAMP): Última atualização

**Constraint único**: `(numero, fonte)` - evita duplicatas do mesmo edital da mesma fonte.

### Tabela `edital_pdfs`

Armazena referências aos PDFs no Supabase Storage.

- `id` (UUID): Chave primária
- `edital_id` (UUID): Referência ao edital
- `nome_arquivo` (TEXT): Nome do arquivo
- `caminho_storage` (TEXT): Caminho no storage (único)
- `url_original` (TEXT): URL original do PDF
- `tamanho_bytes` (BIGINT): Tamanho do arquivo
- `tipo_mime` (TEXT): Tipo MIME (padrão: application/pdf)
- `criado_em` (TIMESTAMP): Quando foi criado

## Troubleshooting

### Erro: "Variáveis de ambiente do Supabase não configuradas"

Configure as variáveis `SUPABASE_URL` e `SUPABASE_SERVICE_ROLE_KEY` no `.env.local`.

### Erro: "Bucket não encontrado"

O sistema tentará criar o bucket automaticamente. Se falhar, crie manualmente no Supabase Dashboard.

### Erro: "Permission denied" ao fazer upload

Certifique-se de usar a `SUPABASE_SERVICE_ROLE_KEY` (não a chave anon) para operações administrativas.

### PDFs não aparecem no storage

Verifique:
1. Se o bucket `edital-pdfs` existe e está público
2. Se as permissões do bucket permitem uploads
3. Se os arquivos PDF foram baixados corretamente em `scripts/output/pdfs/`

## Scripts Disponíveis

- `npm run scrape:all` - Executa todos os scrapers e sincroniza
- `npm run scrape:sigfapes` - Executa apenas o scraper SIGFAPES
- `npm run db:sync` - Sincroniza manualmente com o banco
