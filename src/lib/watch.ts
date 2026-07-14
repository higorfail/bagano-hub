import { createClient } from './supabase'

export async function getWatcherIds(tableName: string, recordId: string): Promise<string[]> {
  const supabase = createClient()
  const { data } = await supabase.from('card_watchers').select('member_id').eq('table_name', tableName).eq('record_id', recordId)
  return (data || []).map(r => r.member_id)
}

export async function toggleWatch(tableName: string, recordId: string, memberId: string, currentlyWatching: boolean) {
  const supabase = createClient()
  if (currentlyWatching) {
    await supabase.from('card_watchers').delete().eq('table_name', tableName).eq('record_id', recordId).eq('member_id', memberId)
  } else {
    await supabase.from('card_watchers').insert({ table_name: tableName, record_id: recordId, member_id: memberId })
  }
}

// Chama-se ao criar o card (autor) e ao atribuir responsáveis — quem cria ou é
// responsável passa a observar automaticamente, igual ao Trello.
export async function ensureWatching(tableName: string, recordId: string | undefined, memberIds: (string | null | undefined)[]) {
  const ids = Array.from(new Set(memberIds.filter(Boolean))) as string[]
  if (!ids.length || !recordId) return
  const supabase = createClient()
  await supabase.from('card_watchers').upsert(
    ids.map(member_id => ({ table_name: tableName, record_id: recordId, member_id })),
    { onConflict: 'table_name,record_id,member_id', ignoreDuplicates: true }
  )
}
