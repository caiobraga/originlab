-- Script para recriar a tabela editais com todas as colunas corretas
-- ATENÇÃO: Isso vai DROPAR a tabela existente e recriar!
-- Use apenas se não houver dados importantes ou se quiser começar do zero

-- Remover tabela existente (CUIDADO: isso apaga todos os dados!)
DROP TABLE IF EXISTS edital_pdfs CASCADE;
DROP TABLE IF EXISTS editais CASCADE;

-- Recriar tabela editais com todas as colunas
CREATE TABLE editais (
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
  
  -- Constraint único
  CONSTRAINT unique_edital_fonte UNIQUE (numero, fonte)
);

-- Recriar tabela edital_pdfs
CREATE TABLE edital_pdfs (
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
  
  -- Constraint único
  CONSTRAINT unique_pdf_storage UNIQUE (caminho_storage)
);

-- Criar índices
CREATE INDEX idx_editais_fonte ON editais(fonte);
CREATE INDEX idx_editais_status ON editais(status);
CREATE INDEX idx_editais_data_encerramento ON editais(data_encerramento);
CREATE INDEX idx_editais_criado_em ON editais(criado_em);
CREATE INDEX idx_edital_pdfs_edital_id ON edital_pdfs(edital_id);

-- Função para atualizar updated_at automaticamente
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.atualizado_em = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger para atualizar updated_at
CREATE TRIGGER update_editais_updated_at
  BEFORE UPDATE ON editais
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Comentários nas tabelas
COMMENT ON TABLE editais IS 'Armazena informações sobre editais extraídos de diversas fontes';
COMMENT ON TABLE edital_pdfs IS 'Armazena referências aos PDFs dos editais armazenados no Supabase Storage';











