-- ============================================================
-- personal_tasks: quadro pessoal estilo Trello (Tarefa/Lembrete/Nota) por
-- membro da equipe — separado de Extras (que agora é só conteúdo de cliente).
-- Cada um só vê o próprio quadro (assigned_to), mas pode criar um card já
-- atribuído a outra pessoa (cai no quadro dela, não no de quem criou).
-- Execute no Supabase → SQL Editor.
-- ============================================================

CREATE TABLE IF NOT EXISTS personal_tasks (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  title        TEXT        NOT NULL,
  type         TEXT        NOT NULL DEFAULT 'tarefa',   -- tarefa | lembrete | nota
  status       TEXT        NOT NULL DEFAULT 'a_fazer',  -- a_fazer | fazendo | feito
  note         TEXT,
  client_id    UUID        REFERENCES clients(id) ON DELETE SET NULL,
  assigned_to  UUID        NOT NULL REFERENCES team_members(id) ON DELETE CASCADE,
  created_by   UUID        REFERENCES team_members(id) ON DELETE SET NULL,
  due_date     DATE,
  completed_at TIMESTAMPTZ,
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  updated_at   TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS personal_task_comments (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id     UUID        NOT NULL REFERENCES personal_tasks(id) ON DELETE CASCADE,
  body        TEXT        NOT NULL,
  author_name TEXT,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- Reaproveita o trigger de updated_at já criado em updated_at_tracking_setup.sql
-- (função set_updated_at) — se ainda não rodou aquele arquivo, rode-o antes deste.
DROP TRIGGER IF EXISTS trg_personal_tasks_updated_at ON personal_tasks;
CREATE TRIGGER trg_personal_tasks_updated_at
  BEFORE UPDATE ON personal_tasks
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

ALTER TABLE personal_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE personal_task_comments ENABLE ROW LEVEL SECURITY;

DO $plpg$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'personal_tasks' AND policyname = 'personal_tasks_access') THEN
    EXECUTE 'CREATE POLICY "personal_tasks_access" ON personal_tasks FOR ALL USING (true) WITH CHECK (true)';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'personal_task_comments' AND policyname = 'personal_task_comments_access') THEN
    EXECUTE 'CREATE POLICY "personal_task_comments_access" ON personal_task_comments FOR ALL USING (true) WITH CHECK (true)';
  END IF;
END $plpg$;

GRANT SELECT, INSERT, UPDATE, DELETE ON personal_tasks TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON personal_task_comments TO authenticated;
