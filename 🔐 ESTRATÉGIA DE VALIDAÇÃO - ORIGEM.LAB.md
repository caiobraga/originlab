# 🔐 ESTRATÉGIA DE VALIDAÇÃO - ORIGEM.LAB

**Versão**: 1.0  
**Data**: Novembro 2025  
**Status**: Pronto para Implementação

---

## 📋 OBJETIVO

Implementar um sistema automático de validação para **diferenciar Pesquisadores (PF) de Startups/PMEs (PJ)** e aplicar o modelo de preços correto com **Success Fee automática via Stripe**.

---

## 🎯 SEGMENTAÇÃO

### **PESQUISADOR (PF - Pessoa Física)**

```
Critérios:
├─ CPF válido
├─ Sem CNPJ ativo
├─ Sem registro de empresa
└─ Planos: Gratuito, Pro (R$ 79/mês), Premium (R$ 199/mês)
   └─ SEM Success Fee
```

**Validação:**
- CPF via API Receita Federal (validação de dígitos + base)
- Consulta de CNPJ associado (deve retornar vazio)
- Email corporativo opcional (não obrigatório)

---

### **STARTUP/PME (PJ - Pessoa Jurídica)**

```
Critérios:
├─ CNPJ válido e ativo
├─ Receita bruta < R$ 4.8M/ano (MEI/ME/EPP)
├─ Enquadramento: MEI, ME ou EPP
└─ Planos: Gratuito, Pro (R$ 199/mês + 1% SF), Premium (R$ 499/mês + 1% SF)
   └─ COM Success Fee 1%
```

**Validação:**
- CNPJ via API Receita Federal (validação de dígitos + base)
- Receita bruta via Simples Nacional (se disponível)
- Enquadramento legal (MEI/ME/EPP)
- Data de abertura (deve estar ativa)

---

### **EMPRESA GRANDE (PJ - Pessoa Jurídica)**

```
Critérios:
├─ CNPJ válido e ativo
├─ Receita bruta > R$ 4.8M/ano (Empresa)
├─ Enquadramento: Empresa, Sociedade Anônima, etc
└─ Planos: Departamento (R$ 1.990/mês), Instituição (R$ 4.990/mês), Corporativo (R$ 9.990/mês)
   └─ SEM Success Fee (modelo diferente)
```

**Validação:**
- CNPJ via API Receita Federal
- Receita bruta via Simples Nacional ou Declaração de IR
- Enquadramento legal
- Número de funcionários (opcional)

---

## 🔌 FLUXO TÉCNICO DE VALIDAÇÃO

### **1. ONBOARDING - COLETA DE DADOS**

```
┌─────────────────────────────────────────┐
│ Usuário acessa /onboarding              │
└────────────┬────────────────────────────┘
             │
             ▼
┌─────────────────────────────────────────┐
│ Pergunta: Você é PF ou PJ?              │
│ ├─ PF (Pesquisador)                     │
│ └─ PJ (Startup/PME/Empresa)             │
└────────────┬────────────────────────────┘
             │
      ┌──────┴──────┐
      ▼             ▼
   [PF]           [PJ]
    │              │
    ▼              ▼
 CPF Form      CNPJ Form
```

---

### **2. VALIDAÇÃO PF (PESQUISADOR)**

```
Usuário insere CPF
     │
     ▼
┌─────────────────────────────────────────┐
│ Validação Local (dígitos verificadores) │
│ ├─ Formato: XXX.XXX.XXX-XX              │
│ ├─ Dígitos verificadores corretos?      │
│ └─ Não é CPF genérico (111.111.111-11)  │
└────────────┬────────────────────────────┘
             │
        ✅ Válido? 
             │
             ▼
┌─────────────────────────────────────────┐
│ Consulta API Receita Federal            │
│ GET /cpf/{cpf}/status                   │
│ ├─ CPF existe na base?                  │
│ ├─ CPF está ativo?                      │
│ └─ Retorna: nome, data de nascimento    │
└────────────┬────────────────────────────┘
             │
        ✅ Ativo?
             │
             ▼
┌─────────────────────────────────────────┐
│ Consulta CNPJ Associado                 │
│ GET /cpf/{cpf}/cnpj-associado           │
│ └─ Tem CNPJ? (deve ser vazio)           │
└────────────┬────────────────────────────┘
             │
        ✅ Sem CNPJ?
             │
             ▼
┌─────────────────────────────────────────┐
│ ✅ PESQUISADOR VALIDADO                 │
│ ├─ Plano: Gratuito ou Pro (R$ 79/mês)  │
│ ├─ Success Fee: NÃO                     │
│ └─ Salvar: { type: 'PF', cpf, ... }    │
└─────────────────────────────────────────┘
```

