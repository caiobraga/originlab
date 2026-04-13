-- Stripe subscription fields on profiles (synced via webhook + admin script).
-- Run in Supabase SQL Editor after backup.

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS stripe_customer_id TEXT,
  ADD COLUMN IF NOT EXISTS stripe_subscription_id TEXT,
  ADD COLUMN IF NOT EXISTS subscription_status TEXT,
  ADD COLUMN IF NOT EXISTS subscription_price_id TEXT,
  ADD COLUMN IF NOT EXISTS subscription_current_period_end TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS subscription_plan_key TEXT;

CREATE INDEX IF NOT EXISTS idx_profiles_stripe_customer_id
  ON profiles (stripe_customer_id) WHERE stripe_customer_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_profiles_stripe_subscription_id
  ON profiles (stripe_subscription_id) WHERE stripe_subscription_id IS NOT NULL;

COMMENT ON COLUMN profiles.stripe_customer_id IS 'Stripe Customer id (cus_...)';
COMMENT ON COLUMN profiles.stripe_subscription_id IS 'Stripe Subscription id (sub_...)';
COMMENT ON COLUMN profiles.subscription_status IS 'Stripe subscription.status (active, trialing, canceled, ...)';
COMMENT ON COLUMN profiles.subscription_plan_key IS 'Internal plan slug: pro, empresas (from checkout metadata)';
