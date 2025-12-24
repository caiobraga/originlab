import { supabase } from "./supabase";
import { User } from "@supabase/supabase-js";

export interface UserProfile {
  cpf?: string;
  cnpj?: string;
  lattesId?: string;
  userType: "pesquisador" | "pessoa-empresa" | "ambos";
  hasCnpj?: boolean;
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
      // Sempre tentar usar a função SECURITY DEFINER primeiro
      if (!session || session.user.id !== userId) {
        console.log("Sem sessão ativa ou sessão diferente, usando função upsert_user_profile...");
        console.log("Parâmetros da função:", {
          p_user_id: userId,
          p_cpf: profileData.cpf || null,
          p_cnpj: profileData.cnpj || null,
          p_lattes_id: profileData.lattes_id || null,
          p_user_type: profileData.user_type,
          p_has_cnpj: profileData.has_cnpj || false,
        });
        
        const { data: functionResult, error: functionError } = await supabase.rpc('upsert_user_profile', {
          p_user_id: userId,
          p_cpf: profileData.cpf || null,
          p_cnpj: profileData.cnpj || null,
          p_lattes_id: profileData.lattes_id || null,
          p_user_type: profileData.user_type,
          p_has_cnpj: profileData.has_cnpj || false,
        });

        if (functionError) {
          console.error("❌ Erro ao usar função upsert_user_profile:", functionError);
          console.error("Código do erro:", functionError.code);
          console.error("Mensagem do erro:", functionError.message);
          console.error("Detalhes:", functionError.details);
          console.error("Hint:", functionError.hint);
          
          // Se a função não existe, tentar método direto
          if (functionError.code === '42883' || functionError.message?.includes('does not exist')) {
            console.warn("⚠️ Função upsert_user_profile não encontrada. Tentando método direto...");
            const { data, error } = await supabase
              .from('profiles')
              .insert(profileData)
              .select()
              .single();

            if (error) {
              console.error("Erro ao inserir perfil (método direto):", error);
              throw error;
            }
            result = data;
            console.log("✅ Perfil criado com sucesso (método direto):", result);
          } else {
            // Para outros erros da função, lançar exceção
            throw functionError;
          }
        } else {
          result = functionResult;
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
          
          // Se for erro de RLS, tentar usar a função
          if (error.code === '42501' || error.message?.includes('permission') || error.message?.includes('policy') || error.message?.includes('RLS')) {
            console.warn("Erro de RLS detectado. Tentando usar função upsert_user_profile...");
            
            const { data: functionResult, error: functionError } = await supabase.rpc('upsert_user_profile', {
              p_user_id: userId,
              p_cpf: profileData.cpf || null,
              p_cnpj: profileData.cnpj || null,
              p_lattes_id: profileData.lattes_id || null,
              p_user_type: profileData.user_type,
              p_has_cnpj: profileData.has_cnpj || false,
            });

            if (functionError) {
              console.error("Erro ao usar função upsert_user_profile:", functionError);
              throw functionError;
            }
            
            result = functionResult;
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

    // Também salvar no user_metadata como backup/compatibilidade
    try {
      const metadataProfile: any = {
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

    // Se encontrou perfil na tabela, retornar
    if (profile) {
      return {
        cpf: profile.cpf || undefined,
        cnpj: profile.cnpj || undefined,
        lattesId: profile.lattes_id || undefined,
        userType: (profile.user_type as "pesquisador" | "pessoa-empresa" | "ambos") || "pesquisador",
        hasCnpj: profile.has_cnpj || false,
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
      };
    }
    // Retornar perfil vazio mas válido para permitir edição
    return {
      userType: "pesquisador",
    };
  }

  return {
    cpf: profile.cpf,
    cnpj: profile.cnpj,
    lattesId: profile.lattesId,
    userType: profile.userType || "pesquisador",
    hasCnpj: profile.hasCnpj,
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

