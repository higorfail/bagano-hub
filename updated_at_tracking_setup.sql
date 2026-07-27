-- Adiciona updated_at (atualizado automaticamente a cada UPDATE) em schedules,
-- extras e materials. Usado pro indicador "parado há X dias" no dashboard
-- ("Pra você") — sem essa coluna não dá pra saber há quanto tempo um card está
-- na mesma etapa, só quando foi criado.

ALTER TABLE schedules ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now();
ALTER TABLE extras    ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now();
ALTER TABLE materials ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now();

-- Backfill ANTES de criar o trigger — linhas existentes ficam com updated_at =
-- created_at (melhor que "agora", senão tudo parece recém-mexido de uma vez).
UPDATE schedules SET updated_at = created_at WHERE updated_at IS NULL;
UPDATE extras    SET updated_at = created_at WHERE updated_at IS NULL;
UPDATE materials SET updated_at = created_at WHERE updated_at IS NULL;

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_schedules_updated_at ON schedules;
CREATE TRIGGER trg_schedules_updated_at
  BEFORE UPDATE ON schedules
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_extras_updated_at ON extras;
CREATE TRIGGER trg_extras_updated_at
  BEFORE UPDATE ON extras
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_materials_updated_at ON materials;
CREATE TRIGGER trg_materials_updated_at
  BEFORE UPDATE ON materials
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
