-- ============================================
-- EXPORT DATA AS CSV (Alternative Method)
-- ============================================
-- Run these commands in psql or Supabase SQL Editor
-- Then import using import-csv.sql

-- Export editais to CSV format
COPY (
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
  ORDER BY criado_em
) TO STDOUT WITH CSV HEADER;

-- Export edital_pdfs to CSV format
COPY (
  SELECT 
    id,
    edital_id,
    nome_arquivo,
    caminho_storage,
    url_original,
    tamanho_bytes,
    tipo_mime,
    criado_em
  FROM edital_pdfs
  ORDER BY criado_em
) TO STDOUT WITH CSV HEADER;










