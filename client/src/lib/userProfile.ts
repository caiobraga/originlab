import { supabase } from "./supabase";
import { User } from "@supabase/supabase-js";

/** Chama upsert_user_profile com retry quando o backend retorna "User does not exist" (race pós-signUp). */
async function callUpsertRpcWithRetry(rpcParams: {
  p_user_id: string;
  p_cpf: string | null;
  p_cnpj: string | null;
  p_lattes_id: string | null;
  p_user_type: string;
  p_has_cnpj: boolean;
}): Promise<{ data: unknown; error: { code: string; message: string } | null }> {
  const { data, error } = await supabase.rpc('upsert_user_profile', rpcParams);
  if (!error) return { data, error: null };
  const isRaceCondition =
    error.code === 'P0001' ||
    error.code === '23503' ||
    (error.message && (error.message.includes('User does not exist') || error.message.includes('foreign key') || error.message.includes('violates foreign key')));
  if (isRaceCondition) {
    console.warn("⚠️ User not yet visible (race após signUp). Aguardando 2s e tentando novamente...");
    await new Promise((r) => setTimeout(r, 2000));
    const retry = await supabase.rpc('upsert_user_profile', rpcParams);
    return { data: retry.data, error: retry.error };
  }
  return { data, error };
}

/** Dados extraídos do currículo (PDF ou Lattes), usado para exibição e elegibilidade. */
export type CurriculumData = {
  id?: string;
  nome?: string;
  resumo?: string;
  areasAtuacao?: string[];
  formacao?: Array<{ nivel: string; curso: string; instituicao: string; anoConclusao?: string }>;
  elegibilidade?: { possuiDoutorado?: boolean; possuiMestrado?: boolean; possuiGraduacao?: boolean; podeParticiparEditais?: boolean; observacoes?: string[] };
  [key: string]: unknown;
};

export interface UserProfile {
  cpf?: string;
  cnpj?: string;
  lattesId?: string;
  userType: "pesquisador" | "pessoa-empresa" | "ambos";
  hasCnpj?: boolean;
  dataCollectionConsent?: boolean;
  consentVersion?: string;
  /** Dados do currículo extraídos de PDF (persistido em user_metadata). */
  curriculumData?: CurriculumData | null;
  /** Indica se o usuário já passou pelo onboarding (primeiro login). Controla redirecionamento para /onboarding. */
  onboardingCompleted?: boolean;
  /** Telefone (apenas números), coletado no onboarding. */
  phone?: string;
  /** Área de atuação principal (ex: tech, health), coletada no onboarding. */
  area?: string;
}

/**
 * Salva o perfil do usuário após o cadastro
 * Agora salva na tabela profiles do banco de dados
 */
