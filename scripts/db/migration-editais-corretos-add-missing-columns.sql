-- Alinha `editais_corretos` com o que o script `api:validate-editais-corretos` e o front esperam.
-- Use este ficheiro se a tabela já existia sem algumas colunas (PostgREST:
-- "Could not find the '…' column of 'editais_corretos' in the schema cache").
--
-- Executar no SQL Editor do Supabase (ou psql) uma vez.

ALTER TABLE editais_corretos ADD COLUMN IF NOT EXISTS processado_em TIMESTAMP WITH TIME ZONE;
ALTER TABLE editais_corretos ADD COLUMN IF NOT EXISTS criado_em TIMESTAMP WITH TIME ZONE;
ALTER TABLE editais_corretos ADD COLUMN IF NOT EXISTS atualizado_em TIMESTAMP WITH TIME ZONE;

ALTER TABLE editais_corretos ADD COLUMN IF NOT EXISTS origem_informacoes_processadas_em TIMESTAMP WITH TIME ZONE;
ALTER TABLE editais_corretos ADD COLUMN IF NOT EXISTS validado_em TIMESTAMP WITH TIME ZONE DEFAULT NOW();
ALTER TABLE editais_corretos ADD COLUMN IF NOT EXISTS validation_report JSONB;
