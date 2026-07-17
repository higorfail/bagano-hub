-- ============================================================
-- Cronograma ganha etiquetas, igual já existe em Extras e Materiais.
-- Execute no Supabase → SQL Editor.
-- ============================================================

ALTER TABLE schedules
  ADD COLUMN IF NOT EXISTS labels JSONB DEFAULT '[]'::jsonb;
