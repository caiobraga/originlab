-- Migration para adicionar campo de consentimento de coleta de dados (LGPD)
-- Conforme LGPD, é necessário obter consentimento explícito para coleta de dados pessoais

-- Adicionar coluna de consentimento na tabela profiles
ALTER TABLE profiles 
ADD COLUMN IF NOT EXISTS data_collection_consent BOOLEAN NOT NULL DEFAULT false;

-- Adicionar coluna para data/hora do consentimento
ALTER TABLE profiles 
ADD COLUMN IF NOT EXISTS consent_date TIMESTAMP WITH TIME ZONE;

-- Adicionar coluna para versão do termo de consentimento (útil para futuras atualizações)
ALTER TABLE profiles 
ADD COLUMN IF NOT EXISTS consent_version VARCHAR(10);

-- Comentários nas colunas
COMMENT ON COLUMN profiles.data_collection_consent IS 'Indica se o usuário consentiu com a coleta de dados pessoais (LGPD)';
COMMENT ON COLUMN profiles.consent_date IS 'Data e hora em que o usuário deu consentimento';
COMMENT ON COLUMN profiles.consent_version IS 'Versão do termo de consentimento aceito pelo usuário';

-- Índice para consultas de usuários que consentiram
CREATE INDEX IF NOT EXISTS idx_profiles_consent ON profiles(data_collection_consent) WHERE data_collection_consent = true;
