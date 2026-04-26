-- Leitura pública de `editais_corretos` via PostgREST (VITE_SUPABASE_ANON_KEY = role `anon`).
--
-- Se o SQL Editor do Supabase mostra linhas em `editais_corretos` mas o app no navegador
-- recebe 0 itens (fonte vazia), quase sempre é RLS: a tabela está com RLS ativo e não há
-- policy de SELECT para `anon` (e/ou `authenticated`).
--
-- Execute este script no mesmo projeto das variáveis VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY.

ALTER TABLE public.editais_corretos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "editais_corretos_select_public" ON public.editais_corretos;

CREATE POLICY "editais_corretos_select_public"
  ON public.editais_corretos
  FOR SELECT
  TO anon, authenticated
  USING (true);

COMMENT ON POLICY "editais_corretos_select_public" ON public.editais_corretos IS
  'Leitura do catálogo validado para o front (chave anônima e sessão).';
