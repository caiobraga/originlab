# Sistema de Perfil de Usuário e Relevância de Editais

Este sistema permite extrair informações de CPF/CNPJ e ID Lattes dos usuários e verificar se os editais são relevantes para cada usuário.

## Arquivos Principais

- `userProfile.ts` - Funções para gerenciar perfil do usuário (CPF, CNPJ, Lattes ID)
- `editalRelevance.ts` - Funções para verificar relevância de editais
- `useUserProfile.ts` - Hook React para acessar perfil do usuário
- `EditalCard.tsx` - Componente React para exibir editais com indicador de relevância

## Como Funciona

### 1. Salvando Perfil do Usuário

Quando um usuário se cadastra, os dados são salvos automaticamente no `user_metadata` do Supabase:

```typescript
import { saveUserProfile } from "@/lib/userProfile";

await saveUserProfile(userId, {
  cpf: "12345678900",
  cnpj: "12345678000190", // Opcional
  lattesId: "1234567890123456", // Para pesquisadores
  userType: "pesquisador", // ou "pessoa-empresa"
  hasCnpj: true, // Para pessoa-empresa
});
```

### 2. Extraindo Informações do Usuário

```typescript
import { extractCPF, extractCNPJ, extractLattesId } from "@/lib/userProfile";
import { useAuth } from "@/contexts/AuthContext";

function MyComponent() {
  const { user } = useAuth();
  
  const cpf = extractCPF(user);
  const cnpj = extractCNPJ(user);
  const lattesId = extractLattesId(user);
  
  // Retorna apenas números (sem formatação)
  console.log(cpf); // "12345678900"
  console.log(cnpj); // "12345678000190"
  console.log(lattesId); // "1234567890123456"
}
```

### 3. Verificando Relevância de Editais

```typescript
import { isEditalRelevantForUser, getEditalRelevanceInfo } from "@/lib/editalRelevance";
import { Edital } from "@/lib/editalRelevance";

const edital: Edital = {
  numero: "10/2025",
  titulo: "NOVA ECONOMIA CAPIXABA",
  requisitos: {
    cpf: true,
    cnpj: true,
    tipoUsuario: ["pessoa-empresa"],
  },
};

// Verificar se é relevante
const isRelevant = isEditalRelevantForUser(edital, user);

// Obter informações detalhadas
const relevanceInfo = getEditalRelevanceInfo(edital, user);
// Retorna: { isRelevant: boolean, reasons: string[], warnings: string[] }
```

### 4. Filtrando Editais Relevantes

```typescript
import { filterRelevantEditais } from "@/lib/editalRelevance";

const allEditais: Edital[] = [...];
const relevantEditais = filterRelevantEditais(allEditais, user);
```

### 5. Usando o Componente EditalCard

```typescript
import { EditalCard } from "@/components/EditalCard";
import { useAuth } from "@/contexts/AuthContext";

function EditaisList() {
  const { user } = useAuth();
  const editais: Edital[] = [...];

  return (
    <div>
      {editais.map((edital) => (
        <EditalCard key={edital.numero} edital={edital} user={user} />
      ))}
    </div>
  );
}
```

## Estrutura de Dados

### UserProfile

```typescript
interface UserProfile {
  cpf?: string; // Apenas números
  cnpj?: string; // Apenas números
  lattesId?: string; // 16 dígitos
  userType: "pesquisador" | "pessoa-empresa";
  hasCnpj?: boolean;
}
```

### Edital

```typescript
interface Edital {
  numero: string;
  titulo: string;
  dataEncerramento?: string;
  status?: string;
  pdfUrls?: string[];
  pdfPaths?: string[];
  requisitos?: {
    cpf?: boolean;
    cnpj?: boolean;
    lattesId?: boolean;
    tipoUsuario?: ("pesquisador" | "pessoa-empresa" | "ambos")[];
  };
  descricao?: string;
}
```

## Validações

As funções incluem validações básicas de formato:

- `isValidCPFFormat(cpf)` - Verifica se CPF tem 11 dígitos
- `isValidCNPJFormat(cnpj)` - Verifica se CNPJ tem 14 dígitos
- `isValidLattesId(lattesId)` - Verifica se Lattes ID tem 16 dígitos

## Próximos Passos

1. **Análise de PDFs**: Usar IA para analisar os PDFs dos editais e extrair requisitos automaticamente
2. **Tabela de Perfis**: Migrar de `user_metadata` para uma tabela dedicada no Supabase
3. **Cache de Relevância**: Armazenar resultados de relevância para melhorar performance
4. **Notificações**: Notificar usuários sobre novos editais relevantes

