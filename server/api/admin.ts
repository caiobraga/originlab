import express from "express";
import { getServiceSupabase } from "../lib/stripeSubscriptionSync.js";

const router = express.Router();

async function getUserFromBearer(req: express.Request) {
  const auth = req.headers.authorization;
  if (!auth?.startsWith("Bearer ")) return { user: null as null, token: null as null, error: "no_bearer" };
  const token = auth.slice(7).trim();
  const supabase = getServiceSupabase();
  if (!supabase) return { user: null as null, token: null as null, error: "no_supabase" };
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser(token);
  if (error || !user) return { user: null as null, token: null as null, error: "invalid_token" };
  return { user, token, error: null as null };
}

async function assertAdmin(req: express.Request, res: express.Response) {
  const { user, error } = await getUserFromBearer(req);
  if (!user) {
    res.status(401).json({ error: error === "no_bearer" ? "Faça login." : "Sessão inválida." });
    return null;
  }
  const supabase = getServiceSupabase();
  if (!supabase) {
    res.status(503).json({ error: "Servidor sem SUPABASE_SERVICE_ROLE_KEY." });
    return null;
  }
  const { data: profile, error: profErr } = await supabase
    .from("profiles")
    .select("is_admin")
    .eq("user_id", user.id)
    .maybeSingle();
  if (profErr) {
    res.status(500).json({ error: `Erro ao ler perfil admin: ${profErr.message}` });
    return null;
  }
  if (!profile?.is_admin) {
    res.status(403).json({ error: "Acesso negado (admin)." });
    return null;
  }
  return { user, supabase };
}

router.get("/admin/users", async (req, res) => {
  const ctx = await assertAdmin(req, res);
  if (!ctx) return;
  const { supabase } = ctx;

  const page = Math.max(1, parseInt(String(req.query.page || "1"), 10) || 1);
  const perPage = Math.min(200, Math.max(1, parseInt(String(req.query.perPage || "50"), 10) || 50));

  const { data, error } = await supabase.auth.admin.listUsers({ page, perPage });
  if (error) return res.status(500).json({ error: error.message });

  // Enriquecer com flags do profile (is_admin/is_blocked) quando existirem.
  const userIds = (data?.users || []).map((u) => u.id);
  const { data: profiles } = await supabase
    .from("profiles")
    .select(
      "user_id, is_admin, is_blocked, user_type, has_cnpj, cnpj, lattes_id, criado_em, subscription_plan_key, subscription_status"
    )
    .in("user_id", userIds);
  const byUser = new Map((profiles || []).map((p: any) => [p.user_id, p]));

  const users = (data?.users || []).map((u) => {
    const p = byUser.get(u.id) || null;
    return {
      id: u.id,
      email: u.email,
      created_at: u.created_at,
      last_sign_in_at: u.last_sign_in_at,
      email_confirmed_at: u.email_confirmed_at,
      banned_until: (u as any).banned_until ?? null,
      is_admin: p?.is_admin ?? false,
      is_blocked: p?.is_blocked ?? false,
      user_type: p?.user_type ?? null,
      has_cnpj: p?.has_cnpj ?? null,
      cnpj: p?.cnpj ?? null,
      lattes_id: p?.lattes_id ?? null,
      profile_created_at: p?.criado_em ?? null,
      subscription_plan_key: p?.subscription_plan_key ?? null,
      subscription_status: p?.subscription_status ?? null,
    };
  });

  return res.json({ page, perPage, users });
});

router.patch("/admin/users/:userId", async (req, res) => {
  const ctx = await assertAdmin(req, res);
  if (!ctx) return;
  const { supabase } = ctx;
  const userId = String(req.params.userId || "").trim();
  if (!userId) return res.status(400).json({ error: "userId inválido" });

  const is_admin = req.body?.is_admin;
  const is_blocked = req.body?.is_blocked;
  if (is_admin === undefined && is_blocked === undefined) {
    return res.status(400).json({ error: "Envie is_admin e/ou is_blocked" });
  }

  const patch: any = { user_id: userId };
  if (is_admin !== undefined) patch.is_admin = Boolean(is_admin);
  if (is_blocked !== undefined) patch.is_blocked = Boolean(is_blocked);

  const { data, error } = await supabase
    .from("profiles")
    .upsert(patch, { onConflict: "user_id" })
    .select()
    .maybeSingle();
  if (error) return res.status(500).json({ error: error.message });
  return res.json({ profile: data });
});

