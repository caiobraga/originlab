    -- Script de migração para garantir que todas as colunas existam
    -- Execute este script se receber erros de coluna não encontrada

    -- Adicionar coluna status se não existir
    DO $$ 
    BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'editais' AND column_name = 'status'
    ) THEN
        ALTER TABLE editais ADD COLUMN status TEXT;
        RAISE NOTICE 'Coluna status adicionada à tabela editais';
    END IF;
    END $$;

    -- Adicionar outras colunas que possam estar faltando
    DO $$ 
    BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'editais' AND column_name = 'valor'
    ) THEN
        ALTER TABLE editais ADD COLUMN valor TEXT;
    END IF;
    END $$;

    DO $$ 
    BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'editais' AND column_name = 'area'
    ) THEN
        ALTER TABLE editais ADD COLUMN area TEXT;
    END IF;
    END $$;

    DO $$ 
    BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'editais' AND column_name = 'orgao'
    ) THEN
        ALTER TABLE editais ADD COLUMN orgao TEXT;
    END IF;
    END $$;

    DO $$ 
    BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'editais' AND column_name = 'descricao'
    ) THEN
        ALTER TABLE editais ADD COLUMN descricao TEXT;
    END IF;
    END $$;

    DO $$ 
    BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'editais' AND column_name = 'data_publicacao'
    ) THEN
        ALTER TABLE editais ADD COLUMN data_publicacao DATE;
    END IF;
    END $$;

    DO $$ 
    BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'editais' AND column_name = 'data_encerramento'
    ) THEN
        ALTER TABLE editais ADD COLUMN data_encerramento DATE;
    END IF;
    END $$;

    -- Criar índices se não existirem
    CREATE INDEX IF NOT EXISTS idx_editais_status ON editais(status);
    CREATE INDEX IF NOT EXISTS idx_editais_fonte ON editais(fonte);
    CREATE INDEX IF NOT EXISTS idx_editais_data_encerramento ON editais(data_encerramento);
    CREATE INDEX IF NOT EXISTS idx_editais_criado_em ON editais(criado_em);

    -- Adicionar constraint único se não existir
    DO $$ 
    BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint 
        WHERE conname = 'unique_edital_fonte'
    ) THEN
        ALTER TABLE editais ADD CONSTRAINT unique_edital_fonte UNIQUE (numero, fonte);
    END IF;
    END $$;




















