# Roadmap de Próximos Passos - Origem.Lab

## Visão Geral

Este documento detalha o roadmap estratégico para os próximos 6-12 meses da Origem.Lab, considerando as funcionalidades já implementadas e as oportunidades de crescimento identificadas.

---

## 📊 Status Atual (Checkpoint: c032b7cd)

### ✅ Implementado (Fases 1-3)
- Landing page otimizada para conversão
- Onboarding de 5 telas (5 minutos)
- Sistema de autenticação (mock)
- Dashboard com 5 editais brasileiros
- Página de detalhes de edital com validação automática via CPF/CNPJ
- Painel "Minhas Propostas" com acompanhamento
- Seção "IA Avançada + Supervisão Humana"
- Planos (Gratuito, Pro, Institucional) com pricing mensal/anual
- Trial de 7 dias com contador no header
- Email de recomendação automático
- Integração com Stripe (mock)
- Serviço de API de Editais (FAPESP, FINEP, CNPq)
- Sistema de Notificações Push em tempo real
- Página de Referência com programa de indicação (R$ 50/amigo)
- Dashboard Admin com métricas (conversão, CAC, LTV, churn)

### 🚀 Fase 4 (Em Progresso)
- [x] Dashboard Admin com métricas de conversão
- [x] Cálculo de CAC, LTV, Churn
- [x] Gráficos de tendências
- [ ] Documento de Roadmap (Este documento)

---

## 🎯 Roadmap Detalhado (6-12 meses)

### **MÊS 1-2: Fundação de Dados e Backend**

#### 1.1 Integração com Banco de Dados Real
- **Objetivo**: Persistir dados de usuários, propostas e métricas
- **Tecnologia**: PostgreSQL + Prisma ORM
- **Tarefas**:
  - Criar schema de banco de dados
  - Migrar dados mock para banco real
  - Implementar autenticação real (JWT)
  - Criar APIs REST para CRUD de usuários
- **Impacto**: Sem dados persistidos, não há escalabilidade
- **Esforço**: 40 horas

#### 1.2 Email Marketing com Resend/SendGrid
- **Objetivo**: Implementar fluxo de emails automáticos
- **Tarefas**:
  - Welcome sequence (3 emails em 7 dias)
  - Email de recomendação automático (24h após onboarding)
  - Email de prazo próximo (7 dias antes do encerramento)
  - Email de re-engajamento (usuários inativos)
- **Impacto**: +25% de engajamento, +15% de conversão
- **Esforço**: 30 horas

#### 1.3 Integração com APIs Reais de Editais
- **Objetivo**: Conectar com bases de dados reais
- **Tarefas**:
  - API FAPESP (via portal)
  - API FINEP (via portal)
  - API CNPq (via portal)
  - Scraper para editais não estruturados
  - Sincronização automática (diária)
- **Impacto**: Dados reais = confiabilidade + diferencial
- **Esforço**: 60 horas

---

### **MÊS 3: Pagamento e Billing**

#### 2.1 Integração Real com Stripe
- **Objetivo**: Processar pagamentos reais
- **Tarefas**:
  - Conectar Stripe API
  - Criar webhooks para eventos de pagamento
  - Implementar gestão de assinaturas
  - Criar portal de faturamento
  - Implementar renovação automática
- **Impacto**: Receita real, reduz fricção de conversão
- **Esforço**: 40 horas

#### 2.2 Sistema de Cupons e Promoções
- **Objetivo**: Aumentar conversão com descontos estratégicos
- **Tarefas**:
  - Criar sistema de cupons
  - Implementar desconto por referral
  - Criar promoção de lançamento (50% off)
  - Analytics de cupons
- **Impacto**: +20% de conversão em períodos promocionais
- **Esforço**: 20 horas

---

### **MÊS 4-5: IA e Automação**

#### 3.1 Editor de Propostas com IA
- **Objetivo**: Gerar propostas automaticamente baseado no edital
- **Tarefas**:
  - Integrar OpenAI GPT-4 API
  - Criar templates de proposta por tipo de edital
  - Implementar editor com sugestões em tempo real
  - Sistema de revisão humana
  - Histórico de versões
