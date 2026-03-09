-- Altera a coluna embedding de 768 para 1024 dimensões (mxbai-embed-large).
-- Execute no Supabase SQL Editor se você ver "expected 768 dimensions, not 1024".
-- Os embeddings atuais (768d) serão removidos; rode db:embed-documents de novo após aplicar.

update public.documents set embedding = null where embedding is not null;

alter table public.documents
  alter column embedding type vector(1024);
