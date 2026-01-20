-- Tabela para captura de leads da landing page
CREATE TABLE IF NOT EXISTS leads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL,
  source TEXT DEFAULT 'landing_page_footer',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  converted BOOLEAN DEFAULT FALSE,
  converted_at TIMESTAMP WITH TIME ZONE,
  notes TEXT
);

-- Índice para busca rápida por email
CREATE INDEX IF NOT EXISTS idx_leads_email ON leads(email);

-- Índice para busca por source
CREATE INDEX IF NOT EXISTS idx_leads_source ON leads(source);

-- Índice para busca por created_at
CREATE INDEX IF NOT EXISTS idx_leads_created_at ON leads(created_at DESC);

-- Política RLS para permitir inserção pública (leads podem ser criados sem autenticação)
ALTER TABLE leads ENABLE ROW LEVEL SECURITY;

-- Política para permitir inserção pública
CREATE POLICY "Permitir inserção pública de leads"
  ON leads
  FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);

-- Política para permitir leitura apenas para usuários autenticados (admin)
CREATE POLICY "Permitir leitura de leads para autenticados"
  ON leads
  FOR SELECT
  TO authenticated
  USING (true);

-- Comentários
COMMENT ON TABLE leads IS 'Tabela para captura de leads da landing page';
COMMENT ON COLUMN leads.email IS 'Email do lead';
COMMENT ON COLUMN leads.source IS 'Origem do lead (ex: landing_page_footer, hero_section, etc)';
COMMENT ON COLUMN leads.converted IS 'Indica se o lead foi convertido em usuário';
COMMENT ON COLUMN leads.converted_at IS 'Data de conversão do lead em usuário';
