-- Indicações (recomendações) de editais por usuário (heurística, sem IA)
-- Objetivo: permitir que o dashboard mostre "Indicações para você" com base
-- em sinais simples (tipo de usuário, CNPJ, área e prazo), com cache no banco.

CREATE TABLE IF NOT EXISTS public.edital_indicacoes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  edital_id UUID NOT NULL REFERENCES public.editais(id) ON DELETE CASCADE,
  score INTEGER NOT NULL CHECK (score >= 0 AND score <= 100),
  motivos TEXT[] NOT NULL DEFAULT '{}',
  gerado_em TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  atualizado_em TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  CONSTRAINT unique_edital_indicacoes_user_edital UNIQUE (user_id, edital_id)
);

CREATE INDEX IF NOT EXISTS idx_edital_indicacoes_user_id ON public.edital_indicacoes(user_id);
CREATE INDEX IF NOT EXISTS idx_edital_indicacoes_edital_id ON public.edital_indicacoes(edital_id);
CREATE INDEX IF NOT EXISTS idx_edital_indicacoes_score ON public.edital_indicacoes(user_id, score DESC);
CREATE INDEX IF NOT EXISTS idx_edital_indicacoes_gerado_em ON public.edital_indicacoes(user_id, gerado_em DESC);

COMMENT ON TABLE public.edital_indicacoes IS 'Indicações de editais por usuário (heurística simples, cacheada).';
COMMENT ON COLUMN public.edital_indicacoes.score IS 'Score 0-100 (heurística determinística).';
COMMENT ON COLUMN public.edital_indicacoes.motivos IS 'Motivos curtos (strings) explicando o score.';

-- updated_at trigger
CREATE OR REPLACE FUNCTION public.update_edital_indicacoes_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.atualizado_em = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_update_edital_indicacoes_updated_at ON public.edital_indicacoes;
CREATE TRIGGER trigger_update_edital_indicacoes_updated_at
  BEFORE UPDATE ON public.edital_indicacoes
  FOR EACH ROW
  EXECUTE FUNCTION public.update_edital_indicacoes_updated_at();

-- RLS: cada usuário só lê suas próprias indicações
ALTER TABLE public.edital_indicacoes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own edital_indicacoes" ON public.edital_indicacoes;
CREATE POLICY "Users can view own edital_indicacoes"
  ON public.edital_indicacoes
  FOR SELECT
  USING (auth.uid() = user_id);

-- Ninguém insere/atualiza diretamente pelo client; a RPC SECURITY DEFINER faz isso.
DROP POLICY IF EXISTS "Users cannot mutate edital_indicacoes" ON public.edital_indicacoes;
CREATE POLICY "Users cannot mutate edital_indicacoes"
  ON public.edital_indicacoes
  FOR ALL
  USING (false)
  WITH CHECK (false);

