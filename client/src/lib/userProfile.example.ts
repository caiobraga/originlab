/**
 * EXEMPLO DE USO DAS FUNÇÕES DE PERFIL DO USUÁRIO
 * 
 * Este arquivo demonstra como usar as funções de perfil do usuário
 * para extrair CPF, CNPJ e ID Lattes e verificar relevância de editais.
 */

import { useAuth } from "@/contexts/AuthContext";
import { 
  extractCPF, 
  extractCNPJ, 
  extractLattesId, 
  getUserType,
  hasCNPJ 
} from "./userProfile";
import { 
  isEditalRelevantForUser, 
  filterRelevantEditais,
  getEditalRelevanceInfo 
} from "./editalRelevance";
import { Edital } from "./editalRelevance";

// Exemplo 1: Extrair informações do usuário atual
export function ExampleExtractUserInfo() {
  const { user } = useAuth();

  if (!user) {
    return <div>Usuário não autenticado</div>;
  }

  const cpf = extractCPF(user);
  const cnpj = extractCNPJ(user);
  const lattesId = extractLattesId(user);
  const userType = getUserType(user);
  const userHasCnpj = hasCNPJ(user);

  return (
    <div>
      <h2>Informações do Perfil</h2>
      <p>CPF: {cpf || "Não cadastrado"}</p>
      <p>CNPJ: {cnpj || "Não cadastrado"}</p>
      <p>ID Lattes: {lattesId || "Não cadastrado"}</p>
      <p>Tipo: {userType || "Não definido"}</p>
      <p>Possui CNPJ: {userHasCnpj ? "Sim" : "Não"}</p>
    </div>
  );
}

// Exemplo 2: Verificar se um edital é relevante
export function ExampleCheckEditalRelevance() {
  const { user } = useAuth();
  
  const edital: Edital = {
    numero: "10/2025",
    titulo: "NOVA ECONOMIA CAPIXABA",
    dataEncerramento: "31/12/2025",
    status: "Ativo",
    requisitos: {
      cpf: true,
      cnpj: true,
      tipoUsuario: ["pessoa-empresa"],
    },
  };

  const isRelevant = isEditalRelevantForUser(edital, user);
  const relevanceInfo = getEditalRelevanceInfo(edital, user);

  return (
    <div>
      <h2>Relevância do Edital</h2>
      <p>É relevante? {isRelevant ? "Sim" : "Não"}</p>
      
      {relevanceInfo.warnings.length > 0 && (
        <div>
          <h3>Avisos:</h3>
          <ul>
            {relevanceInfo.warnings.map((warning, idx) => (
              <li key={idx}>{warning}</li>
            ))}
          </ul>
        </div>
      )}

      {relevanceInfo.reasons.length > 0 && (
        <div>
          <h3>Motivos:</h3>
          <ul>
            {relevanceInfo.reasons.map((reason, idx) => (
              <li key={idx}>{reason}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

// Exemplo 3: Filtrar editais relevantes
export function ExampleFilterRelevantEditais() {
  const { user } = useAuth();
  
  const allEditais: Edital[] = [
    {
      numero: "10/2025",
      titulo: "NOVA ECONOMIA CAPIXABA",
      requisitos: {
        cnpj: true,
        tipoUsuario: ["pessoa-empresa"],
      },
    },
    {
      numero: "23/2025",
      titulo: "CHAMADA DE APOIO A NÚCLEOS CAPIXABAS EMERGENTES EM PD&I",
      requisitos: {
        lattesId: true,
        tipoUsuario: ["pesquisador"],
      },
    },
  ];

  const relevantEditais = filterRelevantEditais(allEditais, user);

  return (
    <div>
      <h2>Editais Relevantes</h2>
      <p>Total: {allEditais.length}</p>
      <p>Relevantes: {relevantEditais.length}</p>
      
      <ul>
        {relevantEditais.map((edital) => (
          <li key={edital.numero}>
            {edital.titulo} - {edital.numero}
          </li>
        ))}
      </ul>
    </div>
  );
}

