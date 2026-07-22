'use client'

import { Suspense, useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import { useUser } from '@/lib/UserContext'
import MaterialCard from '@/components/MaterialCard'
import MaterialCardMini from '@/components/MaterialCardMini'
import Button from '@/components/ui/Button'
import { logActivity } from '@/lib/activity'
import { Archive, ArchiveRestore } from 'lucide-react'

type Material = {
  id: string
  client_id: string
  title: string
  type: string
  status: string
  due_date: string | null
  assigned_to: string | null
  assigned_members?: string[] | null
  labels?: { text: string; color: string }[] | null
  created_at: string
  description?: string
  drive_url?: string
  notes?: string
  label?: string | null
  completed_at?: string | null
  archived_at?: string | null
}

const COLUMNS = [
  { key: 'producao', label: 'A fazer', color: '#F59E0B' },
  { key: 'aguardando_aprovacao', label: 'Em aprovação', color: '#EC4899' },
  { key: 'finalizado', label: 'Finalizados', color: '#22C55E' },
]

function MateriaisContent() {
  useEffect(() => { document.title = 'Materiais · Bagano Hub' }, [])
  const { currentMember, showOnlyMine, members } = useUser()
  const searchParams = useSearchParams()
  const [materials, setMaterials] = useState<Material[]>([])
  const [clients, setClients] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [filterClient, setFilterClient] = useState('')
  const [counts, setCounts] = useState<Record<string, {checklist:number, checkDone:number, comments:number, attachments:number, preview:string|null}>>({})
  const [cardOpen,    setCardOpen]    = useState<string | 'new' | null>(() => searchParams.get('post'))
  const [draggingId,  setDraggingId]  = useState<string | null>(null)
  const [dragOverCol, setDragOverCol] = useState<string | null>(null)
  const [showArchived, setShowArchived] = useState(false)

  useEffect(() => {
    const p = searchParams.get('post')
    if (p) setCardOpen(p)
  }, [searchParams.get('post')])

  useEffect(() => {
    async function load() {
      const supabase = createClient()
      const [{ data: mats }, { data: cls }] = await Promise.all([
        supabase.from('materials').select('id, client_id, title, type, status, description, ai_summary, due_date, drive_url, assigned_to, assigned_members, labels, created_at, completed_at, archived_at').order('created_at', { ascending: false }),
        supabase.from('clients').select('id, name, color_hex').order('name'),
      ])
      setMaterials(mats || [])
      setClients(cls || [])
      const [{ data: chk }, { data: cms }, { data: atts }, { data: ups }] = await Promise.all([
        supabase.from('material_checklist').select('material_id, done'),
        supabase.from('material_comments').select('material_id'),
        supabase.from('material_attachments').select('material_id'),
        supabase.from('material_uploads').select('material_id, file_url, created_at').order('created_at', { ascending: true }),
      ])
      const c: Record<string, any> = {}
      ;(mats || []).forEach((m: any) => { c[m.id] = { checklist: 0, checkDone: 0, comments: 0, attachments: 0, preview: null } })
      ;(chk || []).forEach((x: any) => { if (c[x.material_id]) { c[x.material_id].checklist++; if (x.done) c[x.material_id].checkDone++ } })
      ;(cms || []).forEach((x: any) => { if (c[x.material_id]) c[x.material_id].comments++ })
      ;(atts || []).forEach((x: any) => { if (c[x.material_id]) c[x.material_id].attachments++ })
      ;(ups || []).forEach((x: any) => { if (c[x.material_id] && !c[x.material_id].preview && /\.(png|jpe?g|webp|gif|avif)(\?|$)/i.test(x.file_url || '')) c[x.material_id].preview = x.file_url })
      setCounts(c)
      setLoading(false)
    }
    load()
  }, [])

  const archivedCount = materials.filter(m => m.archived_at).length

  const visible = materials.filter(m => {
    if (showArchived ? !m.archived_at : !!m.archived_at) return false
    if (filterClient && m.client_id !== filterClient) return false
    if (showOnlyMine && currentMember) {
      const assigned = m.assigned_members?.length ? m.assigned_members : m.assigned_to ? [m.assigned_to] : []
      if (!assigned.includes(currentMember.id)) return false
    }
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
    const patch: Record<string, any> = { status: newStatus }
    if (newStatus === 'finalizado' && mat?.status !== 'finalizado') patch.completed_at = new Date().toISOString()
    if (newStatus !== 'finalizado') patch.completed_at = null
    setMaterials(prev => prev.map(m => m.id === id ? { ...m, ...patch } : m))
    const supabase = createClient()
    await supabase.from('materials').update(patch).eq('id', id)
    await logActivity({ tableName: 'materials', recordId: id, action: 'status_changed', actorName: currentMember?.name, actorId: currentMember?.id, field: 'status', oldValue: oldLabel, newValue: newLabel, description: `Status mudou: ${oldLabel} → ${newLabel}` })
  }

  async function archiveMaterial(id: string) {
    setMaterials(prev => prev.map(m => m.id === id ? { ...m, archived_at: new Date().toISOString() } : m))
    const supabase = createClient()
    await supabase.from('materials').update({ archived_at: new Date().toISOString() }).eq('id', id)
  }
  async function unarchiveMaterial(id: string) {
    setMaterials(prev => prev.map(m => m.id === id ? { ...m, archived_at: null } : m))
    const supabase = createClient()
    await supabase.from('materials').update({ archived_at: null }).eq('id', id)
  }

  function handleDeleted(id: string) {
    setMaterials(prev => prev.filter(m => m.id !== id))
    setCardOpen(null)
  }

  if (loading) return <div className="p-6 text-sm text-[var(--color-text-muted)]">Carregando materiais...</div>

  return (
    <div className="px-4 md:px-6 py-4 flex flex-col gap-4 h-full">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-baseline gap-2.5 min-w-0">
          <h1 className="text-xl font-bold text-[var(--color-text-primary)] tracking-tight">Materiais</h1>
          <p className="text-[var(--color-text-muted)] text-sm truncate">{visible.length} materia{visible.length === 1 ? 'l' : 'is'} · menus, cardápios, artes</p>
        </div>
        <div className="flex items-center gap-2">
          <select value={filterClient} onChange={e => setFilterClient(e.target.value)} className="border border-[var(--color-border)] rounded-lg px-3 py-1.5 text-sm bg-[var(--color-bg-card)] outline-none text-[var(--color-text-primary)]">
            <option value="">Todos os clientes</option>
            {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
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
          <Button variant="dark" onClick={() => setCardOpen('new')}>+ Novo material</Button>
        </div>
      </div>

      {showArchived ? (
        <div className="flex flex-col gap-2">
          {visible.length === 0 && (
            <p className="text-sm text-[var(--color-text-faint)] text-center py-8">Nenhum material arquivado.</p>
          )}
          {visible.map(m => (
            <div key={m.id} className="flex items-center gap-3 bg-[var(--color-bg-card)] border border-[var(--color-border)] rounded-xl px-3 py-2.5">
              <button onClick={() => { setCardOpen(m.id); window.history.replaceState(null, '', `?post=${m.id}`) }} className="flex-1 min-w-0 text-left flex items-center gap-2">
                {clients.find(c => c.id === m.client_id) && (
                  <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full text-white flex-shrink-0" style={{ background: clients.find(c => c.id === m.client_id).color_hex }}>
                    {clients.find(c => c.id === m.client_id).name}
                  </span>
                )}
                <span className="text-sm text-[var(--color-text-primary)] truncate">{m.title}</span>
              </button>
              <button onClick={() => unarchiveMaterial(m.id)} title="Desarquivar" className="flex items-center gap-1.5 text-xs font-medium px-2.5 py-1.5 rounded-lg text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-subtle)] transition-colors flex-shrink-0">
                <ArchiveRestore size={13} /> Desarquivar
              </button>
            </div>
          ))}
        </div>
      ) : (
      <div className="flex gap-4 flex-1 overflow-x-auto snap-x snap-mandatory md:snap-none -mx-4 px-4 md:mx-0 md:px-0">
        {COLUMNS.map((col, colIdx) => {
          const items      = colMaterials(col.key)
          const isDragOver = dragOverCol === col.key
          const prevCol    = COLUMNS[colIdx - 1]
          const nextCol    = COLUMNS[colIdx + 1]
          return (
            <div key={col.key} className="w-[calc(100vw-2rem)] flex-shrink-0 snap-center md:w-auto md:flex-1 md:min-w-[300px] md:snap-align-none flex flex-col"
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
                  const ct = counts[m.id] || { checklist: 0, checkDone: 0, comments: 0, attachments: 0, preview: null }
                  return (
                    <MaterialCardMini
                      key={m.id}
                      material={{ ...m, _checkTotal: ct.checklist, _checkDone: ct.checkDone, _comments: ct.comments, _attachments: ct.attachments, _preview: ct.preview }}
                      members={members}
                      onClick={() => { setCardOpen(m.id); window.history.replaceState(null, '', `?post=${m.id}`) }}
                      draggable={true}
                      onDragStart={e => { e.dataTransfer.effectAllowed = 'move'; setDraggingId(m.id) }}
                      onMovePrev={prevCol ? () => moveStatus(m.id, prevCol.key) : undefined}
                      onMoveNext={nextCol ? () => moveStatus(m.id, nextCol.key) : undefined}
                      onArchive={col.key === 'finalizado' ? () => archiveMaterial(m.id) : undefined}
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
      )}

      {cardOpen && (
        <MaterialCard
          materialId={cardOpen === 'new' ? undefined : cardOpen}
          clients={clients}
          onClose={() => { setCardOpen(null); window.history.replaceState(null, '', window.location.pathname) }}
          onSaved={reload}
          onDeleted={handleDeleted}
        />
      )}
    </div>
  )
}

export default function MateriaisPage() {
  return (
    <Suspense>
      <MateriaisContent />
    </Suspense>
  )
}
