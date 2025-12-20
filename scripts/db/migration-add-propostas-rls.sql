-- Migration para adicionar Row Level Security (RLS) à tabela propostas
-- Execute este script se a tabela propostas já existir mas as políticas RLS não estiverem configuradas

-- Habilitar Row Level Security (RLS)
ALTER TABLE propostas ENABLE ROW LEVEL SECURITY;

-- Remover políticas existentes (se houver) para evitar conflitos
DROP POLICY IF EXISTS "Users can view their own propostas" ON propostas;
DROP POLICY IF EXISTS "Users can create their own propostas" ON propostas;
DROP POLICY IF EXISTS "Users can update their own propostas" ON propostas;
DROP POLICY IF EXISTS "Users can delete their own propostas" ON propostas;

-- Política: Usuários podem ver apenas suas próprias propostas
CREATE POLICY "Users can view their own propostas"
  ON propostas
  FOR SELECT
  USING (auth.uid() = user_id);

-- Política: Usuários podem criar suas próprias propostas
CREATE POLICY "Users can create their own propostas"
  ON propostas
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Política: Usuários podem atualizar suas próprias propostas
CREATE POLICY "Users can update their own propostas"
  ON propostas
  FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Política: Usuários podem deletar suas próprias propostas
CREATE POLICY "Users can delete their own propostas"
  ON propostas
  FOR DELETE
  USING (auth.uid() = user_id);

