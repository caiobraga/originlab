-- Cache de dados de CNPJ da ReceitaWS/BrasilAPI para evitar requisições repetidas
CREATE TABLE IF NOT EXISTS cnpj_cache (
  cnpj VARCHAR(14) PRIMARY KEY,
  data JSONB NOT NULL,
  criado_em TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_cnpj_cache_criado_em ON cnpj_cache(criado_em);
COMMENT ON TABLE cnpj_cache IS 'Cache de consultas à ReceitaWS/BrasilAPI por CNPJ';
