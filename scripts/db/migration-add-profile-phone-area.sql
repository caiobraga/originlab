-- Campos do onboarding: telefone e área de atuação (persistidos no perfil)

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS phone VARCHAR(20),
  ADD COLUMN IF NOT EXISTS area TEXT;

COMMENT ON COLUMN profiles.phone IS 'Telefone do usuário (apenas números), coletado no onboarding.';
COMMENT ON COLUMN profiles.area IS 'Área de atuação principal (ex: tech, health, agro), coletada no onboarding.';
