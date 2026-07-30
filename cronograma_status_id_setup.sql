-- cronograma_status nunca teve coluna id (chave natural client_id+month+year) —
-- uma mudança recente pra notificar o time ao finalizar o cronograma assumiu
-- errado que existia, e isso quebrou o próprio botão de finalizar (o
-- PostgREST rejeita a requisição inteira ao pedir uma coluna inexistente no
-- .select(), inclusive quando encadeado com update/insert). O código já foi
-- corrigido pra não depender mais disso — mas a notificação de "time todo
-- avisado ao finalizar" só volta a funcionar depois de rodar isto aqui.

alter table cronograma_status add column if not exists id uuid not null default gen_random_uuid() unique;