export async function saveUserProfile(
  userId: string,
  profile: UserProfile
): Promise<void> {
  try {
    // Preparar dados do perfil - garantir que CPF e CNPJ estejam sem formatação
    const profileData: any = {
      user_id: userId,
      user_type: profile.userType,
      has_cnpj: profile.hasCnpj || false,
    };

    // Adicionar CPF se fornecido (sempre limpar formatação)
    if (profile.cpf) {
      const cpfLimpo = profile.cpf.replace(/\D/g, "");
      if (cpfLimpo && cpfLimpo.length === 11) {
        profileData.cpf = cpfLimpo;
      }
    }

    // Adicionar CNPJ se fornecido (sempre limpar formatação)
    if (profile.cnpj) {
      const cnpjLimpo = profile.cnpj.replace(/\D/g, "");
      if (cnpjLimpo && cnpjLimpo.length === 14) {
        profileData.cnpj = cnpjLimpo;
      }
    }

    // Adicionar Lattes ID se fornecido (remover caracteres não numéricos)
    if (profile.lattesId) {
      const lattesLimpo = profile.lattesId.replace(/\D/g, "");
      if (lattesLimpo && lattesLimpo.length === 16) {
        profileData.lattes_id = lattesLimpo;
      }
    }

    // Adicionar consentimento de coleta de dados (LGPD)
    if (profile.dataCollectionConsent !== undefined) {
      profileData.data_collection_consent = profile.dataCollectionConsent;
      if (profile.dataCollectionConsent) {
        profileData.consent_date = new Date().toISOString();
        profileData.consent_version = profile.consentVersion || "1.0";
      }
    }

    // Telefone e área (onboarding)
    if (profile.phone !== undefined) {
      const phoneLimpo = profile.phone.replace(/\D/g, "").slice(0, 20);
      if (phoneLimpo) profileData.phone = phoneLimpo;
    }
    if (profile.area !== undefined) profileData.area = profile.area || null;

    console.log("Salvando perfil na tabela profiles para userId:", userId);
    console.log("Dados do perfil:", profileData);

    // Verificar se há sessão ativa
    const { data: { session } } = await supabase.auth.getSession();
    console.log("Sessão ativa:", session ? "Sim" : "Não");
    console.log("User ID da sessão:", session?.user?.id);
    console.log("User ID para salvar:", userId);

    // Verificar se já existe um perfil para este usuário
    // Usar maybeSingle() para evitar erro quando não há resultado
    const { data: existingProfile, error: checkError } = await supabase
      .from('profiles')
      .select('id')
      .eq('user_id', userId)
      .maybeSingle();

    console.log("Perfil existente:", existingProfile);
    console.log("Erro ao verificar:", checkError);

    // Se houver erro (exceto quando não há resultado), tratar
    if (checkError) {
      // PGRST116 = no rows returned (não é um erro crítico)
      if (checkError.code === 'PGRST116') {
        // Não há perfil, continuar normalmente para inserir
        console.log("Nenhum perfil existente encontrado, será criado um novo");
      } else {
        // Outros erros (incluindo 406, 42501, etc.)
        console.warn("Erro ao verificar perfil existente:", {
          code: checkError.code,
          message: checkError.message,
          details: checkError.details,
          hint: checkError.hint
        });
        
        // Se for erro de RLS ou 406, tentar continuar mesmo assim
        if (checkError.code === '42501' || checkError.code === '406' || 
            checkError.message?.includes('permission') || checkError.message?.includes('policy')) {
          console.warn("Erro de permissão RLS ou formato detectado. Tentando inserir mesmo assim.");
          // Continuar tentando inserir mesmo assim
        } else {
          // Para outros erros, lançar exceção
          throw checkError;
        }
      }
    }

    let result;
    if (existingProfile) {
      // Atualizar perfil existente
      console.log("Atualizando perfil existente...");
      const { data, error } = await supabase
        .from('profiles')
        .update(profileData)
        .eq('user_id', userId)
        .select()
        .single();

      if (error) {
        console.error("Erro ao atualizar perfil:", error);
        console.error("Detalhes do erro:", JSON.stringify(error, null, 2));
        throw error;
      }
      result = data;
      console.log("Perfil atualizado com sucesso:", result);
    } else {
      // Inserir novo perfil
      console.log("Inserindo novo perfil...");
      
      // Durante signup, geralmente não há sessão ativa ainda
      // Sempre tentar usar a função SECURITY DEFINER primeiro (evita RLS no insert)
      if (!session || session.user.id !== userId) {
        const rpcParams = {
          p_user_id: userId,
          p_cpf: profileData.cpf ?? null,
          p_cnpj: profileData.cnpj ?? null,
          p_lattes_id: profileData.lattes_id ?? null,
          p_user_type: profileData.user_type,
          p_has_cnpj: profileData.has_cnpj === true,
        };
        const functionResult = await callUpsertRpcWithRetry(rpcParams);
        if (functionResult.error) {
          if (functionResult.error.code === '42883' || functionResult.error.message?.includes('does not exist')) {
            console.warn("⚠️ Função upsert_user_profile não encontrada. Tentando método direto...");
            const { data, error } = await supabase
              .from('profiles')
              .insert(profileData)
              .select()
              .single();
            if (error) throw error;
            result = data;
          } else {
            throw functionResult.error;
          }
        } else {
          result = functionResult.data;
          console.log("✅ Perfil criado com sucesso via função upsert_user_profile:", result);
        }
      } else {
        // Se há sessão ativa, usar método direto
        const { data, error } = await supabase
          .from('profiles')
          .insert(profileData)
          .select()
          .single();

        if (error) {
          console.error("Erro ao inserir perfil:", error);
          console.error("Detalhes do erro:", JSON.stringify(error, null, 2));
          console.error("Código do erro:", error.code);
          console.error("Mensagem do erro:", error.message);
          
          // Se for erro de RLS, tentar usar a função (com retry para "User does not exist")
          if (error.code === '42501' || error.message?.includes('permission') || error.message?.includes('policy') || error.message?.includes('RLS')) {
            console.warn("Erro de RLS detectado. Tentando usar função upsert_user_profile...");
            const rpcParams = {
              p_user_id: userId,
              p_cpf: profileData.cpf ?? null,
              p_cnpj: profileData.cnpj ?? null,
              p_lattes_id: profileData.lattes_id ?? null,
              p_user_type: profileData.user_type,
              p_has_cnpj: profileData.has_cnpj === true,
            };
            const functionResult = await callUpsertRpcWithRetry(rpcParams);
            if (functionResult.error) throw functionResult.error;
            result = functionResult.data;
            console.log("Perfil criado com sucesso via função:", result);
          } else {
            throw error;
          }
        } else {
          result = data;
          console.log("Perfil criado com sucesso:", result);
        }
      }
    }

    // Também salvar no user_metadata como backup/compatibilidade (preservar curriculumData)
    try {
      const { data: { user: currentUser } } = await supabase.auth.getUser();
      const existingProfile = (currentUser?.user_metadata?.profile as Record<string, unknown>) || {};
      const metadataProfile: any = {
        ...existingProfile,
        userType: profile.userType,
        hasCnpj: profile.hasCnpj || false,
      };
      if (profileData.cpf) metadataProfile.cpf = profileData.cpf;
      if (profileData.cnpj) metadataProfile.cnpj = profileData.cnpj;
      if (profileData.lattes_id) metadataProfile.lattesId = profileData.lattes_id;

      await supabase.auth.updateUser({
        data: {
          profile: metadataProfile,
        },
      });
    } catch (metadataError) {
      console.warn("Erro ao salvar no user_metadata (não crítico):", metadataError);
      // Não bloquear o fluxo se falhar ao salvar no metadata
    }
  } catch (error) {
    console.error("Erro ao salvar perfil do usuário:", error);
    throw error;
  }
}

