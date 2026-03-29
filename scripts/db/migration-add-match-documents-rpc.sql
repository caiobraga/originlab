-- Migration: função RPC para busca vetorial (RAG top-k) em public.documents
-- Requer: pgvector + coluna documents.embedding preenchida (use scripts/db/embed-documents.ts)
--
-- Uso via Supabase RPC:
--   supabase.rpc('match_documents', { query_embedding, match_count, filter_file_ids, filter_edital_id })

create extension if not exists vector;

create or replace function public.match_documents(
  query_embedding vector(1024),
  match_count int,
  filter_file_ids text[],
  filter_edital_id text default null
)
returns table (
  id uuid,
  file_id text,
  metadata jsonb,
  content text,
  similarity float
)
language sql
stable
as $$
  select
    d.id,
    d.file_id::text as file_id,
    d.metadata,
    d.content,
    (1 - (d.embedding <=> query_embedding))::float as similarity
  from public.documents d
  where d.embedding is not null
    and d.content is not null
    and (
      (filter_file_ids is not null and (
        d.file_id::text = any(filter_file_ids)
        or (d.metadata->>'file_id') = any(filter_file_ids)
      ))
      or (filter_edital_id is not null and (d.metadata->>'edital_id') = filter_edital_id)
    )
  order by d.embedding <=> query_embedding
  limit greatest(match_count, 1);
$$;

comment on function public.match_documents(vector, int, text[], text)
is 'RAG: retorna top-k chunks de documents por similaridade (cosine distance) filtrando por file_id/metadata.file_id e opcionalmente metadata.edital_id';

