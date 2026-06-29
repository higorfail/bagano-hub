'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'

type Entry = {
  id: string
  action: string
  actor_name: string | null
  description: string
  created_at: string
}

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'agora'
  if (mins < 60) return `${mins}min atrás`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h atrás`
  const days = Math.floor(hrs / 24)
  if (days < 7) return `${days}d atrás`
  return new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })
}

const ACTION_DOT: Record<string, string> = {
  created:        'bg-green-500',
  deleted:        'bg-red-500',
  status_changed: 'bg-blue-500',
  commented:      'bg-purple-500',
  updated:        'bg-yellow-500',
}

type Props = { tableName: string; recordId: string; refreshKey?: number }

export default function ActivityLog({ tableName, recordId, refreshKey }: Props) {
  const [entries, setEntries] = useState<Entry[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!recordId) { setLoading(false); return }
    setLoading(true)
    const supabase = createClient()
    supabase.from('activity_log')
      .select('id, action, actor_name, description, created_at')
      .eq('table_name', tableName)
      .eq('record_id', recordId)
      .order('created_at', { ascending: false })
      .limit(30)
      .then(({ data }) => { setEntries(data || []); setLoading(false) })
  }, [tableName, recordId, refreshKey])

  if (loading) return <p className="text-xs text-[var(--color-text-faint)] py-4 text-center">Carregando...</p>

  if (entries.length === 0) return (
    <div className="py-8 text-center">
      <p className="text-xs text-[var(--color-text-faint)]">Nenhuma atividade registrada</p>
    </div>
  )

  return (
    <div className="flex flex-col overflow-y-auto max-h-72 pr-1">
      {entries.map((e, i) => (
        <div key={e.id} className="flex gap-2.5 py-2.5 relative">
          {i < entries.length - 1 && (
            <div className="absolute left-[5px] top-5 bottom-0 w-px bg-[var(--color-border)]" />
          )}
          <div className={`w-2.5 h-2.5 rounded-full flex-shrink-0 mt-1.5 ${ACTION_DOT[e.action] || 'bg-[var(--color-text-faint)]'}`} />
          <div className="flex-1 min-w-0">
            <p className="text-xs text-[var(--color-text-primary)] leading-snug">{e.description}</p>
            <div className="flex items-center gap-1.5 mt-0.5">
              {e.actor_name && (
                <span className="text-[10px] font-medium text-[var(--color-text-secondary)]">{e.actor_name}</span>
              )}
              <span className="text-[10px] text-[var(--color-text-faint)]">{timeAgo(e.created_at)}</span>
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}
