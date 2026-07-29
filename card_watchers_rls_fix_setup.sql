-- Causa raiz real de "notificação não funciona": card_watchers tem RLS
-- habilitado sem nenhuma política liberando o role anon (que é como o Hub
-- roda de verdade, já que não tem login/sessão real). Toda tentativa de
-- registrar alguém como observador de um card (ao criar, atribuir, ou
-- mencionar num comentário) vinha sendo recusada silenciosamente pelo banco
-- — confirmado com um insert de teste retornando 42501 "new row violates
-- row-level security policy". Sem nenhum watcher registrado, /api/push/notify
-- nunca encontra ninguém pra avisar, mesmo com a inscrição de push
-- funcionando perfeitamente.

alter table card_watchers enable row level security;

drop policy if exists "card_watchers_anon_all" on card_watchers;
create policy "card_watchers_anon_all" on card_watchers
  for all
  to anon
  using (true)
  with check (true);

grant select, insert, update, delete on card_watchers to anon, authenticated;