---

### **3. VALIDAÇÃO PJ (STARTUP/PME/EMPRESA)**

```
Usuário insere CNPJ
     │
     ▼
┌─────────────────────────────────────────┐
│ Validação Local (dígitos verificadores) │
│ ├─ Formato: XX.XXX.XXX/XXXX-XX          │
│ ├─ Dígitos verificadores corretos?      │
│ └─ Não é CNPJ genérico                  │
└────────────┬────────────────────────────┘
             │
        ✅ Válido?
             │
             ▼
┌─────────────────────────────────────────┐
│ Consulta API Receita Federal            │
│ GET /cnpj/{cnpj}/status                 │
│ ├─ CNPJ existe na base?                 │
│ ├─ CNPJ está ativo?                     │
│ ├─ Retorna: razão social, data abertura │
│ └─ Retorna: enquadramento legal         │
└────────────┬────────────────────────────┘
             │
        ✅ Ativo?
             │
             ▼
┌─────────────────────────────────────────┐
│ Consulta Receita Bruta                  │
│ GET /cnpj/{cnpj}/receita-bruta          │
│ ├─ Receita bruta < R$ 4.8M? (MEI/ME)   │
│ ├─ Receita bruta > R$ 4.8M? (Empresa)  │
│ └─ Retorna: receita, ano, enquadramento │
└────────────┬────────────────────────────┘
             │
        ✅ Receita obtida?
             │
      ┌──────┴──────────────────┐
      ▼                         ▼
  < R$ 4.8M             >= R$ 4.8M
      │                         │
      ▼                         ▼
┌──────────────┐        ┌──────────────────┐
│ STARTUP/PME  │        │ EMPRESA GRANDE   │
│ ✅ VALIDADO  │        │ ✅ VALIDADO      │
│              │        │                  │
│ Planos:      │        │ Planos:          │
│ ├─ Gratuito  │        │ ├─ Departamento  │
│ ├─ Pro       │        │ ├─ Instituição   │
│ └─ Premium   │        │ └─ Corporativo   │
│              │        │                  │
│ Success Fee: │        │ Success Fee:     │
│ 1%           │        │ NÃO              │
│              │        │                  │
│ Salvar:      │        │ Salvar:          │
│ {            │        │ {                │
│   type:'PJ', │        │   type:'PJ',     │
│   cnpj,      │        │   cnpj,          │
│   receita,   │        │   receita,       │
│   tamanho:   │        │   tamanho:       │
│   'startup'  │        │   'empresa'      │
│ }            │        │ }                │
└──────────────┘        └──────────────────┘
```

---

## 💳 COBRANÇA AUTOMÁTICA DE SUCCESS FEE

### **FLUXO DE APROVAÇÃO E COBRANÇA**

```
1. Usuário (Startup/PME) capta fomento
   └─ Edital aprovado: R$ 100.000

2. Sistema detecta aprovação
   ├─ Via API de edital (webhook)
   └─ Verifica: user.successFee = true

3. Calcula Success Fee
   ├─ R$ 100.000 × 1% = R$ 1.000
   └─ Salva em: pendingCharges[]

4. Stripe cobra automaticamente
   ├─ Usa: user.stripePaymentMethod
   ├─ Valor: R$ 1.000
   ├─ Descrição: "Success Fee - Edital XXXXX"
   └─ Retry automático em caso de falha

5. Confirmação ao usuário
   ├─ Email: "Success Fee cobrada"
   ├─ Dashboard: "Ganhos: R$ 100k | Taxas: R$ 1k"
   └─ Relatório: "Histórico de cobranças"

6. Tratamento de falha
   ├─ Cartão recusado?
   │  └─ Retry em 3 dias
   ├─ Ainda falhar?
   │  └─ Notificação ao usuário
   └─ Usuário atualiza cartão?
      └─ Retry automático
```

---

## 🔐 SEGURANÇA E CONFORMIDADE

### **PROTEÇÃO DE DADOS**

| Aspecto | Implementação |
|---------|---------------|
| **Armazenamento de CPF/CNPJ** | Criptografia AES-256 no banco |
| **Transmissão** | HTTPS/TLS 1.3 |
| **Acesso à Receita Federal** | Token JWT com expiração 1h |
| **Logs** | Auditoria de todas as consultas |
| **Conformidade** | LGPD, GDPR (se aplicável) |

---

### **VALIDAÇÃO DE FRAUDE**

