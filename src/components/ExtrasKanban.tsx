'use client'

import { useState, useEffect, useMemo } from 'react'
import { createClient } from '@/lib/supabase'
import { useUser } from '@/lib/UserContext'
import { Plus, Link2, Check, Camera, Images, Video, Image as ImageIcon, Archive, ArchiveRestore } from 'lucide-react'
import ExtraCard from './ExtraCard'
import ExtraMiniCard from './ExtraMiniCard'
import { copyTextAsync } from '@/lib/clipboard'
import { getOrCreateExtrasApprovalToken, sendFeitoExtrasToClient } from '@/lib/approvalLinks'

type ExtraType     = 'story' | 'carrossel_stories' | 'reels' | 'post'
// 'feito' entrou entre "a fazer" e "com o cliente": o designer termina a arte
// e precisa de um lugar pra dizer isso SEM disparar o envio pro cliente. Antes
// as duas únicas saídas eram deixar em "a fazer" (parece que não fez) ou mover
// pra aprovação — que manda pro cliente na hora.
type ExtraStatus   = 'backlog' | 'feito' | 'aguardando_aprovacao' | 'done'
type ExtraPriority = 'low' | 'normal' | 'high'

interface Extra {
  id: string
  client_id?: string | null
  title: string
  description?: string | null
  type: ExtraType
  status: ExtraStatus
  priority: ExtraPriority
  due_date?: string | null
  drive_url?: string | null
  assigned_member_id?: string | null
  assigned_members?: string[] | null
  labels?: { text: string; color: string }[] | null
  client_approval_status?: string | null
  client_approval_comment?: string | null
  created_at: string
  completed_at?: string | null
  archived_at?: string | null
  position?: number
  clients?: { name: string; color_hex: string } | null
  team_members?: { name: string } | null
}

interface Member { id: string; name: string; role: string }
interface Client { id: string; name: string; color_hex: string }

// "Com o cliente" no lugar de "Em aprovação": diz onde a bola está, que é a
// informação que faltava. Em sentence case porque MAIÚSCULA COM ESPAÇAMENTO
// custa largura de verdade, e com 4 colunas cada pixel conta.
const COLUMNS: { key: ExtraStatus; label: string; color: string }[] = [
  { key: 'backlog',              label: 'A fazer',       color: '#F59E0B' },
  { key: 'feito',                label: 'Feito',         color: '#0EA5E9' },
  { key: 'aguardando_aprovacao', label: 'Com o cliente', color: '#EC4899' },
  { key: 'done',                 label: 'Finalizados',   color: '#22C55E' },
]

const TYPE_CONFIG: Record<ExtraType, { icon: React.ElementType; color: string }> = {
  story:             { icon: Camera,    color: '#8b5cf6' },
  carrossel_stories: { icon: Images,    color: '#6366f1' },
  reels:             { icon: Video,     color: '#ef4444' },
  post:              { icon: ImageIcon, color: '#f59e0b' },
}

const PRIORITY_BORDER: Record<ExtraPriority, string> = {
  low:    '#94a3b8',
  normal: 'var(--color-border)',
  high:   '#ef4444',
}

interface ExtrasKanbanProps {
  clientId?: string | null
  globalMode?: boolean
  members?: Member[]
  initialOpenId?: string | null
  filterClient?: string
  onFilterClientChange?: (v: string) => void
  hideClientFilterUI?: boolean
  showArchived?: boolean
  onShowArchivedChange?: (v: boolean) => void
  /** Criar novo: controlado pelo pai quando o botão mora no header da página.
   *  Mesmo padrão já usado aqui pro filtro de cliente e pro Arquivo. */
  newStatus?: string | null
  onNewStatusChange?: (v: string | null) => void
  /** Título da seção, renderizado À ESQUERDA da própria barra de ações. Sem
   *  isso o pai põe o título acima e as ações caem numa fileira própria
   *  embaixo — duas faixas onde cabia uma. */
  heading?: React.ReactNode
  hideArchiveToggleUI?: boolean
  onArchivedCountChange?: (n: number) => void
}

