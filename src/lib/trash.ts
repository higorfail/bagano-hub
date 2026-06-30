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
  await supabase.from(table).upsert(item.item_data)
  await supabase.from('trash').delete().eq('id', item.id)
}

export async function deleteFromTrash(trashId: string): Promise<void> {
  const supabase = createClient()
  await supabase.from('trash').delete().eq('id', trashId)
}
