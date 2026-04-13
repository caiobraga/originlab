#!/usr/bin/env tsx
/**
 * Cria assinatura Stripe para um usuário (por email) e sincroniza o perfil no Supabase.
 *
 * Uso:
 *   npx tsx scripts/stripe/grant-subscription.ts --email user@example.com --plan pro
 *   npx tsx scripts/stripe/grant-subscription.ts --email user@example.com --price price_xxxxx
 *
 * Opcional: STRIPE_GRANT_COUPON_ID=coupon_xxx (ex.: 100% off) para não exigir cartão em testes.
 */

import "../load-env.js";
import Stripe from "stripe";
import { createClient } from "@supabase/supabase-js";
import { applySubscriptionToProfile } from "../../server/lib/stripeSubscriptionSync.js";

function parseArgs(argv: string[]) {
  let email = "";
  let plan: "pro" | "empresas" | "" = "";
  let price = "";
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--email" && argv[i + 1]) {
      email = argv[++i].trim();
    } else if (a === "--plan" && argv[i + 1]) {
      const p = argv[++i].trim().toLowerCase();
      if (p === "pro" || p === "empresas") plan = p;
    } else if (a === "--price" && argv[i + 1]) {
      price = argv[++i].trim();
    }
  }
  return { email, plan, price };
}

function priceIdFromPlan(plan: "pro" | "empresas"): string | null {
  if (plan === "pro") return process.env.STRIPE_PRICE_PRO_MONTHLY?.trim() || null;
  if (plan === "empresas")
    return process.env.STRIPE_PRICE_EMPRESAS_MONTHLY?.trim() || null;
  return null;
}

async function findUserIdByEmail(
  supabase: ReturnType<typeof createClient>,
  email: string,
): Promise<string | null> {
  const target = email.toLowerCase();
  let page = 1;
  const perPage = 1000;
  for (;;) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage });
    if (error) throw error;
    const u = data.users.find((x) => x.email?.toLowerCase() === target);
    if (u) return u.id;
    if (data.users.length < perPage) return null;
    page++;
  }
}

async function main() {
  const { email, plan, price: priceArg } = parseArgs(process.argv);
  if (!email) {
    console.error("Uso: --email user@example.com (--plan pro|empresas | --price price_xxx)");
    process.exit(1);
  }

  const stripeKey = process.env.STRIPE_SECRET_KEY?.trim();
  if (!stripeKey) {
    console.error("Defina STRIPE_SECRET_KEY");
    process.exit(1);
  }

  const url = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
  const serviceKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    console.error("Defina VITE_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY");
    process.exit(1);
  }

  const priceId =
    priceArg ||
    (plan ? priceIdFromPlan(plan) : null) ||
    process.env.STRIPE_PRICE_PRO_MONTHLY?.trim() ||
    null;
  if (!priceId) {
    console.error("Defina --price ou --plan com STRIPE_PRICE_* no .env");
    process.exit(1);
  }

  const planKey = plan || "pro";
  const stripe = new Stripe(stripeKey);
  const supabase = createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const userId = await findUserIdByEmail(supabase, email);
  if (!userId) {
    console.error(`Nenhum usuário Auth com email: ${email}`);
    process.exit(1);
  }

  const existing = await stripe.customers.list({ email, limit: 1 });
  let customerId: string;
  if (existing.data[0]) {
    customerId = existing.data[0].id;
  } else {
    const c = await stripe.customers.create({
      email,
      metadata: { supabase_user_id: userId },
    });
    customerId = c.id;
  }

  const grantCoupon = process.env.STRIPE_GRANT_COUPON_ID?.trim();
  const subParams: Stripe.SubscriptionCreateParams = {
    customer: customerId,
    items: [{ price: priceId }],
    metadata: {
      supabase_user_id: userId,
      plan_key: planKey,
    },
  };
  if (grantCoupon) {
    subParams.discounts = [{ coupon: grantCoupon }];
  }

  const subscription = await stripe.subscriptions.create(subParams);
  console.log("Assinatura criada:", subscription.id, subscription.status);

  await applySubscriptionToProfile(stripe, userId, customerId, subscription.id);
  console.log("Perfil atualizado no Supabase (user_id=%s)", userId);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
