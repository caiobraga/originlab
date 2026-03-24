-- Acelera RAG (ollama-edital): listagem de `id` por `file_id` e evita
-- "canceling statement due to statement timeout" em tabelas grandes.
-- O script também busca `content` em lotes; sem este índice a 1ª fase pode continuar lenta.
-- Execute no SQL Editor do Supabase.

CREATE INDEX IF NOT EXISTS idx_documents_file_id ON public.documents (file_id)
  WHERE file_id IS NOT NULL;

-- Opcional (fallback por edital): acelera metadata->>edital_id
-- CREATE INDEX IF NOT EXISTS idx_documents_metadata_edital_id ON public.documents ((metadata->>'edital_id'))
--   WHERE metadata->>'edital_id' IS NOT NULL;
