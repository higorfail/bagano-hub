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
