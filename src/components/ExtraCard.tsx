'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { createClient } from '@/lib/supabase'
import { useUser } from '@/lib/UserContext'
import { logActivity } from '@/lib/activity'
import { useToast } from '@/lib/ToastContext'
import { useMentions, renderWithMentions } from '@/lib/useMentions'
import { autoGrow } from '@/lib/autoGrow'
import { ensureWatching } from '@/lib/watch'
import WatchButton from '@/components/WatchButton'
import { generateAiSummary } from '@/lib/aiSummary'
import { DriveThumbnail, FolderThumbnail } from '@/components/DriveThumbnail'
import EditableField from '@/components/EditableField'
import ModalPortal from '@/components/ModalPortal'
import DeliverySection from '@/components/DeliverySection'
import PropertyPill, { pillSelectCls } from '@/components/PropertyPill'
import {
  X, Calendar, CheckSquare, Paperclip,
  Trash2, Link2, Check,
  FileText, Bell, ChevronRight, ChevronDown, Package, ExternalLink, Send, Users, Tag, Pencil
} from 'lucide-react'

type ExtraType     = 'todo' | 'note' | 'reminder'
type ExtraStatus   = 'backlog' | 'doing' | 'done'
type ExtraPriority = 'low' | 'normal' | 'high'

const TYPE_OPTIONS: { value: ExtraType; label: string; icon: React.ElementType; color: string }[] = [
  { value: 'todo',     label: 'Tarefa',   icon: CheckSquare, color: '#3b82f6' },
  { value: 'note',     label: 'Nota',     icon: FileText,    color: '#f59e0b' },
  { value: 'reminder', label: 'Lembrete', icon: Bell,        color: '#8b5cf6' },
]
const STATUS_OPTIONS: { value: ExtraStatus; label: string; color: string }[] = [
  { value: 'backlog', label: 'A fazer',      color: '#6b7280' },
  { value: 'doing',   label: 'Em andamento', color: '#3b82f6' },
  { value: 'done',    label: 'Concluído',    color: '#22c55e' },
]
const PRIORITY_OPTIONS: { value: ExtraPriority; label: string; color: string }[] = [
  { value: 'low',    label: 'Baixa',  color: '#94a3b8' },
  { value: 'normal', label: 'Normal', color: '#6b7280' },
  { value: 'high',   label: 'Alta',   color: '#ef4444' },
]
const TYPE_KEYWORDS: Record<ExtraType, string[]> = {
  reminder: ['lembrar', 'lembrete', 'lembrança', 'não esquecer', 'não esqueça', 'avisar', 'aviso', 'alerta', 'reminder', 'remind'],
  note:     ['nota', 'anotação', 'anotar', 'observação', 'obs:', 'obs ', 'ideia', 'ideias', 'referência', 'ref:', 'pesquisa', 'insight', 'note'],
  todo:     ['fazer', 'criar', 'corrigir', 'implementar', 'desenvolver', 'atualizar', 'revisar', 'tarefa', 'todo', 'pendente'],
}

const LABEL_PALETTE = [
  { name: 'Vermelho', color: '#EF4444' }, { name: 'Laranja', color: '#F59E0B' },
  { name: 'Amarelo',  color: '#EAB308' }, { name: 'Verde',   color: '#22C55E' },
  { name: 'Azul',     color: '#3B82F6' }, { name: 'Roxo',    color: '#8B5CF6' },
  { name: 'Rosa',     color: '#EC4899' }, { name: 'Cinza',   color: '#6B7280' },
]

function initials(name: string) {
  return (name || '?').split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()
}

type Props = {
  extraId?: string
  initialStatus?: ExtraStatus
  fixedClientId?: string | null
  clients?: { id: string; name: string; color_hex: string }[]
  members?: { id: string; name: string; role: string; color?: string }[]
  onClose: () => void
  onSaved: (extra: any) => void
  onDeleted?: (id: string) => void
}

