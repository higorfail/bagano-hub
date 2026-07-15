'use client'

import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { createClient } from '@/lib/supabase'
import { useUser } from '@/lib/UserContext'
import { logActivity } from '@/lib/activity'
import { useToast } from '@/lib/ToastContext'
import { moveToTrash } from '@/lib/trash'
import { useMentions, renderWithMentions } from '@/lib/useMentions'
import { generateAiSummary } from '@/lib/aiSummary'
import { autoGrow } from '@/lib/autoGrow'
import { hostOf, formatBytes } from '@/lib/url'
import { ensureWatching } from '@/lib/watch'
import WatchButton from '@/components/WatchButton'
import { DriveThumbnail, FolderThumbnail } from '@/components/DriveThumbnail'
import EditableField from '@/components/EditableField'
import ModalPortal from '@/components/ModalPortal'
import DeliverySection from '@/components/DeliverySection'
import PropertyPill, { pillSelectCls } from '@/components/PropertyPill'
import {
  X, Calendar, CheckSquare, Paperclip,
  Trash2, Link2, ChevronDown, Users, Tag,
  Upload, File, ExternalLink, Check, Package, Send, Pencil
} from 'lucide-react'

const TYPE_OPTIONS = ['Menu', 'Cardápio', 'Arte avulsa', 'Logo', 'Manual', 'Placa', 'Cartão', 'Sacola', 'Sousplat', 'Story', 'Capas destaque', 'Fundos', 'Outro']
const STATUS_OPTIONS = [
  { value: 'producao',            label: 'A fazer',          color: '#F59E0B' },
  { value: 'aguardando_aprovacao', label: 'Em aprovação',    color: '#EC4899' },
  { value: 'ajuste',              label: 'Ajuste solicitado', color: '#EF4444' },
  { value: 'finalizado',          label: 'Finalizado',       color: '#22C55E' },
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
  materialId?: string
  fixedClientId?: string
  clients?: any[]
  onClose: () => void
  onSaved: () => void
  onDeleted?: (id: string) => void
}