// Billing plans (Stripe prices managed by app)
router.get("/admin/billing/plans", async (req, res) => {
  const ctx = await assertAdmin(req, res);
  if (!ctx) return;
  const { supabase } = ctx;

  const { data, error } = await supabase
    .from("billing_plans")
    .select("*")
    .order("plan_key", { ascending: true });
  if (error) return res.status(500).json({ error: error.message });
  return res.json({ rows: data || [] });
});

router.put("/admin/billing/plans/:planKey", async (req, res) => {
  const ctx = await assertAdmin(req, res);
  if (!ctx) return;
  const { supabase } = ctx;
  const planKey = String(req.params.planKey || "").trim().toLowerCase();
  if (!planKey) return res.status(400).json({ error: "planKey inválido" });

  const title = String(req.body?.title || "").trim();
  const currency = String(req.body?.currency || "brl").trim().toLowerCase();
  const interval = String(req.body?.interval || "month").trim().toLowerCase();
  const unitAmountCents = Number(req.body?.unit_amount_cents);
  const active = req.body?.active === undefined ? true : Boolean(req.body?.active);

  if (!title) return res.status(400).json({ error: "title obrigatório" });
  if (!/^[a-z]{3}$/.test(currency)) return res.status(400).json({ error: "currency inválida" });
  if (interval !== "month") return res.status(400).json({ error: "interval inválido (use month)" });
  if (!Number.isFinite(unitAmountCents) || unitAmountCents <= 0) {
    return res.status(400).json({ error: "unit_amount_cents inválido" });
  }

  const stripeKey =
    process.env.AISELFIE_STRIPE_SECRET_KEY?.trim() ||
    process.env.STRIPE_SECRET_KEY?.trim() ||
    "";
  if (!stripeKey) return res.status(503).json({ error: "Stripe não configurado (AISELFIE_STRIPE_SECRET_KEY)" });

  // Lazy import to keep startup lighter
  const Stripe = (await import("stripe")).default;
  const stripe = new Stripe(stripeKey);

  // Fetch existing plan (if any)
  const { data: existing, error: e0 } = await supabase
    .from("billing_plans")
    .select("*")
    .eq("plan_key", planKey)
    .maybeSingle();
  if (e0) return res.status(500).json({ error: e0.message });

  let productId: string | null = existing?.stripe_product_id ?? null;
  if (!productId) {
    const product = await stripe.products.create({
      name: title,
      metadata: { plan_key: planKey },
    });
    productId = product.id;
  } else if (existing?.title && existing.title !== title) {
    // keep product name in sync
    await stripe.products.update(productId, { name: title });
  }

  // Stripe does not allow changing amount of an existing Price.
  // We create a new recurring price and store it as the active one.
  const price = await stripe.prices.create({
    product: productId,
    currency,
    unit_amount: Math.round(unitAmountCents),
    recurring: { interval: "month" },
    nickname: `${planKey}:${currency}:${unitAmountCents}`,
    metadata: { plan_key: planKey },
  });

  // Deactivate previous price (best-effort)
  const prevPriceId: string | null = existing?.stripe_price_id ?? null;
  if (prevPriceId && prevPriceId !== price.id) {
    try {
      await stripe.prices.update(prevPriceId, { active: false });
    } catch {
      // ignore
    }
  }

  const row: any = {
    plan_key: planKey,
    title,
    currency,
    interval: "month",
    unit_amount_cents: Math.round(unitAmountCents),
    stripe_product_id: productId,
    stripe_price_id: price.id,
    active,
    updated_at: new Date().toISOString(),
  };

  const { data, error } = await supabase
    .from("billing_plans")
    .upsert(row, { onConflict: "plan_key" })
    .select("*")
    .maybeSingle();
  if (error) return res.status(500).json({ error: error.message });
  return res.json({ row: data, stripe: { product_id: productId, price_id: price.id } });
});

