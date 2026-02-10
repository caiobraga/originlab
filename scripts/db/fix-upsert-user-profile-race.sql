-- Corrige race após signUp: remove o check "User does not exist" da RPC.
-- O usuário pode levar um instante para aparecer em auth.users; o INSERT em profiles
-- falha por FK (23503) se o user_id não existir. O cliente faz retry em P0001 e 23503.
-- Use esta versão se sua função aceita apenas 6 parâmetros (sem consent).

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
  UPDATE profiles
  SET cpf = p_cpf, cnpj = p_cnpj, lattes_id = p_lattes_id, user_type = p_user_type, has_cnpj = p_has_cnpj, atualizado_em = NOW()
  WHERE user_id = p_user_id
  RETURNING * INTO v_profile;

  IF NOT FOUND THEN
    INSERT INTO profiles (user_id, cpf, cnpj, lattes_id, user_type, has_cnpj)
    VALUES (p_user_id, p_cpf, p_cnpj, p_lattes_id, p_user_type, p_has_cnpj)
    RETURNING * INTO v_profile;
  END IF;

  RETURN v_profile;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.upsert_user_profile(UUID, VARCHAR, VARCHAR, VARCHAR, TEXT, BOOLEAN) TO authenticated, anon;
