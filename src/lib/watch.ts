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

// @Nome escrito num comentário — mesma convenção usada por useMentions.insert()
// (que sempre grava "@PrimeiroNome "). Usado para achar quem foi mencionado.
export function extractMentionedFirstNames(body: string): string[] {
  const matches = body.matchAll(/@(\w+)/g)
  return Array.from(new Set(Array.from(matches, m => m[1].toLowerCase())))
}

// Garante que @menções num comentário virem watchers do card, mesmo que a
// pessoa mencionada nunca tenha aberto esse card antes — sem isso, o push de
// logActivity() só alcança quem já era watcher e a menção passa batido.
// Chame isto ANTES de logActivity() em qualquer lugar que salva um comentário.
export async function ensureWatchingFromMentions(
  tableName: string,
  recordId: string | undefined,
  commentBody: string,
  members: { id: string; name: string }[],
) {
  const mentioned = extractMentionedFirstNames(commentBody)
  if (!mentioned.length) return
  const ids = members
    .filter(m => mentioned.includes(m.name.split(' ')[0].toLowerCase()))
    .map(m => m.id)
  await ensureWatching(tableName, recordId, ids)
}