- **Impacto**: Diferencial competitivo, aumenta conversão Pro→Institucional
- **Esforço**: 80 horas

#### 3.2 Análise de Elegibilidade Automática
- **Objetivo**: Validar automaticamente elegibilidade para cada edital
- **Tarefas**:
  - Integrar com Receita Federal (Serpro)
  - Integrar com FAPES
  - Integrar com SIAPE
  - Criar scoring de elegibilidade
  - Implementar alertas de inelegibilidade
- **Impacto**: Evita submissões inúteis, aumenta taxa de aprovação
- **Esforço**: 50 horas

---

### **MÊS 6: Expansão Internacional**

#### 4.1 Suporte a Editais Europeus
- **Objetivo**: Adicionar Horizon Europe e programas nacionais
- **Tarefas**:
  - Integrar APIs de editais europeus
  - Traduzir interface para EN/ES
  - Adaptar validação para critérios europeus
  - Criar templates para Horizon Europe
- **Impacto**: TAM global = R$ 200+ bilhões
- **Esforço**: 60 horas

#### 4.2 Suporte a Editais Latinoamericanos
- **Objetivo**: Expandir para Chile, Colômbia, México
- **Tarefas**:
  - Integrar CORFO (Chile)
  - Integrar Minciencias (Colômbia)
  - Integrar CONACYT (México)
  - Suporte a moedas locais
- **Impacto**: Crescimento em LATAM = +300% de TAM
- **Esforço**: 50 horas

---

### **MÊS 7-9: Crescimento e Retenção**

#### 5.1 Programa de Parceria com Aceleradoras
- **Objetivo**: Crescimento via partnerships
- **Tarefas**:
  - Criar programa de parceria (white-label)
  - Integração com plataformas de aceleradoras
  - Comissão por referência (15-20%)
  - Suporte dedicado para parceiros
- **Impacto**: +500 usuários/mês via partners
- **Esforço**: 40 horas

#### 5.2 Programa de Retenção
- **Objetivo**: Reduzir churn de 5.2% para 2%
- **Tarefas**:
  - Criar programa de loyalty (pontos)
  - Implementar NPS tracking
  - Criar playbook de re-engajamento
  - Suporte premium para clientes Pro+
- **Impacto**: +40% de LTV, reduz CAC payback
- **Esforço**: 30 horas

#### 5.3 Comunidade e Conteúdo
- **Objetivo**: Criar moat de conteúdo
- **Tarefas**:
  - Blog com guias de editais
  - Webinars mensais
  - Comunidade Slack/Discord
  - Case studies de clientes
- **Impacto**: SEO, brand awareness, social proof
- **Esforço**: 50 horas

---

### **MÊS 10-12: Escalabilidade e Otimização**

#### 6.1 Otimização de Performance
- **Objetivo**: Suportar 100k+ usuários
- **Tarefas**:
  - Implementar caching (Redis)
  - Otimizar queries de banco de dados
  - CDN para assets estáticos
  - Load testing e auto-scaling
- **Impacto**: Melhor UX, reduz bounce rate
- **Esforço**: 40 horas

#### 6.2 Segurança e Compliance
- **Objetivo**: Estar pronto para LGPD/GDPR
- **Tarefas**:
  - Implementar LGPD compliance
  - Criptografia de dados sensíveis
  - Audit logs
  - Política de privacidade
  - Certificação SOC 2
- **Impacto**: Confiança de clientes enterprise
- **Esforço**: 50 horas

#### 6.3 Mobile App
- **Objetivo**: Expandir para mobile
- **Tarefas**:
  - React Native app (iOS + Android)
  - Notificações push nativas
  - Offline mode
  - App Store + Google Play
- **Impacto**: +30% de engajamento, +15% de conversão
- **Esforço**: 120 horas

---

## 📈 Métricas de Sucesso

### Mês 1-2
- [ ] 500+ usuários cadastrados
- [ ] 50+ usuários pagos (Pro/Institucional)
- [ ] Taxa de conversão: 10%
- [ ] MRR: R$ 5k