```
Verificações automáticas:
├─ CPF/CNPJ duplicado na plataforma?
├─ Email duplicado com outro CPF/CNPJ?
├─ Padrão de atividade suspeita?
│  ├─ Múltiplas tentativas de validação?
│  ├─ Múltiplas Success Fees em curto prazo?
│  └─ Valor anormalmente alto?
├─ Geolocalização inconsistente?
└─ Cartão de crédito duplicado?

Ações em caso de fraude:
├─ Bloquear conta temporariamente
├─ Solicitar verificação manual
├─ Notificar suporte
└─ Registrar em sistema de fraude
```

---

## 📊 DASHBOARD DE VALIDAÇÃO

### **PARA O USUÁRIO**

```
┌─────────────────────────────────────────┐
│ Meu Perfil                              │
├─────────────────────────────────────────┤
│ Tipo: Startup/PME                       │
│ CNPJ: XX.XXX.XXX/XXXX-XX (validado ✅) │
│ Receita Bruta: R$ 2.5M/ano              │
│ Success Fee: 1%                         │
│ Plano: Pro (R$ 199/mês)                 │
│ Ganhos Totais: R$ 500k                  │
│ Taxas Pagas: R$ 5k                      │
│ Saldo Líquido: R$ 495k                  │
└─────────────────────────────────────────┘
```

### **PARA O ADMIN**

```
┌─────────────────────────────────────────┐
│ Validações - Dashboard Admin            │
├─────────────────────────────────────────┤
│ Total de Usuários: 1.250                │
│ ├─ Pesquisadores (PF): 800 (64%)        │
│ ├─ Startups/PMEs (PJ): 350 (28%)        │
│ └─ Empresas (PJ): 100 (8%)              │
│                                         │
│ Validações Pendentes: 15                │
│ ├─ Aguardando CPF: 8                    │
│ ├─ Aguardando CNPJ: 5                   │
│ └─ Falha na Receita Federal: 2          │
│                                         │
│ Success Fees Cobradas: R$ 45.230        │
│ ├─ Última semana: R$ 8.500              │
│ ├─ Taxa de sucesso: 98.5%               │
│ └─ Falhas de cobrança: 1.5%             │
└─────────────────────────────────────────┘
```

---

## 🚀 IMPLEMENTAÇÃO

### **FASE 1: BACKEND (Semana 1-2)**

```
[ ] Criar endpoints de validação
    ├─ POST /api/validate/cpf
    ├─ POST /api/validate/cnpj
    └─ POST /api/validate/receita-bruta

[ ] Integrar com Receita Federal API
    ├─ Autenticação
    ├─ Rate limiting
    └─ Error handling

[ ] Implementar Stripe Charges
    ├─ Criar customer
    ├─ Salvar payment method
    └─ Webhook para cobranças

[ ] Banco de dados
    ├─ Tabela users (adicionar tipo, success_fee)
    ├─ Tabela validations (log de validações)
    └─ Tabela charges (histórico de cobranças)
```

### **FASE 2: FRONTEND (Semana 2-3)**

```
[ ] Atualizar onboarding
    ├─ Pergunta PF vs PJ
    ├─ Formulário CPF
    ├─ Formulário CNPJ
    └─ Validação em tempo real

[ ] Atualizar pricing
    ├─ 3 abas: Pesquisadores, Startups/PMEs, Corporativo
    ├─ Success Fee visível
    └─ Toggle mensal/anual

[ ] Dashboard de ganhos
    ├─ Mostrar Success Fees cobradas
    ├─ Histórico de cobranças
    └─ Saldo líquido
```

### **FASE 3: TESTES (Semana 3-4)**

```
[ ] Testes unitários
    ├─ Validação de CPF/CNPJ
    ├─ Cálculo de Success Fee
    └─ Cobrança Stripe

[ ] Testes de integração
    ├─ Fluxo completo de onboarding
    ├─ Fluxo de aprovação e cobrança
    └─ Tratamento de erros

[ ] Testes de segurança
    ├─ Criptografia de dados
    ├─ Validação de fraude
    └─ Conformidade LGPD
```

---

## 📈 MÉTRICAS DE SUCESSO

| Métrica | Meta | Período |
|---------|------|---------|
| Taxa de validação bem-sucedida | > 95% | Mês 1 |
| Tempo médio de validação | < 5s | Mês 1 |
| Taxa de cobrança de Success Fee | > 98% | Mês 2 |
| Falhas de cobrança | < 2% | Mês 2 |
| Fraudes detectadas | < 0.5% | Contínuo |

---

## 🎯 PRÓXIMAS AÇÕES

1. ✅ Documentação concluída
2. ⏳ Solicitar acesso à API Receita Federal
3. ⏳ Configurar Stripe para cobranças automáticas
4. ⏳ Iniciar desenvolvimento backend
5. ⏳ Testes com dados reais

---

**Status**: ✅ Pronto para implementação
