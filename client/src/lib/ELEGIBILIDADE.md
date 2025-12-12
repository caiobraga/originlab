# Lógica de Elegibilidade para Editais

Este documento explica como o sistema determina se um usuário é elegível para participar de editais com base nas informações de CPF, CNPJ e Currículo Lattes.

## 📋 CPF - Elegibilidade

### Critérios Atuais:
- ✅ **Elegível**: CPF válido (dígitos verificadores corretos)
- ❌ **Não Elegível**: CPF inválido ou com dígitos verificadores incorretos

### Lógica:
```typescript
podeParticiparEditais = CPF válido (validação de dígitos verificadores)
```

### Observações:
- A maioria dos editais exige CPF válido
- Atualmente assumimos maioridade (em produção, buscar data de nascimento via API oficial)
- Para informações completas (nome, data de nascimento), é necessário integrar com:
  - **Cadastro Base do Cidadão (CBC)** - API oficial do governo (requer OAuth)
  - APIs privadas autorizadas (pagas)

---

## 🏢 CNPJ - Elegibilidade

### Critérios Atuais:
- ✅ **Elegível**: 
  - Empresa **ATIVA** na Receita Federal
  - E tem pelo menos **6 meses de atividade** (ou tempo desconhecido)
- ❌ **Não Elegível**: 
  - Empresa não está ativa
  - OU tem menos de 6 meses de atividade

### Lógica:
```typescript
podeParticiparEditais = empresaAtiva && (tempoAtividade >= 6 meses || tempoAtividade === null)
```

### Observações Geradas:
- ⚠️ "Empresa não está ativa na Receita Federal" - se situação !== "ATIVA"
- ⚠️ "Empresa com menos de 6 meses de atividade" - se tempo < 6 meses
- ⚠️ "Email não cadastrado na Receita Federal" - se não tem email (não bloqueia, mas avisa)

### Por que 6 meses?
Muitos editais exigem que empresas tenham um tempo mínimo de atividade para garantir estabilidade e capacidade de execução de projetos.

---

## 🎓 Currículo Lattes - Elegibilidade

### Critérios Atuais:
- ✅ **Elegível**: Possui pelo menos uma formação acadêmica:
  - Doutorado OU
  - Mestrado OU
  - Graduação
- ❌ **Não Elegível**: Não possui nenhuma formação cadastrada

### Lógica:
```typescript
podeParticiparEditais = possuiDoutorado || possuiMestrado || possuiGraduacao
```

### Observações Geradas:
- ⚠️ "Alguns editais podem exigir pós-graduação" - se não tem doutorado nem mestrado
- ⚠️ "Pesquisador com pouca experiência" - se tem menos de 2 anos de experiência

### Detecção de Formação:
O sistema tenta extrair informações do HTML público do Lattes buscando por:
- Palavras-chave: "doutorado", "ph.d", "doctorado"
- Palavras-chave: "mestrado", "master"
- Palavras-chave: "graduação", "bacharelado", "licenciatura"

### Cálculo de Experiência:
- Baseado nos anos encontrados no HTML do Lattes
- Calcula diferença entre o ano mais antigo e o ano atual
- Se < 2 anos, gera observação

---

## 🔄 Como Melhorar a Lógica

### Sugestões para CPF:
1. Integrar com API oficial (CBC) para obter:
   - Data de nascimento → calcular idade real
   - Situação cadastral → verificar se está bloqueado
   - Nome completo → validação adicional

2. Adicionar verificações:
   - Idade mínima (ex: 18 anos)
   - CPF não bloqueado na Receita Federal

### Sugestões para CNPJ:
1. Adicionar verificações adicionais:
   - Capital social mínimo (alguns editais exigem)
   - Natureza jurídica específica (ex: apenas ME, EIRELI, LTDA)
   - Porte da empresa (micro, pequena, média, grande)
   - Atividades CNAE específicas

2. Verificar pendências:
   - Débitos com a Receita Federal
   - Situação no Simples Nacional
   - Certidões negativas

### Sugestões para Lattes:
1. Melhorar extração de dados:
   - Parsing mais robusto do HTML
   - Integração com Extrator Lattes oficial (requer cadastro institucional)
   - Buscar áreas de atuação específicas

2. Adicionar verificações:
   - Áreas de conhecimento específicas
   - Número mínimo de produções científicas
   - Vínculo institucional atual
   - Bolsas e financiamentos recebidos

---

## 📊 Resumo das Regras Atuais

| Tipo | Elegível Se | Não Elegível Se |
|------|-------------|-----------------|
| **CPF** | Dígitos verificadores válidos | CPF inválido |
| **CNPJ** | Ativo E ≥ 6 meses | Inativo OU < 6 meses |
| **Lattes** | Tem graduação/mestrado/doutorado | Sem formação cadastrada |

---

## 🎯 Próximos Passos

1. **Criar sistema de regras configuráveis** - Permitir que cada edital defina seus próprios critérios
2. **Integrar com APIs oficiais** - Obter dados mais completos e confiáveis
3. **Sistema de scoring** - Calcular pontuação de elegibilidade (0-100) ao invés de apenas sim/não
4. **Histórico de elegibilidade** - Rastrear mudanças ao longo do tempo

