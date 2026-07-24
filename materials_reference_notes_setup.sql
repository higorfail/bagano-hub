-- ============================================================
-- materials ganha reference_notes, igual já existe em extras/schedules —
-- pra Materiais também ter uma seção de Referências (notas/links).
-- Execute no Supabase → SQL Editor.
-- ============================================================

ALTER TABLE materials
  ADD COLUMN IF NOT EXISTS reference_notes TEXT;
