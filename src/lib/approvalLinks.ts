import { createClient } from '@/lib/supabase'

// Token "geral" — mesmo padrão get-or-create do copyTypeApprovalLink
// (CronogramaTab.tsx), mas atemporal: chaveia só por client_id, sem mês/ano,
// já que a visão unificada (crono + final + extras pendentes) não é presa a
// um mês específico. Guarda o mês/ano atual só por completude do schema —
// igual o tipo 'extras' já faz — a busca e a query de dados ignoram esse
// valor.
export async function getOrCreateGeneralApprovalToken(clientId: string): Promise<string | null> {
  const supabase = createClient()
  const { data: existing } = await supabase.from('approval_tokens').select('token')
    .eq('client_id', clientId).eq('type', 'geral').eq('active', true).maybeSingle()
  if (existing?.token) return existing.token

  const now = new Date()
  const { data } = await supabase.from('approval_tokens')
    .insert({ client_id: clientId, month: now.getMonth() + 1, year: now.getFullYear(), type: 'geral' })
    .select('token').single()
  return data?.token || null
}

// Token de EXTRAS — também atemporal, pelo mesmo motivo do 'geral': a tela de
// aprovação de extras busca por `client_approval_status = 'aguardando'` e
// ignora mês/ano completamente.
//
// Mesmo assim, os dois lugares que copiavam esse link procuravam por
// client + MÊS DE HOJE. O link antigo continuava valendo (token não expira),
// mas todo mês nascia um token novo pro mesmo cliente, e você deixava de saber
// qual link o cliente tem na mão — impossível revogar o certo. Aqui a chave é
// só o cliente; o mês vai no insert por completude do schema e ninguém lê.
export async function getOrCreateExtrasApprovalToken(clientId: string): Promise<string | null> {
  const supabase = createClient()
  // order + limit em vez de maybeSingle: já podem existir tokens antigos, um
  // por mês, do comportamento anterior. maybeSingle estouraria com dois.
  const { data: existing } = await supabase.from('approval_tokens').select('token')
    .eq('client_id', clientId).eq('type', 'extras').eq('active', true)
    .order('created_at', { ascending: true }).limit(1)
  if (existing?.[0]?.token) return existing[0].token

  const now = new Date()
  const { data } = await supabase.from('approval_tokens')
    .insert({ client_id: clientId, month: now.getMonth() + 1, year: now.getFullYear(), type: 'extras' })
    .select('token').single()
  return data?.token || null
}
