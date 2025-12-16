-- ============================================
-- SUPABASE MIGRATION SCRIPT
-- ============================================
-- This script handles both EXPORT (from old account) and IMPORT (to new account)
-- 
-- USAGE:
-- 1. EXPORT: Run the EXPORT section in OLD Supabase account
-- 2. IMPORT: Run schema.sql first, then run IMPORT section in NEW account
-- ============================================

-- ============================================
-- PART 1: EXPORT DATA (Run in OLD account)
-- ============================================
-- Copy the output INSERT statements and use them in PART 2

-- Check if tables exist before exporting
DO $$
BEGIN
  IF EXISTS (SELECT FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'editais') THEN
    RAISE NOTICE 'Table editais exists - proceeding with export';
  ELSE
    RAISE EXCEPTION 'Table editais does not exist. Make sure you are running this in the correct database.';
  END IF;
END $$;

-- Export editais table as INSERT statements
SELECT 
  'INSERT INTO editais (id, numero, titulo, descricao, data_publicacao, data_encerramento, status, valor, area, orgao, fonte, link, processado_em, criado_em, atualizado_em) VALUES (' ||
  '''' || id || ''', ' ||
  COALESCE('''' || REPLACE(numero, '''', '''''') || '''', 'NULL') || ', ' ||
  COALESCE('''' || REPLACE(titulo, '''', '''''') || '''', 'NULL') || ', ' ||
  COALESCE('''' || REPLACE(descricao, '''', '''''') || '''', 'NULL') || ', ' ||
  COALESCE('''' || data_publicacao::text || '''', 'NULL') || ', ' ||
  COALESCE('''' || data_encerramento::text || '''', 'NULL') || ', ' ||
  COALESCE('''' || REPLACE(status, '''', '''''') || '''', 'NULL') || ', ' ||
  COALESCE('''' || REPLACE(valor, '''', '''''') || '''', 'NULL') || ', ' ||
  COALESCE('''' || REPLACE(area, '''', '''''') || '''', 'NULL') || ', ' ||
  COALESCE('''' || REPLACE(orgao, '''', '''''') || '''', 'NULL') || ', ' ||
  COALESCE('''' || REPLACE(fonte, '''', '''''') || '''', 'NULL') || ', ' ||
  COALESCE('''' || REPLACE(link, '''', '''''') || '''', 'NULL') || ', ' ||
  COALESCE('''' || processado_em::text || '''', 'NULL') || ', ' ||
  COALESCE('''' || criado_em::text || '''', 'NULL') || ', ' ||
  COALESCE('''' || atualizado_em::text || '''', 'NULL') ||
  ');' AS insert_statement
FROM editais
ORDER BY criado_em;

-- Export edital_pdfs table as INSERT statements
-- Note: Run this AFTER exporting editais (due to foreign key relationship)
SELECT 
  'INSERT INTO edital_pdfs (id, edital_id, nome_arquivo, caminho_storage, url_original, tamanho_bytes, tipo_mime, criado_em) VALUES (' ||
  '''' || id || ''', ' ||
  '''' || edital_id || ''', ' ||
  COALESCE('''' || REPLACE(nome_arquivo, '''', '''''') || '''', 'NULL') || ', ' ||
  COALESCE('''' || REPLACE(caminho_storage, '''', '''''') || '''', 'NULL') || ', ' ||
  COALESCE('''' || REPLACE(url_original, '''', '''''') || '''', 'NULL') || ', ' ||
  COALESCE(tamanho_bytes::text, 'NULL') || ', ' ||
  COALESCE('''' || REPLACE(tipo_mime, '''', '''''') || '''', '''application/pdf''') || ', ' ||
  COALESCE('''' || criado_em::text || '''', 'NULL') ||
  ');' AS insert_statement
FROM edital_pdfs
ORDER BY criado_em;

-- ============================================
-- PART 2: IMPORT DATA (Run in NEW account)
-- ============================================
-- IMPORTANT: 
-- 1. Run schema.sql FIRST to create tables
-- 2. Paste the INSERT statements from PART 1 below
-- 3. Or uncomment and modify the example below

-- Step 1: Disable foreign key checks temporarily (if needed)
-- SET session_replication_role = 'replica';

-- Step 2: Import editais (paste your exported INSERT statements here)
-- Example format:
/*
INSERT INTO editais (id, numero, titulo, descricao, data_publicacao, data_encerramento, status, valor, area, orgao, fonte, link, processado_em, criado_em, atualizado_em) 
VALUES (
  '123e4567-e89b-12d3-a456-426614174000',
  '10/2025',
  'Título do Edital',
  'Descrição completa',
  '2025-01-15',
  '2025-03-15',
  'Ativo',
  'R$ 100.000,00',
  'Tecnologia',
  'FAPES',
  'sigfapes',
  'https://example.com/edital',
  '2025-01-10 10:00:00+00',
  '2025-01-10 10:00:00+00',
  '2025-01-10 10:00:00+00'
);
*/

-- Step 3: Import edital_pdfs (paste your exported INSERT statements here)
-- Make sure editais are imported first!
-- Example format:
/*
INSERT INTO edital_pdfs (id, edital_id, nome_arquivo, caminho_storage, url_original, tamanho_bytes, tipo_mime, criado_em)
VALUES (
  '223e4567-e89b-12d3-a456-426614174000',
  '123e4567-e89b-12d3-a456-426614174000',
  'edital.pdf',
  'sigfapes/10-2025/edital.pdf',
  'https://example.com/pdf',
  1024000,
  'application/pdf',
  '2025-01-10 10:00:00+00'
);
*/

-- Step 4: Re-enable foreign key checks
-- SET session_replication_role = 'origin';

-- ============================================
-- PART 3: VERIFICATION (Run after import)
-- ============================================

-- Check record counts
SELECT 
  'editais' AS table_name,
  COUNT(*) AS total_records
FROM editais
UNION ALL
SELECT 
  'edital_pdfs' AS table_name,
  COUNT(*) AS total_records
FROM edital_pdfs;

-- Check for orphaned PDFs (PDFs without edital)
SELECT 
  ep.id,
  ep.nome_arquivo,
  ep.edital_id,
  'Orphaned PDF - edital_id does not exist' AS warning
FROM edital_pdfs ep
LEFT JOIN editais e ON ep.edital_id = e.id
WHERE e.id IS NULL;

-- Check for duplicate editais (should be 0)
SELECT 
  numero,
  fonte,
  COUNT(*) AS count
FROM editais
GROUP BY numero, fonte
HAVING COUNT(*) > 1;

-- Check for duplicate PDFs (should be 0)
SELECT 
  caminho_storage,
  COUNT(*) AS count
FROM edital_pdfs
GROUP BY caminho_storage
HAVING COUNT(*) > 1;

-- Summary
SELECT 
  'Migration Summary' AS info,
  (SELECT COUNT(*) FROM editais) AS total_editais,
  (SELECT COUNT(*) FROM edital_pdfs) AS total_pdfs,
  (SELECT COUNT(*) FROM edital_pdfs ep LEFT JOIN editais e ON ep.edital_id = e.id WHERE e.id IS NULL) AS orphaned_pdfs;









