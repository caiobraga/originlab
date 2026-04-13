import express from "express";
import Stripe from "stripe";
import { getServiceSupabase } from "../lib/stripeSubscriptionSync.js";

const router = express.Router();

const stripeSecret = process.env.STRIPE_SECRET_KEY?.trim() || "";

function getStripe(): Stripe | null {
  return stripeSecret ? new Stripe(stripeSecret) : null;
}

function appBaseUrl(req: express.Request): string {
  const fromEnv = process.env.APP_BASE_URL?.trim();
  if (fromEnv) return fromEnv.replace(/\/$/, "");
  const origin = req.headers.origin;
  if (origin && /^https?:\/\//i.test(origin)) return origin.replace(/\/$/, "");
  return "http://localhost:3000";
}

function priceIdForPlan(planKey: string): string | null {
  if (planKey === "pro")
    return process.env.STRIPE_PRICE_PRO_MONTHLY?.trim() || null;
  if (planKey === "empresas")
    return process.env.STRIPE_PRICE_EMPRESAS_MONTHLY?.trim() || null;
  return null;
}

async function getUserFromBearer(req: express.Request) {
  const auth = req.headers.authorization;
  if (!auth?.startsWith("Bearer ")) return { user: null as null, error: "no_bearer" };
  const token = auth.slice(7).trim();
  const supabase = getServiceSupabase();
  if (!supabase) return { user: null as null, error: "no_supabase" };
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser(token);
  if (error || !user) return { user: null as null, error: "invalid_token" };
  return { user, error: null as null };
}

/** POST /stripe/create-checkout-session { planKey: 'pro' | 'empresas' } */
router.post("/stripe/create-checkout-session", async (req, res) => {
  const stripe = getStripe();
  if (!stripe) {
    return res.status(503).json({ error: "Stripe não configurado (STRIPE_SECRET_KEY)" });
  }

  const { user, error: authErr } = await getUserFromBearer(req);
  if (!user) {
    return res.status(401).json({
      error:
        authErr === "no_bearer"
          ? "Faça login para assinar."
          : "Sessão inválida ou servidor sem Supabase service role.",
    });
  }

  const planKey = String(req.body?.planKey || "").trim();
  if (planKey !== "pro" && planKey !== "empresas") {
    return res.status(400).json({ error: "planKey inválido" });
  }

  const priceId = priceIdForPlan(planKey);
  if (!priceId) {
    return res.status(503).json({
      error:
        planKey === "pro"
          ? "Defina STRIPE_PRICE_PRO_MONTHLY no servidor."
          : "Defina STRIPE_PRICE_EMPRESAS_MONTHLY no servidor.",
    });
  }

  const base = appBaseUrl(req);

  try {
    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      payment_method_types: ["card"],
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${base}/dashboard?checkout=success`,
      cancel_url: `${base}/planos`,
      client_reference_id: user.id,
      customer_email: user.email || undefined,
      metadata: {
        supabase_user_id: user.id,
        plan_key: planKey,
      },
      subscription_data: {
        metadata: {
          supabase_user_id: user.id,
          plan_key: planKey,
        },
      },
    });

    return res.json({ url: session.url });
  } catch (e) {
    console.error("create-checkout-session:", e);
    const msg = e instanceof Error ? e.message : "checkout failed";
    return res.status(500).json({ error: msg });
  }
});

/** POST /stripe/create-portal-session */
router.post("/stripe/create-portal-session", async (req, res) => {
  const stripe = getStripe();
  if (!stripe) {
    return res.status(503).json({ error: "Stripe não configurado" });
  }

  const { user } = await getUserFromBearer(req);
  if (!user) {
    return res.status(401).json({ error: "Não autorizado" });
  }

  const supabase = getServiceSupabase();
  if (!supabase) {
    return res.status(503).json({ error: "Supabase service role não configurada" });
  }

  const { data: profile, error: profErr } = await supabase
    .from("profiles")
    .select("stripe_customer_id")
    .eq("user_id", user.id)
    .maybeSingle();

  if (profErr || !profile?.stripe_customer_id) {
    return res.status(400).json({
      error: "Nenhum cliente Stripe vinculado. Assine um plano primeiro.",
    });
  }

  const base = appBaseUrl(req);

  try {
    const session = await stripe.billingPortal.sessions.create({
      customer: profile.stripe_customer_id,
      return_url: `${base}/perfil`,
    });
    return res.json({ url: session.url });
  } catch (e) {
    console.error("create-portal-session:", e);
    const msg = e instanceof Error ? e.message : "portal failed";
    return res.status(500).json({ error: msg });
  }
});

export default router;
