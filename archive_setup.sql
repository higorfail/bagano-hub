-- ============================================================
-- Arquivamento de Extras e Materiais concluídos — pra não ocupar
-- espaço no board depois de prontos. `completed_at` marca quando
-- o item entrou em done/finalizado (usado pelo cron de auto-arquivo);
-- `archived_at` marca quando saiu do board (manual ou automático).
-- Execute no Supabase → SQL Editor.
-- ============================================================

ALTER TABLE extras
  ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS archived_at  TIMESTAMPTZ;

ALTER TABLE materials
  ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS archived_at  TIMESTAMPTZ;

-- Backfill: itens já concluídos hoje ganham completed_at = agora,
-- pra entrarem na contagem dos 7 dias do auto-arquivo a partir de agora
-- (sem isso, ficariam elegíveis pro auto-arquivo imediatamente no
-- primeiro cron rodado após a migration).
UPDATE extras    SET completed_at = now() WHERE status = 'done'       AND completed_at IS NULL;
UPDATE materials SET completed_at = now() WHERE status = 'finalizado' AND completed_at IS NULL;

-- ============================================================
-- Unifica as colunas do board de Extras com as de Materiais
-- (A fazer / Em aprovação / Finalizados). O status "Em andamento"
-- (doing) vira "Em aprovação" (aguardando_aprovacao) — mesmo nome
-- e cor da coluna equivalente em Materiais. Isso NÃO mexe no fluxo
-- de aprovação do cliente (client_approval_status / link /aprovar),
-- que continua um conceito separado, só a coluna do board mudou de nome.
-- ============================================================
UPDATE extras SET status = 'aguardando_aprovacao' WHERE status = 'doing';
