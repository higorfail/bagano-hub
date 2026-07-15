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
  // Dispara push pros watchers do card, sem bloquear a UI se falhar/demorar
  fetch('/api/push/notify', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(params),
  }).catch(() => {})
}
