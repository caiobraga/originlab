-- Adicionar coluna file_id na tabela edital_pdfs
-- Esta coluna armazena o ID do arquivo no Supabase Storage (usado pelo n8n para buscar documentos)

-- Verificar se a coluna já existe antes de adicionar
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 
    FROM information_schema.columns 
    WHERE table_name = 'edital_pdfs' 
    AND column_name = 'file_id'
  ) THEN
    ALTER TABLE edital_pdfs 
    ADD COLUMN file_id TEXT;
    
    -- Adicionar comentário
    COMMENT ON COLUMN edital_pdfs.file_id IS 'ID do arquivo no Supabase Storage (usado pelo n8n para buscar documentos na tabela documents)';
    
    RAISE NOTICE 'Coluna file_id adicionada com sucesso';
  ELSE
    RAISE NOTICE 'Coluna file_id já existe';
  END IF;
END $$;

-- Criar índice para melhorar performance nas buscas
CREATE INDEX IF NOT EXISTS idx_edital_pdfs_file_id ON edital_pdfs(file_id) WHERE file_id IS NOT NULL;


