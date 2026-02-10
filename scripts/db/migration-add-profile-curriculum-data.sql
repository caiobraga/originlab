-- Dados do currículo extraídos do PDF (onboarding ou perfil), para exibição e elegibilidade.
-- Antes só em user_metadata; agora também na tabela para garantir que a página de perfil mostre os dados.

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS curriculum_data JSONB;

COMMENT ON COLUMN profiles.curriculum_data IS 'Dados do currículo extraídos de PDF (nome, formação, elegibilidade, etc.). Usado na página de perfil e em scores de editais.';
