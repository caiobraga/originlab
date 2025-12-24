-- Migration para criar tabela de perfis de usuários
-- Armazena informações adicionais dos usuários (CPF, CNPJ, Lattes ID, tipo de usuário)
-- Esta tabela complementa o auth.users do Supabase

CREATE TABLE IF NOT EXISTS profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Referência ao usuário do Supabase Auth
  user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  
  -- Dados pessoais
  cpf VARCHAR(11), -- CPF sem formatação (apenas números)
  cnpj VARCHAR(14), -- CNPJ sem formatação (apenas números)
  lattes_id VARCHAR(16), -- ID Lattes (apenas números)
  
  -- Tipo de usuário
  user_type TEXT NOT NULL DEFAULT 'pesquisador' CHECK (user_type IN ('pesquisador', 'pessoa-empresa', 'ambos')),
  has_cnpj BOOLEAN DEFAULT false,
  
  -- Metadados
  criado_em TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  atualizado_em TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  -- Constraints
  CONSTRAINT valid_cpf CHECK (cpf IS NULL OR LENGTH(cpf) = 11),
  CONSTRAINT valid_cnpj CHECK (cnpj IS NULL OR LENGTH(cnpj) = 14),
  CONSTRAINT valid_lattes_id CHECK (lattes_id IS NULL OR LENGTH(lattes_id) = 16)
);

-- Índices para melhor performance
CREATE INDEX IF NOT EXISTS idx_profiles_user_id ON profiles(user_id);
CREATE INDEX IF NOT EXISTS idx_profiles_cpf ON profiles(cpf) WHERE cpf IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_profiles_cnpj ON profiles(cnpj) WHERE cnpj IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_profiles_user_type ON profiles(user_type);

-- Trigger para atualizar updated_em automaticamente
CREATE OR REPLACE FUNCTION update_profiles_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.atualizado_em = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_profiles_updated_at
  BEFORE UPDATE ON profiles
  FOR EACH ROW
  EXECUTE FUNCTION update_profiles_updated_at();

-- Comentários nas colunas
COMMENT ON TABLE profiles IS 'Armazena informações adicionais dos perfis de usuários';
COMMENT ON COLUMN profiles.user_id IS 'Referência ao ID do usuário no auth.users do Supabase';
COMMENT ON COLUMN profiles.cpf IS 'CPF do usuário sem formatação (apenas 11 dígitos)';
COMMENT ON COLUMN profiles.cnpj IS 'CNPJ do usuário sem formatação (apenas 14 dígitos)';
COMMENT ON COLUMN profiles.lattes_id IS 'ID Lattes do pesquisador (apenas 16 dígitos)';
COMMENT ON COLUMN profiles.user_type IS 'Tipo de usuário: pesquisador, pessoa-empresa ou ambos';
COMMENT ON COLUMN profiles.has_cnpj IS 'Indica se o usuário possui CNPJ';

-- RLS (Row Level Security) - usuários só podem ver/editar seu próprio perfil
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

-- Política: usuários podem ler seu próprio perfil
CREATE POLICY "Users can view own profile"
  ON profiles
  FOR SELECT
  USING (auth.uid() = user_id);

-- Função para permitir inserção durante signup
-- Esta função verifica se o user_id existe em auth.users
CREATE OR REPLACE FUNCTION public.user_exists(user_uuid UUID)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (SELECT 1 FROM auth.users WHERE id = user_uuid);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Política: usuários podem inserir seu próprio perfil
-- Permite inserção durante signup mesmo sem confirmação de email
-- Verifica se o user_id existe em auth.users (mesmo sem sessão ativa)
-- IMPORTANTE: Esta política permite inserção se o user_id existe em auth.users,
-- mesmo que não haja sessão ativa (útil durante signup antes da confirmação de email)
DROP POLICY IF EXISTS "Users can insert own profile" ON profiles;
CREATE POLICY "Users can insert own profile"
  ON profiles
  FOR INSERT
  WITH CHECK (
    -- Se o usuário está autenticado, deve ser seu próprio perfil
    (auth.uid() IS NOT NULL AND auth.uid() = user_id) OR
    -- Se não há sessão (durante signup), verificar se o user_id existe em auth.users
    (auth.uid() IS NULL AND public.user_exists(user_id))
  );

-- Grant execute na função para usuários autenticados e anônimos
GRANT EXECUTE ON FUNCTION public.upsert_user_profile TO authenticated, anon;

-- Política: usuários podem atualizar seu próprio perfil
CREATE POLICY "Users can update own profile"
  ON profiles
  FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Política: usuários podem deletar seu próprio perfil
CREATE POLICY "Users can delete own profile"
  ON profiles
  FOR DELETE
  USING (auth.uid() = user_id);

