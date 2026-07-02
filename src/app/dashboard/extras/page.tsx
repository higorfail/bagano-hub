'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import { useUser } from '@/lib/UserContext'
import ExtrasKanban from '@/components/ExtrasKanban'
import { CheckSquare, Clock, AlertCircle } from 'lucide-react'

export default function ExtrasPage() {
  useEffect(() => { document.title = 'Extras · Bagano Hub' }, [])
  const { members } = useUser()
  const supabase = createClient()
  const [stats, setStats] = useState({ total: 0, done: 0, overdue: 0 })

  useEffect(() => {
    async function load() {
      const { data } = await supabase.from('extras').select('status, due_date')
      if (!data) return
      const now = new Date()
      setStats({
        total:   data.length,
        done:    data.filter(e => e.status === 'done').length,
        overdue: data.filter(e => e.due_date && new Date(e.due_date + 'T23:59:59') < now && e.status !== 'done').length,
      })
    }
    load()
  }, [])

  return (
    <div className="p-8 flex flex-col gap-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-[var(--color-text-primary)] tracking-tight">Extras</h1>
        <p className="text-sm text-[var(--color-text-muted)] mt-0.5">Tarefas, notas e lembretes · todos os clientes</p>
      </div>

      {/* Stats */}
      <div className="flex gap-3">
        {[
          { label: 'Total',      value: stats.total,   icon: CheckSquare, color: 'var(--color-text-primary)' },
          { label: 'Concluídos', value: stats.done,    icon: CheckSquare, color: '#22c55e' },
          { label: 'Em atraso',  value: stats.overdue, icon: AlertCircle, color: stats.overdue > 0 ? '#ef4444' : 'var(--color-text-faint)' },
        ].map(({ label, value, icon: Icon, color }) => (
          <div key={label} className="bg-[var(--color-bg-card)] border border-[var(--color-border)] rounded-2xl px-5 py-4 flex items-center gap-4 shadow-card">
            <Icon size={18} style={{ color, flexShrink: 0 }} strokeWidth={1.75} />
            <div>
              <p className="text-xl font-bold" style={{ color }}>{value}</p>
              <p className="text-xs text-[var(--color-text-muted)]">{label}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Kanban */}
      <ExtrasKanban globalMode={true} members={members} />
    </div>
  )
}