router.get("/admin/propostas", async (req, res) => {
  const ctx = await assertAdmin(req, res);
  if (!ctx) return;
  const { supabase } = ctx;

  const limit = Math.min(200, Math.max(1, parseInt(String(req.query.limit || "50"), 10) || 50));
  const offset = Math.max(0, parseInt(String(req.query.offset || "0"), 10) || 0);
  const status = String(req.query.status || "").trim();
  const userId = String(req.query.userId || "").trim();
  const editalId = String(req.query.editalId || "").trim();

  let q = supabase
    .from("propostas")
    .select("id,user_id,edital_id,status,progresso,gerado_com_ia,criado_em,atualizado_em", { count: "exact" })
    .order("atualizado_em", { ascending: false });
  if (status) q = q.eq("status", status);
  if (userId) q = q.eq("user_id", userId);
  if (editalId) q = q.eq("edital_id", editalId);
  q = q.range(offset, offset + limit - 1);

  const { data, error, count } = await q;
  if (error) return res.status(500).json({ error: error.message });
  return res.json({ count: count ?? null, limit, offset, rows: data || [] });
});

router.patch("/admin/propostas/:id", async (req, res) => {
  const ctx = await assertAdmin(req, res);
  if (!ctx) return;
  const { supabase } = ctx;

  const id = String(req.params.id || "").trim();
  if (!id) return res.status(400).json({ error: "id inválido" });

  const status = req.body?.status != null ? String(req.body.status).trim() : null;
  const progresso = req.body?.progresso != null ? Number(req.body.progresso) : null;

  const allowedStatuses = ["rascunho", "em_redacao", "revisao", "submetida", "aprovada", "rejeitada"];
  if (status != null && !allowedStatuses.includes(status)) {
    return res.status(400).json({ error: "status inválido" });
  }
  if (progresso != null && (!Number.isFinite(progresso) || progresso < 0 || progresso > 100)) {
    return res.status(400).json({ error: "progresso inválido" });
  }

  if (status == null && progresso == null) {
    return res.status(400).json({ error: "Envie status e/ou progresso" });
  }

  const patch: any = {};
  if (status != null) patch.status = status;
  if (progresso != null) patch.progresso = Math.round(progresso);

  const { data, error } = await supabase
    .from("propostas")
    .update(patch)
    .eq("id", id)
    .select("id,status,progresso,atualizado_em")
    .single();
  if (error) return res.status(500).json({ error: error.message });
  return res.json({ row: data });
});

