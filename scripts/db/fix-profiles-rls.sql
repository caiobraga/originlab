-- Script para corrigir a política RLS da tabela profiles
-- Permite inserção durante signup mesmo sem sessão ativa

-- Remover política antiga se existir
DROP POLICY IF EXISTS "Users can insert own profile" ON profiles;

-- Criar função para verificar se user existe (se ainda não existir)
CREATE OR REPLACE FUNCTION public.user_exists(user_uuid UUID)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (SELECT 1 FROM auth.users WHERE id = user_uuid);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Criar nova política que permite inserção durante signup
CREATE POLICY "Users can insert own profile"
  ON profiles
  FOR INSERT
  WITH CHECK (
    -- Se o usuário está autenticado, deve ser seu próprio perfil
    (auth.uid() IS NOT NULL AND auth.uid() = user_id) OR
    -- Se não há sessão (durante signup), verificar se o user_id existe em auth.users
    (auth.uid() IS NULL AND public.user_exists(user_id))
  );

-- Criar função para inserir/atualizar perfil durante signup
-- SECURITY DEFINER permite inserir mesmo sem sessão ativa
CREATE OR REPLACE FUNCTION public.upsert_user_profile(
  p_user_id UUID,
  p_cpf VARCHAR(11),
  p_cnpj VARCHAR(14),
  p_lattes_id VARCHAR(16),
  p_user_type TEXT,
  p_has_cnpj BOOLEAN
)
RETURNS profiles AS $$
DECLARE
  v_profile profiles;
BEGIN
  -- Verificar se o usuário existe em auth.users
  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE id = p_user_id) THEN
    RAISE EXCEPTION 'User does not exist';
  END IF;

  -- Tentar atualizar primeiro
  UPDATE profiles
  SET
    cpf = p_cpf,
    cnpj = p_cnpj,
    lattes_id = p_lattes_id,
    user_type = p_user_type,
    has_cnpj = p_has_cnpj,
    atualizado_em = NOW()
  WHERE user_id = p_user_id
  RETURNING * INTO v_profile;

  -- Se não encontrou, inserir
  IF NOT FOUND THEN
    INSERT INTO profiles (user_id, cpf, cnpj, lattes_id, user_type, has_cnpj)
    VALUES (p_user_id, p_cpf, p_cnpj, p_lattes_id, p_user_type, p_has_cnpj)
    RETURNING * INTO v_profile;
  END IF;

  RETURN v_profile;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute na função para usuários autenticados e anônimos
GRANT EXECUTE ON FUNCTION public.upsert_user_profile TO authenticated, anon;

-- Verificar se a política foi criada
SELECT 
  schemaname,
  tablename,
  policyname,
  permissive,
  roles,
  cmd,
  qual,
  with_check
FROM pg_policies 
WHERE tablename = 'profiles' AND policyname = 'Users can insert own profile';

-- Verificar se a função foi criada
SELECT 
  routine_name,
  routine_type,
  security_type
FROM information_schema.routines
WHERE routine_schema = 'public' AND routine_name = 'upsert_user_profile';

