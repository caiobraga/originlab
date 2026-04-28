-- Audit table for AI-generated "redações" (field texts) inside proposals.
-- Used by /admin to acompanhar redações criadas e seus status.

CREATE TABLE IF NOT EXISTS public.redacoes_ai (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  proposta_id UUID REFERENCES public.propostas(id) ON DELETE SET NULL,
  edital_id UUID REFERENCES public.editais(id) ON DELETE SET NULL,
  field_id TEXT,
  field_name TEXT NOT NULL,
  field_description TEXT,
  prompt TEXT,
  generated_text TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'gerada' CHECK (status IN ('gerada', 'revisao', 'aprovada', 'rejeitada')),
  model TEXT,
  provider TEXT, -- ex.: 'ollama', 'n8n'
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_redacoes_ai_user_id_created_at ON public.redacoes_ai(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_redacoes_ai_proposta_id_created_at ON public.redacoes_ai(proposta_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_redacoes_ai_status_created_at ON public.redacoes_ai(status, created_at DESC);

COMMENT ON TABLE public.redacoes_ai IS 'Log/auditoria das redações geradas por IA por campo de proposta.';

-- updated_at trigger
CREATE OR REPLACE FUNCTION public.update_redacoes_ai_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_update_redacoes_ai_updated_at ON public.redacoes_ai;
CREATE TRIGGER trigger_update_redacoes_ai_updated_at
  BEFORE UPDATE ON public.redacoes_ai
  FOR EACH ROW
  EXECUTE FUNCTION public.update_redacoes_ai_updated_at();

-- RLS
ALTER TABLE public.redacoes_ai ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own redacoes_ai" ON public.redacoes_ai;
CREATE POLICY "Users can view own redacoes_ai"
  ON public.redacoes_ai
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert own redacoes_ai" ON public.redacoes_ai;
CREATE POLICY "Users can insert own redacoes_ai"
  ON public.redacoes_ai
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Admins can view all redacoes_ai" ON public.redacoes_ai;
CREATE POLICY "Admins can view all redacoes_ai"
  ON public.redacoes_ai
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.profiles p
      WHERE p.user_id = auth.uid()
        AND p.is_admin = TRUE
    )
  );

DROP POLICY IF EXISTS "Admins can update redacoes_ai status" ON public.redacoes_ai;
CREATE POLICY "Admins can update redacoes_ai status"
  ON public.redacoes_ai
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.profiles p
      WHERE p.user_id = auth.uid()
        AND p.is_admin = TRUE
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.profiles p
      WHERE p.user_id = auth.uid()
        AND p.is_admin = TRUE
    )
  );

