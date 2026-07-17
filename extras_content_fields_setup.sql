-- ============================================================
-- Extras ganham os mesmos campos de conteúdo do Cronograma
-- (briefing, copy, legenda, referências) — pra o card expandido
-- de um Extra poder mostrar tudo que o card de post mostra,
-- sem depender/misturar com a tabela schedules.
-- Execute no Supabase → SQL Editor.
-- ============================================================

ALTER TABLE extras
  ADD COLUMN IF NOT EXISTS briefing         TEXT,
  ADD COLUMN IF NOT EXISTS copy             TEXT,
  ADD COLUMN IF NOT EXISTS legenda          TEXT,
  ADD COLUMN IF NOT EXISTS reference_notes  TEXT,
  ADD COLUMN IF NOT EXISTS reference_images JSONB DEFAULT '[]'::jsonb;
