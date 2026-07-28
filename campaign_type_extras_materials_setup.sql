-- Permite vincular itens do Kanban de Extras e de Materiais a uma campanha
-- sazonal/personalizada, igual já funciona pros posts do cronograma
-- (schedules.campaign_type).

alter table extras add column if not exists campaign_type text;
alter table materials add column if not exists campaign_type text;
