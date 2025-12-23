-- Script para remover anexos que foram salvos como editais separados
-- Anexos não são editais, são parte de outros editais

-- Remover editais que são anexos
DELETE FROM editais
WHERE LOWER(titulo) LIKE 'anexo%'
   OR LOWER(titulo) LIKE '%anexo i%'
   OR LOWER(titulo) LIKE '%anexo ii%'
   OR LOWER(titulo) LIKE '%anexo iii%'
   OR LOWER(titulo) LIKE '%anexo iv%'
   OR LOWER(titulo) LIKE '%anexo v%'
   OR LOWER(titulo) LIKE '%anexo vi%'
   OR LOWER(titulo) LIKE '%anexo vii%'
   OR LOWER(titulo) LIKE '%anexo viii%'
   OR LOWER(titulo) LIKE '%anexo ix%'
   OR LOWER(titulo) LIKE '%anexo x%'
   OR (LOWER(titulo) LIKE '%formulário%' AND LOWER(titulo) LIKE '%anexo%')
   OR (LOWER(titulo) LIKE '%formulario%' AND LOWER(titulo) LIKE '%anexo%');

-- Ver quantos foram removidos
-- SELECT COUNT(*) FROM editais WHERE LOWER(titulo) LIKE 'anexo%';













