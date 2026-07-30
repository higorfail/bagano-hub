-- Campo de hora no Cronograma (schedules), igual já existe em Extras — e
-- corrige de brinde o due_time de Materiais, que tinha o campo na tela mas
-- a coluna nunca existiu no banco (o valor digitado nunca era salvo).

alter table schedules add column if not exists scheduled_time time;
alter table materials add column if not exists due_time time;
