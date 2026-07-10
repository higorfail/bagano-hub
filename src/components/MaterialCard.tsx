'use client'

import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { createClient } from '@/lib/supabase'
import { useUser } from '@/lib/UserContext'
import { logActivity } from '@/lib/activity'
import ActivityLog from '@/components/ActivityLog'
import { useToast } from '@/lib/ToastContext'
import { moveToTrash } from '@/lib/trash'
import { useMentions, renderWithMentions } from '@/lib/useMentions'
import { DriveThumbnail, FolderThumbnail } from '@/components/DriveThumbnail'
import EditableField from '@/components/EditableField'
import {
  X, Calendar, CheckSquare, Paperclip,
  Trash2, Link2, ChevronDown,
  Upload, File, ExternalLink, Check
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

function formatBytes(bytes: number) {
  if (bytes < 1024) return bytes + ' B'
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB'
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB'
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
  const { toast } = useToast()
  const supabase = createClient()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const originalStatusRef = useRef('')
  const snapshotRef = useRef<string>('')
  const [sideTab,      setSideTab]      = useState<'comments' | 'history'>('comments')
  const [activityKey,  setActivityKey]  = useState(0)

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
  const [newComment,  setNewComment]  = useState('')
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
    if (data) { setId(data.id); return data.id }
    return undefined
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
      const statusLabels: Record<string,string> = { producao: 'A fazer', aguardando_aprovacao: 'Em aprovação', ajuste: 'Ajuste solicitado', finalizado: 'Finalizado' }
      if (status !== originalStatusRef.current) {
        const oldLabel = statusLabels[originalStatusRef.current] || originalStatusRef.current
        const newLabel = statusLabels[status] || status
        await logActivity({ tableName: 'materials', recordId: id, action: 'status_changed', actorName: currentMember?.name, field: 'status', oldValue: oldLabel, newValue: newLabel, description: `Status mudou: ${oldLabel} → ${newLabel}` })
        originalStatusRef.current = status
        setActivityKey(k => k + 1)
      }
      const nextSnapshot = JSON.stringify({
        title, type, clientId: fixedClientId || clientId || '', extraClient,
        description, dueDate: dueDate || '', driveUrl: driveUrl || '', labels, assignedMembers,
      })
      if (snapshotRef.current && nextSnapshot !== snapshotRef.current) {
        await logActivity({ tableName: 'materials', recordId: id, action: 'updated', actorName: currentMember?.name, description: `${currentMember?.name || 'Alguém'} editou "${title}"` })
        setActivityKey(k => k + 1)
      }
      snapshotRef.current = nextSnapshot
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
  }

  async function removeUpload(uid: string, fileUrl: string) {
    const path = fileUrl.split('/bagano-materiais/')[1]
    if (path) await supabase.storage.from('bagano-materiais').remove([path])
    await supabase.from('material_uploads').delete().eq('id', uid)
    setUploads(u => u.filter(x => x.id !== uid))
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
    await logActivity({ tableName: 'materials', recordId: mid, action: 'commented', actorName: author, description: `${author} comentou: "${newComment.slice(0, 80)}${newComment.length > 80 ? '…' : ''}"` })
    setActivityKey(k => k + 1)
  }

  // Anexos (links)
  async function addAttachment() {
    if (!newAttachUrl.trim()) return
    const mid = await ensureId()
    if (!mid) return
    const { data } = await supabase.from('material_attachments').insert({
      material_id: mid, url: newAttachUrl, title: newAttachTitle || newAttachUrl,
    }).select().single()
    if (data) setAttachments(a => [...a, data])
    setNewAttachUrl(''); setNewAttachTitle(''); setShowAttachInput(false)
  }
  async function removeAttachment(aid: string) {
    await supabase.from('material_attachments').delete().eq('id', aid)
    setAttachments(a => a.filter(x => x.id !== aid))
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
    setNewCheckText('')
  }
  async function toggleCheck(item: any) {
    await supabase.from('material_checklist').update({ done: !item.done }).eq('id', item.id)
    setChecklist(c => c.map(x => x.id === item.id ? { ...x, done: !x.done } : x))
  }
  async function removeCheck(cid: string) {
    await supabase.from('material_checklist').delete().eq('id', cid)
    setChecklist(c => c.filter(x => x.id !== cid))
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
    <div className="fixed inset-0 bg-black/40 z-[70] flex items-center justify-center">
      <div className="bg-[var(--color-bg-card)] rounded-2xl px-6 py-4 text-sm text-[var(--color-text-muted)]">Carregando…</div>
    </div>
  )

  const SectionTitle = ({ icon: Icon, children, right }: any) => (
    <div className="flex items-center justify-between mb-3">
      <div className="flex items-center gap-2">
        <Icon size={16} className="text-[var(--color-text-secondary)]" />
        <p className="text-sm font-bold text-[var(--color-text-primary)]">{children}</p>
      </div>
      {right}
    </div>
  )

  return (
    <div
      className="fixed inset-0 bg-black/50 z-[70] flex items-center justify-center py-6 px-4"
      onClick={e => { if (e.target === e.currentTarget) { handleSaveMain(); onClose() } }}
    >
      <div className="bg-[var(--color-bg-alt)] rounded-2xl w-full max-w-[1040px] max-h-[92vh] flex flex-col shadow-pop overflow-hidden animate-scale-in">

        {/* HEADER — título (padrão cronograma) */}
        <div className="flex items-start justify-between gap-4 px-7 pt-4 pb-3 bg-[var(--color-bg-card)] border-b border-[var(--color-border)]">
          <div className="flex-1 min-w-0">
            <input
              value={title}
              onChange={e => onTitleChange(e.target.value)}
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

        {/* PROPRIEDADES — barra horizontal no topo (padrão cronograma) */}
        <div className="flex flex-wrap items-end gap-x-5 gap-y-2.5 px-7 py-3 bg-[var(--color-bg-card)] border-b border-[var(--color-border)]">
          {/* Tipo */}
          <div className="flex flex-col gap-1">
            <span className="text-[10px] font-bold text-[var(--color-text-muted)] uppercase tracking-wider">Tipo</span>
            <input
              list="mc-types"
              value={type}
              onChange={e => { setTypeManual(true); setType(e.target.value) }}
              className="w-36 border border-[var(--color-border)] rounded-lg px-2.5 py-1.5 text-xs font-medium text-[var(--color-text-primary)] bg-[var(--color-bg-card)] outline-none focus:border-[var(--color-brand)]"
            />
            <datalist id="mc-types">{TYPE_OPTIONS.map(t => <option key={t} value={t} />)}</datalist>
          </div>
          {/* Status */}
          <div className="flex flex-col gap-1">
            <span className="text-[10px] font-bold text-[var(--color-text-muted)] uppercase tracking-wider">Status</span>
            <div className="relative">
              <select value={status} onChange={e => setStatus(e.target.value)}
                className="appearance-none rounded-lg pl-2.5 pr-7 py-1.5 text-xs font-semibold outline-none cursor-pointer border"
                style={{ background: (statusObj?.color || '#6b7280') + '18', color: statusObj?.color || '#6b7280', borderColor: (statusObj?.color || '#6b7280') + '44' }}>
                {STATUS_OPTIONS.map(s => <option key={s.value} value={s.value} style={{ color: 'var(--color-text-primary)' }}>{s.label}</option>)}
              </select>
              <ChevronDown size={12} className="absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: statusObj?.color || '#6b7280' }} />
            </div>
          </div>
          {/* Data */}
          <div className="flex flex-col gap-1">
            <span className="text-[10px] font-bold text-[var(--color-text-muted)] uppercase tracking-wider">Data</span>
            <button
              onClick={() => setShowDatePicker(true)}
              className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium border border-[var(--color-border)] hover:border-[var(--color-border-hover)] transition-colors"
            >
              {(() => {
                if (!dueDate) return <><Calendar size={12} className="text-[var(--color-text-muted)]" /><span className="text-[var(--color-text-muted)]">Definir</span></>
                const due = new Date(dueDate + 'T23:59:59')
                const diff = Math.ceil((due.getTime() - Date.now()) / (1000 * 60 * 60 * 24))
                const color = diff < 0 ? '#EF4444' : diff <= 2 ? '#F59E0B' : 'var(--color-text-secondary)'
                return (
                  <>
                    <Calendar size={12} style={{ color }} />
                    <span style={{ color }} className="font-medium">
                      {new Date(dueDate + 'T12:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })}
                      {dueTime ? ` · ${dueTime}` : ''}
                      {diff < 0 ? ' · atrasado' : diff === 0 ? ' · hoje' : diff === 1 ? ' · amanhã' : ''}
                    </span>
                  </>
                )
              })()}
            </button>
          </div>
          {/* Cliente (global only) */}
          {!fixedClientId && (
            <div className="flex flex-col gap-1">
              <span className="text-[10px] font-bold text-[var(--color-text-muted)] uppercase tracking-wider">Cliente</span>
              <div className="flex items-center gap-1.5">
                <div className="relative">
                  <select
                    value={clientId}
                    onChange={e => { setClientManual(true); setClientId(e.target.value) }}
                    className="appearance-none rounded-lg pl-2.5 pr-7 py-1.5 text-xs font-medium text-[var(--color-text-primary)] bg-[var(--color-bg-card)] border border-[var(--color-border)] outline-none cursor-pointer">
                    <option value="">— avulso —</option>
                    {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                  <ChevronDown size={12} className="absolute right-2 top-1/2 -translate-y-1/2 text-[var(--color-text-muted)] pointer-events-none" />
                </div>
                {!clientId && (
                  <input
                    value={extraClient}
                    onChange={e => setExtraClient(e.target.value)}
                    placeholder="Nome avulso"
                    className="w-28 border border-[var(--color-border)] rounded-lg px-2.5 py-1.5 text-xs text-[var(--color-text-primary)] bg-[var(--color-bg-card)] placeholder-[var(--color-text-muted)] outline-none focus:border-[var(--color-brand)]"
                  />
                )}
              </div>
            </div>
          )}
          {/* Responsáveis */}
          <div className="flex flex-col gap-1.5">
            <span className="text-[10px] font-bold text-[var(--color-text-muted)] uppercase tracking-wider">Responsáveis</span>
            <div className="flex flex-wrap gap-1">
              {orderedMembers.map(m => {
                const sel = assignedMembers.includes(m.id)
                return (
                  <button key={m.id}
                    onClick={() => setAssignedMembers(prev => sel ? prev.filter(x => x !== m.id) : [...prev, m.id])}
                    className={`text-[11px] px-2 py-0.5 rounded-full border transition-colors ${sel ? 'bg-[var(--color-brand)] text-[var(--color-brand-fg)] border-transparent' : 'border-[var(--color-border)] text-[var(--color-text-secondary)] hover:border-[var(--color-border-strong)]'}`}>
                    {m.name.split(' ')[0]}
                  </button>
                )
              })}
            </div>
          </div>
          {/* Etiquetas */}
          <div className="flex flex-col gap-1.5">
            <span className="text-[10px] font-bold text-[var(--color-text-muted)] uppercase tracking-wider">Etiquetas</span>
            <div className="flex flex-wrap gap-1.5 items-center">
              {labels.map((l, i) => (
                <span key={i} className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-md text-white" style={{ background: l.color }}>
                  {l.text}
                  <button onClick={() => setLabels(ls => ls.filter((_, idx) => idx !== i))}><X size={9} /></button>
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

        {/* CORPO */}
        <div className="flex overflow-hidden flex-1 divide-x divide-[var(--color-border)]">

          {/* ESQUERDA */}
          <div className="flex-1 min-w-0 flex flex-col gap-4 overflow-y-auto px-7 py-5">

            {/* DESCRIÇÃO — clique-para-editar (padrão cronograma) */}
            <EditableField
              label="Briefing"
              hint="· especificações, dimensões, instruções"
              placeholder="Especificações, dimensões, instruções, referências…"
              value={description}
              minH={90}
              onCommit={async v => {
                setDescription(v)
                if (id) await supabase.from('materials').update({ description: v }).eq('id', id)
              }}
            />

            {/* CHECKLIST */}
            <div className="bg-[var(--color-bg-card)] border border-[var(--color-border)] rounded-2xl p-4">
              <SectionTitle
                icon={CheckSquare}
                right={checklist.length > 0 && (
                  <span className="text-xs font-semibold text-[var(--color-text-secondary)]">{checkDone}/{checklist.length} · {checkPct}%</span>
                )}
              >
                Checklist
              </SectionTitle>
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
            <div className="bg-[var(--color-bg-card)] border border-[var(--color-border)] rounded-2xl p-4">
              <SectionTitle icon={Paperclip}>Anexos & Arquivos</SectionTitle>

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
                  {attachments.map(a => (
                    <div key={a.id} className="group flex items-center gap-3 bg-[var(--color-bg-alt)] border border-[var(--color-border)] rounded-lg px-3 py-2">
                      <div className="w-8 h-8 rounded bg-[var(--color-bg-card)] border border-[var(--color-border)] flex items-center justify-center flex-shrink-0">
                        <Link2 size={15} className="text-[var(--color-text-secondary)]" />
                      </div>
                      <a href={a.url} target="_blank" rel="noopener noreferrer" className="flex-1 text-sm hover:underline truncate" style={{ color: 'var(--ds-info-text)' }}>{a.title}</a>
                      <button onClick={() => removeAttachment(a.id)} className="opacity-0 group-hover:opacity-100 text-[var(--color-text-muted)] transition-opacity" onMouseEnter={e => (e.currentTarget.style.color = 'var(--ds-error-text)')} onMouseLeave={e => (e.currentTarget.style.color = '')}>
                        <Trash2 size={13} />
                      </button>
                    </div>
                  ))}
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

            {/* ENTREGA DO CONTEÚDO — fim da coluna */}
            <div
              className="rounded-2xl p-4 transition-colors"
              style={driveUrl
                ? { background: 'var(--ds-success-bg)', border: '1px solid var(--ds-success-border)' }
                : { background: 'var(--color-bg-card)', border: '1px solid var(--color-border)' }}
            >
              <SectionTitle icon={Link2}>
                {driveUrl ? '✓ Entrega do conteúdo' : 'Entrega do conteúdo'}
              </SectionTitle>
              {driveUrl && (
                /\/folders\//.test(driveUrl)
                  ? <FolderThumbnail folderUrl={driveUrl} />
                  : <DriveThumbnail driveUrl={driveUrl} isVideo={/reel|video|vídeo|\.mp4/i.test(type + ' ' + driveUrl)} />
              )}
              <div className="flex gap-2">
                <input
                  value={driveUrl}
                  onChange={e => setDriveUrl(e.target.value)}
                  placeholder="Link do Drive, Figma, WeTransfer…"
                  className="flex-1 border border-[var(--color-border)] rounded-xl px-3 py-2 text-sm text-[var(--color-text-primary)] placeholder-[var(--color-text-muted)] outline-none focus:border-[var(--color-brand)] bg-[var(--color-bg-alt)]"
                />
                {driveUrl && (
                  <a
                    href={driveUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1.5 text-xs font-medium px-3 py-2 rounded-xl border"
                    style={{ color: 'var(--ds-success-text)', borderColor: 'var(--ds-success-border)' }}
                  >
                    <ExternalLink size={13} /> Abrir
                  </a>
                )}
              </div>
            </div>
          </div>

          {/* DIREITA — comentários / histórico */}
          <div className="w-80 flex-shrink-0 flex flex-col bg-[var(--color-bg-card)]">
            <div className="px-5 py-3.5 border-b border-[var(--color-border)]">
              <div className="flex rounded-lg bg-[var(--color-bg-subtle)] p-0.5">
                <button onClick={() => setSideTab('comments')} className={`flex-1 text-xs font-medium py-1 rounded-md transition-all ${sideTab === 'comments' ? 'bg-[var(--color-bg-card)] text-[var(--color-text-primary)] shadow-sm' : 'text-[var(--color-text-muted)]'}`}>
                  Comentários {comments.length > 0 ? `(${comments.length})` : ''}
                </button>
                <button onClick={() => setSideTab('history')} className={`flex-1 text-xs font-medium py-1 rounded-md transition-all ${sideTab === 'history' ? 'bg-[var(--color-bg-card)] text-[var(--color-text-primary)] shadow-sm' : 'text-[var(--color-text-muted)]'}`}>
                  Histórico
                </button>
              </div>
            </div>

            {sideTab === 'history' ? (
              <div className="flex-1 overflow-y-auto px-5 py-4">
                <ActivityLog tableName="materials" recordId={id || materialId || ''} refreshKey={activityKey} createdAt={createdAt} />
              </div>
            ) : (
              <div className="flex-1 overflow-y-auto px-5 py-4 flex flex-col gap-4">
                {comments.length === 0 && (
                  <p className="text-xs text-[var(--color-text-faint)] text-center py-6">Nenhum comentário ainda.</p>
                )}
                {[...comments].reverse().map(c => (
                  <div key={c.id} className="flex gap-2.5">
                    <div className="w-7 h-7 rounded-full flex items-center justify-center text-white text-[9px] font-bold flex-shrink-0" style={{ background: (members.find((m: any) => m.name === c.author_name) as any)?.color || 'var(--color-brand)' }}>
                      {initials(c.author_name)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs mb-1">
                        <span className="font-semibold text-[var(--color-text-primary)]">{c.author_name}</span>{' '}
                        <span className="text-[var(--color-text-muted)]">
                          {new Date(c.created_at).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </p>
                      <p className="text-sm text-[var(--color-text-primary)] bg-[var(--color-bg-alt)] border border-[var(--color-border)] rounded-lg px-3 py-2 whitespace-pre-wrap">{renderWithMentions(c.body)}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {sideTab === 'comments' && (
              <div className="px-5 py-4 border-t border-[var(--color-border)]">
                <div className="flex gap-2.5">
                  <div className="w-7 h-7 rounded-full flex items-center justify-center text-white text-[9px] font-bold flex-shrink-0 mt-0.5" style={{ background: (currentMember as any)?.color || 'var(--color-brand)' }}>
                    {currentMember ? initials(currentMember.name) : 'VO'}
                  </div>
                  <div className="flex-1">
                    <textarea
                      ref={mentions.textareaRef}
                      value={newComment}
                      onChange={mentions.handleChange}
                      onKeyDown={e => { if (mentions.handleKeyDown(e)) return; if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) addComment() }}
                      onBlur={mentions.handleBlur}
                      rows={2}
                      placeholder="Escrever um comentário… @ menciona  (⌘Enter)"
                      className="w-full bg-[var(--color-bg-alt)] border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm text-[var(--color-text-primary)] placeholder-[var(--color-text-muted)] outline-none focus:border-[var(--color-brand)] resize-none"
                    />
                    {mentions.dropdown}
                    {newComment.trim() && (
                      <button onClick={addComment} className="mt-1.5 w-full text-xs font-medium px-3 py-1.5 rounded-lg bg-[var(--color-brand)] text-[var(--color-brand-fg)]">
                        Comentar
                      </button>
                    )}
                  </div>
                </div>
              </div>
            )}
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
                            if (applied) setLabels(ls => ls.filter(l => !(l.text === gl.text && l.color === gl.color)))
                            else setLabels(ls => [...ls, { text: gl.text, color: gl.color }])
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
                      setLabels(ls => [...ls, { ...labelDraft }])
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
            setDueDate(`${calMonth.y}-${mm}-${dd}`)
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
                    <button onClick={() => { setDueDate(''); setDueTime(''); setShowDatePicker(false) }} className="w-full py-2 text-sm font-medium border border-[var(--color-border)] text-[var(--color-text-secondary)] rounded-lg">Remover data</button>
                  )}
                </div>
              </div>
            </div>
          )
        })()}
      </div>
    </div>
  )
}
