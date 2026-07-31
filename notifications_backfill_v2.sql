-- ─────────────────────────────────────────────────────────────────────────────
-- Complemento do backfill: quem está ATRIBUÍDO ao card, não só quem observa
--
-- O primeiro backfill cruzou activity_log com card_watchers. Só que
-- card_watchers só ganha linha quando o app registra explicitamente alguém
-- (atribuição, menção, ou clicar em "observar"). Card antigo, ou card onde
-- ninguém passou por esse fluxo, não tem NENHUM observador — e por isso não
-- gerou notificação nenhuma, mesmo com gente trabalhando nele.
--
-- Foi o que fez sumirem eventos de cards do Dom Leonello.
--
-- Aqui usamos a outra fonte, que existe independente disso: a coluna
-- assigned_members do próprio card. Também preenche card_type e card_number
-- (o selo "Reels" e o "#11") nas linhas que o primeiro backfill deixou sem.
--
-- Pode rodar mais de uma vez sem duplicar.
-- ─────────────────────────────────────────────────────────────────────────────

-- 1. Colunas novas: tipo e número do card
alter table public.hub_notifications add column if not exists card_type   text;
alter table public.hub_notifications add column if not exists card_number integer;

-- 2. Eventos de posts do cronograma pra quem está atribuído ao post
insert into public.hub_notifications
  (member_id, card_table, card_id, client_id, kind, actor_name, title, card_type, card_number, body, url, read_at, created_at)
select
  m.member_id::uuid,
  a.table_name,
  s.id,
  a.client_id::text::uuid,
  coalesce(a.action, 'activity'),
  a.actor_name,
  s.title,
  s.post_type,
  s.post_number,
  a.description,
  '/dashboard/cronograma?post=' || s.id::text || coalesce('&client=' || s.client_id::text, ''),
  now(),
  a.created_at
from public.activity_log a
join public.schedules s
  on s.id::text = a.record_id::text
cross join lateral jsonb_array_elements_text(
  case jsonb_typeof(to_jsonb(s.assigned_members))
    when 'array' then to_jsonb(s.assigned_members)
    else '[]'::jsonb
  end
) as m(member_id)
where a.table_name = 'schedules'
  and a.created_at >= now() - interval '30 days'
  and (a.actor_name is null or m.member_id not in (
        select tm.id::text from public.team_members tm where tm.name = a.actor_name
      ))
  and not exists (
    select 1 from public.hub_notifications n
     where n.member_id  = m.member_id::uuid
       and n.card_id    = s.id
       and n.created_at = a.created_at
  );

-- 3. Preenche tipo/número nas linhas que já existiam sem eles
update public.hub_notifications n
   set card_type   = s.post_type,
       card_number = s.post_number,
       title       = coalesce(n.title, s.title)
  from public.schedules s
 where n.card_table = 'schedules'
   and n.card_id = s.id
   and n.card_type is null;

update public.hub_notifications n
   set card_type = coalesce(e.type, 'extra'),
       title     = coalesce(n.title, e.title)
  from public.extras e
 where n.card_table = 'extras'
   and n.card_id = e.id
   and n.card_type is null;

update public.hub_notifications n
   set card_type = 'material',
       title     = coalesce(n.title, mt.title)
  from public.materials mt
 where n.card_table = 'materials'
   and n.card_id = mt.id
   and n.card_type is null;

update public.hub_notifications n
   set card_type = coalesce(t.type, 'tarefa'),
       title     = coalesce(n.title, t.title)
  from public.personal_tasks t
 where n.card_table = 'personal_tasks'
   and n.card_id = t.id
   and n.card_type is null;

-- 4. Conferência
select tm.name, count(*) as notificacoes
  from public.hub_notifications n
  join public.team_members tm on tm.id = n.member_id
 group by tm.name
 order by notificacoes desc;
