# Script de Correção de PDFs

Este script corrige PDFs corrompidos ou ausentes no Supabase Storage.

## Problema

Os PDFs podem estar corrompidos devido a:
- Erros no processo de download
- Conversão incorreta de ArrayBuffer para Buffer
- Arquivos parcialmente baixados
- Problemas de encoding

## Solução

O script `fix-pdfs.ts`:
1. ✅ Lista todos os PDFs do banco de dados
2. ✅ Verifica se os arquivos locais existem e são válidos
3. ✅ Re-baixa PDFs corrompidos ou ausentes usando fetch nativo
4. ✅ Re-envia para o Supabase Storage
5. ✅ Atualiza registros no banco de dados

## Como Usar

### 1. Executar o script de correção

```bash
npm run db:fix-pdfs
```

### 2. O script irá:

- Buscar todos os PDFs da tabela `edital_pdfs`
- Para cada PDF:
  - Verificar se existe localmente em `scripts/output/pdfs/`
  - Verificar se é um PDF válido (magic number `%PDF`)
  - Se corrompido ou ausente, re-baixar da URL original
  - Re-enviar para o Supabase Storage
  - Atualizar o registro no banco

### 3. Verificar resultados

O script mostra um resumo ao final:
```
📊 RESUMO
═══════════════════════════════════════════════════
✅ Processados: X
🔧 Corrigidos: Y
⏭️  Pulados: Z
```

## Melhorias Implementadas

### No Scraper (`scrape-sigfapes.ts`)

1. **Validação de Content-Type**: Verifica se a resposta é realmente um PDF
2. **Validação de Magic Number**: Verifica o header `%PDF` antes de salvar
3. **Validação de Buffer**: Verifica se o buffer não está vazio
4. **Headers melhorados**: Adiciona `Accept: application/pdf` na requisição

### No Script de Correção (`fix-pdfs.ts`)

1. **Re-download inteligente**: Usa fetch nativo do Node.js (mais confiável)
2. **Validação rigorosa**: Verifica magic number antes de salvar
3. **Substituição segura**: Remove arquivo antigo antes de enviar novo
4. **Atualização de metadados**: Atualiza tamanho e tipo no banco

## Troubleshooting

### Erro: "PDF não encontrado localmente"

O script tentará re-baixar automaticamente se a URL original estiver disponível.

### Erro: "Não foi possível re-baixar o PDF"

Verifique:
- Se a URL original ainda está válida
- Se há problemas de autenticação (cookies de sessão)
- Se o servidor está acessível

### PDFs ainda corrompidos após correção

1. Verifique os logs do script para ver qual PDF está com problema
2. Tente baixar manualmente a URL original
3. Execute o scraper novamente para re-baixar todos os PDFs:
   ```bash
   npm run scrape:all
   ```

## Próximos Passos

Após corrigir os PDFs:
1. Verifique alguns PDFs manualmente no Supabase Storage
2. Teste o download no frontend
3. Se necessário, execute o script novamente

## Notas

- O script usa `upsert: true` para substituir PDFs existentes no storage
- PDFs são validados pelo magic number `%PDF` antes de serem salvos
- O script aguarda 500ms entre cada processamento para não sobrecarregar









