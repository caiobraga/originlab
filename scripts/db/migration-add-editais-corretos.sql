-- Nova tabela: editais_corretos
-- Objetivo: armazenar uma versão validada/normalizada dos campos extraídos de editais,
-- usada como fonte de exibição ("editais corretos").
--
-- Se a tabela já existia sem colunas (ex.: processado_em, atualizado_em), rode também:
--   scripts/db/migration-editais-corretos-add-missing-columns.sql

CREATE TABLE IF NOT EXISTS editais_corretos (
  -- Mantém o mesmo id do edital original, para facilitar joins
  id UUID PRIMARY KEY REFERENCES editais(id) ON DELETE CASCADE,

  -- Identificação (copiada do edital original)
  numero TEXT,
  titulo TEXT NOT NULL,
  descricao TEXT,
  processado_em TIMESTAMP WITH TIME ZONE,
  criado_em TIMESTAMP WITH TIME ZONE,
  atualizado_em TIMESTAMP WITH TIME ZONE,
  data_publicacao DATE,
  data_encerramento DATE,
  status TEXT,
  valor TEXT,
  area TEXT,
  orgao TEXT,
  fonte TEXT NOT NULL,
  link TEXT,

  -- Campos extraídos/normalizados
  valor_projeto TEXT,
  prazo_inscricao TEXT,
  localizacao TEXT,
  vagas TEXT,
  is_researcher BOOLEAN,
  is_company BOOLEAN,
  sobre_programa TEXT,
  criterios_elegibilidade TEXT,
  timeline_estimada JSONB,

  -- Metadados de validação
  validado_em TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  origem_informacoes_processadas_em TIMESTAMP WITH TIME ZONE,
  validation_report JSONB
);

CREATE INDEX IF NOT EXISTS idx_editais_corretos_fonte ON editais_corretos(fonte);
CREATE INDEX IF NOT EXISTS idx_editais_corretos_data_encerramento ON editais_corretos(data_encerramento);
CREATE INDEX IF NOT EXISTS idx_editais_corretos_validado_em ON editais_corretos(validado_em);

COMMENT ON TABLE editais_corretos IS 'Versão validada/normalizada dos editais. Fonte para exibição.';
COMMENT ON COLUMN editais_corretos.id IS 'Mesmo UUID do edital original (editais.id).';
COMMENT ON COLUMN editais_corretos.validation_report IS 'Relatório de validação (diffs, flags, observações).';

