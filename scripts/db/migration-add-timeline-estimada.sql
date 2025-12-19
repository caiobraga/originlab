-- Migration para adicionar campo timeline_estimada aos editais
-- Este campo armazena informações sobre as fases e prazos do edital em formato JSONB

-- Adicionar novo campo à tabela editais
ALTER TABLE editais
ADD COLUMN IF NOT EXISTS timeline_estimada JSONB;

-- Comentário na coluna
COMMENT ON COLUMN editais.timeline_estimada IS 'Timeline estimada do edital extraída dos PDFs, contendo fases, prazos e status em formato JSON';

-- Exemplo de estrutura esperada:
-- {
--   "fases": [
--     {
--       "nome": "Inscrição",
--       "prazo": "30 dias",
--       "status": "aberto" | "fechado" | "pendente",
--       "data_inicio": "2024-01-01",
--       "data_fim": "2024-01-31"
--     },
--     {
--       "nome": "Fase 1: Ideias",
--       "prazo": "60 dias",
--       "status": "pendente",
--       "data_inicio": "2024-02-01",
--       "data_fim": "2024-04-01"
--     }
--   ]
-- }


