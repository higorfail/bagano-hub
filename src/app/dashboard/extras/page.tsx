'use client'

import { Suspense, useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import { useUser } from '@/lib/UserContext'
import ExtrasKanban from '@/components/ExtrasKanban'
import { Archive, ArchiveRestore } from 'lucide-react'

function ExtrasContent() {
  const { members } = useUser()
  const searchParams = useSearchParams()
  const postParam = searchParams.get('post')
  const supabase = createClient()
  const [stats, setStats] = useState({ total: 0, done: 0, overdue: 0 })
  const [clients, setClients] = useState<{ id: string; name: string; color_hex: string }[]>([])
  const [filterClient, setFilterClient] = useState('all')
  const [showArchived, setShowArchived] = useState(false)
  // Criar mora aqui em cima e nasce sempre na primeira coluna. Criar dentro de
  // "Feito" ou "Finalizados" não é uma ação que exista: as colunas aqui são
  // etapas de um fluxo, não gavetas livres como as listas do Trello.
  const [newStatus, setNewStatus] = useState<string | null>(null)
  const [archivedCount, setArchivedCount] = useState(0)

  useEffect(() => { document.title = 'Extras · Bagano Hub' }, [])

  useEffect(() => {
    async function load() {
      const { data } = await supabase.from('extras').select('status, due_date')
      if (!data) return
      const now = new Date()
      setStats({
        total:   data.length,
        done:    data.filter(e => e.status === 'done').length,
        // 'feito' não conta como atraso: a arte está pronta, o prazo de
        // produção foi cumprido. Mesma regra do selo no card.
        overdue: data.filter(e => e.due_date && new Date(e.due_date + 'T23:59:59') < now && !['done', 'feito'].includes(e.status)).length,
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
    <div className="px-4 md:px-6 py-4 flex flex-col gap-4 h-full">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-baseline gap-2.5 min-w-0">
          <h1 className="text-xl font-bold text-[var(--color-text-primary)] tracking-tight">Extras</h1>
          <p className="text-sm text-[var(--color-text-muted)] truncate">
            {stats.total} extra{stats.total === 1 ? '' : 's'} · {stats.done} concluído{stats.done === 1 ? '' : 's'}
            {stats.overdue > 0 && <span style={{ color: '#ef4444' }}> · {stats.overdue} em atraso</span>}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <select value={filterClient} onChange={e => setFilterClient(e.target.value)}
            className="border border-[var(--color-border)] rounded-lg px-3 py-1.5 text-sm bg-[var(--color-bg-card)] outline-none text-[var(--color-text-primary)]">
            <option value="all">Todos os clientes</option>
            {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            <option value="global">Sem cliente</option>
          </select>
          <button
            onClick={() => setShowArchived(s => !s)}
            className="flex items-center gap-1.5 text-sm font-medium px-2.5 py-1.5 rounded-lg border transition-colors"
            style={showArchived
              ? { borderColor: 'var(--color-accent)', color: 'var(--color-accent)' }
              : { borderColor: 'var(--color-border)', color: 'var(--color-text-secondary)' }}
          >
            {showArchived ? <ArchiveRestore size={14} /> : <Archive size={14} />}
            {showArchived ? 'Ver board' : `Arquivo${archivedCount > 0 ? ` (${archivedCount})` : ''}`}
          </button>
          <button onClick={() => setNewStatus('backlog')}
            className="flex-shrink-0 bg-[var(--color-text-primary)] text-[var(--color-bg-page)] rounded-lg px-3 py-1.5 text-sm font-medium">
            + Novo<span className="hidden sm:inline"> extra</span>
          </button>
        </div>
      </div>

      <ExtrasKanban
        newStatus={newStatus}
        onNewStatusChange={setNewStatus}
        globalMode={true}
        members={members}
        initialOpenId={postParam}
        filterClient={filterClient}
        onFilterClientChange={setFilterClient}
        hideClientFilterUI
        showArchived={showArchived}
        onShowArchivedChange={setShowArchived}
        hideArchiveToggleUI
        onArchivedCountChange={setArchivedCount}
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
