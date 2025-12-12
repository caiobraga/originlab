# Critérios Validáveis Automaticamente - Edital Centelha III

## O que pode ser validado via CPF?

### ✅ Validações Automáticas Possíveis

| Critério | Fonte de Dados | Tempo | Status |
|----------|----------------|-------|--------|
| **Idade (18+ anos)** | Receita Federal (CPF) | Instantâneo | ✅ Automático |
| **Residência no ES** | Receita Federal (endereço cadastral) | Instantâneo | ✅ Automático |
| **Situação cadastral regular** | Receita Federal | Instantâneo | ✅ Automático |
| **Adimplência com FAPES** | API FAPES | 1-2 segundos | ✅ Automático |
| **Não participou Centelha 1 ou 2** | Base FAPES/FINEP | 1-2 segundos | ✅ Automático |
| **Não é servidor público** | SIAPE (federal) + bases estaduais | 2-5 segundos | ⚠️ Parcial |
| **Não tem empresa similar** | Receita Federal (CNPJ vinculados) | 2-3 segundos | ✅ Automático |

### ⚠️ Validações Parciais (Requerem Confirmação)

| Critério | Limitação | Solução |
|----------|-----------|---------|
| **Servidor público** | Apenas servidores federais (SIAPE) | Declaração do usuário |
| **Competências técnicas** | Não há base pública | Currículo + autodeclaração |
| **Disponibilidade de tempo** | Subjetivo | Autodeclaração |

### ❌ Não Validáveis Automaticamente

- Qualidade da proposta
- Grau de inovação
- Viabilidade técnica/comercial
- Experiência da equipe

---

## O que pode ser validado via CNPJ?

### ✅ Validações Automáticas Possíveis

| Critério | Fonte de Dados | Tempo | Status |
|----------|----------------|-------|--------|
| **Data de constituição** | Receita Federal | Instantâneo | ✅ Automático |
| **Sede no ES** | Receita Federal (endereço) | Instantâneo | ✅ Automático |
| **Enquadramento ME/EPP** | Receita Federal (porte) | Instantâneo | ✅ Automático |
| **Faturamento < R$ 4.8M** | Receita Federal (declarações) | 1-2 segundos | ✅ Automático |
| **Situação cadastral ativa** | Receita Federal | Instantâneo | ✅ Automático |
| **Objeto social alinhado** | Receita Federal (CNAE) | Instantâneo | ⚠️ Parcial |
| **Adimplência FAPES** | API FAPES | 1-2 segundos | ✅ Automático |
| **Não participou Centelha 1 ou 2** | Base FAPES/FINEP | 1-2 segundos | ✅ Automático |
| **Não é EI ou MEI** | Receita Federal (natureza jurídica) | Instantâneo | ✅ Automático |
| **Inova Simples** | Receita Federal (CINOVA) | Instantâneo | ✅ Automático |

### ⚠️ Validações Parciais

| Critério | Limitação | Solução |
|----------|-----------|---------|
| **Objeto social alinhado** | CNAE pode ser genérico | Análise manual + IA |
| **Sócios sem vínculo com executoras** | Apenas CPF dos sócios | Cruzamento + declaração |

---

## Simulação de Validação - Centelha III ES

### Exemplo: Pessoa Física (CPF)

