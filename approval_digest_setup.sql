-- Fila de resumo de aprovações do cliente — em vez de um push por post
-- aprovado/rejeitado (spam quando o cliente aprova vários de uma vez), conta
-- quantos foram aprovados/ajustados e manda UM resumo depois de alguns
-- minutos sem nenhuma nova ação ("Terras Altas aprovou 10 conteúdos, pediu
-- ajuste em 2"). Ver /api/cron/approval-digest.

create table if not exists approval_digest_queue (
  client_id uuid primary key references clients(id) on delete cascade,
  approved_count integer not null default 0,
  rejected_count integer not null default 0,
  last_action_at timestamptz not null default now()
);

alter table approval_digest_queue enable row level security;

drop policy if exists "approval_digest_queue_anon_all" on approval_digest_queue;
create policy "approval_digest_queue_anon_all" on approval_digest_queue
  for all
  to anon
  using (true)
  with check (true);

grant select, insert, update, delete on approval_digest_queue to anon, authenticated;
