-- ============================================================
-- Garante que a rota /api/push/notify (roda sem sessão, como anon)
-- consiga ler card_watchers e push_subscriptions. Idempotente — pode
-- rodar mesmo se já estiver certo, não quebra nada.
-- Execute no Supabase → SQL Editor.
-- ============================================================

GRANT SELECT ON card_watchers TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON push_subscriptions TO anon;

-- Se card_watchers tiver RLS ativado sem policy pra anon, os grants acima
-- não bastam sozinhos. Este bloco cria uma policy de leitura pra anon,
-- só se RLS estiver ligado e a policy ainda não existir.
DO $plpg$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE tablename = 'card_watchers')
     AND (SELECT relrowsecurity FROM pg_class WHERE relname = 'card_watchers') THEN
    IF NOT EXISTS (
      SELECT 1 FROM pg_policies WHERE tablename = 'card_watchers' AND policyname = 'card_watchers_anon_read'
    ) THEN
      EXECUTE 'CREATE POLICY "card_watchers_anon_read" ON card_watchers FOR SELECT USING (true)';
    END IF;
  END IF;
END $plpg$;
