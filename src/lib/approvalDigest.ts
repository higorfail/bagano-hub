import { createClient } from './supabase'

// Em vez de um push por post aprovado/rejeitado (vira spam quando o cliente
// decide vários de uma vez), soma num contador por cliente — o cron
// /api/cron/approval-digest manda UM resumo depois de alguns minutos sem
// nenhuma ação nova ("Terras Altas aprovou 10 conteúdos, pediu ajuste em 2").
// O `db` opcional é como a página pública de aprovação passa o cliente que
// carrega o cabeçalho `x-approval-token`. Sem ele, este helper criaria um
// cliente sem cabeçalho — e a política do banco, que decide olhando o token,
// não teria como reconhecer a requisição. Quem já chamava sem `db` continua
// igual: no hub logado, quem manda é a sessão.
export async function queueApprovalDigest(clientId: string | null | undefined, kind: 'approved' | 'rejected', count = 1, db?: any) {
  if (!clientId || count <= 0) return
  const supabase = db || createClient()
  const now = new Date().toISOString()
  const { data: existing } = await supabase.from('approval_digest_queue')
    .select('approved_count, rejected_count, window_start').eq('client_id', clientId).maybeSingle()

  // Os contadores continuam existindo só como sinal de "tem o quê nesta
  // janela" (aprovação, ajuste, ou os dois). O NÚMERO do resumo não sai mais
  // daqui: ele é contado no envio, em posts distintos.
  //
  // Motivo: isto soma EVENTOS. Um post aprovado, marcado como ajuste
  // internamente e aprovado de novo somava 2 — e o resumo dizia "aprovou 12
  // conteúdos" pra 11 posts. Contador acumulado não tem como saber que os
  // dois eventos são do mesmo post.
  await supabase.from('approval_digest_queue').upsert({
    client_id: clientId,
    approved_count: (existing?.approved_count || 0) + (kind === 'approved' ? count : 0),
    rejected_count: (existing?.rejected_count || 0) + (kind === 'rejected' ? count : 0),
    // Preserva o início da janela: é a partir dele que o envio conta.
    window_start: existing?.window_start || now,
    last_action_at: now,
  }, { onConflict: 'client_id' })
}
