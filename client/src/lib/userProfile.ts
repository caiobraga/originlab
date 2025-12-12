import { supabase } from "./supabase";
import { User } from "@supabase/supabase-js";

export interface UserProfile {
  cpf?: string;
  cnpj?: string;
  lattesId?: string;
  userType: "pesquisador" | "pessoa-empresa";
  hasCnpj?: boolean;
}

/**
 * Salva o perfil do usuário após o cadastro
 */
export async function saveUserProfile(
  userId: string,
  profile: UserProfile
): Promise<void> {
  try {
    // Salvar no user_metadata do Supabase
    const { error } = await supabase.auth.updateUser({
      data: {
        profile: {
          cpf: profile.cpf?.replace(/\D/g, ""), // Remove formatação
          cnpj: profile.cnpj?.replace(/\D/g, ""), // Remove formatação
          lattesId: profile.lattesId,
          userType: profile.userType,
          hasCnpj: profile.hasCnpj,
        },
      },
    });

    if (error) throw error;
  } catch (error) {
    console.error("Erro ao salvar perfil do usuário:", error);
    throw error;
  }
}

/**
 * Extrai o perfil do usuário atual
 */
export async function getUserProfile(user: User | null): Promise<UserProfile | null> {
  if (!user) return null;

  // Tentar diferentes formatos de metadados
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
 * Extrai CPF do perfil do usuário (apenas números)
 */
export function extractCPF(user: User | null): string | null {
  if (!user) return null;
  const cpf = user.user_metadata?.profile?.cpf;
  return cpf ? cpf.replace(/\D/g, "") : null;
}

/**
 * Extrai CNPJ do perfil do usuário (apenas números)
 */
export function extractCNPJ(user: User | null): string | null {
  if (!user) return null;
  const cnpj = user.user_metadata?.profile?.cnpj;
  return cnpj ? cnpj.replace(/\D/g, "") : null;
}

/**
 * Extrai ID Lattes do perfil do usuário
 */
export function extractLattesId(user: User | null): string | null {
  if (!user) return null;
  return user.user_metadata?.profile?.lattesId || null;
}

/**
 * Verifica se o usuário tem CNPJ
 */
export function hasCNPJ(user: User | null): boolean {
  if (!user) return false;
  const profile = user.user_metadata?.profile;
  return profile?.hasCnpj === true && !!profile?.cnpj;
}

/**
 * Retorna o tipo de usuário (pesquisador ou pessoa-empresa)
 */
export function getUserType(user: User | null): "pesquisador" | "pessoa-empresa" | null {
  if (!user) return null;
  return user.user_metadata?.profile?.userType || null;
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

