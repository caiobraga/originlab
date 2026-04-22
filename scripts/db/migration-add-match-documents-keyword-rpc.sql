-- Migration: função RPC para busca por palavras-chave (BM25/FTS) em public.documents
-- Requer: extensão pg_trgm (opcional) + FTS padrão do Postgres.
--
-- Uso via Supabase RPC:
--   supabase.rpc('match_documents_keyword', { query_text, match_count, filter_file_ids, filter_edital_id })
--
-- Observação:
-- - Isso NÃO substitui o RAG vetorial; é um complemento para termos exatos, IDs, siglas e expressões técnicas.
-- - Use `websearch_to_tsquery` para suportar consultas “humanas” (com aspas, -termos, etc).

create extension if not exists pg_trgm;

create or replace function public.match_documents_keyword(
  query_text text,
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
  with q as (
    select websearch_to_tsquery('portuguese', coalesce(query_text, '')) as tsq
  )
  select
    d.id,
    d.file_id::text as file_id,
    d.metadata,
    d.content,
    ts_rank_cd(to_tsvector('portuguese', d.content), q.tsq)::float as similarity
  from public.documents d
  cross join q
  where d.content is not null
    and q.tsq is not null
    and (
      (filter_file_ids is not null and (
        d.file_id::text = any(filter_file_ids)
        or (d.metadata->>'file_id') = any(filter_file_ids)
      ))
      or (filter_edital_id is not null and (d.metadata->>'edital_id') = filter_edital_id)
    )
    and to_tsvector('portuguese', d.content) @@ q.tsq
  order by ts_rank_cd(to_tsvector('portuguese', d.content), q.tsq) desc
  limit greatest(match_count, 1);
$$;

comment on function public.match_documents_keyword(text, int, text[], text)
is 'RAG keyword: top-k chunks por FTS (ts_rank_cd) filtrando por file_id/metadata.file_id e opcional metadata.edital_id';

