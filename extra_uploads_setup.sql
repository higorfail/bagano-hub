-- ============================================================
-- extra_uploads: permite anexar arquivo (upload real) nos Extras,
-- igual já existe em Materiais (material_uploads).
-- Execute no Supabase → SQL Editor.
-- ============================================================

CREATE TABLE IF NOT EXISTS extra_uploads (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  extra_id    UUID        REFERENCES extras(id) ON DELETE CASCADE,
  filename    TEXT        NOT NULL,
  file_url    TEXT        NOT NULL,
  file_size   BIGINT,
  mime_type   TEXT,
  uploaded_by TEXT,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE extra_uploads ENABLE ROW LEVEL SECURITY;

DO $plpg$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'extra_uploads' AND policyname = 'extra_uploads_access'
  ) THEN
    EXECUTE 'CREATE POLICY "extra_uploads_access" ON extra_uploads FOR ALL USING (true) WITH CHECK (true)';
  END IF;
END $plpg$;

-- RLS sozinha não basta — o Postgres checa GRANT de tabela antes da policy.
-- Sem isso, a feature funciona via curl (anon) mas falha silenciosamente no
-- app logado (role authenticated). Ver memória "project_supabase_grants".
GRANT SELECT, INSERT, UPDATE, DELETE ON extra_uploads TO authenticated;
