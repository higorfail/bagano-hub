-- ─────────────────────────────────────────────────────────────────────────────
-- Caixa de entrada de notificações do Hub
--
-- Antes: o sininho não guardava nada. Ele remontava a lista a cada abertura com
-- 19 consultas ("captações dos próximos 3 dias", "posts parados há 3 dias",
-- "menções dos últimos 7 dias"…). Isso causava três problemas:
--   1. Evento que não se encaixasse numa das 19 perguntas nunca aparecia,
--      mesmo tendo disparado push.
--   2. Cada consulta tinha janela de tempo — passou de 14 dias/7 dias/48h, a
--      notificação sumia mesmo sem ter sido lida.
--   3. "Lido" morava no localStorage, então não atravessava aparelho.
--
-- Agora: uma linha por evento, gravada no MESMO ponto que dispara o push
-- (src/app/api/push/notify/route.ts). Push e sininho passam a ser a mesma
-- coisa por construção — é impossível um chegar e o outro não.
--
-- Rodar no SQL Editor do Supabase.
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists public.notifications (
  id           uuid primary key default gen_random_uuid(),
  member_id    uuid not null,
  -- Card de origem: é por ele que a lista agrupa (três mudanças de data no
  -- mesmo post viram um bloco só, como no Trello).
  card_table   text,
  card_id      uuid,
  client_id    uuid,
  kind         text not null default 'activity',
  actor_name   text,
  actor_id     uuid,
  title        text,
  body         text not null,
  url          text,
  read_at      timestamptz,
  created_at   timestamptz not null default now()
);

-- A consulta do sininho é sempre "as minhas, mais novas primeiro".
create index if not exists notifications_member_created_idx
  on public.notifications (member_id, created_at desc);

-- Contador de não lidas e filtro "só não lidas".
create index if not exists notifications_unread_idx
  on public.notifications (member_id) where read_at is null;

-- Agrupamento por card.
create index if not exists notifications_card_idx
  on public.notifications (card_table, card_id);

-- O hub roda como role `anon` (não tem login de verdade). Sem estes GRANTs a
-- tabela responde 401/42501 — mesmo problema que já apareceu em card_watchers
-- e push_subscriptions.
grant select, insert, update, delete on public.notifications to anon;
grant select, insert, update, delete on public.notifications to authenticated;
grant select, insert, update, delete on public.notifications to service_role;

alter table public.notifications enable row level security;

drop policy if exists "notifications open" on public.notifications;
create policy "notifications open" on public.notifications
  for all to anon, authenticated using (true) with check (true);

-- Faxina: sem isso a tabela cresce pra sempre. Lidas com mais de 30 dias e
-- qualquer coisa com mais de 90 dias saem — o histórico de verdade continua
-- no activity_log, que não é apagado.
create or replace function public.cleanup_notifications()
returns void language sql as $$
  delete from public.notifications
   where (read_at is not null and created_at < now() - interval '30 days')
      or created_at < now() - interval '90 days';
$$;
