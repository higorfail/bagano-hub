'use client'

import { useEffect, useState, useMemo, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import { useUser } from '@/lib/UserContext'
import TaskMiniCard from '@/components/TaskMiniCard'
import TaskCard from '@/components/TaskCard'
import { Plus, ChevronRight, ChevronDown } from 'lucide-react'

const COLUMNS = [
  { key: 'a_fazer', label: 'A fazer', color: '#6B7280' },
  { key: 'fazendo',  label: 'Fazendo', color: '#F59E0B' },
  { key: 'feito',    label: 'Feito',    color: '#22C55E' },
]

type Client = { id: string; name: string; color_hex: string }

export default function TarefasPage() {
  return <Suspense><TarefasPageInner /></Suspense>
}

function TarefasPageInner() {
  useEffect(() => { document.title = 'Quadro pessoal · Bagano Hub' }, [])
  const supabase = createClient()
  const searchParams = useSearchParams()
  const { currentMember, members } = useUser()

  const [tasks, setTasks] = useState<any[]>([])
  const [delegatedTasks, setDelegatedTasks] = useState<any[]>([])
  const [clients, setClients] = useState<Client[]>([])
  const [previewMap, setPreviewMap] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)
  const [openTaskId, setOpenTaskId] = useState<string | null>(searchParams.get('task'))
  const [showNewFor, setShowNewFor] = useState<string | null>(null)
  const [draggingId, setDraggingId] = useState<string | null>(null)
  const [dragOverCol, setDragOverCol] = useState<string | null>(null)
  const [dragOverTaskId, setDragOverTaskId] = useState<string | null>(null)
  const [showDelegated, setShowDelegated] = useState(false)

  const clientMap = useMemo(() => Object.fromEntries(clients.map(c => [c.id, c])), [clients])

  // Ordem estável das notas (por criação) — decide a cor de cada post-it
  const notesOrder = useMemo(
    () => tasks.filter(t => t.type === 'nota').sort((a, b) => a.created_at.localeCompare(b.created_at)).map(t => t.id),
    [tasks]
  )

  async function load() {
    if (!currentMember) return
    setLoading(true)
    const [{ data: t }, { data: cl }, { data: dt }] = await Promise.all([
      supabase.from('personal_tasks').select('*').eq('assigned_to', currentMember.id).order('position', { ascending: true }).order('created_at', { ascending: false }),
      supabase.from('clients').select('id, name, color_hex').eq('status', 'active').order('name'),
      // Cartões que VOCÊ criou pra outra pessoa — some do seu quadro, mas você
      // ainda quer acompanhar o andamento do que delegou.
      supabase.from('personal_tasks').select('*').eq('created_by', currentMember.id).neq('assigned_to', currentMember.id).order('created_at', { ascending: false }),
    ])
    setTasks(t || [])
    setClients(cl || [])
    setDelegatedTasks(dt || [])
    setLoading(false)

    const ids = (t || []).map((x: any) => x.id)
    if (ids.length > 0) {
      const { data: ups } = await supabase.from('personal_task_uploads').select('task_id, file_url, mime_type').in('task_id', ids).order('created_at', { ascending: true })
      const map: Record<string, string> = {}
      ;(ups || []).forEach((u: any) => { if (!map[u.task_id] && (u.mime_type || '').startsWith('image/')) map[u.task_id] = u.file_url })
      setPreviewMap(map)
    } else {
      setPreviewMap({})
    }
  }

  useEffect(() => { load() }, [currentMember?.id])

  async function moveStatus(taskId: string, status: string) {
    const prev = tasks
    setTasks(ts => ts.map(t => t.id === taskId ? { ...t, status } : t))
    const completedPatch = status === 'feito' ? { completed_at: new Date().toISOString() } : { completed_at: null }
    const { error } = await supabase.from('personal_tasks').update({ status, ...completedPatch }).eq('id', taskId)
    if (error) setTasks(prev)
  }

  // Reordena dentro de uma coluna (drag manual, tipo Trello) — dropId é o card
  // sobre o qual foi solto (o arrastado entra antes dele); dropId null = solto
  // no fim da coluna (área vazia abaixo dos cards).
  async function reorderColumn(colKey: string, draggedId: string, dropId: string | null) {
    const prev = tasks
    const already = tasks.filter(t => t.status === colKey && t.id !== draggedId)
    const dragged = tasks.find(t => t.id === draggedId)
    if (!dragged) return
    const insertAt = dropId ? already.findIndex(t => t.id === dropId) : already.length
    const nextOrder = [...already]
    nextOrder.splice(insertAt < 0 ? already.length : insertAt, 0, dragged)

    const wasAjusteStatus = dragged.status
    const completedPatch = colKey === 'feito' ? { completed_at: new Date().toISOString() } : (wasAjusteStatus === 'feito' ? { completed_at: null } : {})

    setTasks(ts => {
      const others = ts.filter(t => t.status !== colKey && t.id !== draggedId)
      const updated = nextOrder.map((t, i) => ({ ...t, status: colKey, position: i, ...(t.id === draggedId ? completedPatch : {}) }))
      return [...others, ...updated]
    })

    const results = await Promise.all(
      nextOrder.map((t, i) => supabase.from('personal_tasks').update({ position: i, status: colKey, ...(t.id === draggedId ? completedPatch : {}) }).eq('id', t.id))
    )
    if (results.some(r => r.error)) setTasks(prev)
  }

  async function deleteTask(taskId: string) {
    const prev = tasks
    setTasks(ts => ts.filter(t => t.id !== taskId))
    const { error } = await supabase.from('personal_tasks').delete().eq('id', taskId)
    if (error) setTasks(prev)
  }

  function closeCard() {
    setOpenTaskId(null)
    setShowNewFor(null)
    window.history.replaceState(null, '', '/dashboard/tarefas')
  }

  if (!currentMember) return (
    <div className="flex items-center justify-center h-full">
      <div className="w-5 h-5 border-2 border-[var(--color-border)] border-t-[var(--color-accent)] rounded-full animate-spin" />
    </div>
  )

  return (
    <div className="min-h-screen bg-[var(--color-bg-page)]">
      <div className="max-w-[1200px] mx-auto px-4 md:px-8 py-6 md:py-8">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-[var(--color-text-primary)] tracking-tight">Quadro pessoal</h1>
          <p className="text-sm text-[var(--color-text-muted)] mt-1">Seu quadro — tarefas, lembretes e notas. Só você vê isso, mas pode atribuir um cartão pra outra pessoa. Arraste pra reordenar ou mudar de coluna.</p>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="w-5 h-5 border-2 border-[var(--color-border)] border-t-[var(--color-accent)] rounded-full animate-spin" />
          </div>
        ) : (
          <div className="flex md:grid md:grid-cols-3 gap-5 overflow-x-auto snap-x snap-mandatory md:snap-none -mx-4 px-4 md:mx-0 md:px-0 pb-2 md:pb-0 items-stretch min-h-[60svh] md:min-h-0">
            {/* min-h no celular: quem rola de lado é ESTE elemento, e a altura
                dele vinha do conteúdo — com poucos cards ele terminava logo
                abaixo do último, então o dedo só arrastava naquela faixa de
                cima. Embaixo, no vazio, o toque caía na página e nada
                acontecia. Agora o quadro ocupa a tela e o vazio arrasta igual. */}
            {COLUMNS.map(col => {
              const colTasks = tasks.filter(t => t.status === col.key)
              const isDragTarget = dragOverCol === col.key && draggingId !== null
              return (
                <div key={col.key} className="flex flex-col gap-2 w-[calc(100vw-2rem)] flex-shrink-0 snap-center snap-always md:w-auto md:flex-shrink md:snap-align-none"
                  onDragOver={e => { e.preventDefault(); setDragOverCol(col.key) }}
                  onDragLeave={e => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragOverCol(null) }}
                  onDrop={e => {
                    e.preventDefault()
                    const tid = e.dataTransfer.getData('taskId')
                    if (tid) reorderColumn(col.key, tid, dragOverTaskId)
                    setDraggingId(null); setDragOverCol(null); setDragOverTaskId(null)
                  }}>
                  <div className="flex items-center justify-between py-1">
                    <div className="flex items-center gap-2">
                      <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: col.color }} />
                      <span className="text-xs font-semibold text-[var(--color-text-muted)] uppercase tracking-wider">{col.label}</span>
                      {colTasks.length > 0 && (
                        <span className="text-[10px] font-medium text-[var(--color-text-faint)] bg-[var(--color-bg-subtle)] px-1.5 py-0.5 rounded-full">{colTasks.length}</span>
                      )}
                    </div>
                    <button onClick={() => setShowNewFor(col.key)}
                      className="w-6 h-6 rounded-lg hover:bg-[var(--color-bg-subtle)] flex items-center justify-center text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] transition-colors"
                      title="Adicionar">
                      <Plus size={13} />
                    </button>
                  </div>

                  {/* flex-1: a lista cresce até o fim da coluna, então largar
                      um card no vazio embaixo também conta como soltar aqui. */}
                  <div className={`flex flex-col gap-2 flex-1 min-h-[80px] rounded-xl transition-colors ${isDragTarget ? 'bg-[var(--color-bg-subtle)] ring-2 ring-[var(--color-brand)]/30' : ''}`}>
                    {colTasks.map(t => (
                      <div key={t.id}
                        onDragOver={e => { e.preventDefault(); e.stopPropagation(); setDragOverCol(col.key); setDragOverTaskId(t.id) }}>
                        <TaskMiniCard task={t} clientMap={clientMap} previewUrl={previewMap[t.id]}
                          noteIndex={notesOrder.indexOf(t.id)} totalNotes={notesOrder.length}
                          draggable
                          onDragStart={e => { e.dataTransfer.setData('taskId', t.id); setDraggingId(t.id) }}
                          onClick={() => { if (!draggingId) { setOpenTaskId(t.id); window.history.replaceState(null, '', `?task=${t.id}`) } }}
                          onMarkDone={col.key !== 'feito' ? () => moveStatus(t.id, 'feito') : undefined}
                          onDelete={() => deleteTask(t.id)}
                        />
                      </div>
                    ))}
                    {colTasks.length === 0 && !isDragTarget && (
                      <button onClick={() => setShowNewFor(col.key)}
                        className="text-xs text-[var(--color-text-faint)] hover:text-[var(--color-text-muted)] text-center py-6 border border-dashed border-[var(--color-border)] rounded-xl transition-colors">
                        Nada aqui ainda
                      </button>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {!loading && delegatedTasks.length > 0 && (
          <div className="mt-8 pt-4 border-t border-[var(--color-border)]">
            <button onClick={() => setShowDelegated(v => !v)}
              className="flex items-center gap-1.5 text-xs font-medium text-[var(--color-text-faint)] hover:text-[var(--color-text-muted)] transition-colors">
              {showDelegated ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
              Delegadas por você
              <span className="text-[10px] bg-[var(--color-bg-subtle)] px-1.5 py-0.5 rounded-full">{delegatedTasks.length}</span>
            </button>

            {showDelegated && (
              <div className="mt-3 flex flex-col gap-1">
                {delegatedTasks.map(t => {
                  const assigneeMember = members.find((m: any) => m.id === t.assigned_to)
                  const statusCol = COLUMNS.find(c => c.key === t.status)
                  return (
                    <button key={t.id}
                      onClick={() => { setOpenTaskId(t.id); window.history.replaceState(null, '', `?task=${t.id}`) }}
                      className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-left hover:bg-[var(--color-bg-subtle)] transition-colors">
                      <div className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: statusCol?.color || '#6B7280' }} />
                      <span className="text-xs text-[var(--color-text-muted)] truncate flex-1">{t.title || 'Sem título'}</span>
                      {assigneeMember && (
                        <span className="text-[10px] text-[var(--color-text-faint)] flex-shrink-0">{assigneeMember.name}</span>
                      )}
                      <span className="text-[10px] text-[var(--color-text-faint)] flex-shrink-0">{statusCol?.label}</span>
                    </button>
                  )
                })}
              </div>
            )}
          </div>
        )}
      </div>

      {(openTaskId || showNewFor) && (
        <TaskCard
          taskId={openTaskId || undefined}
          defaultAssignedTo={currentMember.id}
          defaultStatus={showNewFor || undefined}
          clients={clients}
          onClose={closeCard}
          onSaved={load}
          onDeleted={() => { load(); closeCard() }}
        />
      )}
    </div>
  )
}