```json
{
  "cpf": "123.456.789-00",
  "validacoes": {
    "idade": {
      "status": "aprovado",
      "valor": "32 anos",
      "requisito": "Maior de 18 anos",
      "fonte": "Receita Federal"
    },
    "residencia_es": {
      "status": "aprovado",
      "valor": "Vitória/ES",
      "requisito": "Residente no Espírito Santo",
      "fonte": "Receita Federal"
    },
    "situacao_cadastral": {
      "status": "aprovado",
      "valor": "Regular",
      "requisito": "Situação regular no país",
      "fonte": "Receita Federal"
    },
    "adimplencia_fapes": {
      "status": "aprovado",
      "valor": "Adimplente",
      "requisito": "Estar adimplente junto à Fapes",
      "fonte": "API FAPES"
    },
    "centelha_anterior": {
      "status": "aprovado",
      "valor": "Não participou",
      "requisito": "Não contratado em edições anteriores",
      "fonte": "Base FAPES"
    },
    "servidor_publico": {
      "status": "atencao",
      "valor": "Não encontrado no SIAPE",
      "requisito": "Se servidor, precisa anuência",
      "fonte": "SIAPE",
      "acao_necessaria": "Confirmar se é servidor estadual/municipal"
    },
    "empresas_similares": {
      "status": "aprovado",
      "valor": "Nenhuma empresa vinculada",
      "requisito": "Não ser sócio de empresas afins",
      "fonte": "Receita Federal"
    }
  },
  "resumo": {
    "aprovados": 6,
    "atencao": 1,
    "reprovados": 0,
    "percentual_elegibilidade": 95
  }
}
```

### Exemplo: Pessoa Jurídica (CNPJ)

```json
{
  "cnpj": "12.345.678/0001-00",
  "validacoes": {
    "data_constituicao": {
      "status": "aprovado",
      "valor": "15/03/2025",
      "requisito": "Constituída após 07/10/2024",
      "fonte": "Receita Federal"
    },
    "sede_es": {
      "status": "aprovado",
      "valor": "Vila Velha/ES",
      "requisito": "Sediada no Espírito Santo",
      "fonte": "Receita Federal"
    },
    "porte": {
      "status": "aprovado",
      "valor": "ME - Microempresa",
      "requisito": "Enquadrada como ME ou EPP",
      "fonte": "Receita Federal"
    },
    "faturamento": {
      "status": "aprovado",
      "valor": "R$ 0 (empresa nova)",
      "requisito": "Faturamento < R$ 4.8M/ano",
      "fonte": "Receita Federal"
    },
    "situacao_cadastral": {
      "status": "aprovado",
      "valor": "Ativa",
      "requisito": "Situação cadastral ativa",
      "fonte": "Receita Federal"
    },
    "natureza_juridica": {
      "status": "aprovado",
      "valor": "Sociedade Limitada",
      "requisito": "Não pode ser EI ou MEI",
      "fonte": "Receita Federal"
    },
    "objeto_social": {
      "status": "atencao",
      "valor": "CNAE: 6201-5/00 - Desenvolvimento de software",
      "requisito": "Objeto social relacionado à proposta",
      "fonte": "Receita Federal",
      "acao_necessaria": "Verificar alinhamento com proposta específica"
    },
    "adimplencia_fapes": {
      "status": "aprovado",
      "valor": "Adimplente",
      "requisito": "Estar adimplente junto à Fapes",
      "fonte": "API FAPES"
    },
    "centelha_anterior": {
      "status": "aprovado",
      "valor": "Não participou",
      "requisito": "Não contratada em edições anteriores",
      "fonte": "Base FAPES"
    },
    "inova_simples": {
      "status": "nao_aplicavel",
      "valor": "Não é Inova Simples",
      "requisito": "Opcional - pode ser Inova Simples",
      "fonte": "Receita Federal"
    }
  },
  "resumo": {
    "aprovados": 8,
    "atencao": 1,
    "reprovados": 0,
    "nao_aplicavel": 1,
    "percentual_elegibilidade": 98
  }
}
```

---

## APIs e Integrações Necessárias

### 1. Receita Federal (Serpro)

**Endpoints:**
- `/cpf/consulta` - Dados cadastrais de pessoa física
- `/cnpj/consulta` - Dados cadastrais de pessoa jurídica
- `/cnpj/socios` - Lista de sócios e participações

**Dados retornados:**
- Nome, data de nascimento, situação cadastral
- Endereço, município, UF
- CNPJs vinculados (para CPF)
- Data de constituição, porte, faturamento (para CNPJ)
- Natureza jurídica, CNAE, objeto social

### 2. FAPES (API própria)

**Endpoints:**
- `/adimplencia/cpf` - Verifica pendências de pessoa física
- `/adimplencia/cnpj` - Verifica pendências de pessoa jurídica
- `/historico/centelha` - Verifica participação em edições anteriores
- `/contratos/ativos` - Lista contratos vigentes

