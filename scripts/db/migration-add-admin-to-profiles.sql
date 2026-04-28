-- Admin flags for profiles
-- Adds minimal columns to support an admin area controlled via profiles.is_admin.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS is_admin BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS is_blocked BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN public.profiles.is_admin IS 'Se true, usuário pode acessar /admin e APIs administrativas.';
COMMENT ON COLUMN public.profiles.is_blocked IS 'Se true, usuário pode ser bloqueado no app (controle via front/back).';

-- Optional: allow admins to read profiles (used by /api/admin to render user list if needed).
-- IMPORTANT:
-- Não use subquery em public.profiles dentro de uma policy de public.profiles, pois isso pode
-- causar recursão infinita de RLS e virar erro 500 no PostgREST (ex.: SELECT do próprio perfil falha).
-- Para evitar isso, usamos uma função SECURITY DEFINER para checar is_admin.
DROP POLICY IF EXISTS "Admins can view all profiles" ON public.profiles;

CREATE OR REPLACE FUNCTION public.request_is_admin()
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE((
    SELECT p.is_admin
    FROM public.profiles p
    WHERE p.user_id = auth.uid()
    LIMIT 1
  ), FALSE);
$$;

REVOKE ALL ON FUNCTION public.request_is_admin() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.request_is_admin() TO authenticated;

CREATE POLICY "Admins can view all profiles"
  ON public.profiles
  FOR SELECT
  TO authenticated
  USING (public.request_is_admin());