export default function MaterialCard({ materialId, fixedClientId, clients = [], onClose, onSaved, onDeleted }: Props) {
  const { members, currentMember } = useUser()
  const who = currentMember?.name || 'Alguém'
  const { toast } = useToast()
  const supabase = createClient()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const originalStatusRef = useRef('')
  const snapshotRef = useRef<string>('')
  const titleOriginal = useRef<string | null>(null)
  const typeOriginal = useRef<string | null>(null)
  const [showDetails,  setShowDetails]  = useState(true)
  const [activityKey,  setActivityKey]  = useState(0)
  const [activities,   setActivities]   = useState<{ id: string; action: string; actor_name: string | null; description: string; created_at: string }[]>([])

  const [loading,       setLoading]       = useState(!!materialId)
  const [saving,        setSaving]        = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [id,       setId]       = useState<string | undefined>(materialId)
  const [linkCopied, setLinkCopied] = useState(false)

  // Campos principais
  const [title,       setTitle]       = useState('')
  const [type,        setType]        = useState('Arte avulsa')
  const [typeManual,  setTypeManual]  = useState(false)
  const [status,      setStatus]      = useState('producao')
  const [clientId,    setClientId]    = useState(fixedClientId || '')
  const [clientManual,setClientManual]= useState(false)
  const [extraClient, setExtraClient] = useState('')
  const [description, setDescription] = useState('')
  const [dueDate,     setDueDate]     = useState('')
  const [dueTime,     setDueTime]     = useState('')
  const [driveUrl,    setDriveUrl]    = useState('')
  const [createdAt,   setCreatedAt]   = useState<string | null>(null)
  const [labels,      setLabels]      = useState<{ text: string; color: string }[]>([])

  // Múltiplos responsáveis
  const [assignedMembers, setAssignedMembers] = useState<string[]>([])

  // Sub-entidades
  const [comments,    setComments]    = useState<any[]>([])

  // Atividades do card (feed único comentários+atividade, padrão cronograma)
  useEffect(() => {
    const rid = id || materialId
    if (!rid) { setActivities([]); return }
    supabase.from('activity_log').select('id, action, actor_name, description, created_at')
      .eq('table_name', 'materials').eq('record_id', rid).order('created_at', { ascending: false })
      .then(({ data, error }) => {
        if (error) console.error('activity_log fetch error (materials):', error)
        setActivities(data || [])
      })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, materialId, activityKey])
  const [newComment,  setNewComment]  = useState('')
  const [editingCommentId, setEditingCommentId] = useState<string | null>(null)
  const [editCommentText,  setEditCommentText]  = useState('')
  const mentions = useMentions(newComment, setNewComment, members)
  const [attachments, setAttachments] = useState<any[]>([])
  const [uploads,     setUploads]     = useState<any[]>([])
  const [newAttachUrl,   setNewAttachUrl]   = useState('')
  const [newAttachTitle, setNewAttachTitle] = useState('')
  const [checklist,   setChecklist]   = useState<any[]>([])
  const [newCheckText,setNewCheckText]= useState('')
  const [uploading,   setUploading]   = useState(false)

  // UI toggles
  const [showLabelPicker,  setShowLabelPicker]  = useState(false)
  const [showDatePicker,   setShowDatePicker]   = useState(false)
  const [showAttachInput,  setShowAttachInput]  = useState(false)
  const [labelDraft,       setLabelDraft]       = useState({ text: '', color: '#3B82F6' })
  const [globalLabels,     setGlobalLabels]     = useState<any[]>([])
  const [calMonth,         setCalMonth]         = useState(() => { const d = new Date(); return { y: d.getFullYear(), m: d.getMonth() } })
  const [editingLabel,     setEditingLabel]     = useState<any>(null)

  const orderedMembers = [...members].sort((a, b) => {
    const score = (m: any) => (m.role === 'designer' ? 0 : m.role === 'editor' ? 1 : 2)
    return score(a) - score(b)
  })

  const loadSub = useCallback(async (mid: string) => {
    const [{ data: cms }, { data: atts }, { data: chk }, { data: ups }] = await Promise.all([
      supabase.from('material_comments').select('*').eq('material_id', mid).order('created_at', { ascending: true }),
      supabase.from('material_attachments').select('*').eq('material_id', mid).order('created_at', { ascending: true }),
      supabase.from('material_checklist').select('*').eq('material_id', mid).order('position', { ascending: true }),
      supabase.from('material_uploads').select('*').eq('material_id', mid).order('created_at', { ascending: true }),
    ])
    setComments(cms || [])
    setAttachments(atts || [])
    setChecklist(chk || [])
    setUploads(ups || [])
  }, [])


  useEffect(() => {
    if (!materialId) return
    async function load() {
      const { data } = await supabase.from('materials').select('*').eq('id', materialId).single()
      if (data) {
        setTitle(data.title || '')
        setType(data.type || 'Arte avulsa')
        setStatus(data.status || 'producao')
        originalStatusRef.current = data.status || 'producao'
        setClientId(data.client_id || '')
        setExtraClient(data.extra_client || '')
        setDescription(data.description || '')
        setDueDate(data.due_date || '')
        setDriveUrl(data.drive_url || '')
        setCreatedAt(data.created_at || null)
        setLabels(Array.isArray(data.labels) ? data.labels : [])
        // Múltiplos responsáveis: lê assigned_members, fallback para assigned_to legado
        const am = Array.isArray(data.assigned_members) && data.assigned_members.length > 0
          ? data.assigned_members
          : data.assigned_to ? [data.assigned_to] : []
        setAssignedMembers(am)
        snapshotRef.current = JSON.stringify({
          title: data.title || '', type: data.type || 'Arte avulsa', clientId: data.client_id || '',
          extraClient: data.extra_client || '', description: data.description || '',
          dueDate: data.due_date || '', driveUrl: data.drive_url || '',
          labels: Array.isArray(data.labels) ? data.labels : [], assignedMembers: am,
        })
      }
      await loadSub(materialId)
      setLoading(false)
    }
    load()
  }, [materialId, loadSub])

  useEffect(() => {
    supabase.from('labels').select('*').order('created_at', { ascending: true })
      .then(({ data }) => { if (data) setGlobalLabels(data) })
  }, [])

  // Detecção inteligente pelo título
  function onTitleChange(v: string) {
    setTitle(v)
    const lower = v.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    if (!fixedClientId && !clientManual) {
      const match = clients.find(c => {
        const name = c.name.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        const words = name.split(/\s+/).filter((w: string) => w.length > 3)
        return lower.includes(name) || words.some((w: string) => lower.includes(w))
      })
      setClientId(match ? match.id : '')
    }
    if (!typeManual) {
      const map: Record<string, string> = { menu: 'Menu', cardapio: 'Cardápio', logo: 'Logo', placa: 'Placa', cartao: 'Cartão', sacola: 'Sacola', sousplat: 'Sousplat', story: 'Story', stories: 'Story', capa: 'Capas destaque', fundo: 'Fundos', manual: 'Manual' }
      for (const [k, val] of Object.entries(map)) {
        if (lower.includes(k)) { setType(val); break }
      }
    }
  }

  // Garante que o material existe no banco antes de salvar sub-entidades
  async function ensureId(): Promise<string | undefined> {
    if (id) return id
    if (!title.trim()) return undefined
    const payload = {
      title, type, status,
      client_id: clientId || null,
      extra_client: extraClient || null,
      description,
      due_date: dueDate || null,
      assigned_members: assignedMembers,
      assigned_to: assignedMembers[0] || null,
      labels,
      drive_url: driveUrl,
    }
    const { data } = await supabase.from('materials').insert(payload).select().single()
    if (data) {
      setId(data.id)
      originalStatusRef.current = status
      snapshotRef.current = JSON.stringify({
        title, type, clientId: fixedClientId || clientId || '', extraClient,
        description, dueDate: dueDate || '', driveUrl: driveUrl || '', labels, assignedMembers,
      })
      ensureWatching('materials', data.id, [currentMember?.id, ...assignedMembers])
      await logActivity({ tableName: 'materials', recordId: data.id, clientId: fixedClientId || clientId || null, action: 'created', actorName: currentMember?.name, description: `${currentMember?.name || 'Alguém'} criou "${title}"` })
      setActivityKey(k => k + 1)
      return data.id
    }
    return undefined
  }

  // Salva um campo específico imediatamente e registra no histórico com mensagem detalhada (padrão cronograma)
  async function persist(patch: Record<string, any>, logMsg?: string, action = 'updated'): Promise<string | undefined> {
    const mid = await ensureId()
    if (!mid) return undefined
    const { error } = await supabase.from('materials').update(patch).eq('id', mid)
    if (error) { toast('Erro ao salvar'); return undefined }
    if (logMsg) {
      await logActivity({ tableName: 'materials', recordId: mid, clientId: fixedClientId || clientId || null, action, actorName: currentMember?.name, description: logMsg })
      setActivityKey(k => k + 1)
    }
    onSaved()
    return mid
  }

  async function logMat(mid: string, description: string, action = 'updated') {
    await logActivity({ tableName: 'materials', recordId: mid, clientId: fixedClientId || clientId || null, action, actorName: currentMember?.name, description })
    setActivityKey(k => k + 1)
  }

  const STATUS_LABEL: Record<string,string> = { producao: 'A fazer', aguardando_aprovacao: 'Em aprovação', ajuste: 'Ajuste solicitado', finalizado: 'Finalizado' }
  function changeStatus(v: string) {
    const old = STATUS_LABEL[status] || status
    setStatus(v)
    originalStatusRef.current = v
    persist({ status: v }, `${who} moveu de "${old}" para "${STATUS_LABEL[v] || v}"`, 'status_changed')
  }
  function changeClient(v: string) {
    setClientManual(true)
    setClientId(v)
    const name = v ? (clients.find(c => c.id === v)?.name || '') : 'sem cliente'
    persist({ client_id: v || null }, `${who} definiu o cliente: ${name}`)
  }

  async function handleSaveMain() {
    if (!title.trim()) return
    setSaving(true)
    const payload = {
      title, type, status,
      client_id: clientId || null,
      extra_client: extraClient || null,
      description,
      due_date: dueDate || null,
      assigned_members: assignedMembers,
      assigned_to: assignedMembers[0] || null,
      labels,
      drive_url: driveUrl,
    }
    if (!id) {
      const { data } = await supabase.from('materials').insert(payload).select().single()
      if (data) {
        setId(data.id)
        originalStatusRef.current = status
        await logActivity({ tableName: 'materials', recordId: data.id, action: 'created', actorName: currentMember?.name, description: `${currentMember?.name || 'Alguém'} criou "${title}"` })
        setActivityKey(k => k + 1)
      }
    } else {
      // Rede de segurança: garante que tudo esteja persistido ao fechar.
      // O histórico detalhado por campo já é registrado nos handlers granulares (persist()),
      // então aqui não logamos nada — evita duplicar/generalizar o que já foi registrado.
      await supabase.from('materials').update(payload).eq('id', id)
    }
    setSaving(false)
    toast('Material salvo!')
    onSaved()
  }

  // Upload de arquivo real
  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    const mid = await ensureId()
    if (!mid) { setUploading(false); return }
    const ext = file.name.split('.').pop()
    const path = `materials/${mid}/${Date.now()}_${file.name}`
    const { data: upData, error } = await supabase.storage.from('bagano-materiais').upload(path, file, { upsert: false })
    if (error) { alert('Erro no upload: ' + error.message); setUploading(false); return }
    const { data: { publicUrl } } = supabase.storage.from('bagano-materiais').getPublicUrl(path)
    const { data: row } = await supabase.from('material_uploads').insert({
      material_id: mid,
      filename: file.name,
      file_url: publicUrl,
      file_size: file.size,
      mime_type: file.type,
    }).select().single()
    if (row) setUploads(u => [...u, row])
    setUploading(false)
    if (fileInputRef.current) fileInputRef.current.value = ''
    await logMat(mid, `${who} enviou o arquivo "${file.name}"`)
  }

  async function removeUpload(uid: string, fileUrl: string) {
    const upload = uploads.find(u => u.id === uid)
    const path = fileUrl.split('/bagano-materiais/')[1]
    if (path) await supabase.storage.from('bagano-materiais').remove([path])
    await supabase.from('material_uploads').delete().eq('id', uid)
    setUploads(u => u.filter(x => x.id !== uid))
    const mid = id || materialId
    if (mid) await logMat(mid, `${who} removeu o arquivo "${upload?.filename || ''}"`)
  }

  // Comentários
  async function addComment() {
    if (!newComment.trim()) return
    const mid = await ensureId()
    if (!mid) return
    const author = currentMember?.name || 'Você'
    const { data } = await supabase.from('material_comments').insert({
      material_id: mid, body: newComment, author_name: author,
    }).select().single()
    if (data) setComments(c => [...c, data])
    setNewComment('')
    requestAnimationFrame(() => { if (mentions.textareaRef.current) autoGrow(mentions.textareaRef.current) })
    await logActivity({ tableName: 'materials', recordId: mid, action: 'commented', actorName: author, description: `${author} comentou: "${newComment.slice(0, 80)}${newComment.length > 80 ? '…' : ''}"` })
    setActivityKey(k => k + 1)
  }

  async function saveEditComment(cid: string) {
    const body = editCommentText.trim(); if (!body) return
    const { error } = await supabase.from('material_comments').update({ body }).eq('id', cid)
    if (!error) setComments(cs => cs.map(c => c.id === cid ? { ...c, body } : c))
    setEditingCommentId(null)
  }

  async function deleteComment(cid: string) {
    const prev = comments
    setComments(cs => cs.filter(c => c.id !== cid))
    const { error } = await supabase.from('material_comments').delete().eq('id', cid)
    if (error) setComments(prev)
  }

  // Anexos (links)
  async function addAttachment() {
    if (!newAttachUrl.trim()) return
    const mid = await ensureId()
    if (!mid) return
    const attachTitle = newAttachTitle || newAttachUrl
    const { data } = await supabase.from('material_attachments').insert({
      material_id: mid, url: newAttachUrl, title: attachTitle,
    }).select().single()
    if (data) setAttachments(a => [...a, data])
    setNewAttachUrl(''); setNewAttachTitle(''); setShowAttachInput(false)
    await logMat(mid, `${who} anexou "${attachTitle}"`)
  }
  async function removeAttachment(aid: string) {
    const att = attachments.find(a => a.id === aid)
    await supabase.from('material_attachments').delete().eq('id', aid)
    setAttachments(a => a.filter(x => x.id !== aid))
    const mid = id || materialId
    if (mid) await logMat(mid, `${who} removeu o anexo "${att?.title || ''}"`)
  }

  // Checklist
  async function addCheck() {
    if (!newCheckText.trim()) return
    const mid = await ensureId()
    if (!mid) return
    const { data } = await supabase.from('material_checklist').insert({
      material_id: mid, text: newCheckText, position: checklist.length,
    }).select().single()
    if (data) setChecklist(c => [...c, data])
    await logMat(mid, `${who} adicionou "${newCheckText}" na checklist`)
    setNewCheckText('')
  }
  async function toggleCheck(item: any) {
    await supabase.from('material_checklist').update({ done: !item.done }).eq('id', item.id)
    setChecklist(c => c.map(x => x.id === item.id ? { ...x, done: !x.done } : x))
    const mid = id || materialId
    if (mid) await logMat(mid, item.done ? `${who} desmarcou "${item.text}"` : `${who} marcou "${item.text}" como concluído`)
  }
  async function removeCheck(cid: string) {
    const item = checklist.find(c => c.id === cid)
    await supabase.from('material_checklist').delete().eq('id', cid)
    setChecklist(c => c.filter(x => x.id !== cid))
    const mid = id || materialId
    if (mid) await logMat(mid, `${who} removeu "${item?.text || ''}" da checklist`)
  }

  // Etiquetas globais
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

  const checkDone = checklist.filter(c => c.done).length
  const checkPct  = checklist.length ? Math.round((checkDone / checklist.length) * 100) : 0
  const clientName = clients.find(c => c.id === clientId)?.name
  const statusObj  = STATUS_OPTIONS.find(s => s.value === status)

  if (loading) return (
    <ModalPortal>
      <div className="fixed inset-0 bg-black/40 z-[70] flex items-center justify-center">
        <div className="bg-[var(--color-bg-card)] rounded-2xl px-6 py-4 text-sm text-[var(--color-text-muted)]">Carregando…</div>
      </div>
    </ModalPortal>
  )

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

        {/* CORPO — esquerda (header + props + conteúdo) | sidebar altura total */}
        <div className="flex flex-1 overflow-hidden divide-x divide-[var(--color-border)]">
        <div className="flex-1 min-w-0 flex flex-col overflow-hidden">

        {/* HEADER — título (padrão cronograma) */}
        <div className="flex items-start justify-between gap-4 px-7 pt-4 pb-3 bg-[var(--color-bg-card)] border-b border-[var(--color-border)]">
          <div className="flex-1 min-w-0">
            <input
              value={title}
              onFocus={() => { if (titleOriginal.current === null) titleOriginal.current = title }}
              onChange={e => onTitleChange(e.target.value)}
              onBlur={() => {
                const orig = titleOriginal.current
                titleOriginal.current = null
                if (orig === null || orig === title || !title.trim()) return
                if (!id) persist({ title })
                else persist({ title }, `${who} renomeou "${orig}" para "${title}"`)
              }}
              placeholder="Nome do material…"
              className="w-full text-2xl font-bold text-[var(--color-text-primary)] bg-transparent outline-none placeholder-[var(--color-text-faint)] leading-tight"
            />
            <p className="text-xs text-[var(--color-text-muted)] mt-1">
              {(clientName || extraClient)
                ? <>em <span className="font-semibold text-[var(--color-text-secondary)]">{clientName || extraClient}</span></>
                : 'sem cliente'}
              <span className="mx-1.5 text-[var(--color-text-faint)]">·</span>{type}
            </p>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            {id && (
              <button
                onClick={() => {
                  const url = `${window.location.origin}/dashboard/materiais?post=${id}`
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
            <button
              onClick={() => { handleSaveMain(); onClose() }}
              className="w-8 h-8 rounded-lg hover:bg-[var(--color-bg-subtle)] flex items-center justify-center text-[var(--color-text-secondary)] transition-colors"
            >
              <X size={16} />
            </button>
          </div>
        </div>

        {/* PROPRIEDADES — grid de pills com label embutido (encaixe determinístico) */}
        <div className="px-7 py-2.5 bg-[var(--color-bg-card)] border-b border-[var(--color-border)] flex flex-col gap-1.5">
          <div className="grid grid-cols-3 gap-x-3 gap-y-2">
          {/* Cliente (global only) — primeiro na ordem de UX */}
          {!fixedClientId && (
            <PropertyPill label="Cliente">
              <div className="relative min-w-0">
                <select
                  value={clientId}
                  onChange={e => changeClient(e.target.value)}
                  className={pillSelectCls + ' bg-[var(--color-bg-card)] border-[var(--color-border)]'} style={{ color: clientId ? 'var(--color-text-primary)' : 'var(--color-text-muted)' }}>
                  <option value="">Sem cliente</option>
                  {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
                <ChevronDown size={12} className="absolute right-2 top-1/2 -translate-y-1/2 text-[var(--color-text-muted)] pointer-events-none" />
              </div>
            </PropertyPill>
          )}
          {/* Tipo */}
          <PropertyPill label="Tipo">
            <input
              list="mc-types"
              value={type}
              placeholder="Tipo"
              onFocus={() => { if (typeOriginal.current === null) typeOriginal.current = type }}
              onChange={e => { setTypeManual(true); setType(e.target.value) }}
              onBlur={() => {
                const orig = typeOriginal.current
                typeOriginal.current = null
                if (orig === null || orig === type) return
                if (!id) persist({ type })
                else persist({ type }, `${who} mudou o tipo de "${orig}" para "${type}"`)
              }}
              className="w-full bg-[var(--color-bg-card)] border border-[var(--color-border)] rounded-lg px-2.5 py-1.5 text-xs font-semibold text-[var(--color-text-primary)] placeholder-[var(--color-text-muted)] outline-none focus:border-[var(--color-brand)] truncate"
            />
            <datalist id="mc-types">{TYPE_OPTIONS.map(t => <option key={t} value={t} />)}</datalist>
          </PropertyPill>
          {/* Status */}
          <PropertyPill label="Status">
            <div className="relative min-w-0">
              <select value={status} onChange={e => changeStatus(e.target.value)}
                className={pillSelectCls} style={{ background: (statusObj?.color || '#6b7280') + '18', color: statusObj?.color || '#6b7280', borderColor: (statusObj?.color || '#6b7280') + '44' }}>
                {STATUS_OPTIONS.map(s => <option key={s.value} value={s.value} style={{ color: 'var(--color-text-primary)' }}>{s.label}</option>)}
              </select>
              <ChevronDown size={12} className="absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: statusObj?.color || '#6b7280' }} />
            </div>
          </PropertyPill>
          {/* Data */}
          <PropertyPill label="Data">
            <button
              onClick={() => setShowDatePicker(true)}
              className="w-full flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium border border-[var(--color-border)] hover:border-[var(--color-border-hover)] transition-colors truncate"
            >
              {(() => {
                if (!dueDate) return <><Calendar size={12} className="text-[var(--color-text-muted)] flex-shrink-0" /><span className="text-[var(--color-text-muted)]">Definir</span></>
                const due = new Date(dueDate + 'T23:59:59')
                const diff = Math.ceil((due.getTime() - Date.now()) / (1000 * 60 * 60 * 24))
                const color = diff < 0 ? '#EF4444' : diff <= 2 ? '#F59E0B' : 'var(--color-text-secondary)'
                return (
                  <>
                    <Calendar size={12} style={{ color }} className="flex-shrink-0" />
                    <span style={{ color }} className="truncate">
                      {new Date(dueDate + 'T12:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })}
                      {dueTime ? ` · ${dueTime}` : ''}
                      {diff < 0 ? ' · atrasado' : diff === 0 ? ' · hoje' : diff === 1 ? ' · amanhã' : ''}
                    </span>
                  </>
                )
              })()}
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
                  <button key={m.id}
                    onClick={() => {
                      const next = sel ? assignedMembers.filter(x => x !== m.id) : [...assignedMembers, m.id]
                      setAssignedMembers(next)
                      if (!sel && id) ensureWatching('materials', id, [m.id])
                      const logMsg = sel ? `${who} removeu ${m.name} de "${title}"` : `${who} adicionou ${m.name} a "${title}"`
                      persist({ assigned_members: next, assigned_to: next[0] || null }, logMsg, sel ? 'updated' : 'member_assigned')
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
              <button
                onClick={() => setShowLabelPicker(true)}
                className="text-[11px] px-2 py-0.5 rounded-full border border-dashed border-[var(--color-border)] text-[var(--color-text-muted)] hover:border-[var(--color-border-strong)] transition-colors">
                + Etiqueta
              </button>
            </div>
          </div>
        </div>

          {/* ESQUERDA — conteúdo livre (estilo Trello, sem caixas) */}
          <div className="flex-1 min-w-0 flex flex-col gap-5 overflow-y-auto px-7 py-5">

            {/* DESCRIÇÃO — clique-para-editar (padrão cronograma) */}
            <EditableField
              label="Briefing"
              hint="· especificações, dimensões, instruções"
              placeholder="Especificações, dimensões, instruções, referências…"
              value={description}
              minH={90}
              onCommit={async v => {
                const hadId = !!id
                setDescription(v)
                const mid = await persist({ description: v }, hadId ? `${who} editou o briefing` : undefined)
                if (mid) {
                  const summary = await generateAiSummary(v, title)
                  if (summary != null) await supabase.from('materials').update({ ai_summary: summary }).eq('id', mid)
                }
              }}
            />

            {/* CHECKLIST */}
            <div>
              <div className="flex items-baseline justify-between mb-2">
                <span className="text-xs font-bold text-[var(--color-text-secondary)] uppercase tracking-wider">Checklist</span>
                {checklist.length > 0 && (
                  <span className="text-[10px] text-[var(--color-text-faint)]">{checkDone}/{checklist.length} · {checkPct}%</span>
                )}
              </div>
              {checklist.length > 0 && (
                <div className="w-full h-1.5 bg-[var(--color-bg-subtle)] rounded-full mb-3 overflow-hidden">
                  <div className="h-full bg-[#22C55E] transition-all" style={{ width: `${checkPct}%` }} />
                </div>
              )}
              <div className="flex flex-col gap-0.5">
                {checklist.map(item => (
                  <div key={item.id} className="group flex items-center gap-2.5 px-2 py-1.5 rounded-lg hover:bg-[var(--color-bg-alt)]">
                    <button
                      onClick={() => toggleCheck(item)}
                      className={`w-4 h-4 rounded border flex items-center justify-center flex-shrink-0 transition-colors ${item.done ? 'bg-[#22C55E] border-[#22C55E]' : 'border-[var(--color-border-hover)] hover:border-[#22C55E]'}`}
                    >
                      {item.done && <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3"><polyline points="20 6 9 17 4 12" /></svg>}
                    </button>
                    <span className={`text-sm flex-1 ${item.done ? 'line-through text-[var(--color-text-muted)]' : 'text-[var(--color-text-primary)]'}`}>{item.text}</span>
                    <button onClick={() => removeCheck(item.id)} className="opacity-0 group-hover:opacity-100 text-[var(--color-text-muted)] transition-opacity" onMouseEnter={e => (e.currentTarget.style.color = 'var(--ds-error-text)')} onMouseLeave={e => (e.currentTarget.style.color = '')}>
                      <Trash2 size={13} />
                    </button>
                  </div>
                ))}
              </div>
              <div className="flex items-center gap-2 mt-2">
                <input
                  value={newCheckText}
                  onChange={e => setNewCheckText(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') addCheck() }}
                  placeholder="Adicionar item…"
                  className="flex-1 bg-[var(--color-bg-alt)] border border-[var(--color-border)] rounded-lg px-3 py-1.5 text-sm text-[var(--color-text-primary)] placeholder-[var(--color-text-muted)] outline-none focus:border-[var(--color-brand)]"
                />
                <button onClick={addCheck} className="text-xs font-medium px-3 py-1.5 rounded-lg bg-[var(--color-brand)] text-[var(--color-brand-fg)]">Adicionar</button>
              </div>
            </div>

            {/* ANEXOS & UPLOADS */}
            <div>
              <div className="flex items-baseline gap-2 mb-2">
                <span className="text-xs font-bold text-[var(--color-text-secondary)] uppercase tracking-wider">Anexos & Arquivos</span>
                <span className="text-[10px] text-[var(--color-text-faint)]">· uploads e links</span>
              </div>

              {/* Arquivos enviados */}
              {uploads.length > 0 && (
                <div className="flex flex-col gap-2 mb-3">
                  {uploads.map(u => (
                    <div key={u.id} className="group flex items-center gap-3 bg-[var(--color-bg-alt)] border border-[var(--color-border)] rounded-lg px-3 py-2">
                      <div className="w-8 h-8 rounded bg-[var(--color-bg-card)] border border-[var(--color-border)] flex items-center justify-center flex-shrink-0">
                        <File size={15} className="text-[var(--color-text-secondary)]" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <a href={u.file_url} target="_blank" rel="noopener noreferrer" className="text-sm text-[var(--color-text-primary)] truncate block font-medium hover:underline" style={{ color: undefined }} onMouseEnter={e => (e.currentTarget.style.color = 'var(--ds-info-text)')} onMouseLeave={e => (e.currentTarget.style.color = '')}>
                          {u.filename}
                        </a>
                        {u.file_size && <p className="text-[10px] text-[var(--color-text-muted)]">{formatBytes(u.file_size)}</p>}
                      </div>
                      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <a href={u.file_url} target="_blank" rel="noopener noreferrer" className="w-7 h-7 rounded-lg hover:bg-[var(--color-bg-subtle)] flex items-center justify-center text-[var(--color-text-secondary)]">
                          <ExternalLink size={13} />
                        </a>
                        <button onClick={() => removeUpload(u.id, u.file_url)} className="w-7 h-7 rounded-lg flex items-center justify-center text-[var(--color-text-muted)] transition-colors" onMouseEnter={e => { e.currentTarget.style.background = 'var(--ds-error-bg)'; e.currentTarget.style.color = 'var(--ds-error-text)' }} onMouseLeave={e => { e.currentTarget.style.background = ''; e.currentTarget.style.color = '' }}>
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Links externos */}
              {attachments.length > 0 && (
                <div className="flex flex-col gap-2 mb-3">
                  {attachments.map(a => {
                    const hasCustomTitle = a.title && a.title !== a.url
                    return (
                    <div key={a.id} className="group flex items-center gap-3 bg-[var(--color-bg-alt)] border border-[var(--color-border)] rounded-lg px-3 py-2">
                      <div className="w-8 h-8 rounded bg-[var(--color-bg-card)] border border-[var(--color-border)] flex items-center justify-center flex-shrink-0 overflow-hidden">
                        <img src={`https://www.google.com/s2/favicons?domain=${hostOf(a.url)}&sz=32`} alt="" className="w-4 h-4" />
                      </div>
                      <a href={a.url} target="_blank" rel="noopener noreferrer" className="flex-1 min-w-0 hover:underline">
                        <span className="text-sm block truncate" style={{ color: 'var(--ds-info-text)' }}>{hasCustomTitle ? a.title : hostOf(a.url)}</span>
                        {hasCustomTitle && <span className="text-[10px] text-[var(--color-text-faint)] block truncate">{hostOf(a.url)}</span>}
                      </a>
                      <button onClick={() => removeAttachment(a.id)} className="opacity-0 group-hover:opacity-100 text-[var(--color-text-muted)] transition-opacity" onMouseEnter={e => (e.currentTarget.style.color = 'var(--ds-error-text)')} onMouseLeave={e => (e.currentTarget.style.color = '')}>
                        <Trash2 size={13} />
                      </button>
                    </div>
                  )})}
                </div>
              )}

              {/* Botões de ação */}
              <div className="flex gap-2">
                {/* Upload de arquivo */}
                <input ref={fileInputRef} type="file" className="hidden" onChange={handleFileUpload} />
                <button
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploading}
                  className="flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-alt)] border border-dashed border-[var(--color-border-hover)] flex-1 justify-center disabled:opacity-50"
                >
                  {uploading ? (
                    <><div className="w-3 h-3 border border-[#A8A59E] border-t-transparent rounded-full animate-spin" /> Enviando…</>
                  ) : (
                    <><Upload size={13} /> Enviar arquivo</>
                  )}
                </button>

                {/* Link externo */}
                {!showAttachInput ? (
                  <button
                    onClick={() => setShowAttachInput(true)}
                    className="flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-alt)] border border-dashed border-[var(--color-border-hover)] flex-1 justify-center"
                  >
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

          {/* DIREITA — comentários + atividade (feed único, tipo Trello) */}
          <div className="w-[380px] flex-shrink-0 bg-[var(--color-bg-card)] flex flex-col overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--color-border)]">
              <span className="text-xs font-bold text-[var(--color-text-primary)]">Comentários e atividade</span>
              <div className="flex items-center gap-2">
                <WatchButton tableName="materials" recordId={id} />
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
                const memberMatch = item.author ? members.find((x: any) => x.name === item.author) : null
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
                    <p className="text-[11px] text-[var(--color-text-muted)] leading-snug flex-1 pt-0.5 break-words">
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
        <div className="px-7 py-3.5 border-t border-[var(--color-border)] flex items-center justify-between gap-3 bg-[var(--color-bg-card)]">
          {/* Delete */}
          {materialId && !confirmDelete && (
            <button onClick={() => setConfirmDelete(true)}
              className="flex items-center gap-1.5 text-xs text-[var(--color-text-muted)] transition-colors"
              onMouseEnter={e => (e.currentTarget.style.color = 'var(--ds-error-text)')}
              onMouseLeave={e => (e.currentTarget.style.color = '')}>
              <Trash2 size={13} /> Excluir
            </button>
          )}
          {materialId && confirmDelete && (
            <div className="flex items-center gap-2">
              <span className="text-xs font-medium" style={{ color: 'var(--ds-error-text)' }}>Confirmar exclusão?</span>
              <button onClick={() => setConfirmDelete(false)} className="text-xs px-2.5 py-1 rounded-lg border border-[var(--color-border)] text-[var(--color-text-secondary)]">Cancelar</button>
              <button onClick={async () => {
                try { await moveToTrash('material', materialId, title || 'Material sem título', currentMember?.name) } catch { /* trash table missing */ }
                await logActivity({ tableName: 'materials', recordId: materialId, action: 'deleted', actorName: currentMember?.name, description: `${currentMember?.name || 'Alguém'} excluiu "${title}"` })
                await Promise.all([
                  supabase.from('material_checklist').delete().eq('material_id', materialId),
                  supabase.from('material_comments').delete().eq('material_id', materialId),
                  supabase.from('material_attachments').delete().eq('material_id', materialId),
                ])
                await supabase.from('materials').delete().eq('id', materialId)
                onDeleted?.(materialId)
                onClose()
              }} className="text-xs font-semibold px-2.5 py-1 rounded-xl text-white" style={{ background: 'var(--ds-error-accent)' }}>
                Excluir
              </button>
            </div>
          )}
          {!materialId && <div />}
          <button
            onClick={() => { handleSaveMain(); onClose() }}
            disabled={saving}
            className="px-5 py-2 text-sm font-medium bg-[var(--color-brand)] text-[var(--color-brand-fg)] rounded-lg disabled:opacity-50"
          >
            {saving ? 'Salvando…' : 'Salvar e fechar'}
          </button>
        </div>

        {/* POPOVER ETIQUETAS */}
        {showLabelPicker && (
          <div className="fixed inset-0 z-[80] flex items-center justify-center" onClick={() => setShowLabelPicker(false)}>
            <div className="bg-[var(--color-bg-card)] rounded-2xl border border-[var(--color-border)] p-4 w-72 shadow-xl" onClick={e => e.stopPropagation()}>
              <p className="text-sm font-bold text-[var(--color-text-primary)] mb-3">Etiquetas</p>
              {globalLabels.length > 0 && (
                <div className="flex flex-col gap-1.5 mb-3 max-h-52 overflow-y-auto">
                  {globalLabels.map(gl => {
                    const applied = labels.some(l => l.text === gl.text && l.color === gl.color)
                    const isEditing = editingLabel?.id === gl.id
                    if (isEditing) {
                      return (
                        <div key={gl.id} className="border border-[var(--color-border)] rounded-lg p-2.5 bg-[var(--color-bg-alt)]">
                          <input
                            value={editingLabel.text}
                            onChange={e => setEditingLabel((d: any) => ({ ...d, text: e.target.value }))}
                            className="w-full border border-[var(--color-border)] rounded-lg px-2.5 py-1 text-sm outline-none focus:border-[var(--color-brand)] mb-2"
                          />
                          <div className="flex flex-wrap gap-1 mb-2">
                            {LABEL_PALETTE.map(p => (
                              <button key={p.color} onClick={() => setEditingLabel((d: any) => ({ ...d, color: p.color }))}
                                className={`w-6 h-6 rounded ${editingLabel.color === p.color ? 'ring-2 ring-offset-1 ring-[var(--color-brand)]' : ''}`}
                                style={{ background: p.color }}
                              />
                            ))}
                          </div>
                          <div className="flex gap-1.5">
                            <button onClick={() => updateGlobalLabel(gl.id, editingLabel.text, editingLabel.color)} className="flex-1 py-1.5 text-xs font-medium bg-[var(--color-brand)] text-[var(--color-brand-fg)] rounded-lg">Salvar</button>
                            <button onClick={() => deleteGlobalLabel(gl.id)} className="px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors" style={{ borderColor: 'var(--ds-error-border)', color: 'var(--ds-error-text)' }} onMouseEnter={e => (e.currentTarget.style.background = 'var(--ds-error-bg)')} onMouseLeave={e => (e.currentTarget.style.background = '')}>Excluir</button>
                            <button onClick={() => setEditingLabel(null)} className="px-3 py-1.5 text-xs font-medium border border-[var(--color-border)] text-[var(--color-text-secondary)] rounded-lg">×</button>
                          </div>
                        </div>
                      )
                    }
                    return (
                      <div key={gl.id} className="flex items-center gap-1.5 group">
                        <button
                          onClick={() => {
                            const next = applied
                              ? labels.filter(l => !(l.text === gl.text && l.color === gl.color))
                              : [...labels, { text: gl.text, color: gl.color }]
                            setLabels(next)
                            persist({ labels: next }, applied ? `${who} removeu a etiqueta "${gl.text}"` : `${who} adicionou a etiqueta "${gl.text}"`)
                          }}
                          className="flex-1 flex items-center gap-2 min-w-0"
                        >
                          <span className="flex-1 text-left text-[11px] font-bold uppercase tracking-wide px-2.5 py-1.5 rounded text-white truncate" style={{ background: gl.color }}>{gl.text}</span>
                          {applied && <Check size={14} className="text-[var(--color-text-primary)] flex-shrink-0" />}
                        </button>
                        <button
                          onClick={() => setEditingLabel({ id: gl.id, text: gl.text, color: gl.color })}
                          className="w-7 h-7 rounded-lg hover:bg-[var(--color-bg-subtle)] flex items-center justify-center text-[var(--color-text-muted)] flex-shrink-0"
                        >
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" /><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" /></svg>
                        </button>
                      </div>
                    )
                  })}
                </div>
              )}
              <div className="border-t border-[var(--color-border)] pt-3">
                <p className="text-xs text-[var(--color-text-muted)] mb-2">Criar nova</p>
                <input
                  value={labelDraft.text}
                  onChange={e => setLabelDraft(d => ({ ...d, text: e.target.value }))}
                  placeholder="Texto da etiqueta"
                  className="w-full border border-[var(--color-border)] rounded-lg px-3 py-1.5 text-sm outline-none focus:border-[var(--color-brand)] mb-2"
                />
                <div className="flex flex-wrap gap-1.5 mb-3">
                  {LABEL_PALETTE.map(p => (
                    <button key={p.color} onClick={() => setLabelDraft(d => ({ ...d, color: p.color }))}
                      className={`w-7 h-7 rounded-lg ${labelDraft.color === p.color ? 'ring-2 ring-offset-1 ring-[var(--color-brand)]' : ''}`}
                      style={{ background: p.color }}
                    />
                  ))}
                </div>
                <button
                  onClick={async () => {
                    if (labelDraft.text.trim()) {
                      await createGlobalLabel(labelDraft.text, labelDraft.color)
                      const next = [...labels, { ...labelDraft }]
                      setLabels(next)
                      persist({ labels: next }, `${who} criou e aplicou a etiqueta "${labelDraft.text}"`)
                      setLabelDraft({ text: '', color: '#3B82F6' })
                    }
                  }}
                  className="w-full py-2 text-sm font-medium bg-[var(--color-brand)] text-[var(--color-brand-fg)] rounded-lg"
                >
                  Criar e aplicar
                </button>
              </div>
            </div>
          </div>
        )}

        {/* POPOVER DATAS */}
        {showDatePicker && (() => {
          const MESES = ['janeiro','fevereiro','março','abril','maio','junho','julho','agosto','setembro','outubro','novembro','dezembro']
          const DIAS  = ['dom','seg','ter','qua','qui','sex','sáb']
          const first = new Date(calMonth.y, calMonth.m, 1)
          const startWeekday = first.getDay()
          const daysInMonth  = new Date(calMonth.y, calMonth.m + 1, 0).getDate()
          const cells: (number | null)[] = []
          for (let i = 0; i < startWeekday; i++) cells.push(null)
          for (let d = 1; d <= daysInMonth; d++) cells.push(d)
          function pick(d: number) {
            const mm = String(calMonth.m + 1).padStart(2, '0')
            const dd = String(d).padStart(2, '0')
            const iso = `${calMonth.y}-${mm}-${dd}`
            setDueDate(iso)
            const label = new Date(iso + 'T12:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' })
            persist({ due_date: iso }, `${who} definiu o prazo para ${label}`)
          }
          return (
            <div className="fixed inset-0 z-[80] flex items-center justify-center" onClick={() => setShowDatePicker(false)}>
              <div className="bg-[var(--color-bg-card)] rounded-2xl border border-[var(--color-border)] p-5 w-80 shadow-xl" onClick={e => e.stopPropagation()}>
                <div className="flex items-center justify-between mb-4">
                  <p className="text-sm font-bold text-[var(--color-text-primary)]">Data de entrega</p>
                  <button onClick={() => setShowDatePicker(false)} className="w-7 h-7 rounded-lg hover:bg-[var(--color-bg-subtle)] flex items-center justify-center text-[var(--color-text-secondary)]"><X size={16} /></button>
                </div>
                <div className="flex items-center justify-between mb-3">
                  <button onClick={() => setCalMonth(c => c.m === 0 ? { y: c.y - 1, m: 11 } : { y: c.y, m: c.m - 1 })} className="w-7 h-7 rounded-lg hover:bg-[var(--color-bg-subtle)] flex items-center justify-center text-[var(--color-text-secondary)]">‹</button>
                  <span className="text-sm font-semibold text-[var(--color-text-primary)] capitalize">{MESES[calMonth.m]} {calMonth.y}</span>
                  <button onClick={() => setCalMonth(c => c.m === 11 ? { y: c.y + 1, m: 0 } : { y: c.y, m: c.m + 1 })} className="w-7 h-7 rounded-lg hover:bg-[var(--color-bg-subtle)] flex items-center justify-center text-[var(--color-text-secondary)]">›</button>
                </div>
                <div className="grid grid-cols-7 gap-1 mb-1">
                  {DIAS.map(d => <div key={d} className="text-center text-[10px] font-semibold text-[var(--color-text-muted)] py-1">{d}</div>)}
                </div>
                <div className="grid grid-cols-7 gap-1 mb-4">
                  {cells.map((d, i) => {
                    if (d === null) return <div key={i} />
                    const mm = String(calMonth.m + 1).padStart(2, '0')
                    const dd = String(d).padStart(2, '0')
                    const thisStr = `${calMonth.y}-${mm}-${dd}`
                    const isSel = dueDate === thisStr
                    const today = new Date()
                    const isToday = today.getFullYear() === calMonth.y && today.getMonth() === calMonth.m && today.getDate() === d
                    const isPast = new Date(thisStr + 'T23:59:59') < today
                    return (
                      <button key={i} onClick={() => pick(d)}
                        className={`h-8 rounded-lg text-sm transition-colors ${isSel ? 'bg-[var(--color-brand)] text-[var(--color-brand-fg)] font-semibold' : isToday ? 'text-[var(--color-text-primary)] font-bold ring-1 ring-[var(--color-brand)]' : isPast ? 'text-[var(--color-text-faint)]' : 'text-[var(--color-text-primary)] hover:bg-[var(--color-bg-subtle)]'}`}
                      >
                        {d}
                      </button>
                    )
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
                  {dueDate && (
                    <button onClick={() => { setDueDate(''); setDueTime(''); setShowDatePicker(false); persist({ due_date: null }, `${who} removeu o prazo`) }} className="w-full py-2 text-sm font-medium border border-[var(--color-border)] text-[var(--color-text-secondary)] rounded-lg">Remover data</button>
                  )}
                </div>
              </div>
            </div>
          )
        })()}
      </div>
    </div>
    </ModalPortal>
  )
}
