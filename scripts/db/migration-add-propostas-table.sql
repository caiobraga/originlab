-- Migration para criar tabela de propostas
-- Armazena propostas geradas pelos usuários para editais
-- Os campos do formulário são armazenados em formato JSONB para flexibilidade

CREATE TABLE IF NOT EXISTS propostas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Referências
  edital_id UUID NOT NULL REFERENCES editais(id) ON DELETE CASCADE,
  user_id UUID NOT NULL, -- Referência ao auth.users do Supabase
  
  -- Status e metadados
  status TEXT NOT NULL DEFAULT 'rascunho' CHECK (status IN ('rascunho', 'em_redacao', 'revisao', 'submetida', 'aprovada', 'rejeitada')),
  progresso INTEGER DEFAULT 0 CHECK (progresso >= 0 AND progresso <= 100),
  
  -- Conteúdo da proposta (campos dinâmicos baseados no formulário DOCX)
  -- Cada campo do formulário será armazenado aqui em formato JSONB
  -- Exemplo: {"nome_projeto": "Meu Projeto", "descricao": "...", "orcamento": {...}}
  campos_formulario JSONB DEFAULT '{}'::jsonb,
  
  -- Observações e notas
  observacoes TEXT,
  proxima_etapa TEXT,
  
  -- Metadados
  gerado_com_ia BOOLEAN DEFAULT false,
  ultima_versao_ia TEXT, -- Última sugestão/versão gerada pela IA
  criado_em TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  atualizado_em TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  -- Constraint único: um usuário pode ter apenas uma proposta por edital
  CONSTRAINT unique_user_edital_proposta UNIQUE (user_id, edital_id)
);

-- Índices para melhor performance
CREATE INDEX IF NOT EXISTS idx_propostas_edital_id ON propostas(edital_id);
CREATE INDEX IF NOT EXISTS idx_propostas_user_id ON propostas(user_id);
CREATE INDEX IF NOT EXISTS idx_propostas_status ON propostas(status);
CREATE INDEX IF NOT EXISTS idx_propostas_criado_em ON propostas(criado_em);

-- Índice GIN para busca em campos JSONB
CREATE INDEX IF NOT EXISTS idx_propostas_campos_formulario ON propostas USING GIN (campos_formulario);

-- Trigger para atualizar updated_em automaticamente
CREATE OR REPLACE FUNCTION update_propostas_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.atualizado_em = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_propostas_updated_at
  BEFORE UPDATE ON propostas
  FOR EACH ROW
  EXECUTE FUNCTION update_propostas_updated_at();

-- Comentários nas colunas
COMMENT ON TABLE propostas IS 'Armazena propostas geradas pelos usuários para editais';
COMMENT ON COLUMN propostas.status IS 'Status da proposta: rascunho, em_redacao, revisao, submetida, aprovada, rejeitada';
COMMENT ON COLUMN propostas.campos_formulario IS 'Campos dinâmicos do formulário de submissão em formato JSONB';
COMMENT ON COLUMN propostas.progresso IS 'Percentual de conclusão da proposta (0-100)';
COMMENT ON COLUMN propostas.gerado_com_ia IS 'Indica se a proposta foi gerada usando IA';
COMMENT ON COLUMN propostas.ultima_versao_ia IS 'Última sugestão ou versão gerada pela IA';


