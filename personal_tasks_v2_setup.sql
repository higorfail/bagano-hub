-- ============================================================
-- personal_tasks ganha: etiquetas, prioridade, resumo de IA e anexos/arquivos
-- (mesmo padrão de Cronograma/Extras/Materiais). Execute depois de
-- personal_tasks_setup.sql, no Supabase → SQL Editor.
-- ============================================================

ALTER TABLE personal_tasks ADD COLUMN IF NOT EXISTS labels JSONB DEFAULT '[]'::jsonb;
ALTER TABLE personal_tasks ADD COLUMN IF NOT EXISTS priority TEXT DEFAULT 'normal';
ALTER TABLE personal_tasks ADD COLUMN IF NOT EXISTS ai_summary TEXT;

CREATE TABLE IF NOT EXISTS personal_task_uploads (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id    UUID        NOT NULL REFERENCES personal_tasks(id) ON DELETE CASCADE,
  filename   TEXT,
  file_url   TEXT        NOT NULL,
  file_size  BIGINT,
  mime_type  TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS personal_task_attachments (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id    UUID        NOT NULL REFERENCES personal_tasks(id) ON DELETE CASCADE,
  url        TEXT        NOT NULL,
  title      TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE personal_task_uploads ENABLE ROW LEVEL SECURITY;
ALTER TABLE personal_task_attachments ENABLE ROW LEVEL SECURITY;

DO $plpg$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'personal_task_uploads' AND policyname = 'personal_task_uploads_access') THEN
    EXECUTE 'CREATE POLICY "personal_task_uploads_access" ON personal_task_uploads FOR ALL USING (true) WITH CHECK (true)';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'personal_task_attachments' AND policyname = 'personal_task_attachments_access') THEN
    EXECUTE 'CREATE POLICY "personal_task_attachments_access" ON personal_task_attachments FOR ALL USING (true) WITH CHECK (true)';
  END IF;
END $plpg$;

GRANT SELECT, INSERT, UPDATE, DELETE ON personal_task_uploads TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON personal_task_attachments TO authenticated;
