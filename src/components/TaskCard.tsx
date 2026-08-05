'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { createClient } from '@/lib/supabase'
import { useUser } from '@/lib/UserContext'
import { logActivity } from '@/lib/activity'
import { useToast } from '@/lib/ToastContext'
import { dbError } from '@/lib/dbError'
import { useMentions, renderWithMentions } from '@/lib/useMentions'
import { buildReplyDraft } from '@/lib/commentReply'
import { ensureWatching, ensureWatchingFromMentions } from '@/lib/watch'
import { generateAiSummary } from '@/lib/aiSummary'
import { autoGrow } from '@/lib/autoGrow'
import { hostOf } from '@/lib/url'
import { fetchLinkTitle } from '@/lib/linkTitle'
import { useDragToDismiss } from '@/lib/gestures'
import EditableField from '@/components/EditableField'
import ModalPortal from '@/components/ModalPortal'
import WatchButton from '@/components/WatchButton'
import AttachmentsGrid from '@/components/AttachmentsGrid'
import PropertyPill, { pillSelectCls } from '@/components/PropertyPill'
import { X, Calendar, ChevronDown, Send, Pencil, Trash2, Check, Link2, Tag, Upload , Reply} from 'lucide-react'

const TYPE_OPTIONS = [
  { value: 'tarefa',   label: 'Tarefa',   color: '#3B82F6' },
  { value: 'lembrete', label: 'Lembrete', color: '#F59E0B' },
  { value: 'nota',     label: 'Nota',     color: '#8B5CF6' },
]
const STATUS_OPTIONS = [
  { value: 'a_fazer', label: 'A fazer', color: '#6B7280' },
  { value: 'fazendo',  label: 'Fazendo', color: '#F59E0B' },
  { value: 'feito',    label: 'Feito',    color: '#22C55E' },
]
const PRIORITY_OPTIONS = [
  { value: 'low',    label: 'Baixa',  color: '#94a3b8' },
  { value: 'normal', label: 'Normal', color: '#6b7280' },
  { value: 'high',   label: 'Alta',   color: '#ef4444' },
]
const LABEL_PALETTE = [
  { name: 'Vermelho', color: '#EF4444' },
  { name: 'Laranja',  color: '#F59E0B' },
  { name: 'Amarelo',  color: '#EAB308' },
  { name: 'Verde',    color: '#22C55E' },
  { name: 'Azul',     color: '#3B82F6' },
  { name: 'Roxo',     color: '#8B5CF6' },
  { name: 'Rosa',     color: '#EC4899' },
  { name: 'Cinza',    color: '#6B7280' },
]

function initials(name: string) {
  return (name || '?').split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()
}

type Props = {
  taskId?: string
  defaultAssignedTo?: string
  defaultStatus?: string
  defaultClientId?: string
  clients?: any[]
  onClose: () => void
  onSaved: () => void
  onDeleted?: (id: string) => void
}

