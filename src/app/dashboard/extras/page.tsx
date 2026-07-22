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
  const [clients, setClients] = useState<{ id: string; name: string; color_hex: string }[]>([])
  const [filterClient, setFilterClient] = useState('all')

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

  useEffect(() => {
    supabase.from('clients').select('id, name, color_hex').eq('status', 'active').order('name')
      .then(({ data }) => setClients(data || []))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div className="px-4 md:px-6 py-4 flex flex-col gap-4">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-baseline gap-2.5 min-w-0">
          <h1 className="text-xl font-bold text-[var(--color-text-primary)] tracking-tight">Extras</h1>
          <p className="text-sm text-[var(--color-text-muted)] truncate">posts extras e pedidos do cliente fora do crono</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {/* Stats compactas no lugar dos tiles gigantes */}
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
          <select value={filterClient} onChange={e => setFilterClient(e.target.value)}
            className="border border-[var(--color-border)] rounded-lg px-3 py-1.5 text-sm bg-[var(--color-bg-card)] outline-none text-[var(--color-text-primary)]">
            <option value="all">Todos os clientes</option>
            {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            <option value="global">Sem cliente</option>
          </select>
        </div>
      </div>

      <ExtrasKanban
        globalMode={true}
        members={members}
        initialOpenId={postParam}
        filterClient={filterClient}
        onFilterClientChange={setFilterClient}
        hideClientFilterUI
      />
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