router.get("/admin/editais", async (req, res) => {
  const ctx = await assertAdmin(req, res);
  if (!ctx) return;
  const { supabase } = ctx;

  const limit = Math.min(200, Math.max(1, parseInt(String(req.query.limit || "50"), 10) || 50));
  const offset = Math.max(0, parseInt(String(req.query.offset || "0"), 10) || 0);
  const qtext = String(req.query.q || "").trim();
  const fonte = String(req.query.fonte || "").trim();
  const status = String(req.query.status || "").trim();
  const ativo = String(req.query.ativo || "").trim(); // "1" ativos simples, "0" inativos simples, "dashboard" ativos como /dashboard, "" todos

  // Helpers: aproximar a mesma lógica do /dashboard (client/src/pages/Dashboard.tsx)
  const startOfToday = () => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  };
  const parseDate = (raw: unknown): Date | null => {
    if (raw == null) return null;
    const s = String(raw).trim();
    if (!s || /invalid date/i.test(s)) return null;
    const d = new Date(s);
    return isNaN(d.getTime()) ? null : d;
  };
  const extrairDeadlineSubmissao = (timeline: any): Date | null => {
    if (!timeline) return null;
    const obj = typeof timeline === "string" ? (() => { try { return JSON.parse(timeline); } catch { return null; } })() : timeline;
    if (!obj) return null;
    const fases = obj?.fases;
    if (!Array.isArray(fases) || fases.length === 0) return null;
    // Prioriza data_fim parseável das fases; se houver "submiss" no nome, preferir.
    const withDates = fases
      .map((f: any) => {
        const nome = String(f?.nome || "").toLowerCase();
        const df = parseDate(f?.data_fim) || null;
        return { nome, df };
      })
      .filter((x: any) => x.df);
    if (withDates.length === 0) return null;
    const submissao = withDates.filter((x: any) => x.nome.includes("submiss") || x.nome.includes("propost"));
    const arr = (submissao.length ? submissao : withDates) as Array<{ df: Date }>;
    const max = new Date(Math.max(...arr.map((x) => x.df.getTime())));
    return isNaN(max.getTime()) ? null : max;
  };
  const extrairDataMaisRecentePrazo = (prazo: string | null | undefined): Date | null => {
    if (!prazo || prazo === "Não informado") return null;
    const s = String(prazo);
    const dates: Date[] = [];
    const pushIf = (v: string) => {
      const d = parseDate(v);
      if (d) dates.push(d);
    };
    // ISO
    const iso = s.match(/\d{4}-\d{2}-\d{2}/g) || [];
    iso.forEach(pushIf);
    // BR numérico
    const br = s.match(/\d{1,2}[\/\-.]\d{1,2}[\/\-.]\d{4}/g) || [];
    br.forEach(pushIf);
    // pt mês por extenso: "8 de outubro de 2025"
    const pt = s.match(/\b\d{1,2}\s+de\s+[A-Za-zÀ-ÿçÇ]+\s+de\s+\d{4}\b/gi) || [];
    pt.forEach(pushIf);
    if (dates.length === 0) return null;
    const max = new Date(Math.max(...dates.map((d) => d.getTime())));
    return isNaN(max.getTime()) ? null : max;
  };
  const isEditalAtivoDashboard = (row: any): boolean => {
    const hoje = startOfToday();
    // 1) timeline_estimada (submissão)
    const dl = extrairDeadlineSubmissao(row.timeline_estimada);
    if (dl) {
      const fim = new Date(dl);
      fim.setHours(23, 59, 59, 999);
      return hoje.getTime() <= fim.getTime();
    }
    // 2) prazo_inscricao
    const prazoDate = extrairDataMaisRecentePrazo(row.prazo_inscricao || null);
    if (prazoDate) {
      const fim = new Date(prazoDate);
      fim.setHours(23, 59, 59, 999);
      return hoje.getTime() <= fim.getTime();
    }
    // 3) data_encerramento
    if (row.data_encerramento) {
      const d = parseDate(row.data_encerramento);
      if (d) {
        d.setHours(23, 59, 59, 999);
        return hoje.getTime() <= d.getTime();
      }
    }
    // 4) sem datas: só inativar se status explícito
    const st = String(row.status || "").toLowerCase().trim();
    if (st === "encerrado" || st === "finalizado") return false;
    return true;
  };

  // Quando ativo=dashboard, filtramos em memória com a mesma lógica do /dashboard.
  // (Fazer isso em SQL seria bem mais complexo por causa do parse de timeline_estimada/prazo_inscricao.)
  if (ativo === "dashboard") {
    let q = supabase
      .from("editais_corretos")
      .select(
        "id,numero,titulo,descricao,fonte,status,data_publicacao,data_encerramento,valor,valor_projeto,prazo_inscricao,area,orgao,link,is_researcher,is_company,timeline_estimada,validado_em,criado_em,atualizado_em"
      )
      .order("validado_em", { ascending: false })
      .range(0, 999); // pega mais e pagina após filtrar
    if (fonte) q = q.eq("fonte", fonte);
    if (status) q = q.eq("status", status);
    if (qtext) {
      const like = `%${qtext}%`;
      q = q.or(`titulo.ilike.${like},descricao.ilike.${like},numero.ilike.${like},orgao.ilike.${like},area.ilike.${like}`);
    }

    const { data, error } = await q;
    if (error) return res.status(500).json({ error: error.message });
    const rows = (data || [])
      // mesma “visibilidade por perfil” padrão do dashboard (sem ignorar filtro):
      // precisa ser explícito para pesquisador OU empresa.
      .filter((r: any) => r.is_researcher === true || r.is_company === true)
      // ativo pela lógica do dashboard
      .filter((r: any) => isEditalAtivoDashboard(r));

    const paged = rows.slice(offset, offset + limit);
    return res.json({ count: rows.length, limit, offset, rows: paged });
  }

  let q = supabase
    .from("editais_corretos")
    .select(
      "id,numero,titulo,descricao,fonte,status,data_publicacao,data_encerramento,valor,valor_projeto,prazo_inscricao,area,orgao,link,is_researcher,is_company,validado_em,criado_em,atualizado_em",
      { count: "exact" }
    )
    .order("validado_em", { ascending: false });
  if (fonte) q = q.eq("fonte", fonte);
  if (status) q = q.eq("status", status);
  if (qtext) {
    const like = `%${qtext}%`;
    q = q.or(`titulo.ilike.${like},descricao.ilike.${like},numero.ilike.${like},orgao.ilike.${like},area.ilike.${like}`);
  }
  if (ativo === "1" || ativo === "0") {
    const today = new Date();
    const yyyy = today.getFullYear();
    const mm = String(today.getMonth() + 1).padStart(2, "0");
    const dd = String(today.getDate()).padStart(2, "0");
    const todayIso = `${yyyy}-${mm}-${dd}`;
    if (ativo === "1") q = q.or(`data_encerramento.gte.${todayIso},status.ilike.%abert%`);
    else q = q.or(`data_encerramento.lt.${todayIso},status.ilike.%encerr%,status.ilike.%finaliz%`);
  }
  q = q.range(offset, offset + limit - 1);

  const { data, error, count } = await q;
  if (error) return res.status(500).json({ error: error.message });
  return res.json({ count: count ?? null, limit, offset, rows: data || [] });
});

