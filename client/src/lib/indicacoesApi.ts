import { supabase } from "@/lib/supabase";
import type { DatabaseEdital } from "@/lib/editaisApi";

export type EditalIndicacaoRow = {
  edital_id: string;
  user_id: string;
  score: number;
  motivos: string[];
  gerado_em: string;
};

export type EditalIndicacaoItem = {
  score: number;
  motivos: string[];
  geradoEm: string;
  edital: DatabaseEdital;
};

export async function refreshMyIndicacoes(limit = 20): Promise<number> {
  const { data, error } = await supabase.rpc("refresh_my_indicacoes", { p_limit: limit });
  if (error) throw error;
  return typeof data === "number" ? data : Number(data ?? 0);
}

export async function fetchMyIndicacoes(userId: string, limit = 20): Promise<EditalIndicacaoItem[]> {
  // FK: edital_indicacoes.edital_id -> editais.id
  const { data, error } = await supabase
    .from("edital_indicacoes")
    .select(
      `
      score,
      motivos,
      gerado_em,
      edital:editais (*)
    `
    )
    .eq("user_id", userId)
    .order("score", { ascending: false })
    .order("gerado_em", { ascending: false })
    .limit(limit);

  if (error) throw error;

  const rows = (data ?? []) as Array<{
    score: number;
    motivos: string[] | null;
    gerado_em: string;
    edital: DatabaseEdital | null;
  }>;

  const base = rows.filter((r) => r.edital != null).map((r) => ({
    score: r.score,
    motivos: r.motivos ?? [],
    geradoEm: r.gerado_em,
    edital: r.edital as DatabaseEdital,
  }));

  // Requisito: recomendações devem ser relativas a editais aprovados (presentes em editais_corretos).
  // Overlay: buscar versão validada/normalizada em editais_corretos e filtrar apenas os presentes lá.
  const ids = base.map((b) => b.edital.id).filter(Boolean);
  if (!ids.length) return base;

  const { data: corretos, error: e2 } = await supabase
    .from("editais_corretos")
    .select("*")
    .in("id", ids);
  if (e2) {
    // Não bloquear indicações se a tabela nova ainda não estiver disponível.
    return base;
  }

  const m = new Map<string, any>();
  for (const c of corretos ?? []) {
    if ((c as any)?.id) m.set((c as any).id, c);
  }

  // Só manter recomendações cujo edital foi validado (existe em editais_corretos)
  return base
    .filter((item) => m.has(item.edital.id))
    .map((item) => {
    const c = m.get(item.edital.id);
    if (!c) return item;
    return {
      ...item,
      edital: {
        ...item.edital,
        // garantir metadados "base" caso o row correto não tenha algum campo esperado
        id: c.id ?? item.edital.id,
        numero: c.numero ?? item.edital.numero ?? null,
        titulo: c.titulo ?? item.edital.titulo,
        descricao: c.descricao ?? item.edital.descricao ?? null,
        data_publicacao: c.data_publicacao ?? item.edital.data_publicacao ?? null,
        data_encerramento: c.data_encerramento ?? item.edital.data_encerramento ?? null,
        status: c.status ?? item.edital.status ?? null,
        valor: c.valor ?? item.edital.valor ?? null,
        area: c.area ?? item.edital.area ?? null,
        orgao: c.orgao ?? item.edital.orgao ?? null,
        fonte: c.fonte ?? item.edital.fonte,
        link: c.link ?? item.edital.link ?? null,
        processado_em: c.processado_em ?? item.edital.processado_em ?? null,
        criado_em: c.criado_em ?? item.edital.criado_em,
        atualizado_em: c.atualizado_em ?? item.edital.atualizado_em ?? null,
        // sobrescreve os campos "corrigidos"
        valor_projeto: c.valor_projeto ?? item.edital.valor_projeto ?? null,
        prazo_inscricao: c.prazo_inscricao ?? item.edital.prazo_inscricao ?? null,
        localizacao: c.localizacao ?? item.edital.localizacao ?? null,
        vagas: c.vagas ?? item.edital.vagas ?? null,
        is_researcher: c.is_researcher ?? item.edital.is_researcher ?? null,
        is_company: c.is_company ?? item.edital.is_company ?? null,
        sobre_programa: c.sobre_programa ?? item.edital.sobre_programa ?? null,
        criterios_elegibilidade: c.criterios_elegibilidade ?? item.edital.criterios_elegibilidade ?? null,
        timeline_estimada: c.timeline_estimada ?? item.edital.timeline_estimada ?? null,
      },
    };
    });
}

