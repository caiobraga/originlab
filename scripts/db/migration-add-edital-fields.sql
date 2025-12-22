-- Migration para adicionar campos padronizados de informações fixas dos editais
-- Esses campos são preenchidos pela API interna que processa os PDFs

-- Adicionar novos campos à tabela editais
ALTER TABLE editais 
ADD COLUMN IF NOT EXISTS valor_projeto TEXT,
ADD COLUMN IF NOT EXISTS prazo_inscricao TEXT,
ADD COLUMN IF NOT EXISTS localizacao TEXT,
ADD COLUMN IF NOT EXISTS vagas TEXT,
ADD COLUMN IF NOT EXISTS informacoes_processadas_em TIMESTAMP WITH TIME ZONE;

-- Comentários nas colunas
COMMENT ON COLUMN editais.valor_projeto IS 'Valor por projeto extraído e padronizado dos PDFs';
COMMENT ON COLUMN editais.prazo_inscricao IS 'Prazo de inscrição extraído e padronizado dos PDFs';
COMMENT ON COLUMN editais.localizacao IS 'Localização/região do edital extraída e padronizada dos PDFs';
COMMENT ON COLUMN editais.vagas IS 'Número de vagas/projetos extraído e padronizado dos PDFs';
COMMENT ON COLUMN editais.informacoes_processadas_em IS 'Data/hora em que as informações foram processadas pela API interna';












