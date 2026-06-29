'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import { useUser } from '@/lib/UserContext'
import MaterialCard from '@/components/MaterialCard'
import MaterialCardMini from '@/components/MaterialCardMini'
import { logActivity } from '@/lib/activity'

type Material = {
  id: string
  client_id: string
  title: string
  type: string
  status: string
  description: string
  drive_url: string
  notes: string
  due_date: string | null
  assigned_to: string | null
  label: string | null
  created_at: string
}

const COLUMNS = [
  { key: 'producao', label: 'A fazer', color: '#F59E0B' },
  { key: 'aguardando_aprovacao', label: 'Em aprovação', color: '#EC4899' },
  { key: 'finalizado', label: 'Finalizados', color: '#22C55E' },
]

export default function MateriaisPage() {
  const { currentMember, showOnlyMine, members } = useUser()
  const [materials, setMaterials] = useState<Material[]>([])
  const [clients, setClients] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [filterClient, setFilterClient] = useState('')
  const [counts, setCounts] = useState<Record<string, {checklist:number, checkDone:number, comments:number, attachments:number}>>({})
  const [cardOpen,    setCardOpen]    = useState<string | 'new' | null>(null)
  const [draggingId,  setDraggingId]  = useState<string | null>(null)
  const [dragOverCol, setDragOverCol] = useState<string | null>(null)

  useEffect(() => {
    async function load() {
      const supabase = createClient()
      const [{ data: mats }, { data: cls }] = await Promise.all([
        supabase.from('materials').select('*').order('created_at', { ascending: false }),
        supabase.from('clients').select('id, name, color_hex').order('name'),
      ])
      setMaterials(mats || [])
      setClients(cls || [])
      const [{ data: chk }, { data: cms }, { data: atts }] = await Promise.all([
        supabase.from('material_checklist').select('material_id, done'),
        supabase.from('material_comments').select('material_id'),
        supabase.from('material_attachments').select('material_id'),
      ])
      const c: Record<string, any> = {}
      ;(mats || []).forEach((m: any) => { c[m.id] = { checklist: 0, checkDone: 0, comments: 0, attachments: 0 } })
      ;(chk || []).forEach((x: any) => { if (c[x.material_id]) { c[x.material_id].checklist++; if (x.done) c[x.material_id].checkDone++ } })
      ;(cms || []).forEach((x: any) => { if (c[x.material_id]) c[x.material_id].comments++ })
      ;(atts || []).forEach((x: any) => { if (c[x.material_id]) c[x.material_id].attachments++ })
      setCounts(c)
      setLoading(false)
    }
    load()
  }, [])

  const visible = materials.filter(m => {
    if (filterClient && m.client_id !== filterClient) return false
    if (showOnlyMine && currentMember && m.assigned_to !== currentMember.id) return false
    return true
  })

  function colMaterials(colKey: string) {
    return visible.filter(m => {
      const s = m.status || 'producao'
      if (colKey === 'producao') return s === 'producao' || (!['aguardando_aprovacao', 'finalizado'].includes(s))
      return s === colKey
    })
  }

  async function reload() {
    const supabase = createClient()
    const { data } = await supabase.from('materials').select('*').order('created_at', { ascending: false })
    setMaterials(data || [])
  }

  async function moveStatus(id: string, newStatus: string) {
    const labels: Record<string,string> = { producao: 'A fazer', aguardando_aprovacao: 'Em aprovação', finalizado: 'Finalizado' }
    const mat = materials.find(m => m.id === id)
    const oldLabel = labels[mat?.status || 'producao'] || mat?.status || ''
    const newLabel = labels[newStatus] || newStatus
    setMaterials(prev => prev.map(m => m.id === id ? { ...m, status: newStatus } : m))
    const supabase = createClient()
    await supabase.from('materials').update({ status: newStatus }).eq('id', id)
    await logActivity({ tableName: 'materials', recordId: id, action: 'status_changed', actorName: currentMember?.name, field: 'status', oldValue: oldLabel, newValue: newLabel, description: `Status mudou: ${oldLabel} → ${newLabel}` })
  }

  function handleDeleted(id: string) {
    setMaterials(prev => prev.filter(m => m.id !== id))
    setCardOpen(null)
  }

  if (loading) return <div className="p-6 text-sm text-[var(--color-text-muted)]">Carregando materiais...</div>

  return (
    <div className="p-6 flex flex-col gap-5 h-full">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-[var(--color-text-primary)] font-semibold text-lg">Materiais</h1>
          <p className="text-[var(--color-text-secondary)] text-sm mt-0.5">{visible.length} materiais · menus, cardápios, artes</p>
        </div>
        <div className="flex items-center gap-3">
          <select value={filterClient} onChange={e => setFilterClient(e.target.value)} className="border border-[var(--color-border)] rounded-lg px-3 py-1.5 text-sm bg-[var(--color-bg-card)] outline-none text-[var(--color-text-primary)]">
            <option value="">Todos os clientes</option>
            {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <button onClick={() => setCardOpen('new')} className="bg-[var(--color-brand)] text-[var(--color-brand-fg)] rounded-lg px-4 py-1.5 text-sm font-medium">+ Novo material</button>
        </div>
      </div>

      <div className="flex gap-4 flex-1 overflow-x-auto">
        {COLUMNS.map((col, colIdx) => {
          const items      = colMaterials(col.key)
          const isDragOver = dragOverCol === col.key
          const prevCol    = COLUMNS[colIdx - 1]
          const nextCol    = COLUMNS[colIdx + 1]
          return (
            <div key={col.key} className="flex-1 min-w-[300px] flex flex-col"
              onDragOver={e => { e.preventDefault(); setDragOverCol(col.key) }}
              onDragLeave={() => setDragOverCol(null)}
              onDrop={e => {
                e.preventDefault()
                if (draggingId) moveStatus(draggingId, col.key)
                setDraggingId(null); setDragOverCol(null)
              }}>
              <div className="flex items-center gap-2 mb-3 px-1">
                <span className="w-2 h-2 rounded-full" style={{ background: col.color }} />
                <span className="text-sm font-semibold text-[var(--color-text-primary)]">{col.label}</span>
                <span className="text-xs text-[var(--color-text-muted)]">{items.length}</span>
              </div>
              <div className={`flex flex-col gap-2.5 flex-1 rounded-xl transition-colors ${isDragOver ? 'bg-[var(--color-brand)]10 ring-2 ring-[var(--color-brand)] ring-dashed' : ''}`}>
                {items.map(m => {
                  const ct = counts[m.id] || { checklist: 0, checkDone: 0, comments: 0, attachments: 0 }
                  return (
                    <MaterialCardMini
                      key={m.id}
                      material={{ ...m, _checkTotal: ct.checklist, _checkDone: ct.checkDone, _comments: ct.comments, _attachments: ct.attachments }}
                      members={members}
                      onClick={() => setCardOpen(m.id)}
                      draggable={true}
                      onDragStart={e => { e.dataTransfer.effectAllowed = 'move'; setDraggingId(m.id) }}
                      onMovePrev={prevCol ? () => moveStatus(m.id, prevCol.key) : undefined}
                      onMoveNext={nextCol ? () => moveStatus(m.id, nextCol.key) : undefined}
                    />
                  )
                })}
                {items.length === 0 && (
                  isDragOver ? (
                    <div className="rounded-xl border-2 border-dashed border-[var(--color-brand)] py-10 text-center text-sm text-[var(--color-brand)] font-medium bg-[var(--color-bg-subtle)]">
                      Soltar aqui
                    </div>
                  ) : (
                    <button onClick={() => setCardOpen('new')}
                      className="group w-full rounded-xl border-2 border-dashed border-[var(--color-border)] hover:border-[var(--color-brand)] py-10 flex flex-col items-center gap-2.5 transition-all hover:bg-[var(--color-bg-subtle)]">
                      <div className="w-9 h-9 rounded-full border-2 border-dashed border-[var(--color-border)] group-hover:border-[var(--color-brand)] group-hover:bg-[var(--color-brand)] flex items-center justify-center transition-all">
                        <span className="text-lg text-[var(--color-text-muted)] group-hover:text-white leading-none">+</span>
                      </div>
                      <span className="text-xs text-[var(--color-text-muted)] group-hover:text-[var(--color-brand)] transition-colors font-medium">Adicionar material</span>
                    </button>
                  )
                )}
              </div>
            </div>
          )
        })}
      </div>

      {cardOpen && (
        <MaterialCard
          materialId={cardOpen === 'new' ? undefined : cardOpen}
          clients={clients}
          onClose={() => setCardOpen(null)}
          onSaved={reload}
          onDeleted={handleDeleted}
        />
      )}
    </div>
  )
}
