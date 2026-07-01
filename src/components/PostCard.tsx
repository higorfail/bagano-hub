'use client'

import { useState, useEffect, useRef } from 'react'
import { createClient } from '@/lib/supabase'
import { X, Calendar, Trash2, Link2, AlignLeft, ImagePlus, XCircle, Target, Megaphone, Package, Check, ChevronDown, Send } from 'lucide-react'
import { useToast } from '@/lib/ToastContext'
import { useUser } from '@/lib/UserContext'
import { moveToTrash } from '@/lib/trash'
import { logActivity } from '@/lib/activity'
import { dbError } from '@/lib/dbError'
import ActivityLog from '@/components/ActivityLog'

const POST_TYPES = [
  { value: 'carrossel',         label: 'Carrossel',         color: '#3b82f6' },
  { value: 'reels',             label: 'Reels',             color: '#ef4444' },
  { value: 'post',              label: 'Post',              color: '#f59e0b' },
  { value: 'story',             label: 'Story',             color: '#8b5cf6' },
  { value: 'carrossel_stories', label: 'Carrossel/Stories', color: '#6366f1' },
]
const STATUSES = [
  { value: 'producao',              label: 'Produção',            color: '#f59e0b' },
  { value: 'revisao_interna',       label: 'Revisão interna',     color: '#6b7280' },
  { value: 'aguardando_aprovacao',  label: 'Aguardando aprovação',color: '#ec4899' },
  { value: 'aprovado',              label: 'Aprovado',            color: '#22c55e' },
  { value: 'agendado',              label: 'Agendado',            color: '#3b82f6' },
  { value: 'publicado',             label: 'Publicado',           color: '#059669' },
]
const FUNIL_OPTIONS = ['Topo de funil','Meio de funil','Fundo de funil','Institucional','Promocional','Engajamento','Venda']
const STATUS_LABEL: Record<string, string> = Object.fromEntries(STATUSES.map(s => [s.value, s.label]))

const MESES = ['janeiro','fevereiro','março','abril','maio','junho','julho','agosto','setembro','outubro','novembro','dezembro']
const DIAS  = ['dom','seg','ter','qua','qui','sex','sáb']

type PostForm = {
  title: string; copy: string; post_type: string; scheduled_date: string
  status: string; drive_url: string; reference_notes: string; funil: string
  campaign_type: string; reference_images: string[]
}
const EMPTY: PostForm = { title:'', copy:'', post_type:'carrossel', scheduled_date:'', status:'producao', drive_url:'', reference_notes:'', funil:'', campaign_type:'', reference_images:[] }

type Props = {
  postId?: string
  clientId: string
  clientName?: string
  clientColor?: string
  month: number
  year: number
  postNumber?: number
  onClose: () => void
  onSaved: () => void
  onDeleted?: () => void
}

type EditableField = 'title' | 'copy' | 'reference_notes' | 'drive_url'
type Comment = { id: string; author_name: string | null; body: string; created_at: string }

