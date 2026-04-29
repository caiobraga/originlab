-- Seeds (safe upserts) for billing_plans.
-- Run in Supabase SQL editor after `migration-add-billing-plans.sql`.

INSERT INTO billing_plans (plan_key, title, currency, interval, unit_amount_cents, active)
VALUES ('pro', 'Pro', 'brl', 'month', 199, true)
ON CONFLICT (plan_key) DO UPDATE
SET
  title = EXCLUDED.title,
  currency = EXCLUDED.currency,
  interval = EXCLUDED.interval,
  unit_amount_cents = EXCLUDED.unit_amount_cents,
  active = EXCLUDED.active,
  updated_at = NOW();

