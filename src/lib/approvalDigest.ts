import { createClient } from './supabase'

// Em vez de um push por post aprovado/rejeitado (vira spam quando o cliente
// decide vários de uma vez), soma num contador por cliente — o cron
// /api/cron/approval-digest manda UM resumo depois de alguns minutos sem
// nenhuma ação nova ("Terras Altas aprovou 10 conteúdos, pediu ajuste em 2").
export async function queueApprovalDigest(clientId: string | null | undefined, kind: 'approved' | 'rejected', count = 1) {
  if (!clientId || count <= 0) return
  const supabase = createClient()
  const { data: existing } = await supabase.from('approval_digest_queue').select('approved_count, rejected_count').eq('client_id', clientId).maybeSingle()
  await supabase.from('approval_digest_queue').upsert({
    client_id: clientId,
    approved_count: (existing?.approved_count || 0) + (kind === 'approved' ? count : 0),
    rejected_count: (existing?.rejected_count || 0) + (kind === 'rejected' ? count : 0),
    last_action_at: new Date().toISOString(),
  }, { onConflict: 'client_id' })
}
