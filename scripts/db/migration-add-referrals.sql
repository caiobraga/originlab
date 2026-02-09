-- Migration: Programa de Referência
-- Adiciona suporte a referral_code em profiles e cria tabela referrals

-- 1. Adicionar coluna referral_code em profiles
ALTER TABLE profiles 
ADD COLUMN IF NOT EXISTS referral_code VARCHAR(12) UNIQUE;

CREATE UNIQUE INDEX IF NOT EXISTS idx_profiles_referral_code 
ON profiles(referral_code) WHERE referral_code IS NOT NULL;

COMMENT ON COLUMN profiles.referral_code IS 'Código único para link de referência (ex: /ref/abc123xy)';

-- 2. Criar tabela referrals
CREATE TABLE IF NOT EXISTS referrals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  referrer_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  referred_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'convertido' CHECK (status IN ('pendente', 'convertido')),
  ganhos_referrer DECIMAL(10, 2) DEFAULT 50,
  criado_em TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(referred_id)
);

CREATE INDEX IF NOT EXISTS idx_referrals_referrer ON referrals(referrer_id);
CREATE INDEX IF NOT EXISTS idx_referrals_referred ON referrals(referred_id);

-- RLS
ALTER TABLE referrals ENABLE ROW LEVEL SECURITY;

-- Usuários podem ver referrals onde são o referrer
CREATE POLICY "Users can view own referrals as referrer"
  ON referrals FOR SELECT
  USING (auth.uid() = referrer_id);

-- Inserção via service role ou função (signup)
-- Permite que o referred insira (quando se cadastra com código de referência)
CREATE POLICY "Users can insert when referred"
  ON referrals FOR INSERT
  WITH CHECK (auth.uid() = referred_id);
