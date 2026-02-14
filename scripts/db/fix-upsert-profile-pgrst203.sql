-- Corrige PGRST203: "Could not choose the best candidate function"
-- O banco tinha duas versões de upsert_user_profile (6 e 9 params). PostgREST não conseguia escolher.
-- Remove a versão antiga (6 params) e mantém a versão com consentimento (9 params).
-- Execute no SQL Editor do Supabase.

-- Remove a sobrecarga antiga de 6 parâmetros (se existir)
DROP FUNCTION IF EXISTS public.upsert_user_profile(UUID, VARCHAR, VARCHAR, VARCHAR, TEXT, BOOLEAN);

-- Recria a versão com consentimento (garante que existe apenas uma)
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
  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE id = p_user_id) THEN
    RAISE EXCEPTION 'User does not exist';
  END IF;

  IF p_data_collection_consent = true AND p_consent_date IS NULL THEN
    v_consent_date := NOW();
  ELSE
    v_consent_date := p_consent_date;
  END IF;

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

  IF NOT FOUND THEN
    INSERT INTO profiles (
      user_id, cpf, cnpj, lattes_id, user_type, has_cnpj,
      data_collection_consent, consent_version, consent_date
    )
    VALUES (
      p_user_id, p_cpf, p_cnpj, p_lattes_id, p_user_type, p_has_cnpj,
      p_data_collection_consent, p_consent_version, v_consent_date
    )
    RETURNING * INTO v_profile;
  END IF;

  RETURN v_profile;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.upsert_user_profile TO authenticated, anon;
