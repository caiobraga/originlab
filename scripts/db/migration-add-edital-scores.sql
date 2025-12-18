-- Migration para criar tabela de scores de editais por usuário
-- Armazena match e probabilidade de aprovação calculados pela IA

CREATE TABLE IF NOT EXISTS edital_scores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Referências
  edital_id UUID NOT NULL REFERENCES editais(id) ON DELETE CASCADE,
  user_id UUID NOT NULL, -- Referência ao auth.users do Supabase
  
  -- Scores calculados
  match_percent INTEGER NOT NULL CHECK (match_percent >= 0 AND match_percent <= 100),
  probabilidade_percent INTEGER NOT NULL CHECK (probabilidade_percent >= 0 AND probabilidade_percent <= 100),
  justificativa TEXT, -- Justificativa detalhada do match calculado pela IA
  
  -- Metadados do cálculo
  dados_usuario_utilizados JSONB, -- Armazena quais dados foram usados (CNPJ, Lattes, etc)
  processado_em TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  -- Constraint único: um score por usuário por edital
  CONSTRAINT unique_edital_user_score UNIQUE (edital_id, user_id)
);

-- Índices para melhor performance
CREATE INDEX IF NOT EXISTS idx_edital_scores_edital_id ON edital_scores(edital_id);
CREATE INDEX IF NOT EXISTS idx_edital_scores_user_id ON edital_scores(user_id);
CREATE INDEX IF NOT EXISTS idx_edital_scores_processado_em ON edital_scores(processado_em);

-- Comentários nas colunas
COMMENT ON TABLE edital_scores IS 'Armazena scores de match e probabilidade de aprovação calculados pela IA para cada usuário e edital';
COMMENT ON COLUMN edital_scores.match_percent IS 'Percentual de match (0-100) entre perfil do usuário e edital';
COMMENT ON COLUMN edital_scores.probabilidade_percent IS 'Probabilidade de aprovação (0-100) calculada pela IA';
COMMENT ON COLUMN edital_scores.justificativa IS 'Justificativa detalhada do match explicando pontos fortes e fracos do perfil do usuário em relação ao edital';
COMMENT ON COLUMN edital_scores.dados_usuario_utilizados IS 'JSON com informações sobre quais dados do usuário foram usados no cálculo (ex: {"lattesId": true, "cnpj": false})';