router.patch("/admin/editais/:id", async (req, res) => {
  const ctx = await assertAdmin(req, res);
  if (!ctx) return;
  const { supabase } = ctx;
  const id = String(req.params.id || "").trim();
  if (!id) return res.status(400).json({ error: "id inválido" });

  const body = req.body || {};
  const patch: any = {};
  const allowedText = [
    "numero",
    "titulo",
    "descricao",
    "status",
    "valor",
    "valor_projeto",
    "prazo_inscricao",
    "area",
    "orgao",
    "fonte",
    "link",
    "sobre_programa",
    "criterios_elegibilidade",
  ];
  for (const k of allowedText) {
    if (body[k] !== undefined) patch[k] = body[k] === null ? null : String(body[k]);
  }
  if (body.data_publicacao !== undefined) patch.data_publicacao = body.data_publicacao || null;
  if (body.data_encerramento !== undefined) patch.data_encerramento = body.data_encerramento || null;
  if (body.is_researcher !== undefined) patch.is_researcher = body.is_researcher === null ? null : Boolean(body.is_researcher);
  if (body.is_company !== undefined) patch.is_company = body.is_company === null ? null : Boolean(body.is_company);

  if (Object.keys(patch).length === 0) {
    return res.status(400).json({ error: "Nada para atualizar" });
  }

  const { data, error } = await supabase
    .from("editais_corretos")
    .update(patch)
    .eq("id", id)
    .select(
      "id,numero,titulo,descricao,fonte,status,data_publicacao,data_encerramento,valor,valor_projeto,prazo_inscricao,area,orgao,link,is_researcher,is_company,validado_em,criado_em,atualizado_em"
    )
    .single();
  if (error) return res.status(500).json({ error: error.message });
  return res.json({ row: data });
});

router.get("/admin/redacoes", async (req, res) => {
  const ctx = await assertAdmin(req, res);
  if (!ctx) return;
  const { supabase } = ctx;

  const limit = Math.min(200, Math.max(1, parseInt(String(req.query.limit || "50"), 10) || 50));
  const offset = Math.max(0, parseInt(String(req.query.offset || "0"), 10) || 0);
  const status = String(req.query.status || "").trim();
  const userId = String(req.query.userId || "").trim();
  const propostaId = String(req.query.propostaId || "").trim();

  let q = supabase
    .from("redacoes_ai")
    .select("id,user_id,proposta_id,edital_id,field_id,field_name,status,model,provider,created_at,updated_at", { count: "exact" })
    .order("created_at", { ascending: false });
  if (status) q = q.eq("status", status);
  if (userId) q = q.eq("user_id", userId);
  if (propostaId) q = q.eq("proposta_id", propostaId);
  q = q.range(offset, offset + limit - 1);

  const { data, error, count } = await q;
  if (error) return res.status(500).json({ error: error.message });
  return res.json({ count: count ?? null, limit, offset, rows: data || [] });
});

router.patch("/admin/redacoes/:id", async (req, res) => {
  const ctx = await assertAdmin(req, res);
  if (!ctx) return;
  const { supabase } = ctx;
  const id = String(req.params.id || "").trim();
  const status = String(req.body?.status || "").trim();
  if (!id) return res.status(400).json({ error: "id inválido" });
  if (!["gerada", "revisao", "aprovada", "rejeitada"].includes(status)) {
    return res.status(400).json({ error: "status inválido" });
  }
  const { data, error } = await supabase
    .from("redacoes_ai")
    .update({ status })
    .eq("id", id)
    .select("id,status,updated_at")
    .single();
  if (error) return res.status(500).json({ error: error.message });
  return res.json({ row: data });
});

export default router;

