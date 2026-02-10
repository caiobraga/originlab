-- Campo para controlar se o usuário já passou pelo onboarding (primeiro login).
-- onboarding_completed = false -> mostrar onboarding
-- onboarding_completed = true  -> não mostrar onboarding (já passou ou pulou)

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS onboarding_completed BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN profiles.onboarding_completed IS 'Indica se o usuário já concluiu (ou pulou) o onboarding no primeiro acesso. Usado para redirecionar para /onboarding quando false.';
