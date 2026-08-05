import { createClient } from '@/lib/supabase'

export type TrashItemType = 'post' | 'member' | 'material' | 'special_date' | 'extra'

export type TrashItem = {
  id: string
  item_type: TrashItemType
  item_data: Record<string, unknown>
  label: string
  deleted_at: string
  deleted_by: string | null
  expires_at: string
}

const ITEM_TABLES: Record<TrashItemType, string> = {
  post:         'schedules',
  member:       'team_members',
  material:     'materials',
  special_date: 'special_dates',
  extra:        'extras',
}

export async function moveToTrash(
  type: TrashItemType,
  id: string,
  label: string,
  deletedBy?: string | null
): Promise<void> {
  const supabase = createClient()
  const table = ITEM_TABLES[type]
  const { data } = await supabase.from(table).select('*').eq('id', id).single()
  if (!data) return
  const { error } = await supabase.from('trash').insert({
    item_type: type,
    item_data: data,
    label,
    deleted_by: deletedBy || null,
  })
  if (error) throw new Error(error.message)
}

export async function restoreFromTrash(item: TrashItem): Promise<void> {
  const supabase = createClient()
  const table = ITEM_TABLES[item.item_type]
  // A ordem aqui é a diferença entre restaurar e PERDER.
  //
  // Antes, o upsert ia sem checagem e a linha da lixeira era apagada logo
  // depois, desse ou não certo. Falhando o upsert — permissão, chave
  // estrangeira apontando pra cliente já removido, coluna que mudou de nome —
  // o item sumia da lixeira sem ter voltado pra lugar nenhum, e não havia mais
  // de onde tirar: a lixeira ERA a última cópia.
  const { error } = await supabase.from(table).upsert(item.item_data)
  if (error) throw new Error(`Não consegui restaurar: ${error.message}`)
  const { error: delErr } = await supabase.from('trash').delete().eq('id', item.id)
  // Restaurou mas não limpou a lixeira: o item existe duas vezes, o que é
  // chato e reversível. Melhor que o contrário.
  if (delErr) console.error('[lixeira] item restaurado, mas a linha da lixeira ficou:', delErr)
}

export async function deleteFromTrash(trashId: string): Promise<void> {
  const supabase = createClient()
  await supabase.from('trash').delete().eq('id', trashId)
}
