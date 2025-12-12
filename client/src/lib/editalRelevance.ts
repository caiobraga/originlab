import { User } from "@supabase/supabase-js";
import { extractCPF, extractCNPJ, extractLattesId, getUserType, hasCNPJ } from "./userProfile";

export interface Edital {
  numero: string;
  titulo: string;
  dataEncerramento?: string;
  status?: string;
  pdfUrls?: string[];
  pdfPaths?: string[];
  processadoEm?: string;
  // Campos adicionais que podem ser extraídos dos PDFs ou do site
  requisitos?: {
    cpf?: boolean;
    cnpj?: boolean;
    lattesId?: boolean;
    tipoUsuario?: ("pesquisador" | "pessoa-empresa" | "ambos")[];
  };
  descricao?: string;
}

/**
 * Verifica se um edital é relevante para um usuário baseado no seu perfil
 */
export function isEditalRelevantForUser(edital: Edital, user: User | null): boolean {
  if (!user) return false;

  const userType = getUserType(user);
  const cpf = extractCPF(user);
  const cnpj = extractCNPJ(user);
  const lattesId = extractLattesId(user);
  const userHasCnpj = hasCNPJ(user);

  // Se o edital tem requisitos específicos, verificar
  if (edital.requisitos) {
    const req = edital.requisitos;

    // Verificar tipo de usuário
    if (req.tipoUsuario && req.tipoUsuario.length > 0) {
      if (!req.tipoUsuario.includes("ambos")) {
        if (userType === "pesquisador" && !req.tipoUsuario.includes("pesquisador")) {
          return false;
        }
        if (userType === "pessoa-empresa" && !req.tipoUsuario.includes("pessoa-empresa")) {
          return false;
        }
      }
    }

    // Verificar CPF
    if (req.cpf && !cpf) {
      return false;
    }

    // Verificar CNPJ
    if (req.cnpj && !cnpj) {
      return false;
    }

    // Verificar Lattes ID (geralmente necessário para pesquisadores)
    if (req.lattesId && !lattesId) {
      return false;
    }
  }

  // Análise básica baseada no título e descrição do edital
  // (pode ser expandida com análise de PDFs usando IA)
  const tituloLower = edital.titulo.toLowerCase();
  const descricaoLower = edital.descricao?.toLowerCase() || "";

  // Pesquisadores geralmente precisam de Lattes ID
  if (userType === "pesquisador" && !lattesId) {
    // Se o edital menciona pesquisa, ciência, etc., pode ser relevante mas requer Lattes
    if (
      tituloLower.includes("pesquisa") ||
      tituloLower.includes("ciência") ||
      tituloLower.includes("inovação") ||
      tituloLower.includes("desenvolvimento")
    ) {
      // Retorna true mas pode mostrar aviso de que precisa Lattes ID
      return true; // Mas deve mostrar aviso
    }
  }

  // Empresas geralmente precisam de CNPJ
  if (userType === "pessoa-empresa") {
    if (
      tituloLower.includes("empresa") ||
      tituloLower.includes("startup") ||
      tituloLower.includes("negócio") ||
      tituloLower.includes("inovação tecnológica")
    ) {
      if (!userHasCnpj) {
        // Pode ser relevante mas requer CNPJ
        return true; // Mas deve mostrar aviso
      }
    }
  }

  // Por padrão, se passou todas as verificações, é relevante
  return true;
}

/**
 * Retorna uma lista de editais filtrados por relevância para o usuário
 */
export function filterRelevantEditais(editais: Edital[], user: User | null): Edital[] {
  return editais.filter((edital) => isEditalRelevantForUser(edital, user));
}

/**
 * Retorna informações sobre por que um edital pode não ser relevante
 */
export function getEditalRelevanceInfo(edital: Edital, user: User | null): {
  isRelevant: boolean;
  reasons: string[];
  warnings: string[];
} {
  const reasons: string[] = [];
  const warnings: string[] = [];

  if (!user) {
    return {
      isRelevant: false,
      reasons: ["Usuário não autenticado"],
      warnings: [],
    };
  }

  const userType = getUserType(user);
  const cpf = extractCPF(user);
  const cnpj = extractCNPJ(user);
  const lattesId = extractLattesId(user);
  const userHasCnpj = hasCNPJ(user);

  // Verificar requisitos específicos
  if (edital.requisitos) {
    const req = edital.requisitos;

    if (req.tipoUsuario && req.tipoUsuario.length > 0) {
      if (!req.tipoUsuario.includes("ambos")) {
        if (userType === "pesquisador" && !req.tipoUsuario.includes("pesquisador")) {
          reasons.push("Este edital é apenas para pessoas físicas/empresas");
        }
        if (userType === "pessoa-empresa" && !req.tipoUsuario.includes("pessoa-empresa")) {
          reasons.push("Este edital é apenas para pesquisadores");
        }
      }
    }

    if (req.cpf && !cpf) {
      warnings.push("Este edital requer CPF cadastrado");
    }

    if (req.cnpj && !cnpj) {
      warnings.push("Este edital requer CNPJ cadastrado");
    }

    if (req.lattesId && !lattesId) {
      warnings.push("Este edital requer ID Lattes cadastrado");
    }
  }

  // Análise baseada no título
  const tituloLower = edital.titulo.toLowerCase();
  
  if (userType === "pesquisador" && !lattesId) {
    if (
      tituloLower.includes("pesquisa") ||
      tituloLower.includes("ciência") ||
      tituloLower.includes("inovação")
    ) {
      warnings.push("Este edital pode requerer ID Lattes");
    }
  }

  if (userType === "pessoa-empresa" && !userHasCnpj) {
    if (
      tituloLower.includes("empresa") ||
      tituloLower.includes("startup") ||
      tituloLower.includes("negócio")
    ) {
      warnings.push("Este edital pode requerer CNPJ");
    }
  }

  const isRelevant = reasons.length === 0;

  return {
    isRelevant,
    reasons,
    warnings,
  };
}

