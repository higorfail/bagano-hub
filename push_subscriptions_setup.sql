-- ============================================================
-- push_subscriptions: assinaturas de push notification (PWA) por membro.
-- Execute no Supabase → SQL Editor.
-- ============================================================

CREATE TABLE IF NOT EXISTS push_subscriptions (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id   UUID        REFERENCES team_members(id) ON DELETE CASCADE,
  endpoint    TEXT        NOT NULL UNIQUE,
  p256dh      TEXT        NOT NULL,
  auth        TEXT        NOT NULL,
  user_agent  TEXT,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE push_subscriptions ENABLE ROW LEVEL SECURITY;

DO $plpg$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'push_subscriptions' AND policyname = 'push_subscriptions_access'
  ) THEN
    EXECUTE 'CREATE POLICY "push_subscriptions_access" ON push_subscriptions FOR ALL USING (true) WITH CHECK (true)';
  END IF;
END $plpg$;

-- authenticated (o app no navegador, pra criar/remover a própria assinatura) e
-- anon (a rota /api/push/notify roda no servidor sem sessão de usuário, então
-- lê como anon — ver memória "project_supabase_grants": RLS sozinha não basta).
GRANT SELECT, INSERT, UPDATE, DELETE ON push_subscriptions TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON push_subscriptions TO anon;
