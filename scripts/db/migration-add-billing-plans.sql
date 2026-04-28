-- Billing plans managed by the app (admin).
-- The app will create Stripe Product/Price via API and store the active price_id here.

CREATE TABLE IF NOT EXISTS billing_plans (
  plan_key TEXT PRIMARY KEY, -- e.g. 'pro', 'empresas'
  title TEXT NOT NULL,
  currency TEXT NOT NULL DEFAULT 'brl',
  interval TEXT NOT NULL DEFAULT 'month',
  unit_amount_cents INTEGER NOT NULL CHECK (unit_amount_cents > 0),
  stripe_product_id TEXT,
  stripe_price_id TEXT,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_billing_plans_active ON billing_plans(active);

-- RLS: default deny; allow read for anon/auth if you want to show pricing publicly (optional).
ALTER TABLE billing_plans ENABLE ROW LEVEL SECURITY;

-- Allow read for everyone (optional; needed if the frontend wants to show dynamic prices).
-- You can remove this policy if you only read server-side.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'billing_plans' AND policyname = 'billing_plans_read_all'
  ) THEN
    CREATE POLICY billing_plans_read_all ON billing_plans
      FOR SELECT
      USING (active = true);
  END IF;
END $$;

-- Admin writes should be done via server/service-role, so no client write policies are needed.