-- RPC: recalcula as indicações do próprio usuário (cache)
-- Heurística:
-- - sinal por tipo (pesquisador/empresa)
-- - match por área (profiles.area) contra editais.area/descricao
-- - prazo próximo (data_encerramento em até 30 dias)
-- - status "aberta" / "aberto"
CREATE OR REPLACE FUNCTION public.refresh_my_indicacoes(p_limit INTEGER DEFAULT 20)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID;
  v_user_type TEXT;
  v_has_cnpj BOOLEAN;
  v_area TEXT;
  v_sexo TEXT;
  v_curriculum JSONB;
  v_pode_participar_editais BOOLEAN;
  v_possui_doutorado BOOLEAN;
  v_possui_mestrado BOOLEAN;
  v_possui_graduacao BOOLEAN;
  v_anos_experiencia INTEGER;
  v_count INTEGER;
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT p.user_type, COALESCE(p.has_cnpj, false), p.area, p.sexo, p.curriculum_data
    INTO v_user_type, v_has_cnpj, v_area, v_sexo, v_curriculum
  FROM public.profiles p
  WHERE p.user_id = v_uid;

  -- Defaults seguros (quando o profile não existe ou tem valores vazios)
  v_user_type := COALESCE(NULLIF(TRIM(v_user_type), ''), 'pesquisador');
  v_has_cnpj := COALESCE(v_has_cnpj, false);
  v_area := NULLIF(TRIM(v_area), '');
  v_sexo := NULLIF(TRIM(v_sexo), '');
  v_curriculum := COALESCE(v_curriculum, '{}'::JSONB);

  -- Extrair elegibilidade e formação do curriculum_data (JSONB) com defaults seguros
  v_pode_participar_editais :=
    CASE LOWER(COALESCE(v_curriculum->'elegibilidade'->>'podeParticiparEditais', ''))
      WHEN 'true' THEN TRUE
      WHEN 'false' THEN FALSE
      ELSE NULL
    END;
  v_possui_doutorado :=
    CASE LOWER(COALESCE(v_curriculum->'elegibilidade'->>'possuiDoutorado', 'false'))
      WHEN 'true' THEN TRUE
      ELSE FALSE
    END;
  v_possui_mestrado :=
    CASE LOWER(COALESCE(v_curriculum->'elegibilidade'->>'possuiMestrado', 'false'))
      WHEN 'true' THEN TRUE
      ELSE FALSE
    END;
  v_possui_graduacao :=
    CASE LOWER(COALESCE(v_curriculum->'elegibilidade'->>'possuiGraduacao', 'false'))
      WHEN 'true' THEN TRUE
      ELSE FALSE
    END;

  v_anos_experiencia :=
    NULLIF(REGEXP_REPLACE(COALESCE(v_curriculum->'elegibilidade'->>'anosExperiencia', ''), '[^0-9]', '', 'g'), '')::INTEGER;

  -- Limpar cache antigo (mantém simples e determinístico)
  DELETE FROM public.edital_indicacoes WHERE user_id = v_uid;

  -- Mapear "area" do onboarding (tech/health/...) para termos (substring match simples)
  -- Mantém heurística leve (sem IA) e melhora o recall do match.
  WITH base AS (
    SELECT
      e.id AS edital_id,
      e.titulo,
      e.descricao,
      e.area,
      e.sobre_programa,
      e.criterios_elegibilidade,
      e.status,
      e.data_encerramento,
      e.prazo_inscricao,
      e.timeline_estimada,
      e.valor_projeto,
      e.valor,
      e.is_researcher,
      e.is_company,
      -- Texto de elegibilidade: prioriza criterios_elegibilidade, com fallback para sobre_programa + descricao
      LOWER(
        CASE
          WHEN COALESCE(NULLIF(TRIM(e.criterios_elegibilidade), ''), '') <> '' THEN e.criterios_elegibilidade
          ELSE COALESCE(e.sobre_programa, '') || ' ' || COALESCE(e.descricao, '')
        END
      ) AS elig_text,
      LOWER(
        COALESCE(e.titulo, '') || ' ' ||
        COALESCE(e.descricao, '') || ' ' ||
        COALESCE(e.sobre_programa, '') || ' ' ||
        COALESCE(e.criterios_elegibilidade, '')
      ) AS edital_text
    FROM public.editais_corretos e
    -- Regras de exclusão (hard filters):
    -- 1) NÃO indicar edital sem timeline estimada útil (se vazio/nulo, sai fora).
    -- 2) NÃO indicar edital sem valor de projeto (usa valor_projeto como primário; fallback para valor).
    -- 3) NÃO indicar edital sem prazo inferível (mantém o filtro anterior).
    WHERE
      -- (1) timeline estimada precisa existir e conter pelo menos 1 data ISO (YYYY-MM-DD)
      e.timeline_estimada IS NOT NULL
      AND e.timeline_estimada::text ~ '\d{4}-\d{2}-\d{2}'
      -- (2) valor precisa existir em pelo menos um dos campos
      AND (
        (e.valor_projeto IS NOT NULL AND NULLIF(TRIM(e.valor_projeto), '') IS NOT NULL AND e.valor_projeto <> 'Não informado')
        OR (e.valor IS NOT NULL AND NULLIF(TRIM(e.valor), '') IS NOT NULL AND e.valor <> 'Não informado')
      )
      -- (3) prazo inferível (deadline) precisa existir em alguma fonte
      AND (
        e.data_encerramento IS NOT NULL
        OR (
          e.prazo_inscricao IS NOT NULL
          AND NULLIF(TRIM(e.prazo_inscricao), '') IS NOT NULL
          AND e.prazo_inscricao <> 'Não informado'
          AND (
            e.prazo_inscricao ~ '\d{4}-\d{2}-\d{2}'
            OR e.prazo_inscricao ~ '\d{1,2}[\/\-.]\d{1,2}[\/\-.]\d{4}'
            OR e.prazo_inscricao ~ '\d{1,2}\s+de\s+[[:alpha:]]+\s+de\s+\d{4}'
          )
        )
        OR (
          e.timeline_estimada IS NOT NULL
          AND e.timeline_estimada::text ~ '\d{4}-\d{2}-\d{2}'
        )
      )
  ),
  area_terms AS (
    SELECT
      CASE COALESCE(v_area, '')
        WHEN 'tech' THEN ARRAY['tecnologia','tecnologico','inovacao','software','digital','ti','ia','dados','cloud','startup']::TEXT[]
        WHEN 'health' THEN ARRAY['saude','health','medicina','biotecnologia','farmacia','clinica','hospital','sus']::TEXT[]
        WHEN 'agro' THEN ARRAY['agro','agronegocio','agricultura','rural','agricola','alimento','pecuaria']::TEXT[]
        WHEN 'energy' THEN ARRAY['energia','energetico','sustentavel','renovavel','clima','hidrogenio','solar','eolica']::TEXT[]
        WHEN 'bio' THEN ARRAY['bio','biotecnologia','biologia','genetica','biomassa']::TEXT[]
        WHEN 'other' THEN ARRAY[]::TEXT[]
        ELSE ARRAY[]::TEXT[]
      END AS terms
  ),
  scored AS (
    SELECT
      b.edital_id,
      LEAST(
        100,
        GREATEST(
          0,
          -- tipo de usuário
          (CASE
            WHEN b.is_researcher IS TRUE AND (v_user_type = 'pesquisador' OR v_user_type = 'ambos') THEN 40
            WHEN b.is_researcher IS TRUE THEN 5
            ELSE 10
          END)
          +
          (CASE
            WHEN b.is_company IS TRUE AND v_has_cnpj IS TRUE THEN 40
            WHEN b.is_company IS TRUE THEN 5
            ELSE 10
          END)
          +
          -- área (match simples por termos)
          (CASE
            WHEN v_area IS NULL THEN 0
            WHEN v_area = 'other' THEN 0
            WHEN EXISTS (
              SELECT 1
              FROM area_terms at, unnest(at.terms) t(term)
              WHERE LOWER(COALESCE(b.area, '') || ' ' || COALESCE(b.descricao, '')) LIKE '%' || LOWER(t.term) || '%'
            ) THEN 15
            ELSE 0
          END)
          +
          -- prazo próximo
          (CASE
            WHEN b.data_encerramento IS NOT NULL
                 AND b.data_encerramento >= CURRENT_DATE
                 AND b.data_encerramento <= (CURRENT_DATE + INTERVAL '30 days') THEN 10
            ELSE 0
          END)
          +
          -- status aberto
          (CASE
            WHEN b.status IS NOT NULL
             AND LOWER(b.status) LIKE '%abert%'
             AND (
               -- Evidência real de "aberto": há um deadline conhecido (ou inferível) ainda no futuro.
               (b.data_encerramento IS NOT NULL AND b.data_encerramento >= CURRENT_DATE)
               OR (
                 b.prazo_inscricao IS NOT NULL
                 AND NULLIF(TRIM(b.prazo_inscricao), '') IS NOT NULL
                 AND b.prazo_inscricao <> 'Não informado'
                 AND (
                   b.prazo_inscricao ~ '\d{4}-\d{2}-\d{2}'
                   OR b.prazo_inscricao ~ '\d{1,2}[\/\-.]\d{1,2}[\/\-.]\d{4}'
                   OR b.prazo_inscricao ~ '\d{1,2}\s+de\s+[[:alpha:]]+\s+de\s+\d{4}'
                 )
               )
               OR (
                 b.timeline_estimada IS NOT NULL
                 AND b.timeline_estimada::text ~ '\d{4}-\d{2}-\d{2}'
               )
             )
              THEN 5
            ELSE 0
          END)
          +
          -- sexo/gênero: evitar recomendações incompatíveis (ex.: programas exclusivos para mulheres)
          -- Usa um texto mais amplo (inclui sobre_programa e criterios_elegibilidade).
          (CASE
            WHEN v_sexo = 'masculino'
              AND (
                b.edital_text LIKE '%mulher%'
                OR b.edital_text LIKE '%femin%'
                OR b.edital_text LIKE '%empreendedora%'
              )
              THEN -200  -- zera (clamp em 0) e impede de entrar no cutoff
            WHEN v_sexo = 'feminino'
              AND b.edital_text LIKE '%homens%'
              THEN -200
            ELSE 0
          END)
          +
          -- currículo/elegibilidade: reduzir falsos positivos e priorizar perfis mais fortes
          (CASE
            WHEN v_pode_participar_editais IS FALSE THEN -60
            ELSE 0
          END)
          +
          -- bônus por titulação (independente do edital; simples e determinístico)
          (CASE WHEN v_possui_doutorado IS TRUE THEN 12 ELSE 0 END)
          +
          (CASE WHEN v_possui_mestrado IS TRUE THEN 8 ELSE 0 END)
          +
          -- graduação: bônus só quando o edital menciona exigência/critério de formação superior
          (CASE
            WHEN v_possui_graduacao IS TRUE
             AND (
               b.elig_text LIKE '%graduac%'
               OR b.elig_text LIKE '%nivel superior%'
               OR b.elig_text LIKE '%nível superior%'
               OR b.elig_text LIKE '%formacao%'
               OR b.elig_text LIKE '%formação%'
               OR b.elig_text LIKE '%diploma%'
               OR b.elig_text LIKE '%bacharel%'
               OR b.elig_text LIKE '%licenci%'
             )
              THEN 4
            ELSE 0
          END)
          +
          -- requisitos do edital vs formação (texto)
          (CASE
            WHEN (b.edital_text LIKE '%doutor%' OR b.edital_text LIKE '%phd%')
                 AND v_possui_doutorado IS NOT TRUE THEN -15
            ELSE 0
          END)
          +
          (CASE
            WHEN b.edital_text LIKE '%mestrad%'
                 AND (v_possui_mestrado IS NOT TRUE AND v_possui_doutorado IS NOT TRUE) THEN -10
            ELSE 0
          END)
          +
          (CASE
            WHEN b.edital_text LIKE '%graduac%'
                 AND (v_possui_graduacao IS NOT TRUE AND v_possui_mestrado IS NOT TRUE AND v_possui_doutorado IS NOT TRUE) THEN -20
            ELSE 0
          END)
          +
          -- experiência (opcional): se baixo e edital parece exigir experiência
          (CASE
            WHEN v_anos_experiencia IS NOT NULL AND v_anos_experiencia < 2
                 AND (b.edital_text LIKE '%experi%' OR b.edital_text LIKE '%minimo%' OR b.edital_text LIKE '%mínimo%') THEN -5
            ELSE 0
          END)
        )
      )::INTEGER AS score,
      (
        SELECT COALESCE(ARRAY_AGG(DISTINCT m), '{}'::TEXT[])
        FROM UNNEST(ARRAY[
          CASE
            WHEN b.is_researcher IS TRUE AND (v_user_type = 'pesquisador' OR v_user_type = 'ambos') THEN 'Direcionado para pesquisadores'
            WHEN b.is_researcher IS TRUE THEN 'Pode exigir perfil de pesquisador'
            ELSE NULL
          END,
          CASE
            WHEN b.is_company IS TRUE AND v_has_cnpj IS TRUE THEN 'Direcionado para empresas (você tem CNPJ)'
            WHEN b.is_company IS TRUE THEN 'Pode exigir empresa/CNPJ'
            ELSE NULL
          END,
          CASE
            WHEN v_area IS NOT NULL AND v_area <> 'other' AND EXISTS (
              SELECT 1
              FROM area_terms at, unnest(at.terms) t(term)
              WHERE LOWER(COALESCE(b.area, '') || ' ' || COALESCE(b.descricao, '')) LIKE '%' || LOWER(t.term) || '%'
            ) THEN 'Alinhado com sua área'
            ELSE NULL
          END,
          CASE
            WHEN b.data_encerramento IS NOT NULL
                 AND b.data_encerramento >= CURRENT_DATE
                 AND b.data_encerramento <= (CURRENT_DATE + INTERVAL '30 days') THEN 'Prazo próximo'
            ELSE NULL
          END,
          CASE
            WHEN b.status IS NOT NULL
             AND LOWER(b.status) LIKE '%abert%'
             AND (
               (b.data_encerramento IS NOT NULL AND b.data_encerramento >= CURRENT_DATE)
               OR (
                 b.prazo_inscricao IS NOT NULL
                 AND NULLIF(TRIM(b.prazo_inscricao), '') IS NOT NULL
                 AND b.prazo_inscricao <> 'Não informado'
                 AND (
                   b.prazo_inscricao ~ '\d{4}-\d{2}-\d{2}'
                   OR b.prazo_inscricao ~ '\d{1,2}[\/\-.]\d{1,2}[\/\-.]\d{4}'
                   OR b.prazo_inscricao ~ '\d{1,2}\s+de\s+[[:alpha:]]+\s+de\s+\d{4}'
                 )
               )
               OR (
                 b.timeline_estimada IS NOT NULL
                 AND b.timeline_estimada::text ~ '\d{4}-\d{2}-\d{2}'
               )
             )
              THEN 'Inscrições abertas'
            ELSE NULL
          END,
          CASE
            WHEN v_sexo = 'masculino' AND (b.edital_text LIKE '%mulher%' OR b.edital_text LIKE '%femin%' OR b.edital_text LIKE '%empreendedora%')
              THEN 'Incompatível com seu perfil (foco em mulheres)'
            WHEN v_sexo = 'feminino' AND b.edital_text LIKE '%homens%'
              THEN 'Incompatível com seu perfil (foco em homens)'
            ELSE NULL
          END,
          CASE
            WHEN v_pode_participar_editais IS FALSE THEN 'Possível inelegibilidade pelo currículo'
            ELSE NULL
          END,
          CASE WHEN v_possui_doutorado IS TRUE THEN 'Perfil com doutorado' ELSE NULL END,
          CASE WHEN v_possui_mestrado IS TRUE THEN 'Perfil com mestrado' ELSE NULL END,
          CASE
            WHEN v_possui_graduacao IS TRUE
             AND (
               b.elig_text LIKE '%graduac%'
               OR b.elig_text LIKE '%nivel superior%'
               OR b.elig_text LIKE '%nível superior%'
               OR b.elig_text LIKE '%formacao%'
               OR b.elig_text LIKE '%formação%'
               OR b.elig_text LIKE '%diploma%'
               OR b.elig_text LIKE '%bacharel%'
               OR b.elig_text LIKE '%licenci%'
             )
              THEN 'Perfil com graduação'
            ELSE NULL
          END,
          CASE
            WHEN (b.edital_text LIKE '%doutor%' OR b.edital_text LIKE '%phd%')
                 AND v_possui_doutorado IS NOT TRUE THEN 'Edital pode exigir doutorado'
            ELSE NULL
          END,
          CASE
            WHEN b.edital_text LIKE '%mestrad%'
                 AND (v_possui_mestrado IS NOT TRUE AND v_possui_doutorado IS NOT TRUE) THEN 'Edital pode exigir mestrado'
            ELSE NULL
          END,
          CASE
            WHEN b.edital_text LIKE '%graduac%'
                 AND (v_possui_graduacao IS NOT TRUE AND v_possui_mestrado IS NOT TRUE AND v_possui_doutorado IS NOT TRUE) THEN 'Edital pode exigir formação acadêmica'
            ELSE NULL
          END,
          CASE
            WHEN v_anos_experiencia IS NOT NULL AND v_anos_experiencia < 2
                 AND (b.edital_text LIKE '%experi%' OR b.edital_text LIKE '%minimo%' OR b.edital_text LIKE '%mínimo%') THEN 'Edital pode exigir experiência'
            ELSE NULL
          END
        ]::TEXT[]) AS m
        WHERE m IS NOT NULL AND m <> ''
      ) AS motivos,
      b.data_encerramento
    FROM base b
  ),
  picked AS (
    SELECT *
    FROM scored
    ORDER BY score DESC, data_encerramento ASC NULLS LAST, edital_id
    LIMIT GREATEST(1, LEAST(200, COALESCE(p_limit, 20)))
  )
  INSERT INTO public.edital_indicacoes (user_id, edital_id, score, motivos)
  SELECT v_uid, p.edital_id, p.score, COALESCE(p.motivos, '{}'::TEXT[])
  FROM picked p
  WHERE p.score >= 10
  ON CONFLICT (user_id, edital_id)
  DO UPDATE SET
    score = EXCLUDED.score,
    motivos = EXCLUDED.motivos,
    gerado_em = NOW();

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

GRANT EXECUTE ON FUNCTION public.refresh_my_indicacoes(INTEGER) TO authenticated;