### 3. SIAPE (Governo Federal)

**Endpoint:**
- `/servidor/consulta` - Verifica se CPF é servidor público federal

**Limitação:** Não cobre servidores estaduais/municipais

### 4. Bases Estaduais (ES)

**Endpoints:**
- `/servidor/estadual` - Verifica servidores do ES
- `/servidor/municipal` - Verifica servidores municipais (se disponível)

---

## Fluxo de Validação Automática

```
1. Usuário informa CPF ou CNPJ
   ↓
2. Sistema consulta Receita Federal (dados básicos)
   ↓
3. Sistema consulta FAPES (adimplência + histórico)
   ↓
4. Sistema consulta SIAPE (se CPF - servidor público)
   ↓
5. Sistema cruza dados e gera relatório
   ↓
6. Apresenta resultado com 3 status:
   - ✅ Aprovado (atende critério)
   - ⚠️ Atenção (requer confirmação)
   - ❌ Reprovado (não atende critério)
   ↓
7. Calcula percentual de elegibilidade
   ↓
8. Gera recomendações personalizadas
```

---

## Benefícios da Validação Automática

### Para o Usuário:
- **Instantâneo**: Sabe em segundos se é elegível
- **Transparente**: Vê exatamente quais critérios atende
- **Acionável**: Recebe orientações sobre o que precisa fazer

### Para a Origem.Lab:
- **Diferencial competitivo**: Nenhum concorrente oferece isso
- **Reduz fricção**: Usuário não perde tempo com editais inelegíveis
- **Aumenta conversão**: Foco em editais com alta chance de aprovação
- **Dados valiosos**: Entende perfil dos usuários

### Para as Agências de Fomento:
- **Menos propostas inelegíveis**: Reduz carga de análise
- **Melhor qualidade**: Apenas candidatos elegíveis se inscrevem
- **Transparência**: Critérios objetivos são verificados automaticamente

---

## Implementação Sugerida

### Fase 1: MVP (Simulação)
- Validação simulada (dados mockados)
- Interface de apresentação dos resultados
- Feedback visual claro (✅ ⚠️ ❌)

### Fase 2: Integração Real
- Integração com Receita Federal (Serpro)
- Integração com FAPES
- Cache de resultados (24h)

### Fase 3: Inteligência
- Machine Learning para prever critérios subjetivos
- Análise de objeto social com NLP
- Recomendações personalizadas baseadas em histórico

---

## Exemplo de Apresentação no Painel

```
┌─────────────────────────────────────────────────────────┐
│ Validação Automática de Elegibilidade                  │
│ Edital: Centelha III - Espírito Santo                  │
└─────────────────────────────────────────────────────────┘

CPF informado: 123.456.789-00
Última atualização: 10/11/2025 08:15

┌─────────────────────────────────────────────────────────┐
│ ✅ CRITÉRIOS APROVADOS (6/7)                           │
├─────────────────────────────────────────────────────────┤
│ ✓ Idade: 32 anos (requisito: 18+)                     │
│ ✓ Residência: Vitória/ES (requisito: ES)              │
│ ✓ Situação cadastral: Regular                          │
│ ✓ Adimplência FAPES: Adimplente                       │
│ ✓ Centelha anterior: Não participou                    │
│ ✓ Empresas similares: Nenhuma vinculada                │
└─────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────┐
│ ⚠️ ATENÇÃO (1)                                          │
├─────────────────────────────────────────────────────────┤
│ ⚠ Servidor público: Não encontrado no SIAPE            │
│   → Você é servidor estadual ou municipal?             │
│   → Se SIM: precisará de carta de anuência            │
│   → Se NÃO: está tudo certo!                          │
└─────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────┐
│ ELEGIBILIDADE: 95% ✅                                   │
│                                                         │
│ Você atende a maioria dos critérios objetivos!         │
│ Recomendação: CANDIDATAR-SE                            │
└─────────────────────────────────────────────────────────┘
```
