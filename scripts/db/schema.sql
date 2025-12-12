-- Tabela para armazenar editais
CREATE TABLE IF NOT EXISTS editais (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Identificação
  numero TEXT,
  titulo TEXT NOT NULL,
  descricao TEXT,
  
  -- Datas
  data_publicacao DATE,
  data_encerramento DATE,
  
  -- Status e informações
  status TEXT,
  valor TEXT,
  area TEXT,
  orgao TEXT,
  fonte TEXT NOT NULL, -- Fonte do scraper (ex: "sigfapes", "fapesp")
  
  -- Links
  link TEXT,
  
  -- Metadados
  processado_em TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  criado_em TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  atualizado_em TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  -- Índices
  CONSTRAINT unique_edital_fonte UNIQUE (numero, fonte)
);

-- Índices para melhor performance
CREATE INDEX IF NOT EXISTS idx_editais_fonte ON editais(fonte);
CREATE INDEX IF NOT EXISTS idx_editais_status ON editais(status);
CREATE INDEX IF NOT EXISTS idx_editais_data_encerramento ON editais(data_encerramento);
CREATE INDEX IF NOT EXISTS idx_editais_criado_em ON editais(criado_em);

-- Tabela para armazenar PDFs dos editais
CREATE TABLE IF NOT EXISTS edital_pdfs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  edital_id UUID NOT NULL REFERENCES editais(id) ON DELETE CASCADE,
  
  -- Informações do arquivo
  nome_arquivo TEXT NOT NULL,
  caminho_storage TEXT NOT NULL, -- Caminho no Supabase Storage
  url_original TEXT, -- URL original do PDF (se disponível)
  tamanho_bytes BIGINT,
  tipo_mime TEXT DEFAULT 'application/pdf',
  
  -- Metadados
  criado_em TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  -- Índices
  CONSTRAINT unique_pdf_storage UNIQUE (caminho_storage)
);

CREATE INDEX IF NOT EXISTS idx_edital_pdfs_edital_id ON edital_pdfs(edital_id);

-- Função para atualizar updated_at automaticamente
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.atualizado_em = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger para atualizar updated_at
DROP TRIGGER IF EXISTS update_editais_updated_at ON editais;
CREATE TRIGGER update_editais_updated_at
  BEFORE UPDATE ON editais
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Comentários nas tabelas
COMMENT ON TABLE editais IS 'Armazena informações sobre editais extraídos de diversas fontes';
COMMENT ON TABLE edital_pdfs IS 'Armazena referências aos PDFs dos editais armazenados no Supabase Storage';