### Mês 3-4
- [ ] 2k+ usuários cadastrados
- [ ] 200+ usuários pagos
- [ ] Taxa de conversão: 12%
- [ ] MRR: R$ 20k
- [ ] CAC: < R$ 100

### Mês 5-6
- [ ] 5k+ usuários cadastrados
- [ ] 500+ usuários pagos
- [ ] Taxa de conversão: 15%
- [ ] MRR: R$ 50k
- [ ] LTV/CAC: > 10x

### Mês 7-12
- [ ] 15k+ usuários cadastrados
- [ ] 1.5k+ usuários pagos
- [ ] Taxa de conversão: 18%
- [ ] MRR: R$ 150k
- [ ] ARR: R$ 1.8M
- [ ] Churn: < 2%
- [ ] NRR: > 110%

---

## 💰 Estimativa de Investimento

| Fase | Período | Horas | Custo (R$ 200/h) | Prioridade |
|------|---------|-------|------------------|-----------|
| Backend + Banco | Mês 1-2 | 130 | R$ 26k | 🔴 Crítica |
| Email Marketing | Mês 2 | 30 | R$ 6k | 🔴 Crítica |
| APIs Reais | Mês 2-3 | 60 | R$ 12k | 🔴 Crítica |
| Stripe Real | Mês 3 | 40 | R$ 8k | 🔴 Crítica |
| IA Editor | Mês 4-5 | 80 | R$ 16k | 🟡 Alta |
| Elegibilidade IA | Mês 5 | 50 | R$ 10k | 🟡 Alta |
| Expansão Intl | Mês 6 | 110 | R$ 22k | 🟡 Alta |
| Partnerships | Mês 7 | 40 | R$ 8k | 🟢 Média |
| Retenção | Mês 7-8 | 30 | R$ 6k | 🟢 Média |
| Conteúdo | Mês 8-9 | 50 | R$ 10k | 🟢 Média |
| Performance | Mês 10 | 40 | R$ 8k | 🟢 Média |
| Segurança | Mês 11 | 50 | R$ 10k | 🟡 Alta |
| Mobile | Mês 12 | 120 | R$ 24k | 🟢 Média |
| **TOTAL** | **12 meses** | **820** | **R$ 166k** | |

---

## 🎯 Estratégia de Execução

### Equipe Recomendada
- **1 CTO/Tech Lead** (full-time)
- **2 Backend Engineers** (full-time)
- **1 Frontend Engineer** (full-time)
- **1 Product Manager** (full-time)
- **1 Growth/Marketing** (full-time)
- **1 Customer Success** (part-time)

### Metodologia
- **Sprint de 2 semanas**
- **Daily standups**
- **Weekly demos**
- **Monthly planning**

### Riscos e Mitigações

| Risco | Probabilidade | Impacto | Mitigação |
|-------|--------------|--------|-----------|
| Atraso em APIs reais | Alta | Alto | Começar com mock, depois integrar |
| Concorrência (Instrumentl) | Média | Alto | Focar em LATAM, diferencial IA |
| Churn alto | Média | Alto | Email marketing + suporte ativo |
| Falta de tração | Média | Alto | Parcerias com aceleradoras |
| Problemas de segurança | Baixa | Crítico | Audit de segurança mensal |

---

## 🚀 Próximas Ações (Próximas 2 Semanas)

1. **Semana 1**
   - [ ] Criar schema PostgreSQL
   - [ ] Setup Prisma ORM
   - [ ] Implementar autenticação JWT
   - [ ] Criar APIs REST básicas

2. **Semana 2**
   - [ ] Integrar Resend para emails
   - [ ] Criar welcome sequence
   - [ ] Testar fluxo end-to-end
   - [ ] Deploy em staging

---

## 📞 Contato e Suporte

Para dúvidas sobre o roadmap, entre em contato com:
- **Product Manager**: [email]
- **CTO**: [email]
- **Founder**: [email]

---

**Última atualização**: Novembro 2025
**Próxima revisão**: Dezembro 2025