function formatDue(d: string) {
  const diff = Math.round((new Date(d + 'T12:00:00').getTime() - Date.now()) / 86400000)
  if (diff === 0)  return 'Hoje'
  if (diff === 1)  return 'Amanhã'
  if (diff === -1) return 'Ontem'
  if (diff < -1)   return `${Math.abs(diff)}d atraso`
  return new Date(d + 'T12:00:00').toLocaleDateString('pt-BR', { day: 'numeric', month: 'short' })
}

function isOverdue(due_date?: string | null, status?: ExtraStatus) {
  // 'feito' não conta como atraso: a arte está pronta, o prazo de PRODUÇÃO foi
  // cumprido. Cobrar atraso de trabalho entregue é o tipo de aviso que ensina
  // a equipe a ignorar aviso.
  if (!due_date || status === 'done' || status === 'feito') return false
  return new Date(due_date + 'T23:59:59') < new Date()
}

export default function ExtrasKanban({ clientId, globalMode = false, members = [], initialOpenId, filterClient: filterClientProp, onFilterClientChange, hideClientFilterUI = false, showArchived: showArchivedProp, onShowArchivedChange, hideArchiveToggleUI = false, onArchivedCountChange, newStatus: newStatusProp, onNewStatusChange, heading }: ExtrasKanbanProps) {
  const supabase = createClient()
  const { currentMember, showOnlyMine } = useUser()
  const [extras,  setExtras]  = useState<Extra[]>([])
  const [clients, setClients] = useState<Client[]>([])
  const [loading, setLoading] = useState(true)

  // Modal state — null = closed, string = editing existing, 'new:{status}' = creating in column
  const [openExtraId,     setOpenExtraId]     = useState<string | null>(initialOpenId || null)

  useEffect(() => { if (initialOpenId) setOpenExtraId(initialOpenId) }, [initialOpenId])
  const [internalNewStatus, setInternalNewStatus] = useState<ExtraStatus | null>(null)
  const newStatus    = (newStatusProp !== undefined ? newStatusProp : internalNewStatus) as ExtraStatus | null
  const setNewStatus = (onNewStatusChange || setInternalNewStatus) as (v: ExtraStatus | null) => void

  // Client filter (global mode) — controlado pelo pai (header da página) quando as props vêm preenchidas
  const [internalFilterClient, setInternalFilterClient] = useState<string>('all')
  const filterClient = filterClientProp !== undefined ? filterClientProp : internalFilterClient
  const setFilterClient = onFilterClientChange || setInternalFilterClient

  // Drag and drop
  const [draggingId,   setDraggingId]   = useState<string | null>(null)
  const [dragOverCol,  setDragOverCol]  = useState<ExtraStatus | null>(null)
  const [dragOverExtraId, setDragOverExtraId] = useState<string | null>(null)
  const [checkCounts,  setCheckCounts]  = useState<Record<string, { done: number; total: number }>>({})
  const [commentCounts, setCommentCounts] = useState<Record<string, number>>({})
  const [attachCounts, setAttachCounts] = useState<Record<string, number>>({})
  const [copiedLink, setCopiedLink] = useState(false)
  // Soltar um card em cima do botão Arquivo arquiva — o caminho que existia
  // era abrir o card ou achar o ícone que só aparece no hover da coluna final.
  const [archiveDragOver, setArchiveDragOver] = useState(false)
  const [internalShowArchived, setInternalShowArchived] = useState(false)
  const showArchived = showArchivedProp !== undefined ? showArchivedProp : internalShowArchived
  const setShowArchived = onShowArchivedChange || setInternalShowArchived

  async function archiveExtra(id: string) {
    setExtras(prev => prev.map(e => e.id === id ? { ...e, archived_at: new Date().toISOString() } : e))
    await supabase.from('extras').update({ archived_at: new Date().toISOString() }).eq('id', id)
  }
  async function unarchiveExtra(id: string) {
    setExtras(prev => prev.map(e => e.id === id ? { ...e, archived_at: null } : e))
    await supabase.from('extras').update({ archived_at: null }).eq('id', id)
  }

  async function copyExtrasApprovalLink() {
    if (!clientId) return
    // Copiar o link É o envio: o que está em "Feito" passa pra "Com o cliente"
    // junto. Sem isso o cliente abriria uma página vazia, porque a tela de
    // aprovação só lista extra com client_approval_status = 'aguardando'.
    let enviados = 0
    const ok = await copyTextAsync(async () => {
      enviados = await sendFeitoExtrasToClient(clientId)
      const token = await getOrCreateExtrasApprovalToken(clientId)
      if (!token) throw new Error('sem token')
      return `${window.location.origin}/aprovar/${token}`
    })
    if (!ok) return
    if (enviados > 0) {
      setExtras(prev => prev.map(e => e.status === 'feito' && !e.archived_at
        ? { ...e, status: 'aguardando_aprovacao' as ExtraStatus, client_approval_status: 'aguardando' } : e))
    }
    setCopiedLink(true)
    setTimeout(() => setCopiedLink(false), 2000)
  }

  async function load() {
    // Mesmo motivo do quadro de Materiais: sem `finally`, uma falha no meio
    // prendia o quadro no estado de carregando pra sempre.
    setLoading(true)
    try {
    let q = supabase
      .from('extras')
      .select('*')
      .order('position', { ascending: true })
      .order('created_at', { ascending: true })
    if (clientId) q = q.eq('client_id', clientId)

    const { data, error } = await q
    if (error) console.error('ExtrasKanban load error:', error)
    if (data) setExtras(data as Extra[])

    // Always load clients for name lookup (even in non-global mode)
    const { data: cl } = await supabase.from('clients').select('id, name, color_hex').eq('status', 'active').order('name')
    if (cl) setClients(cl)

    // Progresso do checklist por extra
    const { data: chk } = await supabase.from('extra_checklist').select('extra_id, done')
    const cc: Record<string, { done: number; total: number }> = {}
    ;(chk || []).forEach((x: any) => {
      if (!cc[x.extra_id]) cc[x.extra_id] = { done: 0, total: 0 }
      cc[x.extra_id].total++
      if (x.done) cc[x.extra_id].done++
    })
    setCheckCounts(cc)

    // Nº de comentários por extra
    const { data: cms } = await supabase.from('extra_comments').select('extra_id')
    const cmc: Record<string, number> = {}
    ;(cms || []).forEach((x: any) => { cmc[x.extra_id] = (cmc[x.extra_id] || 0) + 1 })
    setCommentCounts(cmc)

    // Anexos (link colado + arquivo enviado) — o card de Material já mostrava
    // esse contador e o de Extra não. `extra_uploads` ainda pode estar sem
    // permissão pra anon; erro aqui vira console, não lista vazia calada.
    const [attsR, upsR] = await Promise.all([
      supabase.from('extra_attachments').select('extra_id'),
      supabase.from('extra_uploads').select('extra_id'),
    ])
    if (attsR.error || upsR.error) console.error('[anexos] contagem falhou no quadro de Extras:', attsR.error || upsR.error)
    const atc: Record<string, number> = {}
    ;[...(attsR.data || []), ...(upsR.data || [])].forEach((x: any) => { atc[x.extra_id] = (atc[x.extra_id] || 0) + 1 })
    setAttachCounts(atc)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [clientId])

  async function moveStatus(id: string, status: ExtraStatus) {
    const prevStatus = extras.find(e => e.id === id)?.status
    const patch: Record<string, any> = { status }
    if (status === 'done' && prevStatus !== 'done') patch.completed_at = new Date().toISOString()
    if (status !== 'done') patch.completed_at = null
    setExtras(prev => prev.map(e => e.id === id ? { ...e, ...patch } : e))
    const { error } = await supabase.from('extras').update(patch).eq('id', id)
    if (error) console.error('moveStatus error:', error)
  }

  // Reordena dentro de uma coluna (drag manual, tipo Trello) — dropId é o card
  // sobre o qual foi solto (o arrastado entra antes dele); dropId null = solto
  // no fim da coluna (área vazia abaixo dos cards).
  async function reorderColumn(colKey: ExtraStatus, draggedId: string, dropId: string | null) {
    const prev = extras
    const already = extras.filter(e => e.status === colKey && e.id !== draggedId)
    const dragged = extras.find(e => e.id === draggedId)
    if (!dragged) return
    const insertAt = dropId ? already.findIndex(e => e.id === dropId) : already.length
    const nextOrder = [...already]
    nextOrder.splice(insertAt < 0 ? already.length : insertAt, 0, dragged)

    const prevStatus = dragged.status
    const completedPatch = colKey === 'done' && prevStatus !== 'done' ? { completed_at: new Date().toISOString() } : (colKey !== 'done' ? { completed_at: null } : {})

    // Mesma sincronização do ExtraCard (changeStatus) — arrastar o card no
    // Kanban é OUTRO jeito de mudar o status, além do seletor dentro do card.
    // "Feito" é o único que não mexe na aprovação: terminou, nada foi enviado.
    // Arrastar pra "Com o cliente" continua mandando na hora, mesmo com o
    // envio automático pelo link — quem mandou por WhatsApp marca aqui.
    let approvalPatch: string | null | undefined
    if (prevStatus !== colKey) {
      if (colKey === 'feito') approvalPatch = undefined
      else if (colKey === 'aguardando_aprovacao') approvalPatch = dragged.client_approval_status === 'aguardando' ? undefined : 'aguardando'
      else if (colKey === 'done') approvalPatch = dragged.client_approval_status === 'aprovado' ? undefined : 'aprovado'
      else if (colKey === 'backlog') approvalPatch = dragged.client_approval_status ? null : undefined
    }
    const approvalPatchObj = approvalPatch !== undefined ? { client_approval_status: approvalPatch } : {}

    setExtras(es => {
      const others = es.filter(e => e.status !== colKey && e.id !== draggedId)
      const updated = nextOrder.map((e, i) => ({ ...e, status: colKey, position: i, ...(e.id === draggedId ? { ...completedPatch, ...approvalPatchObj } : {}) }))
      return [...others, ...updated]
    })

    const results = await Promise.all(
      nextOrder.map((e, i) => supabase.from('extras').update({ position: i, status: colKey, ...(e.id === draggedId ? { ...completedPatch, ...approvalPatchObj } : {}) }).eq('id', e.id))
    )
    if (results.some(r => r.error)) setExtras(prev)
  }

  function handleSaved(extra: Extra) {
    setExtras(prev => {
      const exists = prev.some(e => e.id === extra.id)
      return exists ? prev.map(e => e.id === extra.id ? extra : e) : [...prev, extra]
    })
    setOpenExtraId(null)
    setNewStatus(null)
  }

  function handleDeleted(id: string) {
    setExtras(prev => prev.filter(e => e.id !== id))
    setOpenExtraId(null)
    setNewStatus(null)
  }

  const clientMap = useMemo(() => Object.fromEntries(clients.map(c => [c.id, c])), [clients])

  const archivedCount = useMemo(() => extras.filter(e => e.archived_at).length, [extras])
  useEffect(() => { onArchivedCountChange?.(archivedCount) }, [archivedCount, onArchivedCountChange])

  const filtered = useMemo(() => extras.filter(e => {
    if (showArchived ? !e.archived_at : !!e.archived_at) return false
    if (showOnlyMine && currentMember) {
      const assigned = e.assigned_members?.length ? e.assigned_members : e.assigned_member_id ? [e.assigned_member_id] : []
      if (!assigned.includes(currentMember.id)) return false
    }
    if (!globalMode) return true
    if (filterClient === 'all')    return true
    if (filterClient === 'global') return !e.client_id
    return e.client_id === filterClient
  }), [extras, globalMode, filterClient, showOnlyMine, currentMember, showArchived])

  if (loading) return (
    <div className="flex items-center justify-center py-12">
      <div className="w-5 h-5 border-2 border-[var(--color-border)] border-t-[var(--color-text-muted)] rounded-full animate-spin" />
    </div>
  )

  return (
    <div className="flex flex-col gap-3 h-full min-h-0">

      {/* Uma barra só: antes o link de aprovação e o Arquivo eram dois blocos
          justify-end separados, cada um numa linha própria e com a largura do
          próprio texto — duas faixas gastas e nenhuma margem em comum. Todos
          em h-8 e alinhados à direita a partir do mesmo ponto. */}
      {(heading || clientId || (globalMode && !hideClientFilterUI) || !hideArchiveToggleUI) && (
        <div className="flex items-center gap-2 flex-wrap">
          {heading && <div className="min-w-0 mr-auto">{heading}</div>}
          {globalMode && !hideClientFilterUI && (
            <>
              <select value={filterClient} onChange={e => setFilterClient(e.target.value)}
                className="h-8 text-sm rounded-lg border bg-[var(--color-bg-card)] px-3 outline-none font-medium"
                style={filterClient !== 'all'
                  ? { borderColor: clients.find(c => c.id === filterClient)?.color_hex || 'var(--color-border-strong)', color: 'var(--color-text-primary)' }
                  : { borderColor: 'var(--color-border)', color: 'var(--color-text-secondary)' }}>
                <option value="all">Todos os clientes</option>
                {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                <option value="global">Sem cliente</option>
              </select>
              {filterClient !== 'all' && (
                <button onClick={() => setFilterClient('all')} className="text-xs text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] transition-colors">✕ limpar</button>
              )}
            </>
          )}
          <div className="flex items-center gap-2 ml-auto">
            {clientId && (
              <button onClick={copyExtrasApprovalLink}
                className="h-8 flex items-center gap-1.5 text-xs font-semibold px-3 rounded-lg border transition-colors"
                style={copiedLink
                  ? { borderColor: 'var(--ds-success-border)', color: 'var(--ds-success-text)', background: 'var(--ds-success-bg)' }
                  : { borderColor: 'var(--color-border)', color: 'var(--color-text-secondary)' }}>
                {copiedLink ? <><Check size={12} /> Link copiado!</> : <><Link2 size={12} /> <span className="hidden sm:inline">Link de aprovação dos extras</span><span className="sm:hidden">Link de aprovação</span></>}
              </button>
            )}
            {!hideArchiveToggleUI && (
              <button
                onClick={() => setShowArchived(!showArchived)}
                onDragOver={e => { if (draggingId) { e.preventDefault(); setArchiveDragOver(true) } }}
                onDragLeave={() => setArchiveDragOver(false)}
                onDrop={e => {
                  e.preventDefault()
                  setArchiveDragOver(false)
                  const id = e.dataTransfer.getData('extraId') || draggingId
                  if (id) archiveExtra(id)
                  setDraggingId(null); setDragOverCol(null); setDragOverExtraId(null)
                }}
                title={draggingId ? 'Solte aqui pra arquivar' : undefined}
                className="h-8 flex items-center gap-1.5 text-xs font-medium px-2.5 rounded-lg border transition-colors flex-shrink-0"
                style={archiveDragOver
                  ? { borderColor: 'var(--color-brand)', color: 'var(--color-brand)', background: 'var(--color-bg-subtle)', borderStyle: 'dashed' }
                  : showArchived
                  ? { borderColor: 'var(--color-accent)', color: 'var(--color-accent)', background: 'var(--color-accent)/8' }
                  : { borderColor: 'var(--color-border)', color: 'var(--color-text-secondary)' }}
              >
                {showArchived ? <ArchiveRestore size={13} /> : <Archive size={13} />}
                {showArchived ? 'Ver board' : `Arquivo${archivedCount > 0 ? ` (${archivedCount})` : ''}`}
              </button>
            )}
            {/* Só quando o pai não controla a criação — na página de Extras o
                botão mora no header dela, e dois botões iguais seria ruído. */}
            {onNewStatusChange === undefined && (
              <button onClick={() => setNewStatus('backlog')}
                className="h-8 flex-shrink-0 bg-[var(--color-text-primary)] text-[var(--color-bg-page)] rounded-lg px-3 text-xs font-medium">
                + Novo extra
              </button>
            )}
          </div>
        </div>
      )}

      {showArchived ? (
        <div className="flex flex-col gap-2">
          {filtered.length === 0 && (
            <p className="text-sm text-[var(--color-text-faint)] text-center py-8">Nenhum item arquivado.</p>
          )}
          {filtered.map(extra => (
            <div key={extra.id} className="flex items-center gap-3 bg-[var(--color-bg-card)] border border-[var(--color-border)] rounded-xl px-3 py-2.5">
              <button onClick={() => { setOpenExtraId(extra.id); window.history.replaceState(null, '', `?post=${extra.id}`) }} className="flex-1 min-w-0 text-left flex items-center gap-2">
                {globalMode && extra.client_id && clientMap[extra.client_id] && (
                  <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full text-white flex-shrink-0" style={{ background: clientMap[extra.client_id].color_hex }}>
                    {clientMap[extra.client_id].name}
                  </span>
                )}
                <span className="text-sm text-[var(--color-text-primary)] truncate">{extra.title}</span>
              </button>
              <button onClick={() => unarchiveExtra(extra.id)} title="Desarquivar" className="flex items-center gap-1.5 text-xs font-medium px-2.5 py-1.5 rounded-lg text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-subtle)] transition-colors flex-shrink-0">
                <ArchiveRestore size={13} /> Desarquivar
              </button>
            </div>
          ))}
        </div>
      ) : (
      /* Estrutura copiada do Kanban de posts, que é o único quadro do hub onde
         a rolagem por coluna já funciona nos três tamanhos de tela: o trilho
         rola na horizontal com encaixe, cada coluna tem largura fixa de 268px
         (a medida de lista do Trello) e SÓ a área de cards rola na vertical.
         Cabeçalho e botão de adicionar ficam parados.

         Largura fixa em vez de dividir a tela: com 4 colunas, dividir daria
         164px por coluna no iPad em retrato — uma tira onde não cabe título e
         etiqueta na mesma linha. Fixo, o quadro rola quando não couber. */
      <div className="flex-1 min-h-[60svh] md:min-h-0 overflow-x-auto -mx-4 px-4 md:mx-0 md:px-0 snap-x snap-mandatory md:snap-none">
        {/* Sem min-w-max: as colunas ESTICAM pra ocupar a largura disponível
            (flex-1) e só param de encolher no piso de 268px — aí o trilho
            passa da largura do pai e a rolagem horizontal entra. */}
        <div className="flex gap-3 h-full md:w-full">
        {COLUMNS.map(col => {
          const colExtras = filtered.filter(e => e.status === col.key)
          const isDragTarget = dragOverCol === col.key && draggingId !== null

          return (
            <div key={col.key} className="flex flex-col w-[calc(100vw-2rem)] flex-shrink-0 md:w-auto md:flex-1 md:min-w-[268px] md:flex-shrink snap-center snap-always md:snap-align-none overflow-hidden"
              onDragOver={e => { e.preventDefault(); setDragOverCol(col.key) }}
              onDragLeave={e => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragOverCol(null) }}
              onDrop={e => {
                e.preventDefault()
                const id = e.dataTransfer.getData('extraId')
                if (id) reorderColumn(col.key, id, dragOverExtraId)
                setDraggingId(null)
                setDragOverCol(null)
                setDragOverExtraId(null)
              }}
            >
              {/* Cabeçalho — parado, não rola com os cards. Contador aparece
                  mesmo em zero: num quadro, coluna vazia é informação. */}
              <div className="flex items-center justify-between py-1 px-1 flex-shrink-0">
                <div className="flex items-center gap-2 min-w-0">
                  <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: col.color }} />
                  <span className="text-xs font-semibold text-[var(--color-text-primary)] truncate">{col.label}</span>
                  <span className="text-[10px] font-bold text-[var(--color-text-muted)] bg-[var(--color-bg-card)] border border-[var(--color-border)] rounded-full w-5 h-5 flex items-center justify-center flex-shrink-0">{colExtras.length}</span>
                </div>
              </div>

              {/* Só esta área rola. */}
              <div className={`flex flex-col gap-2 flex-1 min-h-[80px] overflow-y-auto px-1 pb-1 rounded-xl transition-colors ${isDragTarget ? 'bg-[var(--color-bg-subtle)] ring-2 ring-[var(--color-brand)]/30' : ''}`}
                style={{ scrollbarGutter: 'stable' }}>
                {colExtras.map(extra => {
                  const assignedData = extra.assigned_members
                    ? members.filter(m => extra.assigned_members!.includes(m.id))
                    : []
                  return (
                    <div key={extra.id}
                      onDragOver={e => { e.preventDefault(); e.stopPropagation(); setDragOverCol(col.key); setDragOverExtraId(extra.id) }}>
                      <ExtraMiniCard
                        extra={extra}
                        TypeIcon={(TYPE_CONFIG[extra.type] || TYPE_CONFIG.post).icon}
                        typeColor={(TYPE_CONFIG[extra.type] || TYPE_CONFIG.post).color}
                        priorityColor={PRIORITY_BORDER[extra.priority]}
                        assignedData={assignedData}
                        chk={checkCounts[extra.id]}
                        commentCount={commentCounts[extra.id] || 0}
                        attachCount={attachCounts[extra.id] || 0}
                        onMovePrev={COLUMNS[COLUMNS.findIndex(c => c.key === col.key) - 1] ? () => moveStatus(extra.id, COLUMNS[COLUMNS.findIndex(c => c.key === col.key) - 1].key) : undefined}
                        onMoveNext={COLUMNS[COLUMNS.findIndex(c => c.key === col.key) + 1] ? () => moveStatus(extra.id, COLUMNS[COLUMNS.findIndex(c => c.key === col.key) + 1].key) : undefined}
                        clientBadge={globalMode && extra.client_id && clientMap[extra.client_id] ? { name: clientMap[extra.client_id].name, color: clientMap[extra.client_id].color_hex } : null}
                        showGlobalBadge={globalMode && !extra.client_id}
                        dragging={draggingId === extra.id}
                        onDragStart={e => {
                          e.dataTransfer.setData('extraId', extra.id)
                          setDraggingId(extra.id)
                        }}
                        onDragEnd={() => { setDraggingId(null); setDragOverCol(null); setDragOverExtraId(null) }}
                        onClick={() => { if (!draggingId) { setOpenExtraId(extra.id); window.history.replaceState(null, '', `?post=${extra.id}`) } }}
                        onArchive={col.key === 'done' ? () => archiveExtra(extra.id) : undefined}
                      />
                    </div>
                  )
                })}

                {/* Coluna vazia: alvo de soltar, e não um botão — o de criar
                    mora no rodapé agora, e vale cheia ou vazia. */}
                {colExtras.length === 0 && (
                  <div className={`flex items-center justify-center h-20 border-2 border-dashed rounded-xl transition-colors ${isDragTarget ? 'border-[var(--color-brand)]' : 'border-[var(--color-border)]'}`}>
                    <p className={`text-[10px] font-medium ${isDragTarget ? 'text-[var(--color-brand)]' : 'text-[var(--color-text-faint)]'}`}>
                      {isDragTarget ? 'Solte aqui' : '—'}
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

      {/* ExtraCard — edit existing */}
      {openExtraId && (
        <ExtraCard
          extraId={openExtraId}
          fixedClientId={clientId}
          clients={globalMode ? clients : []}
          members={members}
          onClose={() => { setOpenExtraId(null); window.history.replaceState(null, '', window.location.pathname) }}
          onSaved={handleSaved}
          onDeleted={handleDeleted}
        />
      )}

      {/* ExtraCard — create new in column */}
      {newStatus && (
        <ExtraCard
          initialStatus={newStatus}
          fixedClientId={clientId}
          clients={globalMode ? clients : []}
          members={members}
          onClose={() => setNewStatus(null)}
          onSaved={handleSaved}
          onDeleted={handleDeleted}
        />
      )}
    </div>
  )
}
