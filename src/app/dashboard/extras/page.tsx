'use client'

import { Suspense, useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import { useUser } from '@/lib/UserContext'
import ExtrasKanban from '@/components/ExtrasKanban'

function ExtrasContent() {
  const { members } = useUser()
  const searchParams = useSearchParams()
  const postParam = searchParams.get('post')
  const supabase = createClient()
  const [stats, setStats] = useState({ total: 0, done: 0, overdue: 0 })

  useEffect(() => { document.title = 'Extras · Bagano Hub' }, [])

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
    <div className="px-6 py-4 flex flex-col gap-4">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-baseline gap-2.5 min-w-0">
          <h1 className="text-xl font-bold text-[var(--color-text-primary)] tracking-tight">Extras</h1>
          <p className="text-sm text-[var(--color-text-muted)] truncate">tarefas, notas e lembretes</p>
        </div>
        {/* Stats compactas no lugar dos tiles gigantes */}
        <div className="flex items-center gap-2">
          {[
            { label: 'total',      value: stats.total,   color: 'var(--color-text-primary)' },
            { label: 'concluídos', value: stats.done,    color: '#22c55e' },
            { label: 'em atraso',  value: stats.overdue, color: stats.overdue > 0 ? '#ef4444' : 'var(--color-text-faint)' },
          ].map(({ label, value, color }) => (
            <div key={label} className="flex items-baseline gap-1.5 bg-[var(--color-bg-card)] border border-[var(--color-border)] rounded-lg px-2.5 py-1">
              <span className="text-sm font-bold" style={{ color }}>{value}</span>
              <span className="text-[11px] text-[var(--color-text-muted)]">{label}</span>
            </div>
          ))}
        </div>
      </div>

      <ExtrasKanban globalMode={true} members={members} initialOpenId={postParam} />
    </div>
  )
}

export default function ExtrasPage() {
  return (
    <Suspense>
      <ExtrasContent />
    </Suspense>
  )
}
