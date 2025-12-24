# API de Editais - Documentação

## Visão Geral

Este módulo gerencia a busca de editais do Supabase e o cálculo de scores (match e probabilidade de aprovação).

## Estrutura

### `editaisApi.ts`

Contém todas as funções para:
- Buscar editais do Supabase
- Calcular scores (match e probabilidade)
- Formatar dados para exibição

## Funções Principais

### `fetchEditaisFromSupabase()`

Busca todos os editais da tabela `editais` no Supabase.

**Retorna:** `Promise<DatabaseEdital[]>`

### `calculateEditalScores(edital, userId?)`

**⚠️ ATUALMENTE MOCKADA** - Calcula match e probabilidade de aprovação.

**Parâmetros:**
- `edital`: Edital do banco de dados
- `userId`: (opcional) ID do usuário para análise personalizada

**Retorna:** `Promise<{ match: number, probabilidade: number }>`

**Lógica atual (mockada):**
- Match base: 50%
- Probabilidade base: 40%
- Ajustes baseados em:
  - Área informada (+10%)
  - Descrição completa (+5%)
  - Status ativo (+15%)
  - Prazo restante (+5-10%)
  - Variação aleatória (-10 a +10%)

### `fetchEditaisWithScores(userId?)`

Busca editais e adiciona scores calculados.

**Retorna:** `Promise<EditalWithScores[]>`

## Integração com API Real

Para substituir a função mockada por uma API real:

1. **Criar endpoint da API:**
   ```typescript
   POST /api/editais/scores
   Body: { editalId: string, userId?: string }
   Response: { match: number, probabilidade: number }
   ```

2. **Atualizar `calculateEditalScores`:**
   ```typescript
   export async function calculateEditalScores(
     edital: DatabaseEdital,
     userId?: string
   ): Promise<{ match: number; probabilidade: number }> {
     const response = await fetch('/api/editais/scores', {
       method: 'POST',
       headers: { 'Content-Type': 'application/json' },
       body: JSON.stringify({ 
         editalId: edital.id, 
         userId 
       })
     });
     
     return await response.json();
   }
   ```

3. **A API deve considerar:**
   - Perfil do usuário (CPF, CNPJ, Lattes)
   - Histórico de aprovações
   - Requisitos do edital
   - Similaridade com editais anteriores aprovados
   - Análise de texto (título, descrição)
   - Regras de negócio específicas

## Uso no Dashboard

```typescript
import { fetchEditaisWithScores } from "@/lib/editaisApi";

const editais = await fetchEditaisWithScores(user?.id);
// editais agora contém match e probabilidade calculados
```

## Formatação de Dados

### `formatPrazo(dataEncerramento)`

Formata a data de encerramento para exibição:
- "Prazo encerrado" (se passou)
- "Último dia" (se hoje)
- "X dias" (dias restantes)

### `getPaisFromEdital(edital)`

Determina país e flag baseado no órgão/fonte:
- FAPESP, FINEP, CNPq → Brasil 🇧🇷
- European, Horizon → União Europeia 🇪🇺
- UK, British → Reino Unido 🇬🇧
- etc.

### `getStatusFromEdital(edital)`

Determina status do edital:
- "novo" - Ativo/aberto
- "em_analise" - Em análise
- "submetido" - Encerrado/finalizado

## Próximos Passos

1. ✅ Buscar editais do Supabase
2. ✅ Calcular scores mockados
3. ⏳ Integrar com API real de análise
4. ⏳ Adicionar cache de scores
5. ⏳ Implementar atualização periódica de scores
6. ⏳ Adicionar análise de perfil do usuário



















