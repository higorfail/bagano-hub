-- ============================================================
-- personal_tasks ganha "position" (ordem manual dentro da coluna, tipo Trello).
-- Execute depois de personal_tasks_v2_setup.sql, no Supabase → SQL Editor.
-- ============================================================

ALTER TABLE personal_tasks ADD COLUMN IF NOT EXISTS position INTEGER DEFAULT 0;
