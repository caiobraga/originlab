import { supabase } from "@/lib/supabase";

async function getBearer(): Promise<string | null> {
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token || null;
}

export type AdminUserRow = {
  id: string;
  email: string | null;
  created_at: string | null;
  last_sign_in_at: string | null;
  email_confirmed_at: string | null;
  banned_until: string | null;
  is_admin: boolean;
  is_blocked: boolean;
  user_type: string | null;
  has_cnpj: boolean | null;
  cnpj: string | null;
  lattes_id: string | null;
  profile_created_at: string | null;
  subscription_plan_key: string | null;
  subscription_status: string | null;
};

export async function adminListUsers(params?: { page?: number; perPage?: number }) {
  const token = await getBearer();
  if (!token) throw new Error("Faça login para acessar o admin.");
  const qs = new URLSearchParams();
  if (params?.page) qs.set("page", String(params.page));
  if (params?.perPage) qs.set("perPage", String(params.perPage));
  const r = await fetch(`/api/admin/users?${qs.toString()}`, {
    headers: { Authorization: `Bearer ${token}` },
    // Evita cache HTTP do browser/proxy (o toggle is_blocked precisa refletir imediatamente).
    cache: "no-store",
  });
  if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || "Erro ao buscar usuários");
  return (await r.json()) as { page: number; perPage: number; users: AdminUserRow[] };
}

export async function adminPatchUser(userId: string, patch: { is_admin?: boolean; is_blocked?: boolean }) {
  const token = await getBearer();
  if (!token) throw new Error("Faça login para acessar o admin.");
  const r = await fetch(`/api/admin/users/${encodeURIComponent(userId)}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify(patch),
    cache: "no-store",
  });
  if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || "Erro ao atualizar usuário");
  return await r.json();
}

export type BillingPlanRow = {
  plan_key: string;
  title: string;
  currency: string;
  interval: string;
  unit_amount_cents: number;
  stripe_product_id: string | null;
  stripe_price_id: string | null;
  active: boolean;
  updated_at: string;
};

export async function adminListBillingPlans() {
  const token = await getBearer();
  if (!token) throw new Error("Faça login para acessar o admin.");
  const r = await fetch(`/api/admin/billing/plans`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  });
  if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || "Erro ao buscar planos");
  return (await r.json()) as { rows: BillingPlanRow[] };
}

export async function adminUpsertBillingPlan(
  planKey: string,
  patch: { title: string; currency?: string; interval?: string; unit_amount_cents: number; active?: boolean },
) {
  const token = await getBearer();
  if (!token) throw new Error("Faça login para acessar o admin.");
  const r = await fetch(`/api/admin/billing/plans/${encodeURIComponent(planKey)}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify(patch),
    cache: "no-store",
  });
  if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || "Erro ao salvar plano");
  return (await r.json()) as { row: BillingPlanRow; stripe?: { product_id?: string; price_id?: string } };
}

export type RedacaoRow = {
  id: string;
  user_id: string;
  proposta_id: string | null;
  edital_id: string | null;
  field_id: string | null;
  field_name: string;
  status: "gerada" | "revisao" | "aprovada" | "rejeitada";
  model: string | null;
  provider: string | null;
  created_at: string;
  updated_at: string;
};

export async function adminListRedacoes(params?: { limit?: number; offset?: number; status?: string; userId?: string; propostaId?: string }) {
  const token = await getBearer();
  if (!token) throw new Error("Faça login para acessar o admin.");
  const qs = new URLSearchParams();
  if (params?.limit != null) qs.set("limit", String(params.limit));
  if (params?.offset != null) qs.set("offset", String(params.offset));
  if (params?.status) qs.set("status", params.status);
  if (params?.userId) qs.set("userId", params.userId);
  if (params?.propostaId) qs.set("propostaId", params.propostaId);
  const r = await fetch(`/api/admin/redacoes?${qs.toString()}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || "Erro ao buscar redações");
  return (await r.json()) as { count: number | null; limit: number; offset: number; rows: RedacaoRow[] };
}

export async function adminUpdateRedacaoStatus(id: string, status: RedacaoRow["status"]) {
  const token = await getBearer();
  if (!token) throw new Error("Faça login para acessar o admin.");
  const r = await fetch(`/api/admin/redacoes/${encodeURIComponent(id)}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ status }),
  });
  if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || "Erro ao atualizar status");
  return await r.json();
}

export type PropostaAdminRow = {
  id: string;
  user_id: string;
  edital_id: string;
  status: "rascunho" | "em_redacao" | "revisao" | "submetida" | "aprovada" | "rejeitada";
  progresso: number | null;
  gerado_com_ia: boolean | null;
  criado_em: string | null;
  atualizado_em: string | null;
};

export async function adminListPropostas(params?: { limit?: number; offset?: number; status?: string; userId?: string; editalId?: string }) {
  const token = await getBearer();
  if (!token) throw new Error("Faça login para acessar o admin.");
  const qs = new URLSearchParams();
  if (params?.limit != null) qs.set("limit", String(params.limit));
  if (params?.offset != null) qs.set("offset", String(params.offset));
  if (params?.status) qs.set("status", params.status);
  if (params?.userId) qs.set("userId", params.userId);
  if (params?.editalId) qs.set("editalId", params.editalId);
  const r = await fetch(`/api/admin/propostas?${qs.toString()}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || "Erro ao buscar propostas");
  return (await r.json()) as { count: number | null; limit: number; offset: number; rows: PropostaAdminRow[] };
}

export async function adminUpdateProposta(id: string, patch: { status?: PropostaAdminRow["status"]; progresso?: number }) {
  const token = await getBearer();
  if (!token) throw new Error("Faça login para acessar o admin.");
  const r = await fetch(`/api/admin/propostas/${encodeURIComponent(id)}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify(patch),
  });
  if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || "Erro ao atualizar proposta");
  return await r.json();
}

export type EditalAdminRow = {
  id: string;
  numero: string | null;
  titulo: string;
  descricao: string | null;
  fonte: string;
  status: string | null;
  data_publicacao: string | null;
  data_encerramento: string | null;
  valor: string | null;
  valor_projeto: string | null;
  prazo_inscricao: string | null;
  area: string | null;
  orgao: string | null;
  link: string | null;
  is_researcher: boolean | null;
  is_company: boolean | null;
  validado_em: string | null;
  criado_em: string | null;
  atualizado_em: string | null;
};

export async function adminListEditais(params?: { limit?: number; offset?: number; q?: string; fonte?: string; status?: string; ativo?: "1" | "0" | "dashboard" }) {
  const token = await getBearer();
  if (!token) throw new Error("Faça login para acessar o admin.");
  const qs = new URLSearchParams();
  if (params?.limit != null) qs.set("limit", String(params.limit));
  if (params?.offset != null) qs.set("offset", String(params.offset));
  if (params?.q) qs.set("q", params.q);
  if (params?.fonte) qs.set("fonte", params.fonte);
  if (params?.status) qs.set("status", params.status);
  if (params?.ativo) qs.set("ativo", params.ativo);
  const r = await fetch(`/api/admin/editais?${qs.toString()}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || "Erro ao buscar editais");
  return (await r.json()) as { count: number | null; limit: number; offset: number; rows: EditalAdminRow[] };
}

export async function adminUpdateEdital(id: string, patch: Partial<EditalAdminRow>) {
  const token = await getBearer();
  if (!token) throw new Error("Faça login para acessar o admin.");
  const r = await fetch(`/api/admin/editais/${encodeURIComponent(id)}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify(patch),
  });
  if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || "Erro ao atualizar edital");
  return await r.json();
}

