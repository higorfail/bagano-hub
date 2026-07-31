import { createClient } from './supabase'

export async function logActivity(params: {
  tableName: string
  recordId: string
  clientId?: string | null
  action: string
  actorName?: string | null
  actorId?: string | null
  field?: string | null
  oldValue?: string | null
  newValue?: string | null
  description: string
  // Aprovação/rejeição do cliente usa um resumo em lote em vez de um push por
  // post (ver queueApprovalDigest) — continua sendo GRAVADA na caixa de
  // entrada normalmente, só não dispara o push individual duplicado.
  skipPush?: boolean
}) {
  try {
    const supabase = createClient()
    await supabase.from('activity_log').insert({
      table_name: params.tableName,
      record_id: params.recordId,
      client_id: params.clientId || null,
      action: params.action,
      actor_name: params.actorName || null,
      field: params.field || null,
      old_value: params.oldValue || null,
      new_value: params.newValue || null,
      description: params.description,
    })
  } catch {
    // never block the UI for logging
  }
  // A rota é chamada SEMPRE, inclusive com skipPush: é ela que grava a
  // notificação na caixa de entrada, e só o envio do push é que fica de fora.
  // Antes o skipPush saía aqui e a aprovação do cliente nunca chegava ao
  // sininho — era a maior fonte de "chegou no push mas não ficou salvo".
  fetch('/api/push/notify', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(params),
  }).catch(() => {})
}
