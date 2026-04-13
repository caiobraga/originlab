-- Atribuição de cadastro (afiliados / campanhas): first-touch até o signup
-- Execute no SQL Editor do Supabase após as migrations de profiles.

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS signup_affiliate_code VARCHAR(64),
  ADD COLUMN IF NOT EXISTS signup_utm JSONB,
  ADD COLUMN IF NOT EXISTS signup_attribution_recorded_at TIMESTAMPTZ;

COMMENT ON COLUMN profiles.signup_affiliate_code IS 'Código de afiliado/campanha (ex: ?aff=parceiro_blog)';
COMMENT ON COLUMN profiles.signup_utm IS 'UTMs e ids de clique capturados na primeira visita (utm_*, gclid, fbclid)';
COMMENT ON COLUMN profiles.signup_attribution_recorded_at IS 'Momento em que a atribuição foi gravada no cadastro';

CREATE INDEX IF NOT EXISTS idx_profiles_signup_affiliate
  ON profiles (signup_affiliate_code)
  WHERE signup_affiliate_code IS NOT NULL;

-- Grava atribuição pós-signup sem sessão (anon), desde que o usuário exista em auth.users
CREATE OR REPLACE FUNCTION public.merge_signup_attribution(
  p_user_id UUID,
  p_affiliate TEXT DEFAULT NULL,
  p_utm JSONB DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_aff TEXT;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE id = p_user_id) THEN
    RAISE EXCEPTION 'User does not exist';
  END IF;

  v_aff := NULLIF(TRIM(p_affiliate), '');
  IF v_aff IS NOT NULL THEN
    v_aff := LEFT(v_aff, 64);
  END IF;

  UPDATE profiles
  SET
    signup_affiliate_code = COALESCE(v_aff, signup_affiliate_code),
    signup_utm = COALESCE(p_utm, signup_utm),
    signup_attribution_recorded_at = CASE
      WHEN v_aff IS NOT NULL OR (p_utm IS NOT NULL AND p_utm <> '{}'::jsonb)
      THEN COALESCE(signup_attribution_recorded_at, NOW())
      ELSE signup_attribution_recorded_at
    END,
    atualizado_em = NOW()
  WHERE user_id = p_user_id;

  IF NOT FOUND THEN
    INSERT INTO profiles (
      user_id,
      user_type,
      signup_affiliate_code,
      signup_utm,
      signup_attribution_recorded_at
    )
    VALUES (
      p_user_id,
      'pesquisador',
      v_aff,
      CASE WHEN p_utm IS NOT NULL AND p_utm <> '{}'::jsonb THEN p_utm ELSE NULL END,
      CASE
        WHEN v_aff IS NOT NULL OR (p_utm IS NOT NULL AND p_utm <> '{}'::jsonb)
        THEN NOW()
        ELSE NULL
      END
    );
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.merge_signup_attribution(UUID, TEXT, JSONB) TO anon, authenticated;
