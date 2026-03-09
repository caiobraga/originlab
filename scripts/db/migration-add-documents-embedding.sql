-- Migration: adicionar colunas de embedding e metadata à tabela documents
-- Execute no Supabase SQL Editor antes de rodar o script db:embed-documents.
--
-- 1. Habilitar extensão pgvector (se ainda não estiver)
create extension if not exists vector;

-- 2. Adicionar coluna embedding (vetor) à tabela documents
-- Dimensão 1024 para mxbai-embed-large (Ollama). Outros: nomic-embed-text=768, OpenAI text-embedding-3-small=1536.
alter table public.documents
  add column if not exists embedding vector(1024);

-- 3. Adicionar coluna content (texto para RAG; o script db:embed-documents preenche a partir da coluna de origem, ex.: name)
alter table public.documents
  add column if not exists content text;

-- 4. Adicionar coluna metadata (jsonb) para extra data (ex.: file_id)
alter table public.documents
  add column if not exists metadata jsonb default '{}'::jsonb;

-- 5. Índice para busca por similaridade (opcional, melhora performance em muitas linhas)
-- Descomente após popular os embeddings:
-- create index if not exists idx_documents_embedding_cosine
--   on public.documents using ivfflat (embedding vector_cosine_ops)
--   with (lists = 100);

comment on column public.documents.embedding is 'Vetor de embedding do conteúdo (ex.: mxbai-embed-large 1024d)';
comment on column public.documents.content is 'Texto do documento (preenchido por db:embed-documents; usado pelo RAG)';
comment on column public.documents.metadata is 'Metadados extras (ex.: file_id, source) para RAG e filtros';