function commentTime(iso: string) {
  const d = new Date(iso)
  const diff = Date.now() - d.getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'agora'
  if (mins < 60) return `${mins}min`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h`
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })
}

export default function PostCard({ postId, clientId, clientName, clientColor, month, year, postNumber, onClose, onSaved, onDeleted }: Props) {
  const supabase = createClient()
  const { toast } = useToast()
  const { currentMember } = useUser()
  const [loading,      setLoading]      = useState(!!postId)
  const [deleting,     setDeleting]     = useState(false)
  const [confirmDelete,setConfirmDelete]= useState(false)
  const [uploadingRef, setUploadingRef] = useState(false)
  const [currentId,    setCurrentId]    = useState<string | undefined>(postId)
  const [campaigns,    setCampaigns]    = useState<{ id: string; name: string; type: string }[]>([])
  const [editingField, setEditingField] = useState<EditableField | null>(null)
  const [justSaved,    setJustSaved]    = useState(false)
  const [activityKey,  setActivityKey]  = useState(0)
  const [sideTab,      setSideTab]      = useState<'detalhes' | 'comentarios' | 'historico'>('detalhes')
  const [comments,     setComments]     = useState<Comment[]>([])
  const [newComment,   setNewComment]   = useState('')
  const refInputRef = useRef<HTMLInputElement>(null)

  const [form,     setForm]     = useState<PostForm>(EMPTY)
  const formRef = useRef(form); formRef.current = form
  const [showCal,  setShowCal]  = useState(false)
  const [calMonth, setCalMonth] = useState(() => ({ y: year, m: month - 1 }))

  const isNew = !postId
  const savedTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    supabase.from('campaigns').select('id, name, type').eq('client_id', clientId).then(({ data }) => setCampaigns(data || []))
  }, [clientId])

  useEffect(() => {
    if (!postId) return
    async function load() {
      const { data } = await supabase.from('schedules').select('*').eq('id', postId).single()
      if (data) setForm({
        title: data.title || '', copy: data.copy || '', post_type: data.post_type || 'carrossel',
        scheduled_date: data.scheduled_date || '', status: data.status || 'producao',
        drive_url: data.drive_url || '', reference_notes: data.reference_notes || '',
        funil: data.funil || '', campaign_type: data.campaign_type || '',
        reference_images: Array.isArray(data.reference_images) ? data.reference_images : [],
      })
      setLoading(false)
    }
    load()
  }, [postId])

  // Carrega comentários
  useEffect(() => {
    if (!currentId) return
    supabase.from('schedule_comments').select('id, author_name, body, created_at').eq('schedule_id', currentId).order('created_at', { ascending: true })
      .then(({ data }) => { if (data) setComments(data) })
  }, [currentId])

  useEffect(() => () => { if (savedTimer.current) clearTimeout(savedTimer.current) }, [])

  function flashSaved() {
    setJustSaved(true)
    if (savedTimer.current) clearTimeout(savedTimer.current)
    savedTimer.current = setTimeout(() => setJustSaved(false), 1600)
  }

  async function ensurePostId(): Promise<string | undefined> {
    if (currentId) return currentId
    const f = formRef.current
    if (!f.title.trim()) return undefined
    const { data, error } = await supabase.from('schedules').insert({
      client_id: clientId, month, year, post_number: postNumber,
      title: f.title, copy: f.copy, post_type: f.post_type, status: f.status,
      scheduled_date: f.scheduled_date || null, drive_url: f.drive_url,
      reference_notes: f.reference_notes, funil: f.funil, campaign_type: f.campaign_type || null,
      reference_images: f.reference_images,
    }).select().single()
    if (dbError(error, toast, 'criar post')) return undefined
    if (data) {
      setCurrentId(data.id)
      await logActivity({ tableName: 'schedules', recordId: data.id, action: 'created', actorName: currentMember?.name, description: `${currentMember?.name || 'Alguém'} criou "${f.title}"` })
      setActivityKey(k => k + 1)
      flashSaved()
      onSaved()
      return data.id
    }
    return undefined
  }

  async function persist(patch: Record<string, any>, logMsg?: string, action = 'updated') {
    const hadId = !!currentId
    const pid = await ensurePostId()
    if (!pid) { if (!formRef.current.title.trim()) toast('Adicione um título primeiro'); return }
    const dbPatch: Record<string, any> = { ...patch }
    if ('scheduled_date' in dbPatch) dbPatch.scheduled_date = dbPatch.scheduled_date || null
    if ('campaign_type' in dbPatch) dbPatch.campaign_type = dbPatch.campaign_type || null
    const { error } = await supabase.from('schedules').update(dbPatch).eq('id', pid)
    if (dbError(error, toast, 'salvar')) return
    if (hadId) flashSaved()
    if (logMsg) {
      await logActivity({ tableName: 'schedules', recordId: pid, action, actorName: currentMember?.name, description: logMsg })
      setActivityKey(k => k + 1)
    }
    onSaved()
  }

  function commitText(field: EditableField) {
    setEditingField(null)
    persist({ [field]: formRef.current[field] })
  }
  function changeType(value: string) { setForm(f => ({ ...f, post_type: value })); persist({ post_type: value }) }
  function changeStatus(value: string) {
    const old = STATUS_LABEL[formRef.current.status] || formRef.current.status
    const neu = STATUS_LABEL[value] || value
    setForm(f => ({ ...f, status: value }))
    persist({ status: value }, `Status: ${old} → ${neu}`, 'status_changed')
  }

  async function addComment() {
    const body = newComment.trim()
    if (!body) return
    const pid = await ensurePostId()
    if (!pid) { toast('Adicione um título primeiro'); return }
    const { data, error } = await supabase.from('schedule_comments')
      .insert({ schedule_id: pid, author_name: currentMember?.name || null, body }).select().single()
    if (dbError(error, toast, 'comentar')) return
    if (data) setComments(c => [...c, data])
    setNewComment('')
    await logActivity({ tableName: 'schedules', recordId: pid, action: 'commented', actorName: currentMember?.name, description: `${currentMember?.name || 'Alguém'} comentou` })
    setActivityKey(k => k + 1)
  }

  async function handleRefImageUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setUploadingRef(true)
    const pid = await ensurePostId()
    if (!pid) { toast('Adicione um título antes de subir imagens'); setUploadingRef(false); return }
    const safeName = file.name.normalize('NFD').replace(/[^a-zA-Z0-9._-]/g, '_')
    const path = `posts/${pid}/${Date.now()}_${safeName}`
    const { error } = await supabase.storage.from('bagano-materiais').upload(path, file, { upsert: false })
    if (error) { toast('Erro no upload: ' + error.message); setUploadingRef(false); return }
    const { data: { publicUrl } } = supabase.storage.from('bagano-materiais').getPublicUrl(path)
    const newImages = [...formRef.current.reference_images, publicUrl]
    setForm(f => ({ ...f, reference_images: newImages }))
    await supabase.from('schedules').update({ reference_images: newImages }).eq('id', pid)
    flashSaved()
    setUploadingRef(false)
    if (refInputRef.current) refInputRef.current.value = ''
  }

  async function removeRefImage(url: string) {
    const newImages = formRef.current.reference_images.filter(u => u !== url)
    setForm(f => ({ ...f, reference_images: newImages }))
    if (currentId) await supabase.from('schedules').update({ reference_images: newImages }).eq('id', currentId)
    const path = url.split('/bagano-materiais/')[1]
    if (path) supabase.storage.from('bagano-materiais').remove([path])
  }

  async function handleDelete() {
    if (!postId) return
    setDeleting(true)
    try {
      await moveToTrash('post', postId, form.title || 'Post sem título')
    } catch (err) {
      toast('Erro na lixeira: ' + (err instanceof Error ? err.message : String(err)))
      setDeleting(false); return
    }
    await supabase.from('schedules').delete().eq('id', postId)
    setDeleting(false)
    if (onDeleted) onDeleted()
    onClose()
  }

  const typeObj   = POST_TYPES.find(t => t.value === form.post_type) || POST_TYPES[0]
  const statusObj = STATUSES.find(s => s.value === form.status) || STATUSES[0]

  const dueDateLabel = (() => {
    if (!form.scheduled_date) return null
    const diff = Math.ceil((new Date(form.scheduled_date + 'T23:59:59').getTime() - Date.now()) / 86400000)
    const color = diff < 0 ? '#EF4444' : diff <= 2 ? '#F59E0B' : 'var(--color-text-secondary)'
    const suffix = diff < 0 ? ' · atrasado' : diff === 0 ? ' · hoje' : diff === 1 ? ' · amanhã' : ''
    return { text: new Date(form.scheduled_date + 'T12:00:00').toLocaleDateString('pt-BR', { day:'2-digit', month:'short' }) + suffix, color }
  })()

  if (loading) return (
    <div className="fixed inset-0 bg-black/40 z-[70] flex items-center justify-center">
      <div className="bg-[var(--color-bg-card)] rounded-2xl px-6 py-4 text-sm text-[var(--color-text-muted)]">Carregando…</div>
    </div>
  )

  const selectCls = 'w-full appearance-none bg-[var(--color-bg-card)] border border-[var(--color-border)] rounded-lg pl-3 pr-8 py-2 text-sm font-medium text-[var(--color-text-primary)] outline-none cursor-pointer hover:border-[var(--color-border-hover)] transition-colors'

  return (
    <div className="fixed inset-0 bg-black/50 z-[70] flex items-center justify-center py-6 px-4"
      onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="bg-[var(--color-bg-alt)] rounded-2xl w-full max-w-[920px] max-h-[92vh] flex flex-col shadow-pop overflow-hidden animate-scale-in">

        <div className="h-[3px] flex-shrink-0 rounded-t-2xl" style={{ background: clientColor || typeObj.color }} />

        {/* HEADER — badges de leitura (tipo + status) + salvo + fechar */}
        <div className="flex items-center justify-between gap-3 px-6 py-3 bg-[var(--color-bg-card)] border-b border-[var(--color-border)]">
          <div className="flex items-center gap-2 min-w-0">
            {postNumber && <span className="text-xs font-black text-[var(--color-border-strong)]">#{postNumber}</span>}
            <span className="text-xs font-semibold px-2 py-1 rounded-lg" style={{ background: typeObj.color + '22', color: typeObj.color }}>{typeObj.label}</span>
            <span className="text-xs font-semibold px-2 py-1 rounded-lg" style={{ background: statusObj.color + '22', color: statusObj.color }}>{statusObj.label}</span>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <span className={`flex items-center gap-1 text-[11px] font-medium text-[var(--ds-success-text)] transition-opacity ${justSaved ? 'opacity-100' : 'opacity-0'}`}>
              <Check size={12} /> salvo
            </span>
            <button onClick={onClose} className="w-8 h-8 rounded-lg hover:bg-[var(--color-bg-subtle)] flex items-center justify-center text-[var(--color-text-secondary)] transition-colors">
              <X size={16} />
            </button>
          </div>
        </div>

        {/* TITLE */}
        <div className="px-7 pt-5 pb-4 bg-[var(--color-bg-card)] border-b border-[var(--color-border)]">
          {editingField === 'title' ? (
            <input autoFocus value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
              onBlur={() => commitText('title')} onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur() }}
              placeholder="Título do post…"
              className="w-full text-2xl font-bold text-[var(--color-text-primary)] bg-transparent outline-none placeholder:text-[var(--color-text-faint)] leading-tight" />
          ) : (
            <div onClick={() => setEditingField('title')} className="cursor-text text-2xl font-bold text-[var(--color-text-primary)] leading-tight hover:opacity-80 transition-opacity">
              {form.title || <span className="text-[var(--color-text-faint)]">Título do post…</span>}
            </div>
          )}
          {clientName && (
            <p className="text-xs text-[var(--color-text-muted)] mt-1.5">
              em <span className="font-semibold" style={{ color: clientColor }}>{clientName}</span>
              <span className="mx-1.5 text-[var(--color-text-faint)]">·</span>
              {MESES[month - 1]} {year}
            </p>
          )}
        </div>

        {/* BODY */}
        <div className="flex gap-0 overflow-hidden flex-1 divide-x divide-[var(--color-border)]">

          {/* LEFT — briefing + referências */}
          <div className="flex-1 min-w-0 flex flex-col overflow-y-auto">
            {/* Briefing / Legenda */}
            <div className="px-7 py-5 border-b border-[var(--color-border)]">
              <div className="flex items-center gap-2 mb-2.5">
                <AlignLeft size={14} className="text-[var(--color-text-muted)]" />
                <span className="text-xs font-semibold text-[var(--color-text-muted)] uppercase tracking-wider">Legenda / Briefing</span>
                <span className="text-[10px] text-[var(--color-text-faint)]">· o que o post deve dizer</span>
              </div>
              {editingField === 'copy' ? (
                <textarea autoFocus value={form.copy} onChange={e => setForm(f => ({ ...f, copy: e.target.value }))}
                  onBlur={() => commitText('copy')} rows={7}
                  placeholder="Texto da legenda, briefing, instruções para o designer/editor…"
                  className="w-full bg-[var(--color-bg-card)] border border-[var(--color-accent)] rounded-lg px-2.5 py-1.5 text-sm text-[var(--color-text-primary)] outline-none resize-none leading-relaxed min-h-[150px]" />
              ) : (
                <div onClick={() => setEditingField('copy')} className="cursor-text text-sm text-[var(--color-text-primary)] leading-relaxed whitespace-pre-line min-h-[80px] rounded-lg hover:bg-[var(--color-bg-subtle)] -mx-1.5 px-1.5 py-1 transition-colors">
                  {form.copy || <span className="text-[var(--color-text-faint)]">Clique para escrever a legenda / briefing…</span>}
                </div>
              )}
            </div>

            {/* Referências */}
            <div className="px-7 py-5">
              <div className="flex items-center justify-between mb-2.5">
                <div className="flex items-center gap-2">
                  <Link2 size={14} className="text-[var(--color-text-muted)]" />
                  <span className="text-xs font-semibold text-[var(--color-text-muted)] uppercase tracking-wider">Referências</span>
                  <span className="text-[10px] text-[var(--color-text-faint)]">· inspiração, exemplos</span>
                </div>
                <button onClick={() => refInputRef.current?.click()} disabled={uploadingRef}
                  className="flex items-center gap-1 text-xs text-[var(--color-text-muted)] hover:text-[var(--color-accent)] transition-colors disabled:opacity-50">
                  <ImagePlus size={13} />
                  {uploadingRef ? 'Enviando…' : 'Imagem'}
                </button>
                <input ref={refInputRef} type="file" accept="image/*" className="hidden" onChange={handleRefImageUpload} />
              </div>
              {editingField === 'reference_notes' ? (
                <textarea autoFocus value={form.reference_notes} onChange={e => setForm(f => ({ ...f, reference_notes: e.target.value }))}
                  onBlur={() => commitText('reference_notes')} rows={3}
                  placeholder="Links de referência, observações…"
                  className="w-full bg-[var(--color-bg-card)] border border-[var(--color-accent)] rounded-lg px-2.5 py-1.5 text-sm text-[var(--color-text-primary)] outline-none resize-none leading-relaxed" />
              ) : (
                <div onClick={() => setEditingField('reference_notes')} className="cursor-text text-sm text-[var(--color-text-primary)] leading-relaxed whitespace-pre-line rounded-lg hover:bg-[var(--color-bg-subtle)] -mx-1.5 px-1.5 py-1 transition-colors min-h-[40px]">
                  {form.reference_notes || <span className="text-[var(--color-text-faint)]">Clique para adicionar links/observações de referência…</span>}
                </div>
              )}
              {form.reference_images.length > 0 && (
                <div className="grid grid-cols-3 gap-2 mt-3">
                  {form.reference_images.map((url, i) => (
                    <div key={i} className="group relative aspect-square rounded-xl overflow-hidden border border-[var(--color-border)]">
                      <img src={url} alt={`Referência ${i + 1}`} className="w-full h-full object-cover" />
                      <button onClick={() => removeRefImage(url)}
                        className="absolute top-1 right-1 opacity-0 group-hover:opacity-100 transition-opacity bg-black/60 rounded-full p-0.5">
                        <XCircle size={14} className="text-white" />
                      </button>
                      <a href={url} target="_blank" rel="noopener noreferrer"
                        className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity bg-black/20 flex items-end p-1.5">
                        <span className="text-[9px] text-white font-medium bg-black/40 rounded px-1">abrir</span>
                      </a>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* RIGHT — entrega (topo, fixo) + tabs */}
          <div className="w-80 flex-shrink-0 bg-[var(--color-bg-card)] flex flex-col overflow-hidden">

            {/* 📦 ENTREGA — sempre visível */}
            <div className="px-4 pt-4 pb-3 border-b border-[var(--color-border)]">
              <div className="rounded-xl p-3" style={{ background: 'var(--ds-info-bg)', border: '1px solid var(--ds-info-border)' }}>
                <div className="flex items-center gap-1.5 mb-1">
                  <Package size={14} style={{ color: 'var(--ds-info-accent)' }} />
                  <span className="text-[11px] font-bold uppercase tracking-wider" style={{ color: 'var(--ds-info-text)' }}>Entrega do conteúdo</span>
                </div>
                <p className="text-[10px] mb-2" style={{ color: 'var(--ds-info-text)', opacity: 0.8 }}>o post/carrossel/vídeo pronto (Drive)</p>
                {editingField === 'drive_url' ? (
                  <input autoFocus value={form.drive_url} onChange={e => setForm(f => ({ ...f, drive_url: e.target.value }))}
                    onBlur={() => commitText('drive_url')} onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur() }}
                    placeholder="https://drive.google.com/…"
                    className="w-full bg-[var(--color-bg-card)] border border-[var(--ds-info-accent)] rounded-lg px-2.5 py-1.5 text-xs text-[var(--color-text-primary)] outline-none" />
                ) : form.drive_url ? (
                  <div className="flex items-center gap-1.5">
                    <a href={form.drive_url} target="_blank" rel="noopener noreferrer"
                      className="flex-1 flex items-center gap-1.5 bg-[var(--color-bg-card)] rounded-lg px-2.5 py-1.5 text-xs font-medium truncate hover:opacity-90 transition-opacity"
                      style={{ color: 'var(--ds-info-text)' }}>
                      <Link2 size={12} className="flex-shrink-0" /> <span className="truncate">Abrir no Drive</span>
                    </a>
                    <button onClick={() => setEditingField('drive_url')} className="text-[10px] text-[var(--ds-info-text)] hover:underline flex-shrink-0">editar</button>
                  </div>
                ) : (
                  <button onClick={() => setEditingField('drive_url')}
                    className="w-full flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium border-2 border-dashed transition-colors"
                    style={{ borderColor: 'var(--ds-info-border)', color: 'var(--ds-info-text)' }}>
                    <Link2 size={13} /> + Colar link do Drive
                  </button>
                )}
              </div>
            </div>

            {/* Tabs */}
            <div className="flex items-center gap-0.5 px-3 border-b border-[var(--color-border)]">
              {([['detalhes','Detalhes'],['comentarios','Comentários'],['historico','Histórico']] as const).map(([k, lbl]) => (
                <button key={k} onClick={() => setSideTab(k)}
                  className={`px-2.5 py-2.5 text-xs font-semibold border-b-2 transition-colors ${sideTab === k ? 'text-[var(--color-text-primary)] border-[var(--color-accent)]' : 'text-[var(--color-text-muted)] border-transparent hover:text-[var(--color-text-secondary)]'}`}>
                  {lbl}{k === 'comentarios' && comments.length > 0 ? ` ${comments.length}` : ''}
                </button>
              ))}
            </div>

            <div className="flex-1 overflow-y-auto flex flex-col">
              {sideTab === 'detalhes' && (
                <div className="px-4 py-4 flex flex-col gap-4">
                  {/* Tipo */}
                  <div>
                    <label className="text-[10px] font-semibold text-[var(--color-text-muted)] uppercase tracking-wider mb-1.5 block">Tipo de conteúdo</label>
                    <div className="relative">
                      <select value={form.post_type} onChange={e => changeType(e.target.value)} className={selectCls}>
                        {POST_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                      </select>
                      <ChevronDown size={14} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[var(--color-text-muted)] pointer-events-none" />
                    </div>
                  </div>
                  {/* Status */}
                  <div>
                    <label className="text-[10px] font-semibold text-[var(--color-text-muted)] uppercase tracking-wider mb-1.5 block">Status (etapa)</label>
                    <div className="relative">
                      <select value={form.status} onChange={e => changeStatus(e.target.value)} className={selectCls}>
                        {STATUSES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                      </select>
                      <ChevronDown size={14} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[var(--color-text-muted)] pointer-events-none" />
                    </div>
                  </div>
                  {/* Data */}
                  <div>
                    <label className="text-[10px] font-semibold text-[var(--color-text-muted)] uppercase tracking-wider mb-1.5 block">Data estimada</label>
                    <button onClick={() => setShowCal(true)}
                      className="w-full flex items-center gap-2 bg-[var(--color-bg-card)] border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm font-medium hover:border-[var(--color-border-hover)] transition-colors"
                      style={{ color: dueDateLabel ? dueDateLabel.color : 'var(--color-text-muted)' }}>
                      <Calendar size={13} /> {dueDateLabel ? dueDateLabel.text : 'Definir data'}
                    </button>
                  </div>
                  {/* Funil */}
                  <div>
                    <label className="text-[10px] font-semibold text-[var(--color-text-muted)] uppercase tracking-wider mb-1.5 flex items-center gap-1"><Target size={11} /> Funil</label>
                    <div className="flex flex-wrap gap-1">
                      {FUNIL_OPTIONS.map(o => (
                        <button key={o} onClick={() => { const nv = form.funil === o ? '' : o; setForm(f => ({ ...f, funil: nv })); persist({ funil: nv }) }}
                          className="px-2 py-0.5 rounded-md text-[10px] font-medium transition-all border"
                          style={form.funil === o
                            ? { background: clientColor || 'var(--color-brand)', color: 'white', borderColor: 'transparent' }
                            : { borderColor: 'var(--color-border)', color: 'var(--color-text-muted)' }}>
                          {o}
                        </button>
                      ))}
                    </div>
                  </div>
                  {/* Campanha */}
                  {campaigns.length > 0 && (
                    <div>
                      <label className="text-[10px] font-semibold text-[var(--color-text-muted)] uppercase tracking-wider mb-1.5 flex items-center gap-1"><Megaphone size={11} /> Campanha</label>
                      <div className="flex flex-wrap gap-1">
                        <button onClick={() => { setForm(f => ({ ...f, campaign_type: '' })); persist({ campaign_type: '' }) }}
                          className="px-2 py-0.5 rounded-md text-[10px] font-medium transition-all border"
                          style={!form.campaign_type ? { background: 'var(--color-text-primary)', color: 'var(--color-bg-card)', borderColor: 'transparent' } : { borderColor: 'var(--color-border)', color: 'var(--color-text-muted)' }}>
                          Nenhuma
                        </button>
                        {campaigns.map(c => (
                          <button key={c.type} onClick={() => { const nv = form.campaign_type === c.type ? '' : c.type; setForm(f => ({ ...f, campaign_type: nv })); persist({ campaign_type: nv }) }}
                            className="px-2 py-0.5 rounded-md text-[10px] font-medium transition-all border"
                            style={form.campaign_type === c.type ? { background: clientColor || 'var(--color-brand)', color: 'white', borderColor: 'transparent' } : { borderColor: 'var(--color-border)', color: 'var(--color-text-muted)' }}>
                            {c.name}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {sideTab === 'comentarios' && (
                <div className="flex flex-col h-full">
                  <div className="flex-1 overflow-y-auto px-4 py-3 flex flex-col gap-3">
                    {comments.length === 0 ? (
                      <p className="text-xs text-[var(--color-text-faint)] text-center py-6">Nenhum comentário ainda.<br/>Fale de mudanças, dúvidas, ajustes…</p>
                    ) : comments.map(c => (
                      <div key={c.id} className="flex flex-col">
                        <div className="flex items-center gap-1.5 mb-0.5">
                          <span className="text-[11px] font-semibold text-[var(--color-text-primary)]">{c.author_name || 'Alguém'}</span>
                          <span className="text-[10px] text-[var(--color-text-faint)]">{commentTime(c.created_at)}</span>
                        </div>
                        <div className="text-xs text-[var(--color-text-secondary)] bg-[var(--color-bg-subtle)] rounded-xl rounded-tl-sm px-3 py-2 leading-relaxed whitespace-pre-line">{c.body}</div>
                      </div>
                    ))}
                  </div>
                  <div className="px-3 py-3 border-t border-[var(--color-border)] flex items-end gap-2">
                    <textarea value={newComment} onChange={e => setNewComment(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); addComment() } }}
                      placeholder="Escrever comentário…" rows={2}
                      className="flex-1 bg-[var(--color-bg-card)] border border-[var(--color-border)] rounded-lg px-2.5 py-1.5 text-xs text-[var(--color-text-primary)] outline-none resize-none focus:border-[var(--color-accent)]" />
                    <button onClick={addComment} disabled={!newComment.trim()}
                      className="w-8 h-8 rounded-lg flex items-center justify-center text-white disabled:opacity-40 flex-shrink-0" style={{ background: 'var(--color-accent)' }}>
                      <Send size={14} />
                    </button>
                  </div>
                </div>
              )}

              {sideTab === 'historico' && (
                <div className="px-4 py-3">
                  {currentId
                    ? <ActivityLog tableName="schedules" recordId={currentId} refreshKey={activityKey} />
                    : <p className="text-xs text-[var(--color-text-faint)] py-6 text-center">O histórico aparece após salvar o post.</p>}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* FOOTER */}
        <div className="px-7 py-3 border-t border-[var(--color-border)] flex items-center justify-between bg-[var(--color-bg-card)]">
          {!isNew ? (
            confirmDelete ? (
              <div className="flex items-center gap-2">
                <span className="text-xs font-medium" style={{ color: 'var(--ds-error-text)' }}>Confirmar exclusão?</span>
                <button onClick={() => setConfirmDelete(false)} className="text-xs px-3 py-1.5 rounded-lg border border-[var(--color-border)] text-[var(--color-text-secondary)]">Cancelar</button>
                <button onClick={handleDelete} disabled={deleting} className="text-xs font-semibold px-3 py-1.5 rounded-lg text-white disabled:opacity-50" style={{ background: 'var(--ds-error-accent)' }}>
                  {deleting ? 'Excluindo…' : 'Excluir'}
                </button>
              </div>
            ) : (
              <button onClick={() => setConfirmDelete(true)} className="flex items-center gap-1.5 text-xs text-[var(--color-text-muted)] transition-colors" onMouseEnter={e => (e.currentTarget.style.color = 'var(--ds-error-text)')} onMouseLeave={e => (e.currentTarget.style.color = '')}>
                <Trash2 size={13} /> Excluir post
              </button>
            )
          ) : <div />}
          <div className="flex items-center gap-2 text-[11px] text-[var(--color-text-faint)]">
            <Check size={12} /> Salvo automaticamente
          </div>
        </div>

        {/* CALENDAR PICKER */}
        {showCal && (() => {
          const startWeekday = new Date(calMonth.y, calMonth.m, 1).getDay()
          const daysInMonth  = new Date(calMonth.y, calMonth.m + 1, 0).getDate()
          const cells: (number|null)[] = [...Array(startWeekday).fill(null), ...Array.from({length:daysInMonth},(_,i)=>i+1)]
          function pick(d: number) {
            const mm = String(calMonth.m+1).padStart(2,'0'), dd = String(d).padStart(2,'0')
            const s = `${calMonth.y}-${mm}-${dd}`
            setForm(f => ({ ...f, scheduled_date: s })); persist({ scheduled_date: s })
          }
          return (
            <div className="fixed inset-0 z-[80] flex items-center justify-center" onClick={() => setShowCal(false)}>
              <div className="bg-[var(--color-bg-card)] rounded-2xl border border-[var(--color-border)] p-5 w-72 shadow-pop" onClick={e => e.stopPropagation()}>
                <div className="flex items-center justify-between mb-3">
                  <button onClick={() => setCalMonth(c => c.m===0?{y:c.y-1,m:11}:{y:c.y,m:c.m-1})} className="w-7 h-7 rounded-lg hover:bg-[var(--color-bg-subtle)] flex items-center justify-center text-[var(--color-text-secondary)]">‹</button>
                  <span className="text-sm font-semibold text-[var(--color-text-primary)] capitalize">{MESES[calMonth.m]} {calMonth.y}</span>
                  <button onClick={() => setCalMonth(c => c.m===11?{y:c.y+1,m:0}:{y:c.y,m:c.m+1})} className="w-7 h-7 rounded-lg hover:bg-[var(--color-bg-subtle)] flex items-center justify-center text-[var(--color-text-secondary)]">›</button>
                </div>
                <div className="grid grid-cols-7 gap-1 mb-1">
                  {DIAS.map(d => <div key={d} className="text-center text-[10px] font-semibold text-[var(--color-text-muted)] py-1">{d}</div>)}
                </div>
                <div className="grid grid-cols-7 gap-1 mb-4">
                  {cells.map((d, i) => {
                    if (!d) return <div key={i} />
                    const mm=String(calMonth.m+1).padStart(2,'0'), dd=String(d).padStart(2,'0')
                    const s = `${calMonth.y}-${mm}-${dd}`
                    const isSel = form.scheduled_date === s
                    const today = new Date()
                    const isToday = today.getFullYear()===calMonth.y&&today.getMonth()===calMonth.m&&today.getDate()===d
                    return <button key={i} onClick={() => { pick(d); setShowCal(false) }}
                      className={`h-8 rounded-lg text-sm transition-colors ${isSel ? 'text-white font-semibold' : isToday ? 'ring-1 font-bold text-[var(--color-text-primary)]' : 'text-[var(--color-text-primary)] hover:bg-[var(--color-bg-subtle)]'}`}
                      style={isSel ? { background: clientColor || 'var(--color-brand)' } : {}}>{d}</button>
                  })}
                </div>
                {form.scheduled_date && (
                  <button onClick={() => { setForm(f=>({...f,scheduled_date:''})); persist({ scheduled_date: '' }); setShowCal(false) }} className="w-full py-1.5 text-xs text-[var(--color-text-secondary)] border border-[var(--color-border)] rounded-lg hover:bg-[var(--color-bg-subtle)]">
                    Remover data
                  </button>
                )}
              </div>
            </div>
          )
        })()}
      </div>
    </div>
  )
}
