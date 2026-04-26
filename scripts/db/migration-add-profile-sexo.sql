-- Campo de sexo/gênero no perfil (heurísticas de indicação)
-- Mantém simples e opcional (não bloqueia cadastro).

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS sexo TEXT;

-- Valores aceitos (opcional, mas ajuda a manter consistência)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'profiles_sexo_check'
  ) THEN
    ALTER TABLE public.profiles
      ADD CONSTRAINT profiles_sexo_check
      CHECK (sexo IS NULL OR sexo IN ('masculino', 'feminino', 'outro', 'nao_informar'));
  END IF;
END;
$$;

COMMENT ON COLUMN public.profiles.sexo IS 'Sexo/gênero (masculino, feminino, outro, nao_informar) — usado apenas para heurísticas e recomendações.';

