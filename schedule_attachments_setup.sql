-- ============================================================
-- schedule_attachments / schedule_uploads: mesma coisa que já existe em
-- Extras (extra_attachments/extra_uploads) e Materiais (material_attachments/
-- material_uploads), agora pro Cronograma também.
-- Execute no Supabase → SQL Editor.
-- ============================================================

CREATE TABLE IF NOT EXISTS schedule_attachments (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  schedule_id UUID        REFERENCES schedules(id) ON DELETE CASCADE,
  url         TEXT        NOT NULL,
  title       TEXT,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS schedule_uploads (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  schedule_id UUID        REFERENCES schedules(id) ON DELETE CASCADE,
  filename    TEXT        NOT NULL,
  file_url    TEXT        NOT NULL,
  file_size   BIGINT,
  mime_type   TEXT,
  uploaded_by TEXT,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE schedule_attachments ENABLE ROW LEVEL SECURITY;
ALTER TABLE schedule_uploads     ENABLE ROW LEVEL SECURITY;

DO $plpg$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'schedule_attachments' AND policyname = 'schedule_attachments_access'
  ) THEN
    EXECUTE 'CREATE POLICY "schedule_attachments_access" ON schedule_attachments FOR ALL USING (true) WITH CHECK (true)';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'schedule_uploads' AND policyname = 'schedule_uploads_access'
  ) THEN
    EXECUTE 'CREATE POLICY "schedule_uploads_access" ON schedule_uploads FOR ALL USING (true) WITH CHECK (true)';
  END IF;
END $plpg$;

-- RLS sozinha não basta — o Postgres checa GRANT de tabela antes da policy
-- (ver memória "project_supabase_grants").
GRANT SELECT, INSERT, UPDATE, DELETE ON schedule_attachments TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON schedule_uploads     TO authenticated;

-- ============================================================
-- Migração: imagens que já estavam em schedules.reference_images (sistema
-- antigo, dentro de Referências) viram registros em schedule_uploads, pra
-- não se perder nada quando a opção de imagem sair de Referências.
-- ============================================================
INSERT INTO schedule_uploads (schedule_id, filename, file_url, uploaded_by)
SELECT
  s.id,
  split_part(img, '/', array_length(string_to_array(img, '/'), 1)),
  img,
  'Migração automática'
FROM schedules s, jsonb_array_elements_text(s.reference_images) AS img
WHERE s.reference_images IS NOT NULL AND jsonb_array_length(s.reference_images) > 0;

UPDATE schedules SET reference_images = '[]'::jsonb WHERE reference_images IS NOT NULL;