/**
 * Salva os dados do currículo (extraídos de PDF) no user_metadata e na tabela profiles.
 * Assim a página de perfil e getUserProfile passam a ler do banco e não dependem de sessão atualizada.
 */
export async function saveCurriculumToMetadata(curriculumData: CurriculumData): Promise<void> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;

  const current = (user.user_metadata?.profile as Record<string, unknown>) || {};
  await supabase.auth.updateUser({
    data: { profile: { ...current, curriculumData } },
  });

  const { error: upsertError } = await supabase
    .from("profiles")
    .upsert(
      { user_id: user.id, curriculum_data: curriculumData as Record<string, unknown> },
      { onConflict: "user_id" }
    );

  if (upsertError) {
    console.warn("Currículo salvo no metadata; falha ao salvar profiles.curriculum_data:", upsertError);
  }

  await supabase.auth.refreshSession();
}

/**
 * Extrai o perfil do usuário atual
 * Agora busca da tabela profiles do banco de dados
 */
export async function getUserProfile(user: User | null): Promise<UserProfile | null> {
  if (!user) return null;

  try {
    // Buscar perfil na tabela profiles
    // Usar maybeSingle() ao invés de single() para evitar erro quando não há resultado
    const { data: profile, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('user_id', user.id)
      .maybeSingle();

    // Se houver erro, verificar o tipo
    if (error) {
      // 406 Not Acceptable pode ocorrer por problemas de RLS ou formato
      // PGRST116 = no rows returned (não é um erro crítico)
      if (error.code === 'PGRST116') {
        // Não há perfil na tabela, usar fallback
        console.log("Perfil não encontrado na tabela profiles, usando user_metadata como fallback");
        return getProfileFromMetadata(user);
      }
      
      // Para outros erros (incluindo 406), fazer fallback silenciosamente
      console.warn("Erro ao buscar perfil da tabela profiles:", {
        code: error.code,
        message: error.message,
        details: error.details,
        hint: error.hint
      });
      
      // Fallback para user_metadata se houver erro na tabela
      return getProfileFromMetadata(user);
    }

    // Se encontrou perfil na tabela, retornar (curriculumData: primeiro do banco, depois user_metadata)
    if (profile) {
      const metadataProfile = user?.user_metadata?.profile;
      const curriculumFromDb = profile.curriculum_data != null && typeof profile.curriculum_data === "object";
      return {
        cpf: profile.cpf || undefined,
        cnpj: profile.cnpj || undefined,
        lattesId: profile.lattes_id || undefined,
        userType: (profile.user_type as "pesquisador" | "pessoa-empresa" | "ambos") || "pesquisador",
        hasCnpj: profile.has_cnpj || false,
        curriculumData: (curriculumFromDb ? (profile.curriculum_data as CurriculumData) : metadataProfile?.curriculumData) ?? undefined,
        onboardingCompleted: profile.onboarding_completed ?? Boolean(metadataProfile?.onboarding_completed),
        phone: profile.phone ?? undefined,
        area: profile.area ?? undefined,
      };
    }

    // Se não encontrou na tabela, tentar user_metadata como fallback
    return getProfileFromMetadata(user);
  } catch (error) {
    console.error("Erro inesperado ao buscar perfil:", error);
    // Fallback para user_metadata em caso de erro
    return getProfileFromMetadata(user);
  }
}

/**
 * Marca o onboarding como concluído no perfil (tabela profiles).
 * Usado ao concluir ou pular o onboarding para não exibir novamente.
 * Usa upsert para criar o perfil se ainda não existir.
 */
export async function setOnboardingCompleted(userId: string): Promise<void> {
  const { error } = await supabase
    .from("profiles")
    .upsert(
      { user_id: userId, onboarding_completed: true },
      { onConflict: "user_id" }
    );
  if (error) {
    console.error("Erro ao marcar onboarding como concluído:", error);
    throw error;
  }
}

/** Dados que podem ser atualizados a partir do onboarding. */
export interface OnboardingProfileUpdate {
  phone?: string;
  area?: string;
  userType?: "pesquisador" | "pessoa-empresa" | "ambos";
  markOnboardingCompleted?: boolean;
}

/**
 * Atualiza o perfil com dados preenchidos no onboarding (telefone, área, tipo de usuário).
 * Opcionalmente marca o onboarding como concluído.
 * Usa upsert para criar o perfil se ainda não existir (ex.: quando o signup não criou a linha).
 */
export async function updateProfileFromOnboarding(
  userId: string,
  data: OnboardingProfileUpdate
): Promise<void> {
  const row: Record<string, unknown> = { user_id: userId };
  if (data.phone !== undefined) row.phone = data.phone.replace(/\D/g, "").slice(0, 20) || null;
  if (data.area !== undefined) row.area = data.area || null;
  if (data.userType !== undefined) row.user_type = data.userType;
  if (data.markOnboardingCompleted === true) row.onboarding_completed = true;
  if (Object.keys(row).length === 1) return; // só user_id, nada a persistir

  const { error } = await supabase
    .from("profiles")
    .upsert(row, { onConflict: "user_id" });
  if (error) {
    console.error("Erro ao salvar perfil com dados do onboarding:", error);
    throw error;
  }
}

/**
 * Função auxiliar para extrair perfil de user_metadata (fallback)
 */
function getProfileFromMetadata(user: User): UserProfile {
  const metadata = user.user_metadata;
  const profile = metadata?.profile || metadata;
  
  // Se não encontrou perfil, retornar perfil básico com tipo padrão
  if (!profile || (!profile.cpf && !profile.cnpj && !profile.lattesId)) {
    // Verificar se há algum dado nos metadados diretos
    if (metadata?.cpf || metadata?.cnpj || metadata?.lattesId) {
      return {
        cpf: metadata.cpf,
        cnpj: metadata.cnpj,
        lattesId: metadata.lattesId,
        userType: metadata.userType || "pesquisador",
        hasCnpj: metadata.hasCnpj,
        onboardingCompleted: Boolean(metadata?.profile?.onboarding_completed),
      };
    }
    // Retornar perfil vazio mas válido para permitir edição
    return {
      userType: "pesquisador",
      onboardingCompleted: Boolean(metadata?.profile?.onboarding_completed),
    };
  }

  return {
    cpf: profile.cpf,
    cnpj: profile.cnpj,
    lattesId: profile.lattesId,
    userType: profile.userType || "pesquisador",
    hasCnpj: profile.hasCnpj,
    curriculumData: profile.curriculumData ?? undefined,
    onboardingCompleted: Boolean(profile.onboarding_completed),
    phone: profile.phone,
    area: profile.area,
  };
}

/**
 * Extrai CPF do perfil do usuário (apenas números) - versão síncrona
 * Busca do user_metadata (fallback rápido)
 */
export function extractCPF(user: User | null): string | null {
  if (!user) return null;
  const cpf = user.user_metadata?.profile?.cpf;
  return cpf ? cpf.replace(/\D/g, "") : null;
}

/**
 * Extrai CPF do perfil do usuário (apenas números) - versão assíncrona
 * Busca primeiro na tabela profiles, depois no user_metadata como fallback
 */
export async function extractCPFAsync(user: User | null): Promise<string | null> {
  if (!user) return null;
  
  try {
    const { data: profile } = await supabase
      .from('profiles')
      .select('cpf')
      .eq('user_id', user.id)
      .single();
    
    if (profile?.cpf) return profile.cpf;
  } catch (error) {
    // Fallback para user_metadata
  }
  
  return extractCPF(user);
}

/**
 * Extrai CNPJ do perfil do usuário (apenas números) - versão síncrona
 * Busca do user_metadata (fallback rápido)
 */
export function extractCNPJ(user: User | null): string | null {
  if (!user) return null;
  const cnpj = user.user_metadata?.profile?.cnpj;
  return cnpj ? cnpj.replace(/\D/g, "") : null;
}

/**
 * Extrai CNPJ do perfil do usuário (apenas números) - versão assíncrona
 * Busca primeiro na tabela profiles, depois no user_metadata como fallback
 */
export async function extractCNPJAsync(user: User | null): Promise<string | null> {
  if (!user) return null;
  
  try {
    const { data: profile } = await supabase
      .from('profiles')
      .select('cnpj')
      .eq('user_id', user.id)
      .single();
    
    if (profile?.cnpj) return profile.cnpj;
  } catch (error) {
    // Fallback para user_metadata
  }
  
  return extractCNPJ(user);
}

/**
 * Extrai ID Lattes do perfil do usuário - versão síncrona
 * Busca do user_metadata (fallback rápido)
 */
export function extractLattesId(user: User | null): string | null {
  if (!user) return null;
  return user.user_metadata?.profile?.lattesId || null;
}

/**
 * Extrai ID Lattes do perfil do usuário - versão assíncrona
 * Busca primeiro na tabela profiles, depois no user_metadata como fallback
 */
export async function extractLattesIdAsync(user: User | null): Promise<string | null> {
  if (!user) return null;
  
  try {
    const { data: profile } = await supabase
      .from('profiles')
      .select('lattes_id')
      .eq('user_id', user.id)
      .single();
    
    if (profile?.lattes_id) return profile.lattes_id;
  } catch (error) {
    // Fallback para user_metadata
  }
  
  return extractLattesId(user);
}

/**
 * Verifica se o usuário tem CNPJ - versão síncrona
 * Busca do user_metadata (fallback rápido)
 */
export function hasCNPJ(user: User | null): boolean {
  if (!user) return false;
  const profile = user.user_metadata?.profile;
  return profile?.hasCnpj === true && !!profile?.cnpj;
}

/**
 * Verifica se o usuário tem CNPJ - versão assíncrona
 * Busca primeiro na tabela profiles, depois no user_metadata como fallback
 */
export async function hasCNPJAsync(user: User | null): Promise<boolean> {
  if (!user) return false;
  
  try {
    const { data: profile } = await supabase
      .from('profiles')
      .select('has_cnpj, cnpj')
      .eq('user_id', user.id)
      .single();
    
    if (profile) {
      return profile.has_cnpj === true && !!profile.cnpj;
    }
  } catch (error) {
    // Fallback para user_metadata
  }
  
  return hasCNPJ(user);
}

/**
 * Retorna o tipo de usuário (pesquisador, pessoa-empresa ou ambos) - versão síncrona
 * Busca do user_metadata (fallback rápido)
 */
export function getUserType(user: User | null): "pesquisador" | "pessoa-empresa" | "ambos" | null {
  if (!user) return null;
  return user.user_metadata?.profile?.userType || null;
}

/**
 * Retorna o tipo de usuário (pesquisador, pessoa-empresa ou ambos) - versão assíncrona
 * Busca primeiro na tabela profiles, depois no user_metadata como fallback
 */
export async function getUserTypeAsync(user: User | null): Promise<"pesquisador" | "pessoa-empresa" | "ambos" | null> {
  if (!user) return null;
  
  try {
    const { data: profile } = await supabase
      .from('profiles')
      .select('user_type')
      .eq('user_id', user.id)
      .single();
    
    if (profile?.user_type) {
      return profile.user_type as "pesquisador" | "pessoa-empresa" | "ambos";
    }
  } catch (error) {
    // Fallback para user_metadata
  }
  
  return getUserType(user);
}

/**
 * Valida formato de CPF (apenas formato, não dígito verificador)
 */
export function isValidCPFFormat(cpf: string): boolean {
  const numbers = cpf.replace(/\D/g, "");
  return numbers.length === 11;
}

/**
 * Valida formato de CNPJ (apenas formato, não dígito verificador)
 */
export function isValidCNPJFormat(cnpj: string): boolean {
  const numbers = cnpj.replace(/\D/g, "");
  return numbers.length === 14;
}

/**
 * Valida formato de ID Lattes (16 dígitos)
 */
export function isValidLattesId(lattesId: string): boolean {
  const numbers = lattesId.replace(/\D/g, "");
  return numbers.length === 16;
}

