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
    const { error } = await supabase.from('activity_log').insert({
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
    // Registrar nunca pode travar a tela — mas silêncio total foi o que fez
    // buracos no histórico demorarem a aparecer. Avisa e segue.
    if (error) console.error('[historico] não gravou:', error)
  } catch (e) {
    console.error('[historico] não gravou:', e)
  }
  // A rota é chamada SEMPRE, inclusive com skipPush: é ela que grava a
  // notificação na caixa de entrada, e só o envio do push é que fica de fora.
  // Antes o skipPush saía aqui e a aprovação do cliente nunca chegava ao
  // sininho — era a maior fonte de "chegou no push mas não ficou salvo".
  fetch('/api/push/notify', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(params),
    // keepalive: a requisição sobrevive se a pessoa fechar a aba ou navegar
    // logo depois da ação. Sem isso o navegador cancela em trânsito e a
    // notificação nunca chega a ser gravada — mesmo problema que já mordeu o
    // registro de "cliente pediu ajuste" antes.
    keepalive: true,
  }).catch(() => {})
}
