-- Agenda o digest de aprovação a cada 5 minutos SEM depender do Cron do
-- Vercel (que no plano atual só permite frequência diária). Quem agenda
-- aqui é o próprio Postgres do Supabase, via pg_cron + pg_net: o banco
-- chama o endpoint /api/cron/approval-digest por HTTP, no mesmo intervalo
-- que o QUIET_MINUTES do route.ts espera.
--
-- IMPORTANTE — rode ANTES deste arquivo, direto no SQL Editor (não deixe
-- isso salvo em arquivo/commitado, é o valor real do segredo):
--
--   select vault.create_secret('<VALOR_REAL_DO_CRON_SECRET>', 'cron_secret_bagano');
--
-- Se vocês ainda não têm um CRON_SECRET configurado no Vercel (Project
-- Settings → Environment Variables), pode gerar um novo agora — só
-- garanta que o MESMO valor fique nos dois lugares (Vercel e aqui no
-- Vault). Se não quiser usar segredo nenhum, pule essa etapa e troque o
-- header abaixo por '{}'::jsonb — o endpoint aceita chamadas sem auth
-- quando CRON_SECRET não está definido.

-- 1) Habilita as extensões (se o create extension abaixo der erro de
--    permissão, habilite pg_cron e pg_net pelo Dashboard: Database →
--    Extensions, e pule pra etapa 2).
create extension if not exists pg_cron with schema extensions;
create extension if not exists pg_net with schema extensions;

-- 2) Remove um agendamento antigo com o mesmo nome, se existir (permite
--    rodar este arquivo de novo com segurança).
select cron.unschedule('approval-digest') where exists (
  select 1 from cron.job where jobname = 'approval-digest'
);

-- 3) Agenda a chamada a cada 5 minutos. Usa http_get (não http_post) porque
--    a rota só implementa GET (igual as outras 2 rotas de cron, que seguem
--    a convenção do Cron nativo do Vercel) — com POST, toda chamada batia
--    405 Method Not Allowed e o job "tinha sucesso" (só rodou o SQL certo)
--    sem nunca de fato processar a fila.
select cron.schedule(
  'approval-digest',
  '*/5 * * * *',
  $$
  select net.http_get(
    url := 'https://bagano-hub.vercel.app/api/cron/approval-digest',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || (
        select decrypted_secret from vault.decrypted_secrets
        where name = 'cron_secret_bagano'
      )
    ),
    timeout_milliseconds := 5000
  );
  $$
);

-- Conferir se ficou agendado:
-- select * from cron.job where jobname = 'approval-digest';

-- Conferir as últimas execuções e respostas HTTP:
-- select * from cron.job_run_details where jobid = (select jobid from cron.job where jobname = 'approval-digest') order by start_time desc limit 5;
-- select * from net._http_response order by created desc limit 5;

-- Pra desligar, se precisar:
-- select cron.unschedule('approval-digest');