export default function TaskCard({ taskId, defaultAssignedTo, defaultStatus, defaultClientId, clients = [], onClose, onSaved, onDeleted }: Props) {
  const { members, currentMember } = useUser()
  const who = currentMember?.name || 'Alguém'
  const { toast } = useToast()
  const supabase = createClient()
  const titleOriginal = useRef<string | null>(null)
  const [showDetails, setShowDetails] = useState(false)
  const [mobilePane, setMobilePane] = useState<'details' | 'comments'>('details')
  const [titleScrolled, setTitleScrolled] = useState(false)
  // Arrastar a barra do topo pra baixo fecha o card, como folha de iOS.
  // A alcinha cinza existe pra isso ser descobrível — gesto sem pista
  // visível ninguém acha. O X continua ali do lado.
  const sheetDrag = useDragToDismiss({ axis: 'y', direction: 1, threshold: 100, onDismiss: () => { (document.activeElement as HTMLElement)?.blur(); onClose() } })
  const scrollColRef = useRef<HTMLDivElement>(null)
  const [activityKey, setActivityKey] = useState(0)
  const [activities, setActivities] = useState<{ id: string; action: string; actor_name: string | null; description: string; created_at: string }[]>([])

  const [loading, setLoading] = useState(!!taskId)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [id, setId] = useState<string | undefined>(taskId)
  const [linkCopied, setLinkCopied] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [cardDragOver, setCardDragOver] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [title, setTitle] = useState('')
  const [type, setType] = useState('tarefa')
  const [status, setStatus] = useState(defaultStatus || 'a_fazer')
  const [priority, setPriority] = useState('normal')
  const [clientId, setClientId] = useState(defaultClientId || '')
  const [note, setNote] = useState('')
  const [dueDate, setDueDate] = useState('')
  const [assignedTo, setAssignedTo] = useState(defaultAssignedTo || currentMember?.id || '')
  const [createdAt, setCreatedAt] = useState<string | null>(null)
  const [createdByName, setCreatedByName] = useState<string | null>(null)
  const [labels, setLabels] = useState<{ text: string; color: string }[]>([])
  const [showLabelPicker, setShowLabelPicker] = useState(false)
  const [globalLabels, setGlobalLabels] = useState<any[]>([])
  const [labelDraft, setLabelDraft] = useState({ text: '', color: '#3B82F6' })
  const [editingLabel, setEditingLabel] = useState<any>(null)

  const [attachments, setAttachments] = useState<any[]>([])
  const [attachmentsLoaded, setAttachmentsLoaded] = useState(false)
  const backfilledRef = useRef(false)
  const [uploads, setUploads] = useState<any[]>([])
  const [newAttachUrl, setNewAttachUrl] = useState('')
  const [newAttachTitle, setNewAttachTitle] = useState('')
  const [showAttachInput, setShowAttachInput] = useState(false)

  const [comments, setComments] = useState<any[]>([])
  const [newComment, setNewComment] = useState('')
  const [editingCommentId, setEditingCommentId] = useState<string | null>(null)
  const [editCommentText, setEditCommentText] = useState('')
  const mentions = useMentions(newComment, setNewComment, members)

  useEffect(() => {
    supabase.from('labels').select('*').order('created_at', { ascending: true })
      .then(({ data }) => { if (data) setGlobalLabels(data) })
  }, [])

  useEffect(() => {
    const rid = id || taskId
    if (!rid) { setActivities([]); return }
    supabase.from('activity_log').select('id, action, actor_name, description, created_at')
      .eq('table_name', 'personal_tasks').eq('record_id', rid).order('created_at', { ascending: false })
      .then(({ data }) => setActivities(data || []))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, taskId, activityKey])

  const loadSub = useCallback(async (tid: string) => {
    const [{ data: cms }, { data: atts }, { data: ups }] = await Promise.all([
      supabase.from('personal_task_comments').select('*').eq('task_id', tid).order('created_at', { ascending: true }),
      supabase.from('personal_task_attachments').select('*').eq('task_id', tid).order('created_at', { ascending: true }),
      supabase.from('personal_task_uploads').select('*').eq('task_id', tid).order('created_at', { ascending: true }),
    ])
    setComments(cms || [])
    setAttachments(atts || [])
    setUploads(ups || [])
    setAttachmentsLoaded(true)
  }, [])

  // Links já escritos na nota/comentários ANTES do anexo automático existir
  // nunca foram anexados (o auto-anexo só dispara ao editar). Varre uma vez,
  // ao abrir, pra valer a regra "todo link do card aparece nos anexos".
  useEffect(() => {
    if (!id || !attachmentsLoaded || backfilledRef.current) return
    backfilledRef.current = true
    autoAttachLinks([note, ...comments.map((c: any) => c.body)].join('\n'))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, attachmentsLoaded, comments.length])

  useEffect(() => {
    if (!taskId) return
    async function load() {
      const { data } = await supabase.from('personal_tasks').select('*').eq('id', taskId).single()
      if (data) {
        setTitle(data.title || '')
        setType(data.type || 'tarefa')
        setStatus(data.status || 'a_fazer')
        setPriority(data.priority || 'normal')
        setClientId(data.client_id || '')
        setNote(data.note || '')
        setDueDate(data.due_date || '')
        setAssignedTo(data.assigned_to || '')
        setCreatedAt(data.created_at || null)
        setLabels(Array.isArray(data.labels) ? data.labels : [])
        if (data.created_by) {
          const creator = members.find((m: any) => m.id === data.created_by)
          setCreatedByName(creator?.name || null)
        }
      }
      await loadSub(taskId)
      setLoading(false)
    }
    load()
  }, [taskId, loadSub, members])

  async function ensureId(): Promise<string | undefined> {
    if (id) return id
    // Salva mesmo sem título ainda preenchido — "Sem título" até a pessoa nomear.
    const payload = {
      title: title.trim() || 'Sem título', type, status, priority, note,
      client_id: clientId || null,
      assigned_to: assignedTo,
      created_by: currentMember?.id || null,
      due_date: dueDate || null,
      labels,
    }
    // Mesmo motivo do MaterialCard: insert recusado em silêncio deixa o card
    // sem id e nada é gravado, sem nenhum aviso na tela.
    const { data, error } = await supabase.from('personal_tasks').insert(payload).select().single()
    if (dbError(error, toast, 'criar tarefa')) return undefined
    if (data) {
      setId(data.id)
      await ensureWatching('personal_tasks', data.id, [currentMember?.id, assignedTo])
      await logActivity({ tableName: 'personal_tasks', recordId: data.id, action: 'created', actorName: currentMember?.name, actorId: currentMember?.id, description: `${currentMember?.name || 'Alguém'} criou "${title.trim() || 'Sem título'}"` })
      setActivityKey(k => k + 1)
      return data.id
    }
    return undefined
  }

  async function persist(patch: Record<string, any>, logMsg?: string, action = 'updated'): Promise<string | undefined> {
    const tid = await ensureId()
    if (!tid) return undefined
    const { error } = await supabase.from('personal_tasks').update(patch).eq('id', tid)
    if (error) { toast('Erro ao salvar'); return undefined }
    if (logMsg) {
      await logActivity({ tableName: 'personal_tasks', recordId: tid, action, actorName: currentMember?.name, actorId: currentMember?.id, description: logMsg })
      setActivityKey(k => k + 1)
    }
    onSaved()
    return tid
  }

  const STATUS_LABEL: Record<string, string> = Object.fromEntries(STATUS_OPTIONS.map(s => [s.value, s.label]))
  function changeStatus(v: string) {
    const old = STATUS_LABEL[status] || status
    setStatus(v)
    const completedPatch = v === 'feito' ? { completed_at: new Date().toISOString() } : { completed_at: null }
    persist({ status: v, ...completedPatch }, `${who} moveu de "${old}" para "${STATUS_LABEL[v] || v}"`, 'status_changed')
  }
  function changeType(v: string) {
    typeManualRef.current = true
    setType(v)
    persist({ type: v }, `${who} mudou o tipo para "${TYPE_OPTIONS.find(t => t.value === v)?.label || v}"`)
  }
  function changeClient(v: string) {
    setClientId(v)
    const name = v ? (clients.find(c => c.id === v)?.name || '') : 'sem cliente'
    persist({ client_id: v || null }, `${who} definiu o cliente: ${name}`)
  }
  async function changeAssignedTo(v: string) {
    setAssignedTo(v)
    const name = members.find((m: any) => m.id === v)?.name || 'alguém'
    // ensureId() (não `id` direto) cobre também o caso de atribuir na
    // primeira interação de uma tarefa ainda não salva — `id` ainda seria
    // null nesse instante. Registra o novo responsável como observador ANTES
    // do persist disparar o push — essa era a delegação ("Delegadas por
    // você") que podia sair sem avisar ninguém.
    const tid = await ensureId()
    if (tid) await ensureWatching('personal_tasks', tid, [v])
    persist({ assigned_to: v }, `${who} atribuiu essa tarefa pra ${name}`, 'member_assigned')
  }
  function changePriority(v: string) {
    setPriority(v)
    persist({ priority: v }, `${who} definiu a prioridade: ${PRIORITY_OPTIONS.find(p => p.value === v)?.label || v}`)
  }
  const typeManualRef = useRef(!!taskId)
  function onTitleChange(v: string) {
    setTitle(v)
    if (!typeManualRef.current) {
      const lower = v.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      if (/lembr/.test(lower)) setType('lembrete')
      else if (/^nota|anota|observ/.test(lower)) setType('nota')
    }
  }

  // Etiquetas globais (mesmo padrão de Cronograma/Extras/Materiais)
  async function createGlobalLabel(text: string, color: string) {
    const { data } = await supabase.from('labels').insert({ text, color }).select().single()
    if (data) setGlobalLabels(g => [...g, data])
    return data
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

  // Anexos & Arquivos — mesmo padrão de Cronograma/Extras/Materiais (upload real + colar link)
  async function uploadFile(file: File) {
    setUploading(true)
    const tid = await ensureId()
    if (!tid) { toast('Erro ao criar a tarefa'); setUploading(false); return }
    const path = `tasks/${tid}/${Date.now()}_${file.name}`
    const { error } = await supabase.storage.from('bagano-materiais').upload(path, file, { upsert: false })
    if (error) { toast('Erro no upload: ' + error.message); setUploading(false); return }
    const { data: { publicUrl } } = supabase.storage.from('bagano-materiais').getPublicUrl(path)
    const { data: row } = await supabase.from('personal_task_uploads').insert({
      task_id: tid, filename: file.name, file_url: publicUrl, file_size: file.size, mime_type: file.type,
    }).select().single()
    if (row) setUploads(u => [...u, row])
    setUploading(false)
    await logActivity({ tableName: 'personal_tasks', recordId: tid, action: 'updated', actorName: currentMember?.name, actorId: currentMember?.id, description: `${who} enviou o arquivo "${file.name}"` })
    setActivityKey(k => k + 1)
  }
  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]; if (!file) return
    await uploadFile(file)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }
  async function removeUpload(uid: string, fileUrl: string) {
    const upload = uploads.find(u => u.id === uid)
    const path = fileUrl.split('/bagano-materiais/')[1]
    if (path) await supabase.storage.from('bagano-materiais').remove([path])
    await supabase.from('personal_task_uploads').delete().eq('id', uid)
    setUploads(u => u.filter(x => x.id !== uid))
    if (id) {
      await logActivity({ tableName: 'personal_tasks', recordId: id, action: 'updated', actorName: currentMember?.name, actorId: currentMember?.id, description: `${who} removeu o arquivo "${upload?.filename || ''}"` })
      setActivityKey(k => k + 1)
    }
  }
  async function addAttachment() {
    if (!newAttachUrl.trim()) return
    const tid = await ensureId(); if (!tid) return
    const url = newAttachUrl.trim()
    const customTitle = newAttachTitle.trim() || null
    const { data } = await supabase.from('personal_task_attachments').insert({ task_id: tid, url, title: customTitle }).select().single()
    if (data) setAttachments(a => [...a, data])
    setNewAttachUrl(''); setNewAttachTitle(''); setShowAttachInput(false)
    await logActivity({ tableName: 'personal_tasks', recordId: tid, action: 'updated', actorName: currentMember?.name, actorId: currentMember?.id, description: `${who} anexou "${customTitle || hostOf(url)}"` })
    setActivityKey(k => k + 1)
    if (!customTitle && data) {
      const fetched = await fetchLinkTitle(url)
      if (fetched) {
        await supabase.from('personal_task_attachments').update({ title: fetched }).eq('id', data.id)
        setAttachments(a => a.map(x => x.id === data.id ? { ...x, title: fetched } : x))
      }
    }
  }
  async function addAttachmentUrl(url: string) {
    const tid = await ensureId(); if (!tid) return
    const { data } = await supabase.from('personal_task_attachments').insert({ task_id: tid, url, title: null }).select().single()
    if (data) setAttachments(a => [...a, data])
    await logActivity({ tableName: 'personal_tasks', recordId: tid, action: 'updated', actorName: currentMember?.name, actorId: currentMember?.id, description: `${who} anexou "${hostOf(url)}"` })
    setActivityKey(k => k + 1)
    const fetched = await fetchLinkTitle(url)
    if (fetched && data) {
      await supabase.from('personal_task_attachments').update({ title: fetched }).eq('id', data.id)
      setAttachments(a => a.map(x => x.id === data.id ? { ...x, title: fetched } : x))
    }
  }
  // Link colado sem querer dentro da nota ou de um comentário passa
  // despercebido lá dentro do texto — leva pros Anexos automaticamente (sem
  // tirar do texto original).
  async function autoAttachLinks(text: string) {
    const urls = text.match(/https?:\/\/\S+/g) || []
    for (const url of urls) {
      if (!attachments.some(a => a.url === url)) await addAttachmentUrl(url)
    }
  }
  async function removeAttachment(aid: string) {
    const att = attachments.find(a => a.id === aid)
    await supabase.from('personal_task_attachments').delete().eq('id', aid)
    setAttachments(a => a.filter(x => x.id !== aid))
    if (id) {
      await logActivity({ tableName: 'personal_tasks', recordId: id, action: 'updated', actorName: currentMember?.name, actorId: currentMember?.id, description: `${who} removeu o anexo "${att?.title || ''}"` })
      setActivityKey(k => k + 1)
    }
  }
  async function handlePaste(e: React.ClipboardEvent) {
    const tag = (e.target as HTMLElement).tagName
    if (tag === 'INPUT' || tag === 'TEXTAREA') return
    const imgItem = Array.from(e.clipboardData.items).find(i => i.type.startsWith('image/'))
    if (imgItem) {
      const file = imgItem.getAsFile()
      if (file) { e.preventDefault(); await uploadFile(file); return }
    }
    const text = e.clipboardData.getData('text/plain').trim()
    if (/^https?:\/\/\S+$/.test(text)) { e.preventDefault(); await addAttachmentUrl(text) }
  }
  async function handleCardDrop(e: React.DragEvent) {
    if (e.dataTransfer.files.length === 0) return
    e.preventDefault()
    for (const file of Array.from(e.dataTransfer.files)) await uploadFile(file)
  }

  async function handleDelete() {
    if (!id) { onClose(); return }
    await supabase.from('personal_tasks').delete().eq('id', id)
    onDeleted?.(id)
    onClose()
  }

  async function addComment() {
    if (!newComment.trim()) return
    const tid = await ensureId()
    if (!tid) return
    if (!currentMember?.name) { toast('Diga quem é você no menu do seu nome antes de comentar.'); return }
    const author = currentMember.name
    const { data } = await supabase.from('personal_task_comments').insert({ task_id: tid, body: newComment, author_name: author }).select().single()
    if (data) setComments(c => [...c, data])
    const body = newComment
    setNewComment('')
    requestAnimationFrame(() => { if (mentions.textareaRef.current) autoGrow(mentions.textareaRef.current) })
    await ensureWatchingFromMentions('personal_tasks', tid, body, members)
    await logActivity({ tableName: 'personal_tasks', recordId: tid, action: 'commented', actorName: author, description: `${author} comentou: "${body.slice(0, 80)}${body.length > 80 ? '…' : ''}"` })
    setActivityKey(k => k + 1)
    await autoAttachLinks(body)
  }
  // Responder = citar (jeito do Trello): preenche a caixa com o trecho e a
  // menção ao autor, em vez de aninhar. A menção não é enfeite — é ela que
  // faz quem foi respondido virar observador e receber push.
  function replyToComment(author: string | null, body: string) {
    setNewComment(draft => buildReplyDraft(author, body, draft))
    requestAnimationFrame(() => {
      const el = mentions.textareaRef.current
      if (!el) return
      el.focus()
      el.selectionStart = el.selectionEnd = el.value.length
      autoGrow(el)
      el.scrollIntoView({ block: 'nearest' })
    })
  }

  async function saveEditComment(cid: string) {
    const body = editCommentText.trim(); if (!body) return
    const { error } = await supabase.from('personal_task_comments').update({ body }).eq('id', cid)
    if (!error) setComments(cs => cs.map(c => c.id === cid ? { ...c, body } : c))
    setEditingCommentId(null)
  }
  async function deleteComment(cid: string) {
    const prev = comments
    setComments(cs => cs.filter(c => c.id !== cid))
    const { error } = await supabase.from('personal_task_comments').delete().eq('id', cid)
    if (error) setComments(prev)
  }

  const clientName = clients.find(c => c.id === clientId)?.name
  const typeObj = TYPE_OPTIONS.find(t => t.value === type)
  const statusObj = STATUS_OPTIONS.find(s => s.value === status)
  const priorityObj = PRIORITY_OPTIONS.find(p => p.value === priority)

  if (loading) return (
    <ModalPortal>
      <div className="fixed inset-0 bg-black/40 z-[70] flex items-center justify-center">
        <div className="bg-[var(--color-bg-card)] rounded-2xl px-6 py-4 text-sm text-[var(--color-text-muted)]">Carregando…</div>
      </div>
    </ModalPortal>
  )

  const fullDateTime = (iso: string) => new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
  type FeedItem =
    | { kind: 'comment'; id: string; cid: string; at: string; author: string | null; body: string }
    | { kind: 'activity'; id: string; at: string; author: string | null; body: string }
  const feed: FeedItem[] = [
    ...comments.map(c => ({ kind: 'comment' as const, id: 'c' + c.id, cid: c.id, at: c.created_at, author: c.author_name, body: c.body })),
    ...activities.map(a => ({ kind: 'activity' as const, id: 'a' + a.id, at: a.created_at, author: a.actor_name, body: a.description })),
    ...(createdAt && !activities.some(a => a.action === 'created')
      ? [{ kind: 'activity' as const, id: '__created__', at: createdAt, author: createdByName, body: 'Card criado' }]
      : []),
  ].sort((x, y) => new Date(y.at).getTime() - new Date(x.at).getTime())
  const isImportantActivity = (f: FeedItem) => f.id === '__created__' || /atribu|status/i.test(f.body)
  const visibleFeed = showDetails ? feed : feed.filter(f => f.kind === 'comment' || isImportantActivity(f))

  return (
    <ModalPortal>
    <div className="fixed inset-0 bg-black/50 z-[70] flex items-center justify-center md:py-6 md:px-4"
      onClick={e => { if (e.target === e.currentTarget) { (document.activeElement as HTMLElement)?.blur(); onClose() } }}>
      <div className={`bg-[var(--color-bg-alt)] rounded-none md:rounded-2xl w-full h-full md:h-auto max-w-[1040px] max-h-full md:max-h-[92vh] flex flex-col shadow-pop overflow-hidden animate-scale-in relative ${cardDragOver ? 'ring-4 ring-[var(--color-accent)]' : ''}`}
        style={{ paddingTop: 'env(safe-area-inset-top)', paddingBottom: 'env(safe-area-inset-bottom)',
          ...(sheetDrag.offset ? { transform: `translateY(${sheetDrag.offset}px)`, transition: 'none' } : {}) }}
        onPaste={handlePaste}
        onDragOver={e => { if (e.dataTransfer.types.includes('Files')) { e.preventDefault(); setCardDragOver(true) } }}
        onDragLeave={e => { if (e.currentTarget === e.target) setCardDragOver(false) }}
        onDrop={e => { setCardDragOver(false); handleCardDrop(e) }}>
        {cardDragOver && (
          <div className="absolute inset-0 z-50 flex items-center justify-center bg-[var(--color-accent)]/10 pointer-events-none">
            <span className="text-sm font-bold px-4 py-2 rounded-xl bg-[var(--color-accent)] text-white shadow-lg">Solte pra anexar</span>
          </div>
        )}

        {/* Barra fina fixa no celular: com o cabeçalho rolando junto, sobrou
            faltando a âncora de "onde estou" e o botão de fechar sempre à
            mão — é o que o Trello mantém preso no topo. */}
        <div {...sheetDrag.handlers}
          className="md:hidden flex flex-col border-b border-[var(--color-border)] bg-[var(--color-bg-card)] flex-shrink-0 touch-pan-y">
          <div className="mx-auto mt-1.5 mb-0.5 w-9 h-1 rounded-full bg-[var(--color-border-strong)]" />
          <div className="flex items-center gap-2 px-3 pb-2 pt-0.5">
          <span className={`flex-1 min-w-0 truncate text-sm font-semibold text-[var(--color-text-primary)] transition-opacity duration-150 ${titleScrolled ? 'opacity-100' : 'opacity-0'}`}>
            {title || 'Tarefa sem título'}
          </span>
          {id && (
            <button onClick={() => { navigator.clipboard.writeText(`${window.location.origin}/dashboard/tarefas?task=${id}`); setLinkCopied(true); setTimeout(() => setLinkCopied(false), 2000) }}
              title="Copiar link do card"
              className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
              style={{ color: linkCopied ? 'var(--ds-success-text)' : 'var(--color-text-secondary)' }}>
              {linkCopied ? <Check size={15} /> : <Link2 size={15} />}
            </button>
          )}
          <button onClick={() => { (document.activeElement as HTMLElement)?.blur(); onClose() }}
            className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 text-[var(--color-text-secondary)]">
            <X size={17} />
          </button>
          </div>
        </div>

        <div className="md:hidden flex items-center border-b border-[var(--color-border)] bg-[var(--color-bg-card)] flex-shrink-0">
          <button onClick={() => setMobilePane('details')} className="flex-1 text-center py-2.5 text-sm font-semibold relative"
            style={{ color: mobilePane === 'details' ? 'var(--color-text-primary)' : 'var(--color-text-muted)' }}>
            Detalhes
            {mobilePane === 'details' && <span className="absolute bottom-0 left-3 right-3 h-0.5 rounded-full" style={{ background: 'var(--color-accent)' }} />}
          </button>
          <button onClick={() => setMobilePane('comments')} className="flex-1 text-center py-2.5 text-sm font-semibold relative"
            style={{ color: mobilePane === 'comments' ? 'var(--color-text-primary)' : 'var(--color-text-muted)' }}>
            Comentários
            {mobilePane === 'comments' && <span className="absolute bottom-0 left-3 right-3 h-0.5 rounded-full" style={{ background: 'var(--color-accent)' }} />}
          </button>
        </div>

        <div className="flex flex-col md:flex-row flex-1 overflow-hidden divide-y md:divide-y-0 md:divide-x divide-[var(--color-border)]">
        {/* No celular a coluna inteira rola: antes só o miolo rolava, e o
            cabeçalho ficava travado ocupando quase metade da tela, deixando
            o conteúdo numa fatia fina. Igual ao Trello: tudo rola junto. */}
        <div ref={scrollColRef}
          onScroll={e => { const t = e.currentTarget.scrollTop; setTitleScrolled(prev => prev ? t > 40 : t > 72) }}
          className={`${mobilePane === 'comments' ? 'hidden md:flex' : 'flex'} flex-1 min-w-0 flex-col overflow-y-auto md:overflow-hidden`}>

        {/* HEADER */}
        <div className="flex items-start justify-between gap-4 px-4 md:px-7 pt-4 pb-3 bg-[var(--color-bg-card)] border-b border-[var(--color-border)]">
          <div className="flex-1 min-w-0">
            <input value={title}
              onFocus={() => { if (titleOriginal.current === null) titleOriginal.current = title }}
              onChange={e => onTitleChange(e.target.value)}
              onBlur={() => {
                const orig = titleOriginal.current
                titleOriginal.current = null
                if (orig === null || orig === title || !title.trim()) return
                if (!id) persist({ title })
                else persist({ title }, `${who} renomeou "${orig}" para "${title}"`)
              }}
              placeholder="Nome da tarefa…"
              className="w-full text-2xl font-bold text-[var(--color-text-primary)] bg-transparent outline-none placeholder-[var(--color-text-faint)] leading-tight" />
            <p className="text-xs text-[var(--color-text-muted)] mt-1">
              {clientName ? <>em <span className="font-semibold text-[var(--color-text-secondary)]">{clientName}</span></> : 'sem cliente'}
              {createdByName && createdByName !== members.find((m: any) => m.id === assignedTo)?.name && (
                <><span className="mx-1.5 text-[var(--color-text-faint)]">·</span>adicionado por {createdByName}</>
              )}
            </p>
          </div>
          <div className="hidden md:flex items-center gap-2 flex-shrink-0">
            {id && (
              <button onClick={() => {
                navigator.clipboard.writeText(`${window.location.origin}/dashboard/tarefas?task=${id}`)
                setLinkCopied(true); setTimeout(() => setLinkCopied(false), 2000)
              }} title="Copiar link do card"
                className="w-8 h-8 rounded-lg hover:bg-[var(--color-bg-subtle)] flex items-center justify-center transition-colors"
                style={{ color: linkCopied ? 'var(--ds-success-text)' : 'var(--color-text-secondary)' }}>
                {linkCopied ? <Check size={14} /> : <Link2 size={14} />}
              </button>
            )}
            <button onClick={() => { (document.activeElement as HTMLElement)?.blur(); onClose() }} className="w-8 h-8 rounded-lg hover:bg-[var(--color-bg-subtle)] flex items-center justify-center text-[var(--color-text-secondary)] transition-colors">
              <X size={16} />
            </button>
          </div>
        </div>

        {/* PROPRIEDADES */}
        <div className="px-4 md:px-7 py-2.5 bg-[var(--color-bg-card)] border-b border-[var(--color-border)] flex flex-col gap-1.5">
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-x-3 gap-y-2">
            <PropertyPill label="Tipo">
              <div className="relative min-w-0">
                <select value={type} onChange={e => changeType(e.target.value)}
                  className={pillSelectCls} style={{ background: (typeObj?.color || '#6b7280') + '18', color: typeObj?.color || '#6b7280', borderColor: (typeObj?.color || '#6b7280') + '44' }}>
                  {TYPE_OPTIONS.map(t => <option key={t.value} value={t.value} style={{ color: 'var(--color-text-primary)' }}>{t.label}</option>)}
                </select>
                <ChevronDown size={12} className="absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: typeObj?.color || '#6b7280' }} />
              </div>
            </PropertyPill>
            <PropertyPill label="Status">
              <div className="relative min-w-0">
                <select value={status} onChange={e => changeStatus(e.target.value)}
                  className={pillSelectCls} style={{ background: (statusObj?.color || '#6b7280') + '18', color: statusObj?.color || '#6b7280', borderColor: (statusObj?.color || '#6b7280') + '44' }}>
                  {STATUS_OPTIONS.map(s => <option key={s.value} value={s.value} style={{ color: 'var(--color-text-primary)' }}>{s.label}</option>)}
                </select>
                <ChevronDown size={12} className="absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: statusObj?.color || '#6b7280' }} />
              </div>
            </PropertyPill>
            <PropertyPill label="Cliente">
              <div className="relative min-w-0">
                <select value={clientId} onChange={e => changeClient(e.target.value)}
                  className={pillSelectCls + ' bg-[var(--color-bg-card)] border-[var(--color-border)]'} style={{ color: clientId ? 'var(--color-text-primary)' : 'var(--color-text-muted)' }}>
                  <option value="">Sem cliente</option>
                  {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
                <ChevronDown size={12} className="absolute right-2 top-1/2 -translate-y-1/2 text-[var(--color-text-muted)] pointer-events-none" />
              </div>
            </PropertyPill>
            <PropertyPill label="Responsável">
              <div className="relative min-w-0">
                <select value={assignedTo} onChange={e => changeAssignedTo(e.target.value)}
                  className={pillSelectCls + ' bg-[var(--color-bg-card)] border-[var(--color-border)]'} style={{ color: 'var(--color-text-primary)' }}>
                  {members.map((m: any) => <option key={m.id} value={m.id}>{m.name}</option>)}
                </select>
                <ChevronDown size={12} className="absolute right-2 top-1/2 -translate-y-1/2 text-[var(--color-text-muted)] pointer-events-none" />
              </div>
            </PropertyPill>
            <PropertyPill label="Prioridade">
              <div className="relative min-w-0">
                <select value={priority} onChange={e => changePriority(e.target.value)}
                  className={pillSelectCls} style={{ background: (priorityObj?.color || '#6b7280') + '18', color: priorityObj?.color || '#6b7280', borderColor: (priorityObj?.color || '#6b7280') + '44' }}>
                  {PRIORITY_OPTIONS.map(p => <option key={p.value} value={p.value} style={{ color: 'var(--color-text-primary)' }}>{p.label}</option>)}
                </select>
                <ChevronDown size={12} className="absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: priorityObj?.color || '#6b7280' }} />
              </div>
            </PropertyPill>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <Calendar size={12} className="text-[var(--color-text-muted)] flex-shrink-0" />
            <input type="date" value={dueDate}
              onChange={e => { setDueDate(e.target.value); persist({ due_date: e.target.value || null }, e.target.value ? `${who} definiu o prazo` : `${who} removeu o prazo`) }}
              className="text-xs font-medium bg-transparent outline-none text-[var(--color-text-secondary)]" />
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

        {/* CONTEÚDO */}
        <div className="flex-1 min-w-0 flex flex-col gap-5 md:overflow-y-auto px-4 md:px-7 py-5">
          <EditableField
            label="Nota" hint="· detalhes, contexto, checklist em texto"
            placeholder="Detalhes da tarefa, contexto, o que precisa ser feito…"
            value={note} minH={120}
            onCommit={async v => {
              const hadId = !!id
              setNote(v)
              const tid = await persist({ note: v }, hadId ? `${who} editou a nota` : undefined)
              if (tid) {
                const summary = await generateAiSummary(v, title)
                if (summary != null) await supabase.from('personal_tasks').update({ ai_summary: summary }).eq('id', tid)
              }
              await autoAttachLinks(v)
            }}
          />

          {/* ANEXOS & ARQUIVOS */}
          <div>
            <div className="flex items-baseline gap-2 mb-2">
              <span className="text-xs font-bold text-[var(--color-text-secondary)] uppercase tracking-wider">Anexos & Arquivos</span>
              <span className="text-[10px] text-[var(--color-text-faint)]">· uploads e links</span>
            </div>

            <AttachmentsGrid
              uploads={uploads}
              links={attachments}
              onRemoveUpload={u => removeUpload(u.id, u.file_url)}
              onRemoveLink={l => removeAttachment(l.id)}
              onTitleResolved={async (aid, title) => {
                await supabase.from('personal_task_attachments').update({ title }).eq('id', aid)
                setAttachments(a => a.map(x => x.id === aid ? { ...x, title } : x))
              }}
            />

            <div className="flex gap-2">
              <input ref={fileInputRef} type="file" className="hidden" onChange={handleFileUpload} />
              <button onClick={() => fileInputRef.current?.click()} disabled={uploading}
                className="flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-alt)] border border-dashed border-[var(--color-border-hover)] flex-1 justify-center disabled:opacity-50">
                {uploading ? (
                  <><div className="w-3 h-3 border border-[#A8A59E] border-t-transparent rounded-full animate-spin" /> Enviando…</>
                ) : (
                  <><Upload size={13} /> Enviar arquivo</>
                )}
              </button>
              {!showAttachInput ? (
                <button onClick={() => setShowAttachInput(true)}
                  className="flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-alt)] border border-dashed border-[var(--color-border-hover)] flex-1 justify-center">
                  <Link2 size={13} /> Colar link
                </button>
              ) : (
                <div className="flex flex-col gap-2 flex-1 bg-[var(--color-bg-alt)] border border-[var(--color-border)] rounded-lg p-3">
                  <input value={newAttachUrl} onChange={e => setNewAttachUrl(e.target.value)} placeholder="https://drive.google.com/…" className="border border-[var(--color-border)] rounded-lg px-3 py-1.5 text-sm outline-none focus:border-[var(--color-brand)] bg-[var(--color-bg-card)]" />
                  <input value={newAttachTitle} onChange={e => setNewAttachTitle(e.target.value)} placeholder="Nome (opcional)" className="border border-[var(--color-border)] rounded-lg px-3 py-1.5 text-sm outline-none focus:border-[var(--color-brand)] bg-[var(--color-bg-card)]" />
                  <div className="flex gap-2 justify-end">
                    <button onClick={() => setShowAttachInput(false)} className="text-xs px-3 py-1.5 rounded-lg border border-[var(--color-border)] text-[var(--color-text-secondary)]">Cancelar</button>
                    <button onClick={addAttachment} className="text-xs font-medium px-3 py-1.5 rounded-lg bg-[var(--color-brand)] text-[var(--color-brand-fg)]">Anexar</button>
                  </div>
                </div>
              )}
            </div>
          </div>

          {id && (
            <button onClick={() => setConfirmDelete(true)}
              className="self-start flex items-center gap-1.5 text-xs font-medium text-[var(--color-text-faint)] hover:text-[var(--ds-error-text)] transition-colors">
              <Trash2 size={12} /> Excluir tarefa
            </button>
          )}
          {confirmDelete && (
            <div className="rounded-xl border p-3 flex items-center gap-3 text-xs" style={{ borderColor: 'var(--ds-error-border)', background: 'var(--ds-error-bg)', color: 'var(--ds-error-text)' }}>
              <span className="flex-1">Excluir essa tarefa? Não tem como desfazer.</span>
              <button onClick={handleDelete} className="font-semibold px-2.5 py-1 rounded-lg bg-[var(--ds-error-accent)] text-white">Excluir</button>
              <button onClick={() => setConfirmDelete(false)} className="font-semibold px-2.5 py-1 rounded-lg">Cancelar</button>
            </div>
          )}
        </div>
        </div>

        {/* SIDEBAR — comentários + atividade */}
        <div className={`${mobilePane === 'details' ? 'hidden md:flex' : 'flex'} w-full md:w-[340px] flex-1 md:flex-none bg-[var(--color-bg-card)] flex-col overflow-hidden`}>
          <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--color-border)]">
            <span className="text-xs font-bold text-[var(--color-text-primary)]">Comentários e atividade</span>
            <div className="flex items-center gap-2">
              <WatchButton tableName="personal_tasks" recordId={id} />
              <button onClick={() => setShowDetails(v => !v)} className="text-[11px] font-medium text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] transition-colors">
                {showDetails ? 'Ocultar detalhes' : 'Mostrar detalhes'}
              </button>
            </div>
          </div>

          <div className="px-4 py-3 border-b border-[var(--color-border)] flex items-start gap-2.5">
            <div className="w-7 h-7 rounded-full flex items-center justify-center text-white text-[10px] font-bold flex-shrink-0 mt-0.5" style={{ background: (currentMember as any)?.color || 'var(--color-brand)' }}>
              {(currentMember?.name || '?').split(' ').slice(0, 2).map((w: string) => w[0]).join('').toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <textarea ref={mentions.textareaRef} value={newComment} onChange={mentions.handleChange}
                onInput={e => autoGrow(e.currentTarget)}
                onKeyDown={e => { if (mentions.handleKeyDown(e)) return; if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); addComment() } }}
                onBlur={mentions.handleBlur}
                placeholder="Escrever um comentário… @ para mencionar" rows={3}
                className="w-full bg-[var(--color-bg-page)] border border-[var(--color-border)] rounded-lg px-3 py-2 text-xs text-[var(--color-text-primary)] outline-none resize-none focus:border-[var(--color-accent)] focus:bg-[var(--color-bg-card)] transition-colors" />
              {mentions.dropdown}
              <div className="flex justify-end mt-2">
                <button onClick={addComment} disabled={!newComment.trim()}
                  className="flex items-center gap-1.5 text-xs font-semibold px-3.5 py-1.5 rounded-lg text-white disabled:opacity-40 enabled:hover:opacity-90 transition-opacity flex-shrink-0"
                  style={{ background: 'var(--color-accent)' }}>
                  <Send size={12} /> Comentar
                </button>
              </div>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto px-4 py-3 flex flex-col gap-3">
            {visibleFeed.length === 0 ? (
              <p className="text-xs text-[var(--color-text-faint)] text-center py-8">Nada ainda.</p>
            ) : visibleFeed.map(item => {
              const memberMatch = item.author ? members.find((x: any) => x.name === item.author) : null
              const av = { initials: item.author ? initials(item.author) : '?', color: (memberMatch as any)?.color || '#9ca3af' }
              return item.kind === 'comment' ? (
                <div key={item.id} className="flex items-start gap-2.5 group">
                  <div className="w-7 h-7 rounded-full flex items-center justify-center text-white text-[10px] font-bold flex-shrink-0 mt-0.5" style={{ background: av.color }}>{av.initials}</div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 mb-1">
                      <span className="text-[11px] font-semibold text-[var(--color-text-primary)]">{item.author || 'Alguém'}</span>
                      <span className="text-[10px] text-[var(--color-text-faint)]" title={fullDateTime(item.at)}>{fullDateTime(item.at)}</span>
                      {editingCommentId !== item.cid && (
                        <div className="ml-auto flex items-center gap-0.5 opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity">
                          <button onClick={() => replyToComment(item.author, item.body)} title="Responder"
                            className="w-6 h-6 rounded-md flex items-center justify-center text-[var(--color-text-faint)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-bg-page)] transition-colors"><Reply size={11} /></button>
                          <button onClick={() => { setEditingCommentId(item.cid); setEditCommentText(item.body) }} title="Editar"
                            className="w-6 h-6 rounded-md flex items-center justify-center text-[var(--color-text-faint)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-bg-page)] transition-colors"><Pencil size={11} /></button>
                          <button onClick={() => deleteComment(item.cid)} title="Excluir"
                            className="w-6 h-6 rounded-md flex items-center justify-center text-[var(--color-text-faint)] hover:text-[var(--ds-error-text)] hover:bg-[var(--color-bg-page)] transition-colors"><Trash2 size={11} /></button>
                        </div>
                      )}
                    </div>
                    {editingCommentId === item.cid ? (
                      <div>
                        <textarea value={editCommentText} onChange={e => setEditCommentText(e.target.value)} rows={2}
                          className="w-full bg-[var(--color-bg-page)] border border-[var(--color-accent)] rounded-lg px-2.5 py-1.5 text-xs outline-none resize-none" />
                        <div className="flex gap-2 mt-1">
                          <button onClick={() => saveEditComment(item.cid)} className="text-[11px] font-semibold px-2.5 py-1 rounded-lg text-white" style={{ background: 'var(--color-accent)' }}>Salvar</button>
                          <button onClick={() => setEditingCommentId(null)} className="text-[11px] px-2.5 py-1 rounded-lg text-[var(--color-text-secondary)]">Cancelar</button>
                        </div>
                      </div>
                    ) : (
                      <div className="text-xs text-[var(--color-text-primary)] leading-relaxed whitespace-pre-line break-words">{renderWithMentions(item.body)}</div>
                    )}
                  </div>
                </div>
              ) : (
                <div key={item.id} className="flex items-start gap-2.5">
                  <div className="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5 bg-[var(--color-bg-subtle)] text-[var(--color-text-faint)] text-[10px]">•</div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs text-[var(--color-text-secondary)] leading-relaxed">{item.body}</p>
                    <span className="text-[10px] text-[var(--color-text-faint)]">{fullDateTime(item.at)}</span>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
        </div>
      </div>
    </div>

    {showLabelPicker && (
      <div className="fixed inset-0 bg-black/40 z-[80] flex items-center justify-center p-4" onClick={() => { setShowLabelPicker(false); setEditingLabel(null) }}>
        <div className="bg-[var(--color-bg-card)] rounded-2xl shadow-xl w-full max-w-sm p-4" onClick={e => e.stopPropagation()}>
          <p className="text-xs font-bold text-[var(--color-text-secondary)] uppercase tracking-wider mb-3">Etiquetas</p>
          {globalLabels.length > 0 && (
            <div className="flex flex-col gap-1 mb-3 max-h-[240px] overflow-y-auto">
              {globalLabels.map(gl => {
                const applied = labels.some(l => l.text === gl.text && l.color === gl.color)
                const isEditing = editingLabel?.id === gl.id
                return isEditing ? (
                  <div key={gl.id} className="flex flex-col gap-2 p-2 rounded-lg bg-[var(--color-bg-subtle)]">
                    <input value={editingLabel.text} onChange={e => setEditingLabel((d: any) => ({ ...d, text: e.target.value }))}
                      className="border border-[var(--color-border)] rounded-lg px-2 py-1 text-xs bg-[var(--color-bg-card)] outline-none" />
                    <div className="flex gap-1.5">
                      {LABEL_PALETTE.map(p => <button key={p.color} onClick={() => setEditingLabel((d: any) => ({ ...d, color: p.color }))}
                        className={`w-6 h-6 rounded-md ${editingLabel.color === p.color ? 'ring-2 ring-offset-1 ring-[var(--color-brand)]' : ''}`} style={{ background: p.color }} />)}
                    </div>
                    <div className="flex gap-2">
                      <button onClick={() => updateGlobalLabel(gl.id, editingLabel.text, editingLabel.color)} className="flex-1 py-1.5 text-xs font-medium bg-[var(--color-brand)] text-[var(--color-brand-fg)] rounded-lg">Salvar</button>
                      <button onClick={() => deleteGlobalLabel(gl.id)} className="px-3 py-1.5 text-xs font-medium border rounded-lg transition-colors" style={{ borderColor: 'var(--ds-error-border)', color: 'var(--ds-error-text)' }}>Excluir</button>
                    </div>
                  </div>
                ) : (
                  <div key={gl.id} className="flex items-center gap-2">
                    <button onClick={() => {
                      const next = applied ? labels.filter(l => !(l.text === gl.text && l.color === gl.color)) : [...labels, { text: gl.text, color: gl.color }]
                      setLabels(next)
                      persist({ labels: next }, applied ? `${who} removeu a etiqueta "${gl.text}"` : `${who} aplicou a etiqueta "${gl.text}"`)
                    }} className={`flex-1 flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-left transition-colors ${applied ? '' : 'hover:bg-[var(--color-bg-subtle)]'}`}
                      style={applied ? { background: gl.color + '22', border: `1px solid ${gl.color}66` } : {}}>
                      <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ background: gl.color }} />
                      <span className="text-xs font-medium text-[var(--color-text-primary)] flex-1 truncate">{gl.text}</span>
                      {applied && <Check size={12} style={{ color: gl.color }} />}
                    </button>
                    <button onClick={() => setEditingLabel(gl)} className="w-7 h-7 rounded-lg flex items-center justify-center text-[var(--color-text-faint)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-bg-subtle)]"><Pencil size={12} /></button>
                  </div>
                )
              })}
            </div>
          )}
          <div className="border-t border-[var(--color-border)] pt-3 flex flex-col gap-2">
            <input value={labelDraft.text} onChange={e => setLabelDraft(d => ({ ...d, text: e.target.value }))} placeholder="Texto da etiqueta"
              className="border border-[var(--color-border)] rounded-lg px-2.5 py-1.5 text-xs bg-[var(--color-bg-input)] outline-none focus:border-[var(--color-accent)]" />
            <div className="flex gap-1.5">
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
            }} className="text-xs font-medium px-3 py-1.5 rounded-lg bg-[var(--color-brand)] text-[var(--color-brand-fg)]">+ Nova etiqueta</button>
          </div>
          <button onClick={() => { setShowLabelPicker(false); setEditingLabel(null) }} className="w-full mt-3 text-xs font-medium text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] py-1.5">Fechar</button>
        </div>
      </div>
    )}
    </ModalPortal>
  )
}
