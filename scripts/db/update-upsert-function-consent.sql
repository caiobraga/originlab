-- Atualizar função upsert_user_profile para incluir campos de consentimento
-- Execute após executar migration-add-consent-field.sql

CREATE OR REPLACE FUNCTION public.upsert_user_profile(
  p_user_id UUID,
  p_cpf VARCHAR(11),
  p_cnpj VARCHAR(14),
  p_lattes_id VARCHAR(16),
  p_user_type TEXT,
  p_has_cnpj BOOLEAN,
  p_data_collection_consent BOOLEAN DEFAULT false,
  p_consent_version VARCHAR(10) DEFAULT NULL,
  p_consent_date TIMESTAMP WITH TIME ZONE DEFAULT NULL
)
RETURNS profiles AS $$
DECLARE
  v_profile profiles;
  v_consent_date TIMESTAMP WITH TIME ZONE;
BEGIN
  -- Verificar se o usuário existe em auth.users
  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE id = p_user_id) THEN
    RAISE EXCEPTION 'User does not exist';
  END IF;

  -- Definir data de consentimento se consentimento for true e data não fornecida
  IF p_data_collection_consent = true AND p_consent_date IS NULL THEN
    v_consent_date := NOW();
  ELSE
    v_consent_date := p_consent_date;
  END IF;

  -- Tentar atualizar primeiro
  UPDATE profiles
  SET
    cpf = p_cpf,
    cnpj = p_cnpj,
    lattes_id = p_lattes_id,
    user_type = p_user_type,
    has_cnpj = p_has_cnpj,
    data_collection_consent = p_data_collection_consent,
    consent_version = p_consent_version,
    consent_date = v_consent_date,
    atualizado_em = NOW()
  WHERE user_id = p_user_id
  RETURNING * INTO v_profile;

  -- Se não encontrou, inserir
  IF NOT FOUND THEN
    INSERT INTO profiles (
      user_id, 
      cpf, 
      cnpj, 
      lattes_id, 
      user_type, 
      has_cnpj,
      data_collection_consent,
      consent_version,
      consent_date
    )
    VALUES (
      p_user_id, 
      p_cpf, 
      p_cnpj, 
      p_lattes_id, 
      p_user_type, 
      p_has_cnpj,
      p_data_collection_consent,
      p_consent_version,
      v_consent_date
    )
    RETURNING * INTO v_profile;
  END IF;

  RETURN v_profile;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute na função atualizada
GRANT EXECUTE ON FUNCTION public.upsert_user_profile TO authenticated, anon;
