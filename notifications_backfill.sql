-- ─────────────────────────────────────────────────────────────────────────────
-- Semear a caixa de entrada com o histórico que já existe
--
-- A tabela notifications nasce vazia, e uma caixa vazia no primeiro dia parece
-- defeito pro time. Aqui reconstruímos o passado recente a partir do que já
-- estava guardado: cada linha do activity_log vira uma notificação pra quem
-- observava aquele card na época.
--
-- RODAR DEPOIS de notifications_setup.sql. Pode rodar mais de uma vez sem
-- duplicar — o NOT EXISTS no final garante isso.
--
-- Duas coisas que valem saber sobre o resultado:
--   • Quem começou a observar um card DEPOIS de um evento vai ver esse evento
--     mesmo assim. O card_watchers guarda quem observa hoje, não desde quando.
--     É o comportamento mais útil (a pessoa vê o que aconteceu no card que ela
--     acompanha), só não é uma reconstrução histórica exata.
--   • Tudo entra como JÁ LIDO. Ninguém deve abrir o Hub amanhã com 200
--     notificações vermelhas de coisas que já resolveu — o histórico serve
--     pra consulta, não pra cobrança.
-- ─────────────────────────────────────────────────────────────────────────────

insert into public.notifications
  (member_id, card_table, card_id, client_id, kind, actor_name, title, body, url, read_at, created_at)
select
  w.member_id,
  a.table_name,
  a.record_id,
  a.client_id,
  coalesce(a.action, 'activity'),
  a.actor_name,
  -- Título do card, buscado na tabela certa conforme a origem do evento.
  case a.table_name
    when 'schedules'      then (select s.title from public.schedules      s where s.id = a.record_id)
    when 'materials'      then (select m.title from public.materials      m where m.id = a.record_id)
    when 'extras'         then (select e.title from public.extras         e where e.id = a.record_id)
    when 'personal_tasks' then (select t.title from public.personal_tasks t where t.id = a.record_id)
  end,
  a.description,
  -- Mesmos links que a rota de push monta, pra abrir no lugar certo.
  case a.table_name
    when 'schedules' then '/dashboard/cronograma?post=' || a.record_id ||
                          coalesce('&client=' || a.client_id::text, '')
    when 'materials' then '/dashboard/materiais?post=' || a.record_id
    when 'extras'    then '/dashboard/extras?post='    || a.record_id
    when 'personal_tasks' then '/dashboard/tarefas?task=' || a.record_id
    else '/dashboard'
  end,
  now(),          -- entra como lido, ver observação acima
  a.created_at
from public.activity_log a
join public.card_watchers w
  on w.table_name = a.table_name
 and w.record_id  = a.record_id
where a.created_at >= now() - interval '30 days'
  -- Quem fez a coisa não precisa ser avisado dela.
  and (a.actor_name is null or w.member_id::text not in (
        select tm.id::text from public.team_members tm where tm.name = a.actor_name
      ))
  and a.table_name in ('schedules', 'materials', 'extras', 'personal_tasks')
  and not exists (
    select 1 from public.notifications n
     where n.member_id  = w.member_id
       and n.card_id    = a.record_id
       and n.created_at = a.created_at
  );

-- Conferência: quantas notificações cada pessoa passou a ter.
select tm.name, count(*) as notificacoes
  from public.notifications n
  join public.team_members tm on tm.id = n.member_id
 group by tm.name
 order by notificacoes desc;
