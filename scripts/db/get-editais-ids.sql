-- ============================================
-- QUERIES TO GET ALL EDITAIS IDs
-- ============================================

-- Option 1: Get ALL editais IDs (no filter)
SELECT id
FROM editais
ORDER BY criado_em DESC;

-- Option 2: Get editais IDs for a specific edital by numero
-- Replace 'YOUR_NUMERO' with the actual numero
SELECT id
FROM editais
WHERE numero = 'YOUR_NUMERO'
ORDER BY criado_em DESC;

-- Option 3: Get editais IDs for a specific edital by numero and fonte
-- Replace 'YOUR_NUMERO' and 'YOUR_FONTE' with actual values
SELECT id
FROM editais
WHERE numero = 'YOUR_NUMERO' 
  AND fonte = 'YOUR_FONTE'
ORDER BY criado_em DESC;

-- Option 4: Get editais IDs for a specific edital by ID (UUID)
-- Replace 'YOUR_UUID' with the actual edital ID
SELECT id
FROM editais
WHERE id = 'YOUR_UUID';

-- Option 5: Get editais IDs matching a title pattern
-- Replace 'YOUR_TITLE_PATTERN' with a search pattern (use % for wildcards)
SELECT id
FROM editais
WHERE titulo ILIKE '%YOUR_TITLE_PATTERN%'
ORDER BY criado_em DESC;

-- Option 6: Get editais IDs for a specific fonte (source)
-- Replace 'YOUR_FONTE' with the source (e.g., 'sigfapes', 'fapesp')
SELECT id
FROM editais
WHERE fonte = 'YOUR_FONTE'
ORDER BY criado_em DESC;

-- Option 7: Get editais IDs with status filter
-- Replace 'YOUR_STATUS' with the status (e.g., 'Ativo', 'Encerrado')
SELECT id
FROM editais
WHERE status = 'YOUR_STATUS'
ORDER BY criado_em DESC;

-- Option 8: Get editais IDs with date range filter
SELECT id
FROM editais
WHERE data_publicacao >= '2024-01-01'
  AND data_publicacao <= '2024-12-31'
ORDER BY criado_em DESC;

-- Option 9: Get editais IDs along with basic info
SELECT 
  id,
  numero,
  titulo,
  fonte,
  status,
  criado_em
FROM editais
ORDER BY criado_em DESC;

-- Option 10: Get all editais IDs as a simple array (PostgreSQL specific)
SELECT ARRAY_AGG(id) as editais_ids
FROM editais;

-- ============================================
-- GET ALL INFORMATION FOR SPECIFIC EDITAL ID
-- ============================================

-- Get all information for edital ID: 15bc534c-3969-4ce8-af08-207563c1ca97
SELECT 
  id,
  numero,
  titulo,
  descricao,
  data_publicacao,
  data_encerramento,
  status,
  valor,
  area,
  orgao,
  fonte,
  link,
  processado_em,
  criado_em,
  atualizado_em
FROM editais
WHERE id = '15bc534c-3969-4ce8-af08-207563c1ca97';

-- Get all information for edital ID with related PDFs
SELECT 
  e.id,
  e.numero,
  e.titulo,
  e.descricao,
  e.data_publicacao,
  e.data_encerramento,
  e.status,
  e.valor,
  e.area,
  e.orgao,
  e.fonte,
  e.link,
  e.processado_em,
  e.criado_em,
  e.atualizado_em,
  json_agg(
    json_build_object(
      'id', p.id,
      'nome_arquivo', p.nome_arquivo,
      'caminho_storage', p.caminho_storage,
      'url_original', p.url_original,
      'tamanho_bytes', p.tamanho_bytes,
      'tipo_mime', p.tipo_mime,
      'criado_em', p.criado_em
    )
  ) FILTER (WHERE p.id IS NOT NULL) as pdfs
FROM editais e
LEFT JOIN edital_pdfs p ON e.id = p.edital_id
WHERE e.id = '15bc534c-3969-4ce8-af08-207563c1ca97'
GROUP BY e.id, e.numero, e.titulo, e.descricao, e.data_publicacao, 
         e.data_encerramento, e.status, e.valor, e.area, e.orgao, 
         e.fonte, e.link, e.processado_em, e.criado_em, e.atualizado_em;

-- ============================================
-- GET PDF FILE IDs FOR SPECIFIC EDITAL ID
-- ============================================

-- Get only the list of PDF file IDs for edital ID: 15bc534c-3969-4ce8-af08-207563c1ca97
SELECT id
FROM edital_pdfs
WHERE edital_id = '15bc534c-3969-4ce8-af08-207563c1ca97'
ORDER BY criado_em;

-- Get PDF file IDs as an array (PostgreSQL specific)
SELECT ARRAY_AGG(id) as pdf_file_ids
FROM edital_pdfs
WHERE edital_id = '15bc534c-3969-4ce8-af08-207563c1ca97';
