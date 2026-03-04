-- Adicionar coluna is_processed na tabela edital_pdfs
-- true = PDF tem registro em documents; false = ainda não; null = não verificado

ALTER TABLE edital_pdfs
ADD COLUMN IF NOT EXISTS is_processed BOOLEAN DEFAULT NULL;

COMMENT ON COLUMN edital_pdfs.is_processed IS 'Se o PDF já tem registro na tabela documents (true/false/null)';

CREATE INDEX IF NOT EXISTS idx_edital_pdfs_is_processed ON edital_pdfs(is_processed) WHERE is_processed IS NOT NULL;
