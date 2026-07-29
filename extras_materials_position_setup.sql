-- Permite reordenar manualmente (arrastar pra cima/baixo) os cards dentro de
-- uma mesma coluna no Kanban de Extras e no board de Materiais — igual já
-- funciona no Quadro pessoal.

alter table extras add column if not exists position integer default 0;
alter table materials add column if not exists position integer default 0;