export default function ExtraCard({ extraId, initialStatus, fixedClientId, clients = [], members: membersProp, onClose, onSaved, onDeleted }: Props) {
  const { members: ctxMembers, currentMember } = useUser()
  const who = currentMember?.name || 'Alguém'
  const { toast } = useToast()
  const members = membersProp ?? ctxMembers
  const supabase = createClient()

  const [loading, setLoading] = useState(!!extraId)
  const [saving,  setSaving]  = useState(false)
  const [id,      setId]      = useState<string | undefined>(extraId)
  const [linkCopied, setLinkCopied] = useState(false)
  const originalStatusRef = useRef<ExtraStatus>(initialStatus ?? 'backlog')
  const snapshotRef = useRef<string>('')
  const titleOriginal = useRef<string | null>(null)
  const [showDetails, setShowDetails] = useState(true)
  const [activityKey, setActivityKey] = useState(0)
  const [activities,  setActivities]  = useState<{ id: string; action: string; actor_name: string | null; description: string; created_at: string }[]>([])

  // Track manual overrides so auto-detect doesn't fight the user
  const [typeManuallySet,   setTypeManuallySet]   = useState(!!extraId)
  const [clientManuallySet, setClientManuallySet] = useState(!!extraId || !!fixedClientId)

  const [title,           setTitle]           = useState('')
  const [type,            setType]            = useState<ExtraType>('todo')
  const [status,          setStatus]          = useState<ExtraStatus>(initialStatus ?? 'backlog')
  const [priority,        setPriority]        = useState<ExtraPriority>('normal')
  const [clientId,        setClientId]        = useState(fixedClientId || '')
  const [description,     setDescription]     = useState('')
  const [dueDate,         setDueDate]         = useState('')
  const [dueTime,         setDueTime]         = useState('')
  const [driveUrl,        setDriveUrl]        = useState('')
  const [createdAt,       setCreatedAt]       = useState<string | null>(null)
  const [labels,          setLabels]          = useState<{ text: string; color: string }[]>([])
  const [assignedMembers, setAssignedMembers] = useState<string[]>([])

  const [needsClientApproval, setNeedsClientApproval] = useState(false)

  const [checklist,      setChecklist]      = useState<any[]>([])
  const [newCheckText,   setNewCheckText]   = useState('')
  const [comments,       setComments]       = useState<any[]>([])

  // Atividades do card (feed único comentários+atividade, padrão cronograma)
  useEffect(() => {
    const rid = id || extraId
    if (!rid) { setActivities([]); return }
    supabase.from('activity_log').select('id, action, actor_name, description, created_at')
      .eq('table_name', 'extras').eq('record_id', rid).order('created_at', { ascending: false })
      .then(({ data, error }) => {
        if (error) console.error('activity_log fetch error (extras):', error)
        setActivities(data || [])
      })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, extraId, activityKey])
  const [newComment,     setNewComment]     = useState('')
  const [editingCommentId, setEditingCommentId] = useState<string | null>(null)
  const [editCommentText,  setEditCommentText]  = useState('')
  const mentions = useMentions(newComment, setNewComment, members)
  const [attachments,    setAttachments]    = useState<any[]>([])
  const [newAttachUrl,   setNewAttachUrl]   = useState('')
  const [newAttachTitle, setNewAttachTitle] = useState('')

  const [showLabelPicker,  setShowLabelPicker]  = useState(false)
  const [showDatePicker,   setShowDatePicker]   = useState(false)
  const [showAttachInput,  setShowAttachInput]  = useState(false)
  const [globalLabels,     setGlobalLabels]     = useState<any[]>([])
  const [labelDraft,       setLabelDraft]       = useState({ text: '', color: '#3B82F6' })
  const [editingLabel,     setEditingLabel]     = useState<any>(null)
  const [calMonth,         setCalMonth]         = useState(() => {
    const d = new Date(); return { y: d.getFullYear(), m: d.getMonth() }
  })

  const orderedMembers    = [...members].sort((a, b) => {
    const score = (m: any) => (m.role === 'designer' ? 0 : m.role === 'editor' ? 1 : 2)
    return score(a) - score(b)
  })

  const loadSub = useCallback(async (eid: string) => {
    const [{ data: chk }, { data: cms }, { data: atts }] = await Promise.all([
      supabase.from('extra_checklist').select('*').eq('extra_id', eid).order('position', { ascending: true }),
      supabase.from('extra_comments').select('*').eq('extra_id', eid).order('created_at', { ascending: true }),
      supabase.from('extra_attachments').select('*').eq('extra_id', eid).order('created_at', { ascending: true }),
    ])
    setChecklist(chk || [])
    setComments(cms || [])
    setAttachments(atts || [])
  }, [])

  useEffect(() => {
    supabase.from('labels').select('*').order('created_at', { ascending: true })
      .then(({ data }) => { if (data) setGlobalLabels(data) })
  }, [])


  // Smart auto-detection as the user types the title
  useEffect(() => {
    if (!title.trim()) return
    const lower = title.toLowerCase()

    if (!typeManuallySet) {
      for (const [t, kws] of Object.entries(TYPE_KEYWORDS) as [ExtraType, string[]][]) {
        if (kws.some(kw => lower.includes(kw))) {
          setType(t)
          break
        }
      }
    }

    if (!clientManuallySet && !fixedClientId && clients.length > 0) {
      const match = clients.find(c => lower.includes(c.name.toLowerCase()))
      if (match) setClientId(match.id)
    }
  }, [title])

  useEffect(() => {
    if (!extraId) return
    async function load() {
      const { data } = await supabase.from('extras').select('*').eq('id', extraId).single()
      if (data) {
        setTitle(data.title || '')
        setType(data.type || 'todo')
        setStatus(data.status || 'backlog')
        originalStatusRef.current = data.status || 'backlog'
        setPriority(data.priority || 'normal')
        setClientId(data.client_id || '')
        setDescription(data.description || '')
        setDueDate(data.due_date || '')
        setDueTime(data.due_time || '')
        setDriveUrl(data.drive_url || '')
        setCreatedAt(data.created_at || null)
        setLabels(Array.isArray(data.labels) ? data.labels : [])
        setNeedsClientApproval(data.needs_client_approval || false)
        const am = Array.isArray(data.assigned_members) && data.assigned_members.length > 0
          ? data.assigned_members : data.assigned_member_id ? [data.assigned_member_id] : []
        setAssignedMembers(am)
        snapshotRef.current = JSON.stringify({
          title: data.title || '', type: data.type || 'todo', priority: data.priority || 'normal',
          clientId: data.client_id || '', description: data.description || '',
          dueDate: data.due_date || '', dueTime: data.due_time || '', driveUrl: data.drive_url || '',
          labels: Array.isArray(data.labels) ? data.labels : [],
          needsClientApproval: data.needs_client_approval || false, assignedMembers: am,
        })
      }
      await loadSub(extraId)
      setLoading(false)
    }
    load()
  }, [extraId, loadSub])

  async function ensureId(): Promise<string | undefined> {
    if (id) return id
    if (!title.trim()) return undefined
    const payload = {
      title, type, status, priority,
      client_id: fixedClientId || clientId || null,
      description, due_date: dueDate || null, due_time: dueTime || null, drive_url: driveUrl || null,
      assigned_members: assignedMembers, assigned_member_id: assignedMembers[0] || null, labels,
    }
    const { data, error } = await supabase.from('extras').insert(payload).select('*').single()
    if (error) console.error('ensureId error:', error)
    if (data) {
      setId(data.id)
      originalStatusRef.current = status
      snapshotRef.current = JSON.stringify({
        title, type, priority, clientId: fixedClientId || clientId || '', description,
        dueDate: dueDate || '', dueTime: dueTime || '', driveUrl: driveUrl || '', labels,
        needsClientApproval, assignedMembers,
      })
      ensureWatching('extras', data.id, [currentMember?.id, ...assignedMembers])
      await logActivity({ tableName: 'extras', recordId: data.id, clientId: fixedClientId || clientId || null, action: 'created', actorName: currentMember?.name, description: `${currentMember?.name || 'Alguém'} criou "${title}"` })
      setActivityKey(k => k + 1)
      return data.id
    }
    return undefined
  }

  // Salva um campo específico imediatamente e registra no histórico com mensagem detalhada (padrão cronograma)
  async function persist(patch: Record<string, any>, logMsg?: string, action = 'updated'): Promise<string | undefined> {
    const eid = await ensureId()
    if (!eid) return undefined
    const { error } = await supabase.from('extras').update(patch).eq('id', eid)
    if (error) { toast('Erro ao salvar'); return undefined }
    if (logMsg) {
      await logActivity({ tableName: 'extras', recordId: eid, clientId: fixedClientId || clientId || null, action, actorName: currentMember?.name, description: logMsg })
      setActivityKey(k => k + 1)
    }
    return eid
  }
  async function logExt(eid: string, description: string, action = 'updated') {
    await logActivity({ tableName: 'extras', recordId: eid, clientId: fixedClientId || clientId || null, action, actorName: currentMember?.name, description })
    setActivityKey(k => k + 1)
  }

  const STATUS_LABEL: Record<ExtraStatus,string> = { backlog: 'A fazer', doing: 'Em andamento', done: 'Concluído' }
  function changeStatus(v: ExtraStatus) {
    const old = STATUS_LABEL[status]
    setStatus(v)
    originalStatusRef.current = v
    persist({ status: v }, `${who} moveu de "${old}" para "${STATUS_LABEL[v]}"`, 'status_changed')
  }
  function changeType(v: ExtraType) {
    const oldLabel = TYPE_OPTIONS.find(t => t.value === type)?.label || type
    const newLabel = TYPE_OPTIONS.find(t => t.value === v)?.label || v
    setType(v); setTypeManuallySet(true)
    persist({ type: v }, `${who} mudou o tipo de "${oldLabel}" para "${newLabel}"`)
  }
  function changePriority(v: ExtraPriority) {
    const newLabel = PRIORITY_OPTIONS.find(p => p.value === v)?.label || v
    setPriority(v)
    persist({ priority: v }, `${who} definiu a prioridade: ${newLabel}`)
  }
  function changeClient(v: string) {
    setClientId(v); setClientManuallySet(true)
    const name = v ? (clients.find(c => c.id === v)?.name || '') : 'sem cliente'
    persist({ client_id: v || null }, `${who} definiu o cliente: ${name}`)
  }
  function changeApproval() {
    const next = !needsClientApproval
    setNeedsClientApproval(next)
    persist({ needs_client_approval: next }, next ? `${who} marcou que precisa de aprovação do cliente` : `${who} removeu a necessidade de aprovação do cliente`)
  }

  async function handleSaveMain() {
    if (!title.trim()) return
    setSaving(true)
    const payload: any = {
      title, type, status, priority,
      client_id: fixedClientId || clientId || null,
      description, due_date: dueDate || null, due_time: dueTime || null, drive_url: driveUrl || null,
      assigned_members: assignedMembers, assigned_member_id: assignedMembers[0] || null, labels,
      needs_client_approval: needsClientApproval,
    }
    // Build client/member info locally to avoid depending on PostgREST joins
    const resolvedClientId = fixedClientId || clientId || null
    const clientInfo = resolvedClientId ? clients.find(c => c.id === resolvedClientId) : null
    function withRelations(raw: any) {
      return {
        ...raw,
        clients: clientInfo ? { name: clientInfo.name, color_hex: clientInfo.color_hex } : null,
        team_members: null,
      }
    }

    let savedData: any
    if (!id) {
      const { data, error } = await supabase.from('extras').insert(payload).select('*').single()
      if (error || !data) {
        console.error('Extra save error:', error)
        toast(`Erro ao salvar: ${error?.message ?? 'resposta vazia'}`)
        setSaving(false)
        return
      }
      setId(data.id)
      savedData = withRelations(data)
      originalStatusRef.current = status
      await logActivity({ tableName: 'extras', recordId: data.id, clientId: resolvedClientId, action: 'created', actorName: currentMember?.name, description: `${currentMember?.name || 'Alguém'} criou "${title}"` })
      setActivityKey(k => k + 1)
    } else {
      // Rede de segurança: garante que tudo esteja persistido ao fechar.
      // O histórico detalhado por campo já é registrado nos handlers granulares (persist()),
      // então aqui não logamos nada — evita duplicar/generalizar o que já foi registrado.
      const { data } = await supabase.from('extras').update(payload).eq('id', id).select('*').single()
      savedData = data ? withRelations(data) : null
    }
    setSaving(false)
    if (savedData) { toast('Extra salvo!'); onSaved(savedData) }
  }

  async function handleDelete() {
    if (!id) { onClose(); return }
    await logActivity({ tableName: 'extras', recordId: id, clientId: fixedClientId || clientId || null, action: 'deleted', actorName: currentMember?.name, description: `${currentMember?.name || 'Alguém'} excluiu "${title}"` })
    await supabase.from('extras').delete().eq('id', id)
    if (onDeleted) onDeleted(id)
    onClose()
  }

  async function addCheck() {
    if (!newCheckText.trim()) return
    const eid = await ensureId(); if (!eid) return
    const { data } = await supabase.from('extra_checklist').insert({ extra_id: eid, text: newCheckText, position: checklist.length }).select().single()
    if (data) setChecklist(c => [...c, data])
    await logExt(eid, `${who} adicionou "${newCheckText}" na checklist`)
    setNewCheckText('')
  }
  async function toggleCheck(item: any) {
    await supabase.from('extra_checklist').update({ done: !item.done }).eq('id', item.id)
    setChecklist(c => c.map(x => x.id === item.id ? { ...x, done: !x.done } : x))
    const eid = id || extraId
    if (eid) await logExt(eid, item.done ? `${who} desmarcou "${item.text}"` : `${who} marcou "${item.text}" como concluído`)
  }
  async function removeCheck(cid: string) {
    const item = checklist.find(c => c.id === cid)
    await supabase.from('extra_checklist').delete().eq('id', cid)
    setChecklist(c => c.filter(x => x.id !== cid))
    const eid = id || extraId
    if (eid) await logExt(eid, `${who} removeu "${item?.text || ''}" da checklist`)
  }

  async function addComment() {
    if (!newComment.trim()) return
    const eid = await ensureId(); if (!eid) return
    const authorName = currentMember?.name || 'Você'
    const body = newComment
    const { data } = await supabase.from('extra_comments').insert({ extra_id: eid, body, author_name: authorName }).select().single()
    if (data) setComments(c => [...c, data])
    setNewComment('')
    requestAnimationFrame(() => { if (mentions.textareaRef.current) autoGrow(mentions.textareaRef.current) })
    await logActivity({ tableName: 'extras', recordId: eid, clientId: fixedClientId || clientId || null, action: 'commented', actorName: authorName, description: `${authorName} comentou: "${body.slice(0, 80)}${body.length > 80 ? '…' : ''}"` })
    setActivityKey(k => k + 1)
  }

  async function saveEditComment(cid: string) {
    const body = editCommentText.trim(); if (!body) return
    const { error } = await supabase.from('extra_comments').update({ body }).eq('id', cid)
    if (!error) setComments(cs => cs.map(c => c.id === cid ? { ...c, body } : c))
    setEditingCommentId(null)
  }

  async function deleteComment(cid: string) {
    const prev = comments
    setComments(cs => cs.filter(c => c.id !== cid))
    const { error } = await supabase.from('extra_comments').delete().eq('id', cid)
    if (error) setComments(prev)
  }

  async function addAttachment() {
    if (!newAttachUrl.trim()) return
    const eid = await ensureId(); if (!eid) return
    const attachTitle = newAttachTitle || newAttachUrl
    const { data } = await supabase.from('extra_attachments').insert({ extra_id: eid, url: newAttachUrl, title: attachTitle }).select().single()
    if (data) setAttachments(a => [...a, data])
    setNewAttachUrl(''); setNewAttachTitle(''); setShowAttachInput(false)
    await logExt(eid, `${who} anexou "${attachTitle}"`)
  }
  async function removeAttachment(aid: string) {
    const att = attachments.find(a => a.id === aid)
    await supabase.from('extra_attachments').delete().eq('id', aid)
    setAttachments(a => a.filter(x => x.id !== aid))
    const eid = id || extraId
    if (eid) await logExt(eid, `${who} removeu o anexo "${att?.title || ''}"`)
  }

  async function createGlobalLabel(text: string, color: string) {
    const { data } = await supabase.from('labels').insert({ text, color }).select().single()
    if (data) setGlobalLabels(g => [...g, data]); return data
  }
  async function updateGlobalLabel(labelId: string, text: string, color: string) {
    const old = globalLabels.find(g => g.id === labelId)
    await supabase.from('labels').update({ text, color }).eq('id', labelId)
    setGlobalLabels(g => g.map(x => x.id === labelId ? { ...x, text, color } : x))
    if (old) setLabels(ls => ls.map(l => (l.text === old.text && l.color === old.color) ? { text, color } : l))
    setEditingLabel(null)
  }
  async function deleteGlobalLabel(labelId: string) {
    const old = globalLabels.find(g => g.id === labelId)
    await supabase.from('labels').delete().eq('id', labelId)
    setGlobalLabels(g => g.filter(x => x.id !== labelId))
    if (old) setLabels(ls => ls.filter(l => !(l.text === old.text && l.color === old.color)))
    setEditingLabel(null)
  }

  const checkDone  = checklist.filter(c => c.done).length
  const checkPct   = checklist.length ? Math.round((checkDone / checklist.length) * 100) : 0
  const typeObj     = TYPE_OPTIONS.find(t => t.value === type)!
  const statusObj   = STATUS_OPTIONS.find(s => s.value === status)!
  const priorityObj = PRIORITY_OPTIONS.find(p => p.value === priority)!
  const clientName  = clients.find(c => c.id === clientId)?.name

  if (loading) return (
    <ModalPortal>
      <div className="fixed inset-0 bg-black/40 z-[70] flex items-center justify-center">
        <div className="bg-[var(--color-bg-card)] rounded-2xl px-6 py-4 text-sm text-[var(--color-text-muted)]">Carregando…</div>
      </div>
    </ModalPortal>
  )

  const dueDateLabel = (() => {
    if (!dueDate) return null
    const diff = Math.ceil((new Date(dueDate + 'T23:59:59').getTime() - Date.now()) / 86400000)
    const color = diff < 0 ? '#EF4444' : diff <= 2 ? '#F59E0B' : 'var(--color-text-secondary)'
    const label = diff < 0 ? 'atrasado' : diff === 0 ? 'hoje' : diff === 1 ? 'amanhã' : ''
    return { text: new Date(dueDate + 'T12:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' }) + (dueTime ? ` · ${dueTime}` : '') + (label ? ` · ${label}` : ''), color }
  })()

  // Feed único (comentários + atividades), padrão cronograma
  const fullDateTime = (iso: string) => new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
  type FeedItem =
    | { kind: 'comment'; id: string; cid: string; at: string; author: string | null; body: string }
    | { kind: 'activity'; id: string; at: string; author: string | null; body: string }
  const feed: FeedItem[] = [
    ...comments.map(c => ({ kind: 'comment' as const, id: 'c' + c.id, cid: c.id, at: c.created_at, author: c.author_name, body: c.body })),
    ...activities.map(a => ({ kind: 'activity' as const, id: 'a' + a.id, at: a.created_at, author: a.actor_name, body: a.description })),
    ...(createdAt && !activities.some(a => a.action === 'created')
      ? [{ kind: 'activity' as const, id: '__created__', at: createdAt, author: null, body: 'Card criado' }]
      : []),
  ].sort((x, y) => new Date(y.at).getTime() - new Date(x.at).getTime())
  const visibleFeed = showDetails ? feed : feed.filter(f => f.kind === 'comment')

  return (
    <ModalPortal>
    <div
      className="fixed inset-0 bg-black/50 z-[70] flex items-center justify-center py-6 px-4"
      onClick={e => { if (e.target === e.currentTarget) { handleSaveMain(); onClose() } }}
    >
      <div className="bg-[var(--color-bg-alt)] rounded-2xl w-full max-w-[1040px] max-h-[92vh] flex flex-col shadow-pop overflow-hidden animate-scale-in">

        {/* Colored accent bar */}
        <div className="h-[3px] flex-shrink-0 rounded-t-2xl" style={{ background: typeObj.color }} />

        {/* CORPO — esquerda (header + props + conteúdo) | sidebar altura total */}
        <div className="flex flex-1 overflow-hidden divide-x divide-[var(--color-border)]">
        <div className="flex-1 min-w-0 flex flex-col overflow-hidden">

        {/* HEADER — título (padrão cronograma) */}
        <div className="flex items-start justify-between gap-4 px-7 pt-4 pb-3 bg-[var(--color-bg-card)] border-b border-[var(--color-border)]">
          <div className="flex-1 min-w-0">
            <input
              value={title}
              onFocus={() => { if (titleOriginal.current === null) titleOriginal.current = title }}
              onChange={e => setTitle(e.target.value)}
              onBlur={() => {
                const orig = titleOriginal.current
                titleOriginal.current = null
                if (orig === null || orig === title || !title.trim()) return
                if (!id) persist({ title })
                else persist({ title }, `${who} renomeou "${orig}" para "${title}"`)
              }}
              placeholder="Sem título…"
              autoFocus={!extraId}
              className="w-full text-2xl font-bold text-[var(--color-text-primary)] bg-transparent outline-none placeholder:text-[var(--color-text-faint)] leading-tight"
            />
            <p className="text-xs text-[var(--color-text-muted)] mt-1">
              {clientName ? <>em <span className="font-semibold text-[var(--color-text-secondary)]">{clientName}</span></> : 'sem cliente'}
              <span className="mx-1.5 text-[var(--color-text-faint)]">·</span>{typeObj.label}
            </p>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            {id && (
              <button
                onClick={() => {
                  const url = `${window.location.origin}/dashboard/extras?post=${id}`
                  navigator.clipboard.writeText(url)
                  setLinkCopied(true)
                  setTimeout(() => setLinkCopied(false), 2000)
                }}
                title="Copiar link do card"
                className="w-8 h-8 rounded-lg hover:bg-[var(--color-bg-subtle)] flex items-center justify-center transition-colors"
                style={{ color: linkCopied ? 'var(--ds-success-text)' : 'var(--color-text-secondary)' }}>
                {linkCopied ? <Check size={14} /> : <Link2 size={14} />}
              </button>
            )}
            <button onClick={() => { handleSaveMain(); onClose() }}
              className="w-8 h-8 rounded-lg hover:bg-[var(--color-bg-subtle)] flex items-center justify-center text-[var(--color-text-secondary)] transition-colors">
              <X size={16} />
            </button>
          </div>
        </div>

        {/* PROPRIEDADES — grid de pills com label embutido (encaixe determinístico) */}
        <div className="px-7 py-2.5 bg-[var(--color-bg-card)] border-b border-[var(--color-border)] flex flex-col gap-1.5">
          <div className="grid grid-cols-3 gap-x-3 gap-y-2">
          {/* Cliente (global only) — primeiro na ordem de UX */}
          {!fixedClientId && clients.length > 0 && (
            <PropertyPill label="Cliente">
              <div className="relative min-w-0">
                <select value={clientId} onChange={e => changeClient(e.target.value)}
                  className={pillSelectCls + ' bg-[var(--color-bg-card)] border-[var(--color-border)]'} style={{ color: clientId ? 'var(--color-text-primary)' : 'var(--color-text-muted)' }}>
                  <option value="">Cliente</option>
                  {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
                <ChevronDown size={12} className="absolute right-2 top-1/2 -translate-y-1/2 text-[var(--color-text-muted)] pointer-events-none" />
              </div>
            </PropertyPill>
          )}
          {/* Tipo */}
          <PropertyPill label="Tipo">
            <div className="relative min-w-0">
              <select value={type} onChange={e => changeType(e.target.value as ExtraType)}
                className={pillSelectCls} style={{ background: typeObj.color + '18', color: typeObj.color, borderColor: typeObj.color + '44' }}>
                {TYPE_OPTIONS.map(t => <option key={t.value} value={t.value} style={{ color: 'var(--color-text-primary)' }}>{t.label}</option>)}
              </select>
              <ChevronDown size={12} className="absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: typeObj.color }} />
            </div>
          </PropertyPill>
          {/* Status */}
          <PropertyPill label="Status">
            <div className="relative min-w-0">
              <select value={status} onChange={e => changeStatus(e.target.value as ExtraStatus)}
                className={pillSelectCls} style={{ background: statusObj.color + '18', color: statusObj.color, borderColor: statusObj.color + '44' }}>
                {STATUS_OPTIONS.map(s => <option key={s.value} value={s.value} style={{ color: 'var(--color-text-primary)' }}>{s.label}</option>)}
              </select>
              <ChevronDown size={12} className="absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: statusObj.color }} />
            </div>
          </PropertyPill>
          {/* Prioridade */}
          <PropertyPill label="Prioridade">
            <div className="relative min-w-0">
              <select value={priority} onChange={e => changePriority(e.target.value as ExtraPriority)}
                className={pillSelectCls} style={{ background: priorityObj.color + '18', color: priorityObj.color, borderColor: priorityObj.color + '44' }}>
                {PRIORITY_OPTIONS.map(p => <option key={p.value} value={p.value} style={{ color: 'var(--color-text-primary)' }}>{p.label}</option>)}
              </select>
              <ChevronDown size={12} className="absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: priorityObj.color }} />
            </div>
          </PropertyPill>
          {/* Data */}
          <PropertyPill label="Data">
            <button onClick={() => setShowDatePicker(true)}
              className="w-full flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium border border-[var(--color-border)] hover:border-[var(--color-border-hover)] transition-colors truncate"
              style={{ color: dueDateLabel ? dueDateLabel.color : 'var(--color-text-muted)' }}>
              <Calendar size={12} className="flex-shrink-0" /> <span className="truncate">{dueDateLabel ? dueDateLabel.text : 'Definir'}</span>
            </button>
          </PropertyPill>
          {/* Aprovação do cliente */}
          <PropertyPill label="Aprovação">
            <button
              onClick={changeApproval}
              className="w-full rounded-lg px-2.5 py-1.5 text-xs font-medium border transition-all truncate"
              style={needsClientApproval
                ? { background: '#3b82f618', color: '#3b82f6', borderColor: '#3b82f644' }
                : { color: 'var(--color-text-muted)', borderColor: 'var(--color-border)' }}>
              {needsClientApproval ? '✓ Cliente aprova' : 'Não precisa'}
            </button>
          </PropertyPill>
          </div>
          {/* Linha 2 — grupos largos (chips) */}
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5">
            <Users size={12} className="text-[var(--color-text-muted)] flex-shrink-0" />
            <div className="flex flex-wrap gap-1 min-w-0">
              {orderedMembers.map(m => {
                const sel = assignedMembers.includes(m.id)
                return (
                  <button key={m.id} onClick={() => {
                    const next = sel ? assignedMembers.filter(x => x !== m.id) : [...assignedMembers, m.id]
                    setAssignedMembers(next)
                    if (!sel && id) ensureWatching('extras', id, [m.id])
                    const logMsg = sel ? `${who} removeu ${m.name} de "${title}"` : `${who} adicionou ${m.name} a "${title}"`
                    persist({ assigned_members: next, assigned_member_id: next[0] || null }, logMsg, sel ? 'updated' : 'member_assigned')
                  }}
                    className={`text-[11px] px-2 py-0.5 rounded-full border transition-colors ${sel ? 'bg-[var(--color-brand)] text-[var(--color-brand-fg)] border-transparent' : 'border-[var(--color-border)] text-[var(--color-text-secondary)] hover:border-[var(--color-border-strong)]'}`}>
                    {m.name.split(' ')[0]}
                  </button>
                )
              })}
            </div>
            <Tag size={12} className="text-[var(--color-text-muted)] flex-shrink-0 ml-2" />
            <div className="flex flex-wrap gap-1.5 items-center min-w-0">
              {labels.map((l, i) => (
                <span key={i} className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-md text-white" style={{ background: l.color }}>
                  {l.text}
                  <button onClick={() => {
                    const next = labels.filter((_, idx) => idx !== i)
                    setLabels(next)
                    persist({ labels: next }, `${who} removeu a etiqueta "${l.text}"`)
                  }}><X size={9} /></button>
                </span>
              ))}
              <button onClick={() => setShowLabelPicker(true)}
                className="text-[11px] px-2 py-0.5 rounded-full border border-dashed border-[var(--color-border)] text-[var(--color-text-muted)] hover:border-[var(--color-border-strong)] transition-colors">
                + Etiqueta
              </button>
            </div>
          </div>
        </div>

          {/* LEFT — conteúdo livre (estilo Trello, sem caixas) */}
          <div className="flex-1 min-w-0 flex flex-col overflow-y-auto px-7 py-5 gap-5">

            {/* DESCRIPTION — clique-para-editar (padrão cronograma) */}
            <EditableField
                label="Descrição"
                hint="· contexto, instruções, links"
                placeholder="Adicione uma descrição, contexto, links…"
                value={description}
                minH={90}
                onCommit={async v => {
                  const hadId = !!id
                  setDescription(v)
                  const eid = await persist({ description: v }, hadId ? `${who} editou a descrição` : undefined)
                  if (eid) {
                    const summary = await generateAiSummary(v, title)
                    if (summary != null) await supabase.from('extras').update({ ai_summary: summary }).eq('id', eid)
                  }
                }}
              />

            {/* CHECKLIST */}
            <div>
              <div className="flex items-baseline gap-2 mb-2">
                <span className="text-xs font-bold text-[var(--color-text-secondary)] uppercase tracking-wider">Checklist</span>
                {checklist.length > 0 && <span className="text-[10px] text-[var(--color-text-faint)]">· {checkDone}/{checklist.length}</span>}
              </div>
              {checklist.length > 0 && (
                <div className="w-full h-1 bg-[var(--color-bg-subtle)] rounded-full mb-3 overflow-hidden">
                  <div className="h-full bg-[#22C55E] transition-all rounded-full" style={{ width: `${checkPct}%` }} />
                </div>
              )}
              <div className="flex flex-col gap-0.5 mb-2">
                {checklist.map(item => (
                  <div key={item.id} className="group flex items-center gap-2.5 px-2 py-1.5 rounded-lg hover:bg-[var(--color-bg-subtle)]">
                    <button onClick={() => toggleCheck(item)}
                      className={`w-4 h-4 rounded border flex items-center justify-center flex-shrink-0 transition-colors ${item.done ? 'bg-[#22C55E] border-[#22C55E]' : 'border-[var(--color-border-hover)] hover:border-[#22C55E]'}`}>
                      {item.done && <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3"><polyline points="20 6 9 17 4 12" /></svg>}
                    </button>
                    <span className={`text-sm flex-1 ${item.done ? 'line-through text-[var(--color-text-muted)]' : 'text-[var(--color-text-primary)]'}`}>{item.text}</span>
                    <button onClick={() => removeCheck(item.id)} className="opacity-0 group-hover:opacity-100 text-[var(--color-text-muted)] transition-opacity" onMouseEnter={e => (e.currentTarget.style.color = 'var(--ds-error-text)')} onMouseLeave={e => (e.currentTarget.style.color = '')}><Trash2 size={13} /></button>
                  </div>
                ))}
              </div>
              <div className="flex items-center gap-2">
                <input value={newCheckText} onChange={e => setNewCheckText(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') addCheck() }}
                  placeholder="Novo item… (Enter)"
                  className="flex-1 bg-[var(--color-bg-subtle)] border border-[var(--color-border)] rounded-lg px-3 py-1.5 text-sm text-[var(--color-text-primary)] placeholder-[var(--color-text-muted)] outline-none focus:border-[var(--color-brand)] transition-colors" />
              </div>
            </div>

            {/* ATTACHMENTS */}
            <div>
              <div className="flex items-baseline gap-2 mb-2">
                <span className="text-xs font-bold text-[var(--color-text-secondary)] uppercase tracking-wider">Anexos</span>
                <span className="text-[10px] text-[var(--color-text-faint)]">· links de apoio</span>
              </div>
              {attachments.length > 0 && (
                <div className="flex flex-col gap-2 mb-3">
                  {attachments.map(a => (
                    <div key={a.id} className="group flex items-center gap-3 bg-[var(--color-bg-subtle)] border border-[var(--color-border)] rounded-xl px-3 py-2">
                      <Link2 size={13} className="text-[var(--color-text-muted)] flex-shrink-0" />
                      <a href={a.url} target="_blank" rel="noopener noreferrer"
                        className="flex-1 text-sm hover:underline truncate" style={{ color: 'var(--ds-info-text)' }}>{a.title}</a>
                      <button onClick={() => removeAttachment(a.id)} className="opacity-0 group-hover:opacity-100 text-[var(--color-text-muted)] transition-opacity" onMouseEnter={e => (e.currentTarget.style.color = 'var(--ds-error-text)')} onMouseLeave={e => (e.currentTarget.style.color = '')}><Trash2 size={13} /></button>
                    </div>
                  ))}
                </div>
              )}
              {!showAttachInput ? (
                <button onClick={() => setShowAttachInput(true)}
                  className="text-xs text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)] transition-colors">
                  + Adicionar link
                </button>
              ) : (
                <div className="flex flex-col gap-2 bg-[var(--color-bg-subtle)] border border-[var(--color-border)] rounded-xl p-3">
                  <input value={newAttachUrl} onChange={e => setNewAttachUrl(e.target.value)} placeholder="https://…"
                    className="border border-[var(--color-border)] rounded-lg px-3 py-1.5 text-sm text-[var(--color-text-primary)] placeholder-[var(--color-text-muted)] outline-none focus:border-[var(--color-brand)] bg-[var(--color-bg-card)]" />
                  <input value={newAttachTitle} onChange={e => setNewAttachTitle(e.target.value)} placeholder="Nome (opcional)"
                    className="border border-[var(--color-border)] rounded-lg px-3 py-1.5 text-sm text-[var(--color-text-primary)] placeholder-[var(--color-text-muted)] outline-none focus:border-[var(--color-brand)] bg-[var(--color-bg-card)]" />
                  <div className="flex gap-2 justify-end">
                    <button onClick={() => setShowAttachInput(false)} className="text-xs px-3 py-1.5 rounded-lg border border-[var(--color-border)] text-[var(--color-text-secondary)]">Cancelar</button>
                    <button onClick={addAttachment} className="text-xs font-medium px-3 py-1.5 rounded-lg bg-[var(--color-brand)] text-[var(--color-brand-fg)]">Anexar</button>
                  </div>
                </div>
              )}
            </div>

            {/* ENTREGA DO CONTEÚDO — padrão design system */}
            <DeliverySection
              value={driveUrl}
              isVideo={/reel|video|vídeo|\.mp4/i.test(type + ' ' + driveUrl)}
              onCommit={async v => {
                const hadValue = !!driveUrl
                setDriveUrl(v)
                const logMsg = !v ? `${who} removeu a entrega do conteúdo` : hadValue ? `${who} atualizou a entrega do conteúdo` : `${who} marcou o conteúdo como entregue`
                persist({ drive_url: v || null }, logMsg)
              }}
            />
          </div>
          </div>

          {/* RIGHT — comentários + atividade (feed único, tipo Trello) */}
          <div className="w-[340px] flex-shrink-0 bg-[var(--color-bg-card)] flex flex-col overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--color-border)]">
              <span className="text-xs font-bold text-[var(--color-text-primary)]">Comentários e atividade</span>
              <div className="flex items-center gap-2">
                <WatchButton tableName="extras" recordId={id} />
                <button onClick={() => setShowDetails(v => !v)} className="text-[11px] font-medium text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] transition-colors">
                  {showDetails ? 'Ocultar detalhes' : 'Mostrar detalhes'}
                </button>
              </div>
            </div>

            {/* Campo de comentário — estilo Trello: avatar + caixa + botão "Comentar" abaixo */}
            <div className="px-4 py-3 border-b border-[var(--color-border)] flex items-start gap-2.5">
              <div className="w-7 h-7 rounded-full flex items-center justify-center text-white text-[10px] font-bold flex-shrink-0 mt-0.5"
                style={{ background: (currentMember as any)?.color || 'var(--color-brand)' }}>
                {(currentMember?.name || '?').split(' ').slice(0, 2).map((w: string) => w[0]).join('').toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <textarea
                  ref={mentions.textareaRef}
                  value={newComment}
                  onChange={mentions.handleChange}
                  onInput={e => autoGrow(e.currentTarget)}
                  onKeyDown={e => { if (mentions.handleKeyDown(e)) return; if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); addComment() } }}
                  onBlur={mentions.handleBlur}
                  placeholder="Escrever um comentário… @ para mencionar" rows={3}
                  className="w-full bg-[var(--color-bg-page)] border border-[var(--color-border)] rounded-lg px-3 py-2 text-xs text-[var(--color-text-primary)] outline-none resize-none focus:border-[var(--color-accent)] focus:bg-[var(--color-bg-card)] transition-colors"
                />
                {mentions.dropdown}
                <div className="flex justify-end mt-2">
                  <button onClick={addComment} disabled={!newComment.trim()}
                    className="flex items-center gap-1.5 text-xs font-semibold px-3.5 py-1.5 rounded-lg text-white disabled:opacity-40 disabled:cursor-not-allowed enabled:hover:opacity-90 enabled:cursor-pointer transition-opacity flex-shrink-0"
                    style={{ background: 'var(--color-accent)' }}>
                    <Send size={12} /> Comentar
                  </button>
                </div>
              </div>
            </div>

            {/* Feed */}
            <div className="flex-1 overflow-y-auto px-4 py-3 flex flex-col gap-3">
              {visibleFeed.length === 0 ? (
                <p className="text-xs text-[var(--color-text-faint)] text-center py-8">Nada ainda. Comente mudanças, dúvidas, ajustes…</p>
              ) : visibleFeed.map(item => {
                const memberMatch = item.author ? members.find(x => x.name === item.author) : null
                const av = {
                  initials: item.author ? initials(item.author) : '?',
                  color: (memberMatch as any)?.color || '#9ca3af',
                }
                return item.kind === 'comment' ? (
                  <div key={item.id} className="flex items-start gap-2.5 group">
                    <div className="w-7 h-7 rounded-full flex items-center justify-center text-white text-[10px] font-bold flex-shrink-0 mt-0.5" style={{ background: av.color }}>{av.initials}</div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 mb-1">
                        <span className="text-[11px] font-semibold text-[var(--color-text-primary)]">{item.author || 'Alguém'}</span>
                        <span className="text-[10px] text-[var(--color-text-faint)]" title={fullDateTime(item.at)}>{fullDateTime(item.at)}</span>
                        {editingCommentId !== item.cid && (
                          <div className="ml-auto flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                            <button onClick={() => { setEditingCommentId(item.cid); setEditCommentText(item.body) }} title="Editar"
                              className="w-6 h-6 rounded-md flex items-center justify-center text-[var(--color-text-faint)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-bg-page)] transition-colors"><Pencil size={11} /></button>
                            <button onClick={() => deleteComment(item.cid)} title="Excluir"
                              className="w-6 h-6 rounded-md flex items-center justify-center text-[var(--color-text-faint)] hover:text-[var(--ds-error-text)] hover:bg-[var(--color-bg-page)] transition-colors"><Trash2 size={11} /></button>
                          </div>
                        )}
                      </div>
                      {editingCommentId === item.cid ? (
                        <div>
                          <textarea autoFocus value={editCommentText} ref={el => { if (el) autoGrow(el) }}
                            onChange={e => { setEditCommentText(e.target.value); autoGrow(e.currentTarget) }}
                            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); saveEditComment(item.cid) } else if (e.key === 'Escape') { setEditingCommentId(null) } }}
                            rows={2} className="w-full bg-[var(--color-bg-card)] border border-[var(--color-accent)] rounded-lg px-2.5 py-1.5 text-xs text-[var(--color-text-primary)] outline-none resize-none" />
                          <div className="flex items-center gap-2 mt-1">
                            <button onClick={() => saveEditComment(item.cid)} className="text-[11px] font-semibold px-2.5 py-1 rounded-md text-white" style={{ background: 'var(--color-accent)' }}>Salvar</button>
                            <button onClick={() => setEditingCommentId(null)} className="text-[11px] px-2.5 py-1 rounded-md text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-subtle)]">Cancelar</button>
                          </div>
                        </div>
                      ) : (
                        <div className="text-xs text-[var(--color-text-secondary)] bg-[var(--color-bg-subtle)] rounded-xl rounded-tl-sm px-3 py-2 leading-relaxed whitespace-pre-line break-words">{renderWithMentions(item.body)}</div>
                      )}
                    </div>
                  </div>
                ) : (
                  <div key={item.id} className="flex items-start gap-2">
                    <div className="w-6 h-6 rounded-full flex items-center justify-center text-white text-[9px] font-bold flex-shrink-0 mt-0.5 opacity-80" style={{ background: av.color }}>{av.initials}</div>
                    <p className="text-[11px] text-[var(--color-text-muted)] leading-snug flex-1 pt-0.5">
                      {item.body}
                      <span className="text-[var(--color-text-faint)]" title={fullDateTime(item.at)}> · {fullDateTime(item.at)}</span>
                    </p>
                  </div>
                )
              })}
            </div>
          </div>
        </div>

        {/* FOOTER */}
        <div className="px-7 py-3.5 border-t border-[var(--color-border)] flex items-center justify-between bg-[var(--color-bg-card)]">
          <button onClick={handleDelete} className="flex items-center gap-1.5 text-xs text-[var(--color-text-muted)] transition-colors" onMouseEnter={e => (e.currentTarget.style.color = 'var(--ds-error-text)')} onMouseLeave={e => (e.currentTarget.style.color = '')}>
            <Trash2 size={13} /> Excluir
          </button>
          <div className="flex items-center gap-2">
            <button onClick={() => { onClose() }} className="px-4 py-1.5 text-sm text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] transition-colors">
              Cancelar
            </button>
            <button onClick={() => { handleSaveMain(); onClose() }} disabled={saving || !title.trim()}
              className="flex items-center gap-1.5 px-4 py-1.5 text-sm font-semibold bg-[var(--color-brand)] text-[var(--color-brand-fg)] rounded-lg disabled:opacity-40 transition-opacity">
              {saving ? 'Salvando…' : 'Salvar'} {!saving && <ChevronRight size={14} />}
            </button>
          </div>
        </div>
      </div>

      {/* LABEL PICKER */}
      {showLabelPicker && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center" onClick={() => setShowLabelPicker(false)}>
          <div className="bg-[var(--color-bg-card)] rounded-2xl border border-[var(--color-border)] p-4 w-72 shadow-xl" onClick={e => e.stopPropagation()}>
            <p className="text-sm font-bold text-[var(--color-text-primary)] mb-3">Etiquetas</p>
            {globalLabels.length > 0 && (
              <div className="flex flex-col gap-1.5 mb-3 max-h-52 overflow-y-auto">
                {globalLabels.map(gl => {
                  const applied  = labels.some(l => l.text === gl.text && l.color === gl.color)
                  const isEditing = editingLabel?.id === gl.id
                  if (isEditing) return (
                    <div key={gl.id} className="border border-[var(--color-border)] rounded-lg p-2.5 bg-[var(--color-bg-alt)]">
                      <input value={editingLabel.text} onChange={e => setEditingLabel((d: any) => ({ ...d, text: e.target.value }))}
                        className="w-full border border-[var(--color-border)] rounded-lg px-2.5 py-1 text-sm outline-none focus:border-[var(--color-brand)] mb-2" />
                      <div className="flex flex-wrap gap-1 mb-2">
                        {LABEL_PALETTE.map(p => <button key={p.color} onClick={() => setEditingLabel((d: any) => ({ ...d, color: p.color }))}
                          className={`w-6 h-6 rounded ${editingLabel.color === p.color ? 'ring-2 ring-offset-1 ring-[var(--color-brand)]' : ''}`} style={{ background: p.color }} />)}
                      </div>
                      <div className="flex gap-1.5">
                        <button onClick={() => updateGlobalLabel(gl.id, editingLabel.text, editingLabel.color)} className="flex-1 py-1.5 text-xs font-medium bg-[var(--color-brand)] text-[var(--color-brand-fg)] rounded-lg">Salvar</button>
                        <button onClick={() => deleteGlobalLabel(gl.id)} className="px-3 py-1.5 text-xs font-medium border rounded-lg transition-colors" style={{ borderColor: 'var(--ds-error-border)', color: 'var(--ds-error-text)' }} onMouseEnter={e => (e.currentTarget.style.background = 'var(--ds-error-bg)')} onMouseLeave={e => (e.currentTarget.style.background = '')}>Excluir</button>
                        <button onClick={() => setEditingLabel(null)} className="px-3 py-1.5 text-xs border border-[var(--color-border)] text-[var(--color-text-secondary)] rounded-lg">×</button>
                      </div>
                    </div>
                  )
                  return (
                    <div key={gl.id} className="flex items-center gap-1.5 group">
                      <button onClick={() => {
                        const next = applied
                          ? labels.filter(l => !(l.text === gl.text && l.color === gl.color))
                          : [...labels, { text: gl.text, color: gl.color }]
                        setLabels(next)
                        persist({ labels: next }, applied ? `${who} removeu a etiqueta "${gl.text}"` : `${who} adicionou a etiqueta "${gl.text}"`)
                      }}
                        className="flex-1 flex items-center gap-2 min-w-0">
                        <span className="flex-1 text-left text-[11px] font-bold uppercase tracking-wide px-2.5 py-1.5 rounded text-white truncate" style={{ background: gl.color }}>{gl.text}</span>
                        {applied && <Check size={14} className="text-[var(--color-text-primary)] flex-shrink-0" />}
                      </button>
                      <button onClick={() => setEditingLabel({ id: gl.id, text: gl.text, color: gl.color })}
                        className="w-7 h-7 rounded-lg hover:bg-[var(--color-bg-subtle)] flex items-center justify-center text-[var(--color-text-muted)] flex-shrink-0">
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" /><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" /></svg>
                      </button>
                    </div>
                  )
                })}
              </div>
            )}
            <div className="border-t border-[var(--color-border)] pt-3">
              <p className="text-xs text-[var(--color-text-muted)] mb-2">Criar nova</p>
              <input value={labelDraft.text} onChange={e => setLabelDraft(d => ({ ...d, text: e.target.value }))} placeholder="Texto da etiqueta"
                className="w-full border border-[var(--color-border)] rounded-lg px-3 py-1.5 text-sm outline-none focus:border-[var(--color-brand)] mb-2" />
              <div className="flex flex-wrap gap-1.5 mb-3">
                {LABEL_PALETTE.map(p => <button key={p.color} onClick={() => setLabelDraft(d => ({ ...d, color: p.color }))}
                  className={`w-7 h-7 rounded-lg ${labelDraft.color === p.color ? 'ring-2 ring-offset-1 ring-[var(--color-brand)]' : ''}`} style={{ background: p.color }} />)}
              </div>
              <button onClick={async () => {
                if (labelDraft.text.trim()) {
                  await createGlobalLabel(labelDraft.text, labelDraft.color)
                  const next = [...labels, { ...labelDraft }]
                  setLabels(next)
                  persist({ labels: next }, `${who} criou e aplicou a etiqueta "${labelDraft.text}"`)
                  setLabelDraft({ text: '', color: '#3B82F6' })
                }
              }}
                className="w-full py-2 text-sm font-medium bg-[var(--color-brand)] text-[var(--color-brand-fg)] rounded-lg">Criar e aplicar</button>
            </div>
          </div>
        </div>
      )}

      {/* DATE PICKER */}
      {showDatePicker && (() => {
        const MESES = ['jan','fev','mar','abr','mai','jun','jul','ago','set','out','nov','dez']
        const DIAS  = ['dom','seg','ter','qua','qui','sex','sáb']
        const startWeekday = new Date(calMonth.y, calMonth.m, 1).getDay()
        const daysInMonth  = new Date(calMonth.y, calMonth.m + 1, 0).getDate()
        const cells: (number|null)[] = [...Array(startWeekday).fill(null), ...Array.from({length: daysInMonth}, (_, i) => i+1)]
        function pick(d: number) {
          const mm = String(calMonth.m + 1).padStart(2,'0'), dd = String(d).padStart(2,'0')
          const iso = `${calMonth.y}-${mm}-${dd}`
          setDueDate(iso)
          const label = new Date(iso + 'T12:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' })
          persist({ due_date: iso }, `${who} definiu o prazo para ${label}`)
        }
        return (
          <div className="fixed inset-0 z-[80] flex items-center justify-center" onClick={() => setShowDatePicker(false)}>
            <div className="bg-[var(--color-bg-card)] rounded-2xl border border-[var(--color-border)] p-5 w-80 shadow-xl" onClick={e => e.stopPropagation()}>
              <div className="flex items-center justify-between mb-4">
                <p className="text-sm font-bold text-[var(--color-text-primary)]">Data limite</p>
                <button onClick={() => setShowDatePicker(false)} className="w-7 h-7 rounded-lg hover:bg-[var(--color-bg-subtle)] flex items-center justify-center text-[var(--color-text-secondary)]"><X size={14} /></button>
              </div>
              <div className="flex items-center justify-between mb-3">
                <button onClick={() => setCalMonth(c => c.m === 0 ? {y:c.y-1,m:11} : {y:c.y,m:c.m-1})} className="w-7 h-7 rounded-lg hover:bg-[var(--color-bg-subtle)] flex items-center justify-center text-[var(--color-text-secondary)]">‹</button>
                <span className="text-sm font-semibold text-[var(--color-text-primary)] capitalize">{MESES[calMonth.m]} {calMonth.y}</span>
                <button onClick={() => setCalMonth(c => c.m === 11 ? {y:c.y+1,m:0} : {y:c.y,m:c.m+1})} className="w-7 h-7 rounded-lg hover:bg-[var(--color-bg-subtle)] flex items-center justify-center text-[var(--color-text-secondary)]">›</button>
              </div>
              <div className="grid grid-cols-7 gap-1 mb-1">
                {DIAS.map(d => <div key={d} className="text-center text-[10px] font-semibold text-[var(--color-text-muted)] py-1">{d}</div>)}
              </div>
              <div className="grid grid-cols-7 gap-1 mb-4">
                {cells.map((d, i) => {
                  if (!d) return <div key={i} />
                  const mm = String(calMonth.m+1).padStart(2,'0'), dd = String(d).padStart(2,'0')
                  const thisStr = `${calMonth.y}-${mm}-${dd}`
                  const isSel = dueDate === thisStr
                  const today = new Date()
                  const isToday = today.getFullYear()===calMonth.y && today.getMonth()===calMonth.m && today.getDate()===d
                  const isPast  = new Date(thisStr+'T23:59:59') < today
                  return <button key={i} onClick={() => pick(d)}
                    className={`h-8 rounded-lg text-sm transition-colors ${isSel ? 'bg-[var(--color-brand)] text-[var(--color-brand-fg)] font-semibold' : isToday ? 'ring-1 ring-[var(--color-brand)] font-bold text-[var(--color-text-primary)]' : isPast ? 'text-[var(--color-text-faint)]' : 'text-[var(--color-text-primary)] hover:bg-[var(--color-bg-subtle)]'}`}>{d}</button>
                })}
              </div>
              <div className="flex gap-2 mb-3">
                <div className="flex-1">
                  <label className="text-[10px] font-bold uppercase text-[var(--color-text-muted)] mb-1 block">Data</label>
                  <input type="date" value={dueDate} onChange={e => setDueDate(e.target.value)} className="w-full border border-[var(--color-border)] rounded-lg px-2.5 py-1.5 text-sm text-[var(--color-text-primary)] bg-[var(--color-bg-card)] outline-none focus:border-[var(--color-brand)]" />
                </div>
                <div>
                  <label className="text-[10px] font-bold uppercase text-[var(--color-text-muted)] mb-1 block">Hora</label>
                  <input type="time" value={dueTime} onChange={e => setDueTime(e.target.value)} className="w-24 border border-[var(--color-border)] rounded-lg px-2.5 py-1.5 text-sm text-[var(--color-text-primary)] bg-[var(--color-bg-card)] outline-none focus:border-[var(--color-brand)]" />
                </div>
              </div>
              <div className="flex flex-col gap-2">
                <button onClick={() => setShowDatePicker(false)} className="w-full py-2 text-sm font-medium bg-[var(--color-brand)] text-[var(--color-brand-fg)] rounded-lg">Confirmar</button>
                {dueDate && <button onClick={() => { setDueDate(''); setDueTime(''); setShowDatePicker(false); persist({ due_date: null }, `${who} removeu o prazo`) }} className="w-full py-2 text-sm font-medium border border-[var(--color-border)] text-[var(--color-text-secondary)] rounded-lg">Remover data</button>}
              </div>
            </div>
          </div>
        )
      })()}
    </div>
    </ModalPortal>
  )
}
