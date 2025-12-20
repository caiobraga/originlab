import { supabase } from "./supabase";
import { User } from "@supabase/supabase-js";
import { createEmptyPropostaForm, type PropostaFormData } from "./propostaFormFields";

export type StatusProposta = "rascunho" | "em_redacao" | "revisao" | "submetida" | "aprovada" | "rejeitada";

export interface Proposta {
  id: string;
  edital_id: string;
  user_id: string;
  status: StatusProposta;
  progresso: number;
  campos_formulario: Record<string, any>;
  observacoes?: string | null;
  proxima_etapa?: string | null;
  gerado_com_ia: boolean;
  ultima_versao_ia?: string | null;
  criado_em: string;
  atualizado_em: string;
  
  // Dados relacionados (join)
  edital_titulo?: string;
  edital_orgao?: string;
  edital_valor?: string;
}

/**
 * Busca todas as propostas do usuário logado
 */
export async function fetchPropostas(userId: string): Promise<Proposta[]> {
  const { data, error } = await supabase
    .from("propostas")
    .select(`
      *,
      editais (
        titulo,
        orgao,
        valor_projeto
      )
    `)
    .eq("user_id", userId)
    .order("atualizado_em", { ascending: false });

  if (error) {
    console.error("Erro ao buscar propostas:", error);
    throw error;
  }

  // Mapear os dados relacionados
  return (data || []).map((proposta: any) => ({
    ...proposta,
    edital_titulo: proposta.editais?.titulo,
    edital_orgao: proposta.editais?.orgao,
    edital_valor: proposta.editais?.valor_projeto,
  }));
}

/**
 * Busca uma proposta específica por ID
 */
export async function fetchPropostaById(propostaId: string, userId: string): Promise<Proposta | null> {
  const { data, error } = await supabase
    .from("propostas")
    .select(`
      *,
      editais (
        titulo,
        orgao,
        valor_projeto
      )
    `)
    .eq("id", propostaId)
    .eq("user_id", userId)
    .single();

  if (error) {
    if (error.code === "PGRST116") {
      return null; // Não encontrado
    }
    console.error("Erro ao buscar proposta:", error);
    throw error;
  }

  return {
    ...data,
    edital_titulo: data.editais?.titulo,
    edital_orgao: data.editais?.orgao,
    edital_valor: data.editais?.valor_projeto,
  };
}

/**
 * Cria uma nova proposta (gerada por IA ou rascunho)
 */
export async function createProposta(
  editalId: string,
  userId: string,
  camposIniciais?: Record<string, any>
): Promise<Proposta> {
  const { data, error } = await supabase
    .from("propostas")
    .insert({
      edital_id: editalId,
      user_id: userId,
      status: "rascunho",
      progresso: 0,
      campos_formulario: camposIniciais || {},
      gerado_com_ia: !!camposIniciais,
      ultima_versao_ia: camposIniciais ? JSON.stringify(camposIniciais) : null,
    })
    .select()
    .single();

  if (error) {
    console.error("Erro ao criar proposta:", error);
    throw error;
  }

  return data;
}

/**
 * Atualiza uma proposta existente
 */
export async function updateProposta(
  propostaId: string,
  userId: string,
  updates: {
    campos_formulario?: Record<string, any>;
    status?: StatusProposta;
    progresso?: number;
    observacoes?: string;
    proxima_etapa?: string;
  }
): Promise<Proposta> {
  const { data, error } = await supabase
    .from("propostas")
    .update(updates)
    .eq("id", propostaId)
    .eq("user_id", userId)
    .select()
    .single();

  if (error) {
    console.error("Erro ao atualizar proposta:", error);
    throw error;
  }

  return data;
}

/**
 * Deleta uma proposta
 */
export async function deleteProposta(propostaId: string, userId: string): Promise<void> {
  const { error } = await supabase
    .from("propostas")
    .delete()
    .eq("id", propostaId)
    .eq("user_id", userId);

  if (error) {
    console.error("Erro ao deletar proposta:", error);
    throw error;
  }
}

/**
 * Gera proposta inicial (sem IA por enquanto)
 * Cria uma proposta vazia que o usuário pode preencher manualmente
 */
export async function gerarPropostaComIA(
  editalId: string,
  userId: string,
  user: User | null,
  profile: any
): Promise<Proposta> {
  try {
    // Verificar se já existe uma proposta para este edital
    const { data: existingProposta } = await supabase
      .from("propostas")
      .select("id")
      .eq("edital_id", editalId)
      .eq("user_id", userId)
      .single();

    if (existingProposta) {
      // Retornar proposta existente
      const proposta = await fetchPropostaById(existingProposta.id, userId);
      if (proposta) {
        return proposta;
      }
    }

    // Criar proposta vazia no banco com estrutura completa do formulário
    const camposFormulario = createEmptyPropostaForm();
    const proposta = await createProposta(editalId, userId, camposFormulario as any);

    // Atualizar progresso inicial
    await updateProposta(proposta.id, userId, {
      progresso: 0,
      proxima_etapa: "Preencher os campos do formulário",
    });

    return proposta;
  } catch (error) {
    console.error("Erro ao criar proposta:", error);
    throw error;
  }
}

