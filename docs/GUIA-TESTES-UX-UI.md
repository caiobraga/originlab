# Guia de Testes UX/UI - Origem.Lab

Este documento orienta a equipe de UX/UI nos testes do site Origem.Lab. Use-o como checklist para garantir qualidade, consistência e boa experiência do usuário em todas as áreas da plataforma.

---

## Índice

1. [Visão Geral](#1-visão-geral)
2. [Navegação e Arquitetura da Informação](#2-navegação-e-arquitetura-da-informação)
3. [Landing Page](#3-landing-page)
4. [Fluxos de Conversão](#4-fluxos-de-conversão)
5. [Formulários e Entrada de Dados](#5-formulários-e-entrada-de-dados)
6. [Design Visual e Consistência](#6-design-visual-e-consistência)
7. [Responsividade e Mobile](#7-responsividade-e-mobile)
8. [Acessibilidade](#8-acessibilidade)
9. [Feedback e Estados da Interface](#9-feedback-e-estados-da-interface)
10. [Conteúdo e Copy](#10-conteúdo-e-copy)
11. [Performance Percebida](#11-performance-percebida)
12. [Checklist Rápido](#12-checklist-rápido)

---

## 1. Visão Geral

### Páginas do Site

| Rota | Página | Descrição |
|------|--------|-----------|
| `/` | Home | Landing page principal |
| `/para-consultorias` | Para Consultorias | Página de segmento |
| `/para-faps` | Para FAPs | Página de segmento |
| `/para-corporativo` | Para Corporativo | Página de segmento |
| `/login` | Login | Autenticação |
| `/onboarding` | Onboarding | Cadastro inicial (5 telas) |
| `/dashboard` | Dashboard | Painel de editais |
| `/edital/:id` | Detalhes do Edital | Página de edital específico |
| `/minhas-propostas` | Minhas Propostas | Gerenciamento de propostas |
| `/demo` | Demo | Demonstração interativa |
| `/referencia` | Indique e Ganhe | Programa de referência (link no Header, Dashboard, Perfil, Footer) |
| `/ref/:code` | Redirecionamento | Armazena código e redireciona para cadastro |

### Como Usar Este Guia

- **Antes de cada release**: percorra o checklist completo
- **Foco em UX**: priorize seções 2, 4, 5 e 9
- **Foco em UI**: priorize seções 6, 7 e 8
- **Teste exploratório**: use a seção 12 como ponto de partida

---

## 2. Navegação e Arquitetura da Informação

### 2.1 Header e Menu

- [ ] **Logo**: clicável e leva à home
- [ ] **Links de âncora** (Como Funciona, Planos, Depoimentos): funcionam corretamente na página
- [ ] **Menu mobile**: abre/fecha sem travar; overlay cobre o conteúdo corretamente
- [ ] **Estado ativo**: página atual destacada visualmente
- [ ] **Botões de ação**: CTA principal visível e diferenciado (ex.: "Começar Grátis", "Entrar")
- [ ] **Menu de perfil** (logado): dropdown abre ao clicar; fecha ao clicar fora ou em item
- [ ] **Logout**: funciona e redireciona adequadamente

### 2.2 Navegação Contextual

- [ ] **Breadcrumbs** (quando existirem): refletem o caminho atual
- [ ] **Botão "Voltar"**: presente em páginas de detalhe (ex.: edital) e funciona
- [ ] **Links internos**: sem links quebrados (404)
- [ ] **Redirecionamentos**: login → dashboard para usuário logado; rotas protegidas → login

### 2.3 Footer

- [ ] Links funcionais (incluindo redes sociais)
- [ ] Informações de contato e legal legíveis

---

## 3. Landing Page

### 3.1 Hero

- [ ] **Headline**: clara, objetiva e visível em 3 segundos
- [ ] **Subheadline**: complementa sem repetir
- [ ] **CTAs**: hierarquia visual clara (primário vs secundário)
- [ ] **Urgência/social proof**: números e badges (ex.: "X editais abertos agora") visíveis e críveis
- [ ] **Visual**: não distrai do CTA principal

### 3.2 Como Funciona

- [ ] Número de passos fácil de escanear (3–4)
- [ ] Cada passo tem título e descrição curta
- [ ] Ícones ou ilustrações coerentes com o texto
- [ ] Ordem lógica de leitura (esquerda→direita ou top→bottom)

### 3.3 Painel Inteligente / Demo

- [ ] Demonstração interativa responde às ações do usuário
- [ ] Filtros e buscas funcionam em tempo real
- [ ] Limite de visualização (ex.: 3 editais) comunicado de forma clara
- [ ] CTA de cadastro aparece no momento de interesse

### 3.4 Planos (Pricing)

- [ ] Plano recomendado (PRO) destacado visualmente
- [ ] Benefícios por plano: visíveis e comparáveis (✓ vs ✗)
- [ ] Preços legíveis e sem ambiguidade
- [ ] CTAs por plano apropriados (ex.: "Começar Grátis", "7 dias grátis")
- [ ] Economia anual (quando aplicável) clara

### 3.5 Depoimentos

- [ ] Conteúdo com números/testemunhos específicos
- [ ] Carrossel ou grid funciona em mobile e desktop
- [ ] Avaliação (ex.: 4.9/5) visível

---

## 4. Fluxos de Conversão

### 4.1 Onboarding (5 telas)

**Acesso**: Hero ("Começar em 2 minutos") ou `/onboarding`

| Etapa | O que testar |
|-------|--------------|
| 1. Email | Campo aceita email válido; erro para inválido; botão "Continuar" reativo |
| 2. Tipo de usuário | Todas as opções selecionáveis; feedback visual na seleção |
| 3. Área de atuação | Seleção clara; opção "Outra" quando existir; afeta filtro de editais |
| 4. Validação CPF/CNPJ | Validação em tempo real; mensagens de erro claras |
| 5. Resultado | **Editais reais** da base; quantidade, valor total e prazo médio dinâmicos; CTA correto |

- [ ] Progresso visual (steps/barra) reflete a etapa atual
- [ ] Dados da tela de resultado vêm da API (editais reais, não hardcoded)
- [ ] Usuário não logado: CTA "Criar conta grátis" → `/cadastro?email=...`
- [ ] Usuário logado: CTA "Explorar Meu Painel" → `/dashboard`
- [ ] "Pular/Já tenho conta" → cadastro ou dashboard conforme autenticação

### 4.2 Login / Cadastro

- [ ] Formulário de login: campos obrigatórios marcados
- [ ] Recuperação de senha: link presente e funcional
- [ ] Cadastro: fluxo completo sem erros
- [ ] Redirecionamento pós-login: vai para dashboard ou página de destino correta
- [ ] Estado de loading durante autenticação

### 4.3 Dashboard → Edital → Proposta

- [ ] Dashboard carrega editais com match score
- [ ] Filtros (região, tipo, busca) funcionam
- [ ] Clique em edital leva à página de detalhes
- [ ] Página de edital: informações completas e legíveis
- [ ] Validação de elegibilidade visível e compreensível
- [ ] Botão "Gerar proposta com IA" (ou similar) visível e contextual
- [ ] Upgrade para Pro: bloqueios claros e CTA evidente

### 4.4 Upgrade / Plano Pago

- [ ] CTA de upgrade visível nos momentos certos (ex.: ao tentar usar recurso bloqueado)
- [ ] Fluxo de checkout (Stripe) carrega e funciona
- [ ] Confirmação de pagamento e retorno ao app

---

## 5. Formulários e Entrada de Dados

### 5.1 Campos

- [ ] Labels associados aos campos (não flutuantes sem contexto)
- [ ] Placeholders ajudam, mas não substituem labels
- [ ] Campos obrigatórios indicados (asterisco ou texto)
- [ ] Tipos de input corretos (email, tel, number, etc.)
- [ ] Máscaras (CPF, CNPJ, telefone) aplicadas quando necessário

### 5.2 Validação

- [ ] Validação em tempo real ou no submit, sem ser intrusiva
- [ ] Mensagens de erro próximas ao campo e em linguagem clara
- [ ] Campos com erro destacados visualmente
- [ ] Não é possível submeter formulário inválido

### 5.3 Formulários Específicos

- [ ] **Formulário CNPq**: todos os campos mapeados e salvos
- [ ] **Formulário de Proposta**: seções expansíveis/colapsáveis funcionam
- [ ] **TextField com IA**: sugestões aparecem e podem ser aceitas/rejeitadas

---

## 6. Design Visual e Consistência

### 6.1 Sistema de Design

- [ ] Paleta de cores consistente (primária, secundária, neutros)
- [ ] Uso de gradientes (ex.: blue→violet) alinhado ao guia
- [ ] Tipografia: hierarquia clara (h1, h2, h3, body)
- [ ] Espaçamento consistente entre seções e componentes
- [ ] Bordas e sombras usadas de forma uniforme

### 6.2 Componentes

- [ ] Botões: estados default, hover, active, disabled
- [ ] Cards: sombra, borda e padding consistentes
- [ ] Badges: cores semânticas (sucesso, aviso, erro)
- [ ] Modais/Dialogs: overlay, centralização e fechamento (X, ESC, clique fora)

### 6.3 Tema (Light/Dark)

- [ ] Seletor de tema funciona
- [ ] Contraste adequado em ambos os temas
- [ ] Transição suave entre temas (se aplicável)

---

## 7. Responsividade e Mobile

### 7.1 Breakpoints

Testar em:
- [ ] Mobile (320px – 480px)
- [ ] Tablet (768px – 1024px)
- [ ] Desktop (1280px+)

### 7.2 Elementos Responsivos

- [ ] Menu vira hambúrguer em mobile
- [ ] Tabelas tornam-se scroll horizontal ou cards em mobile
- [ ] Imagens e gráficos não quebram layout
- [ ] Texto legível sem zoom excessivo
- [ ] Botões e áreas de toque com mínimo 44x44px

### 7.3 Orientação

- [ ] Layout funciona em portrait e landscape

---

## 8. Acessibilidade

> Referência: `WCAG_IMPLEMENTATION.md` no projeto

### 8.1 Navegação por Teclado

- [ ] Tab percorre todos os elementos interativos em ordem lógica
- [ ] Focus visível em todos os elementos (ring, outline)
- [ ] Skip Link presente e funcional (pular para conteúdo principal)
- [ ] Modais e dropdowns: foco preso e ESC fecha

### 8.2 Leitores de Tela

- [ ] Estrutura semântica (main, header, nav, section)
- [ ] Headings em ordem (h1 → h2 → h3)
- [ ] `aria-label` em ícones e botões sem texto
- [ ] `aria-expanded`, `aria-haspopup` em menus
- [ ] Formulários com labels associados

### 8.3 Contraste e Legibilidade

- [ ] Contraste mínimo 4.5:1 para texto normal
- [ ] Contraste mínimo 3:1 para texto grande
- [ ] Links distinguíveis do texto (cor e sublinhado)

### 8.4 Movimento

- [ ] `prefers-reduced-motion` respeitado (animações reduzidas ou desativadas)

---

## 9. Feedback e Estados da Interface

### 9.1 Loading

- [ ] Skeleton ou spinner em carregamentos
- [ ] Botões com loading mostram estado (ex.: ícone de loading)
- [ ] Evitar múltiplos spinners na mesma tela

### 9.2 Sucesso e Erro

- [ ] Toasts/notificações para ações importantes
- [ ] Mensagens de sucesso claras (ex.: "Proposta gerada com sucesso")
- [ ] Mensagens de erro acionáveis (o que fazer para corrigir)
- [ ] Erros de rede tratados com mensagem amigável

### 9.3 Estados Vazios

- [ ] Lista vazia: mensagem e CTA (ex.: "Nenhum edital encontrado. Ajuste os filtros.")
- [ ] Busca sem resultados: orientação clara

### 9.4 Estados de Hover/Active

- [ ] Elementos interativos mudam ao passar o mouse
- [ ] Botões dão feedback ao clicar

---

## 10. Conteúdo e Copy

### 10.1 Clareza

- [ ] Jargões técnicos evitados ou explicados
- [ ] CTAs em verbos de ação ("Começar Grátis", "Ver detalhes")
- [ ] Números específicos quando possível (ex.: "2.347 editais")

### 10.2 Consistência

- [ ] Tom de voz uniforme (formal/informal conforme guia)
- [ ] Terminologia consistente (ex.: "edital" vs "chamada")
- [ ] Sem erros de ortografia ou gramática

### 10.3 Hierarquia

- [ ] Informação mais importante em destaque
- [ ] Parágrafos curtos e escaneáveis

---

## 11. Performance Percebida

- [ ] Páginas carregam em tempo razoável (< 3s)
- [ ] Imagens não travam o layout (lazy load, dimensões)
- [ ] Animações suaves (60fps ou sem travamentos)
- [ ] Feedback imediato em ações do usuário (ex.: clique em botão)

---

## 12. Checklist Rápido

Use este checklist para um teste rápido antes de releases:

```
□ Home carrega e hero está legível
□ Links do header funcionam
□ Menu mobile abre e fecha
□ Onboarding completo (5 telas) sem erros
□ Login e logout funcionam
□ Dashboard carrega editais
□ Filtros do dashboard funcionam
□ Página de edital exibe detalhes completos
□ Formulários validam corretamente
□ Mobile: layout sem quebras
□ Navegação por Tab funciona
□ Toasts/notificações aparecem
□ Não há links 404
```

---

## Reportando Problemas

Ao encontrar um problema, documente:

1. **Onde**: URL e seção da página
2. **O que**: descrição do problema
3. **Esperado**: comportamento esperado
4. **Dispositivo/navegador**: ex.: Chrome 120, iPhone 14
5. **Screenshot ou vídeo**: quando ajudar a explicar

---

## Recursos Adicionais

- **Estratégia de UX**: `Estratégia de UX/Design para Conversão - Origem.Lab.md`
- **Acessibilidade**: `WCAG_IMPLEMENTATION.md`
- **Ferramentas sugeridas**: WAVE, axe DevTools, Lighthouse, responsively.app

---

*Documento criado para a equipe de UX/UI do Origem.Lab. Atualize conforme a plataforma evolui.*
