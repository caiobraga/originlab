-- ============================================
-- IMPORT DATA FROM CSV FILES
-- ============================================
-- Alternative method: Import from CSV files
-- 
-- Steps:
-- 1. Export data using export-csv.sql (or use Supabase Dashboard → Table → Export CSV)
-- 2. Download the CSV files
-- 3. Upload CSV files to Supabase Storage (create a temporary bucket or use local files)
-- 4. Run this script, adjusting file paths as needed

-- ============================================
-- Method 1: Import from Supabase Storage
-- ============================================
-- First, upload your CSV files to a Supabase Storage bucket
-- Then use COPY FROM with storage path

-- Import editais from CSV in storage
-- COPY editais (id, numero, titulo, descricao, data_publicacao, data_encerramento, status, valor, area, orgao, fonte, link, processado_em, criado_em, atualizado_em)
-- FROM 's3://your-bucket/editais.csv'
-- WITH (FORMAT csv, HEADER true);

-- Import edital_pdfs from CSV in storage
-- COPY edital_pdfs (id, edital_id, nome_arquivo, caminho_storage, url_original, tamanho_bytes, tipo_mime, criado_em)
-- FROM 's3://your-bucket/edital_pdfs.csv'
-- WITH (FORMAT csv, HEADER true);

-- ============================================
-- Method 2: Import using Supabase Dashboard
-- ============================================
-- 1. Go to Supabase Dashboard → Table Editor
-- 2. Select the table (editais or edital_pdfs)
-- 3. Click "Insert" → "Import data from CSV"
-- 4. Upload your CSV file
-- 5. Map columns correctly
-- 6. Import

-- ============================================
-- Method 3: Import via psql (if you have direct access)
-- ============================================
-- If you have psql access to your database:

-- \COPY editais FROM '/path/to/editais.csv' WITH (FORMAT csv, HEADER true);
-- \COPY edital_pdfs FROM '/path/to/edital_pdfs.csv' WITH (FORMAT csv, HEADER true);

-- ============================================
-- Verify imports
-- ============================================
SELECT 
  'editais' AS table_name,
  COUNT(*) AS total_records
FROM editais
UNION ALL
SELECT 
  'edital_pdfs' AS table_name,
  COUNT(*) AS total_records
FROM edital_pdfs;



















