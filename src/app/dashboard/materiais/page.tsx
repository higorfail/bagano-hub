'use client'

import { Suspense, useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import { useUser } from '@/lib/UserContext'
import MaterialCard from '@/components/MaterialCard'
import MaterialCardMini from '@/components/MaterialCardMini'
import { logActivity } from '@/lib/activity'
import { Archive, ArchiveRestore, Plus } from 'lucide-react'

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
  position?: number
}

// Mesmas quatro colunas do quadro de Extras. "Feito" é onde o designer diz que
// terminou sem que nada seja enviado; "Com o cliente" diz onde a bola está.
// Material não vai pro cliente pelo hub (não existe link público de material),
// então aqui "Com o cliente" é marcação manual de envio por fora.
const COLUMNS = [
  { key: 'producao',             label: 'A fazer',       color: '#F59E0B' },
  { key: 'feito',                label: 'Feito',         color: '#0EA5E9' },
  { key: 'aguardando_aprovacao', label: 'Com o cliente', color: '#EC4899' },
  { key: 'finalizado',           label: 'Finalizados',   color: '#22C55E' },
]
// Status conhecidos: o que não for nenhum deles cai em "A fazer". Sem esta
// lista, 'feito' caía no balaio do fallback e aparecia em duas colunas.
const KNOWN_STATUS = COLUMNS.map(c => c.key)

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
  const [dragOverMaterialId, setDragOverMaterialId] = useState<string | null>(null)
  const [showArchived, setShowArchived] = useState(false)
  // Soltar em cima do Arquivo arquiva — mesmo gesto do quadro de Extras.
  const [archiveDragOver, setArchiveDragOver] = useState(false)

  useEffect(() => {
    const p = searchParams.get('post')
    if (p) setCardOpen(p)
  }, [searchParams.get('post')])

  useEffect(() => {
    async function load() {
      // try/finally: `setLoading(false)` era a última linha, então qualquer
      // falha no meio deixava a tela girando pra sempre — sem erro na tela e
      // sem saída. Agora sai do loading aconteça o que acontecer.
      try {
      const supabase = createClient()
      const [{ data: mats }, { data: cls }] = await Promise.all([
        supabase.from('materials').select('id, client_id, title, type, status, description, ai_summary, due_date, drive_url, assigned_to, assigned_members, labels, created_at, completed_at, archived_at, position').order('position', { ascending: true }).order('created_at', { ascending: false }),
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
      } finally {
        setLoading(false)
      }
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

  // Números do cabeçalho — sobre os materiais ativos, não sobre o que o filtro
  // de cliente está mostrando: é o estado da agência, não da tela.
  const stats = (() => {
    const ativos = materials.filter(m => !m.archived_at)
    const now = new Date()
    return {
      total:   ativos.length,
      done:    ativos.filter(m => m.status === 'finalizado').length,
      overdue: ativos.filter(m => m.due_date && new Date(m.due_date + 'T23:59:59') < now && !['finalizado', 'feito'].includes(m.status || '')).length,
    }
  })()

  function colMaterials(colKey: string) {
    return visible.filter(m => {
      const s = m.status || 'producao'
      if (colKey === 'producao') return s === 'producao' || !KNOWN_STATUS.includes(s)
      return s === colKey
    })
  }

  async function reload() {
    const supabase = createClient()
    const { data } = await supabase.from('materials').select('*').order('created_at', { ascending: false })
    setMaterials(data || [])
  }

  async function moveStatus(id: string, newStatus: string) {
    const labels: Record<string,string> = { producao: 'A fazer', feito: 'Feito', aguardando_aprovacao: 'Com o cliente', finalizado: 'Finalizado' }
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

  // Reordena dentro de uma coluna (drag manual, tipo Trello) — dropId é o card
  // sobre o qual foi solto (o arrastado entra antes dele); dropId null = solto
  // no fim da coluna (área vazia abaixo dos cards).
  async function reorderColumn(colKey: string, draggedId: string, dropId: string | null) {
    const supabase = createClient()
    const prev = materials
    const already = materials.filter(m => {
      if (m.id === draggedId || m.archived_at) return false
      const s = m.status || 'producao'
      return colKey === 'producao' ? (s === 'producao' || !KNOWN_STATUS.includes(s)) : s === colKey
    })
    const dragged = materials.find(m => m.id === draggedId)
    if (!dragged) return
    const insertAt = dropId ? already.findIndex(m => m.id === dropId) : already.length
    const nextOrder = [...already]
    nextOrder.splice(insertAt < 0 ? already.length : insertAt, 0, dragged)

    const prevStatus = dragged.status
    const completedPatch = colKey === 'finalizado' && prevStatus !== 'finalizado' ? { completed_at: new Date().toISOString() } : (colKey !== 'finalizado' ? { completed_at: null } : {})

    setMaterials(ms => {
      const others = ms.filter(m => !(nextOrder.some(n => n.id === m.id)))
      const updated = nextOrder.map((m, i) => ({ ...m, status: colKey, position: i, ...(m.id === draggedId ? completedPatch : {}) }))
      return [...others, ...updated]
    })

    const results = await Promise.all(
      nextOrder.map((m, i) => supabase.from('materials').update({ position: i, status: colKey, ...(m.id === draggedId ? completedPatch : {}) }).eq('id', m.id))
    )
    if (results.some(r => r.error)) setMaterials(prev)
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
          {/* Mesmo formato do Extras: contagem + o que precisa de atenção.
              "menus, cardápios, artes" descrevia o que a equipe já sabe. */}
          <p className="text-[var(--color-text-muted)] text-sm truncate">
            {stats.total} materia{stats.total === 1 ? 'l' : 'is'} · {stats.done} finalizado{stats.done === 1 ? '' : 's'}
            {stats.overdue > 0 && <span style={{ color: '#ef4444' }}> · {stats.overdue} em atraso</span>}
          </p>
        </div>
        {/* Os três numa linha só: o filtro estica pra ocupar a sobra e os dois
            botões ficam no tamanho do próprio texto. "Novo material" encurta
            pra "Novo" no celular — é o rótulo que não cabia e obrigava a
            empurrar tudo pra uma segunda fileira. Todos em h-9: as alturas
            diferentes eram o que deixava a barra torta. */}
        <div className="flex items-center gap-2 w-full md:w-auto">
          <select value={filterClient} onChange={e => setFilterClient(e.target.value)} className="flex-1 md:flex-none min-w-0 h-9 border border-[var(--color-border)] rounded-xl px-3 text-sm bg-[var(--color-bg-card)] outline-none text-[var(--color-text-primary)]">
            <option value="">Todos os clientes</option>
            {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <button
            onClick={() => setShowArchived(s => !s)}
            onDragOver={e => { if (draggingId) { e.preventDefault(); setArchiveDragOver(true) } }}
            onDragLeave={() => setArchiveDragOver(false)}
            onDrop={e => {
              e.preventDefault()
              setArchiveDragOver(false)
              if (draggingId) archiveMaterial(draggingId)
              setDraggingId(null); setDragOverCol(null); setDragOverMaterialId(null)
            }}
            title={draggingId ? 'Solte aqui pra arquivar' : undefined}
            className="h-9 flex-shrink-0 flex items-center justify-center gap-1.5 text-sm font-medium px-3 rounded-xl border transition-colors"
            style={archiveDragOver
              ? { borderColor: 'var(--color-brand)', color: 'var(--color-brand)', background: 'var(--color-bg-subtle)', borderStyle: 'dashed' }
              : showArchived
              ? { borderColor: 'var(--color-accent)', color: 'var(--color-accent)' }
              : { borderColor: 'var(--color-border)', color: 'var(--color-text-secondary)' }}
          >
            {showArchived ? <ArchiveRestore size={14} /> : <Archive size={14} />}
            {showArchived ? 'Ver board' : `Arquivo${archivedCount > 0 ? ` (${archivedCount})` : ''}`}
          </button>
          {/* Criar mora aqui e nasce na primeira coluna. As colunas são etapas
              de um fluxo, não gavetas livres: criar em "Feito" ou
              "Finalizados" não é uma ação que exista. */}
          <button onClick={() => setCardOpen('new')}
            className="h-9 flex-shrink-0 bg-[var(--color-text-primary)] text-[var(--color-bg-page)] rounded-xl px-3 text-sm font-medium">
            + Novo<span className="hidden sm:inline"> material</span>
          </button>
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
      <div className="flex-1 min-h-[60svh] md:min-h-0 overflow-x-auto -mx-4 px-4 md:mx-0 md:px-0 snap-x snap-mandatory md:snap-none">
        {/* Sem min-w-max: as colunas esticam (flex-1) e só param de encolher
            no piso de 268px — aí o trilho passa da largura do pai e a rolagem
            horizontal entra. */}
        <div className="flex gap-3 h-full md:w-full">
        {/* Classes idênticas às do Extras, que encaixa certo. A única diferença
            que este quadro tinha era o `flex-1` no elemento que rola — ele
            existe pra altura no desktop, mas no celular ficava no próprio
            scroller, e era o único quadro do hub onde o encaixe não pegava.
            Não consegui provar a causa lendo o código; convergir pro que
            funciona é mais honesto que inventar uma terceira teoria. */}
        {COLUMNS.map((col, colIdx) => {
          const items      = colMaterials(col.key)
          const isDragOver = dragOverCol === col.key
          const prevCol    = COLUMNS[colIdx - 1]
          const nextCol    = COLUMNS[colIdx + 1]
          return (
            <div key={col.key} className="flex flex-col w-[calc(100vw-2rem)] flex-shrink-0 md:w-auto md:flex-1 md:min-w-[268px] md:flex-shrink snap-center snap-always md:snap-align-none overflow-hidden"
              onDragOver={e => { e.preventDefault(); setDragOverCol(col.key) }}
              onDragLeave={() => setDragOverCol(null)}
              onDrop={e => {
                e.preventDefault()
                if (draggingId) reorderColumn(col.key, draggingId, dragOverMaterialId)
                setDraggingId(null); setDragOverCol(null); setDragOverMaterialId(null)
              }}>
              {/* Cabeçalho idêntico ao do quadro de Extras — parado, não rola
                  com os cards, e com o "+" que só existia lá. */}
              <div className="flex items-center justify-between py-1 px-1 flex-shrink-0">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: col.color }} />
                  <span className="text-xs font-semibold text-[var(--color-text-primary)] truncate">{col.label}</span>
                  <span className="text-[10px] font-bold text-[var(--color-text-muted)] bg-[var(--color-bg-card)] border border-[var(--color-border)] rounded-full w-5 h-5 flex items-center justify-center flex-shrink-0">{items.length}</span>
                </div>
              </div>
              <div className={`flex flex-col gap-2.5 flex-1 min-h-[80px] overflow-y-auto px-1 pb-1 rounded-xl transition-colors ${isDragOver ? 'bg-[var(--color-bg-subtle)] ring-2 ring-[var(--color-brand)]/30' : ''}`}
                style={{ scrollbarGutter: 'stable' }}>
                {items.map(m => {
                  const ct = counts[m.id] || { checklist: 0, checkDone: 0, comments: 0, attachments: 0, preview: null }
                  return (
                    <div key={m.id}
                      onDragOver={e => { e.preventDefault(); e.stopPropagation(); setDragOverCol(col.key); setDragOverMaterialId(m.id) }}>
                      <MaterialCardMini
                        material={{ ...m, _checkTotal: ct.checklist, _checkDone: ct.checkDone, _comments: ct.comments, _attachments: ct.attachments, _preview: ct.preview }}
                        members={members}
                        clientBadge={(() => { const c = clients.find(c => c.id === m.client_id); return c ? { name: c.name, color: c.color_hex } : null })()}
                        onClick={() => { setCardOpen(m.id); window.history.replaceState(null, '', `?post=${m.id}`) }}
                        draggable={true}
                        onDragStart={e => { e.dataTransfer.effectAllowed = 'move'; setDraggingId(m.id) }}
                        onDragEnd={() => { setDraggingId(null); setDragOverCol(null); setDragOverMaterialId(null) }}
                        onMovePrev={prevCol ? () => moveStatus(m.id, prevCol.key) : undefined}
                        onMoveNext={nextCol ? () => moveStatus(m.id, nextCol.key) : undefined}
                        onArchive={col.key === 'finalizado' ? () => archiveMaterial(m.id) : undefined}
                      />
                    </div>
                  )
                })}
                {items.length === 0 && (
                  <div className={`flex items-center justify-center h-20 border-2 border-dashed rounded-xl transition-colors ${isDragOver ? 'border-[var(--color-brand)]' : 'border-[var(--color-border)]'}`}>
                    <p className={`text-[10px] font-medium ${isDragOver ? 'text-[var(--color-brand)]' : 'text-[var(--color-text-faint)]'}`}>
                      {isDragOver ? 'Solte aqui' : '—'}
                    </p>
                  </div>
                )}
              </div>

            </div>
          )
        })}
        </div>
      </div>
      )}

      {cardOpen && (
        <MaterialCard
          // "new:<coluna>" = criando naquela coluna; qualquer outra coisa é id.
          materialId={cardOpen.startsWith('new') ? undefined : cardOpen}
          initialStatus={cardOpen.startsWith('new:') ? cardOpen.slice(4) : undefined}
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
