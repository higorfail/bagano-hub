-- Faxina do log de respostas HTTP do pg_net (net._http_response). Cada
-- chamada do cron do digest de aprovação (a cada 5 min) grava uma linha
-- ali — sem limpeza, cresce pra sempre. Isso não custa nada nem afeta
-- performance no volume que temos, mas é organização básica: mantém só os
-- últimos 3 dias.

select cron.unschedule('pg_net_cleanup') where exists (
  select 1 from cron.job where jobname = 'pg_net_cleanup'
);

select cron.schedule(
  'pg_net_cleanup',
  '0 3 * * *',
  $$ delete from net._http_response where created < now() - interval '3 days'; $$
);

-- Conferir se ficou agendado:
-- select * from cron.job where jobname = 'pg_net_cleanup';
