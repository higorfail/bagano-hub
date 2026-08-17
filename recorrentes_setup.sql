-- ============================================================
-- Recorrentes: conteúdo que se repete na rotina do cliente (story de "aberto
-- hoje", post do almoço executivo). Execute no Supabase → SQL Editor.
-- ============================================================

CREATE TABLE IF NOT EXISTS recurrings (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id        UUID        NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  title            TEXT        NOT NULL,
  type             TEXT        NOT NULL DEFAULT 'story',   -- 'story' | 'post'
  notes            TEXT,
  drive_folder_url TEXT,                                    -- pasta com as artes
  caption          TEXT,                                    -- legenda padrão
  recurrence_mode  TEXT        NOT NULL DEFAULT 'daily',    -- daily | weekdays | monthdays | dates
  weekdays         SMALLINT[]  DEFAULT '{}',                -- 0=dom … 6=sáb
  month_days       SMALLINT[]  DEFAULT '{}',                -- 1..31
  specific_dates   DATE[]      DEFAULT '{}',
  times            TEXT[]      DEFAULT '{}',                -- 'HH:MM'; vazio = sem hora marcada
  active           BOOLEAN     NOT NULL DEFAULT TRUE,
  position         INT         DEFAULT 0,
  created_at       TIMESTAMPTZ DEFAULT NOW(),
  updated_at       TIMESTAMPTZ DEFAULT NOW()
);

-- A marcação de "postei". Uma linha por (recorrente, dia, horário) — um
-- recorrente com dois horários são dois compromissos separados no mesmo dia.
CREATE TABLE IF NOT EXISTS recurring_logs (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  recurring_id  UUID        NOT NULL REFERENCES recurrings(id) ON DELETE CASCADE,
  done_date     DATE        NOT NULL,
  -- '' quando o recorrente não tem horário. Nunca NULL: em Postgres NULL não
  -- colide com NULL num UNIQUE, e o mesmo dia poderia ser marcado várias vezes.
  slot          TEXT        NOT NULL DEFAULT '',
  drive_file_id TEXT,                                       -- qual arte foi usada
  done_by       TEXT,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (recurring_id, done_date, slot)
);

-- A legenda de UMA arte da pasta. O Drive não guarda esse texto, então ele mora
-- aqui, amarrado ao id do arquivo.
CREATE TABLE IF NOT EXISTS recurring_variants (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  recurring_id  UUID        NOT NULL REFERENCES recurrings(id) ON DELETE CASCADE,
  drive_file_id TEXT        NOT NULL,
  caption       TEXT,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (recurring_id, drive_file_id)
);

CREATE INDEX IF NOT EXISTS recurrings_client_idx     ON recurrings (client_id);
CREATE INDEX IF NOT EXISTS recurring_logs_rec_idx    ON recurring_logs (recurring_id, done_date);
CREATE INDEX IF NOT EXISTS recurring_variants_rec_idx ON recurring_variants (recurring_id);

ALTER TABLE recurrings         ENABLE ROW LEVEL SECURITY;
ALTER TABLE recurring_logs     ENABLE ROW LEVEL SECURITY;
ALTER TABLE recurring_variants ENABLE ROW LEVEL SECURITY;

DO $plpg$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'recurrings' AND policyname = 'recurrings_access') THEN
    EXECUTE 'CREATE POLICY "recurrings_access" ON recurrings FOR ALL USING (true) WITH CHECK (true)';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'recurring_logs' AND policyname = 'recurring_logs_access') THEN
    EXECUTE 'CREATE POLICY "recurring_logs_access" ON recurring_logs FOR ALL USING (true) WITH CHECK (true)';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'recurring_variants' AND policyname = 'recurring_variants_access') THEN
    EXECUTE 'CREATE POLICY "recurring_variants_access" ON recurring_variants FOR ALL USING (true) WITH CHECK (true)';
  END IF;
END $plpg$;

-- O hub roda como `anon` (não tem login de verdade) — sem o GRANT pro anon,
-- toda consulta volta 401/42501 e a tela abre vazia.
GRANT SELECT, INSERT, UPDATE, DELETE ON recurrings         TO authenticated, anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON recurring_logs     TO authenticated, anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON recurring_variants TO authenticated, anon;
