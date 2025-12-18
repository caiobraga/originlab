-- Migration para adicionar novos campos aos editais
-- Campos: is_researcher, is_company, sobre_programa, criterios_elegibilidade

-- Adicionar novos campos à tabela editais
ALTER TABLE editais 
ADD COLUMN IF NOT EXISTS is_researcher BOOLEAN,
ADD COLUMN IF NOT EXISTS is_company BOOLEAN,
ADD COLUMN IF NOT EXISTS sobre_programa TEXT,
ADD COLUMN IF NOT EXISTS criterios_elegibilidade TEXT;

-- Comentários nas colunas
COMMENT ON COLUMN editais.is_researcher IS 'Indica se o edital é direcionado para pesquisadores (true/false)';
COMMENT ON COLUMN editais.is_company IS 'Indica se o edital é direcionado para empresas (true/false)';
COMMENT ON COLUMN editais.sobre_programa IS 'Informações sobre o programa extraídas dos PDFs';
COMMENT ON COLUMN editais.criterios_elegibilidade IS 'Critérios de elegibilidade extraídos dos PDFs';

