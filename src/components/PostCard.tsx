'use client'

import { useState, useEffect, useRef } from 'react'
import { createClient } from '@/lib/supabase'
import { X, Calendar, ChevronRight, Trash2, Link2, AlignLeft, ImagePlus, XCircle } from 'lucide-react'
import { useToast } from '@/lib/ToastContext'

const POST_TYPES = [
  { value: 'reels',             label: 'Reels',             color: '#ef4444' },
  { value: 'carrossel',         label: 'Carrossel',         color: '#3b82f6' },
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

const MESES = ['janeiro','fevereiro','março','abril','maio','junho','julho','agosto','setembro','outubro','novembro','dezembro']
const DIAS  = ['dom','seg','ter','qua','qui','sex','sáb']

type PostForm = {
  title: string; copy: string; post_type: string; scheduled_date: string
  status: string; drive_url: string; reference_notes: string; funil: string
  reference_images: string[]
}
const EMPTY: PostForm = { title:'', copy:'', post_type:'reels', scheduled_date:'', status:'producao', drive_url:'', reference_notes:'', funil:'', reference_images:[] }

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

export default function PostCard({ postId, clientId, clientName, clientColor, month, year, postNumber, onClose, onSaved, onDeleted }: Props) {
  const supabase = createClient()
  const { toast } = useToast()
  const [loading,      setLoading]      = useState(!!postId)
  const [saving,       setSaving]       = useState(false)
  const [deleting,     setDeleting]     = useState(false)
  const [confirmDelete,setConfirmDelete]= useState(false)
  const [uploadingRef, setUploadingRef] = useState(false)
  const [currentId,    setCurrentId]    = useState<string | undefined>(postId)
  const refInputRef = useRef<HTMLInputElement>(null)

  const [form,     setForm]     = useState<PostForm>(EMPTY)
  const [showCal,  setShowCal]  = useState(false)
  const [calMonth, setCalMonth] = useState(() => ({ y: year, m: month - 1 }))

  const isNew = !postId

  useEffect(() => {
    if (!postId) return
    async function load() {
      const { data } = await supabase.from('schedules').select('*').eq('id', postId).single()
      if (data) setForm({
        title: data.title || '', copy: data.copy || '', post_type: data.post_type || 'reels',
        scheduled_date: data.scheduled_date || '', status: data.status || 'producao',
        drive_url: data.drive_url || '', reference_notes: data.reference_notes || '',
        funil: data.funil || '',
        reference_images: Array.isArray(data.reference_images) ? data.reference_images : [],
      })
      setLoading(false)
    }
    load()
  }, [postId])

  async function ensurePostId(): Promise<string | undefined> {
    if (currentId) return currentId
    if (!form.title.trim()) return undefined
    const { data } = await supabase.from('schedules').insert({
      client_id: clientId, month, year, post_number: postNumber,
      title: form.title, post_type: form.post_type, status: form.status,
    }).select().single()
    if (data) { setCurrentId(data.id); return data.id }
    return undefined
  }

  async function handleRefImageUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setUploadingRef(true)
    const pid = await ensurePostId()
    if (!pid) { toast('Adicione um título antes de subir imagens', 'info'); setUploadingRef(false); return }
    const path = `posts/${pid}/${Date.now()}_${file.name}`
    const { error } = await supabase.storage.from('bagano-materiais').upload(path, file, { upsert: false })
    if (error) { toast('Erro no upload', 'error'); setUploadingRef(false); return }
    const { data: { publicUrl } } = supabase.storage.from('bagano-materiais').getPublicUrl(path)
    const newImages = [...form.reference_images, publicUrl]
    setForm(f => ({ ...f, reference_images: newImages }))
    await supabase.from('schedules').update({ reference_images: newImages }).eq('id', pid)
    setUploadingRef(false)
    if (refInputRef.current) refInputRef.current.value = ''
  }

  async function removeRefImage(url: string) {
    const newImages = form.reference_images.filter(u => u !== url)
    setForm(f => ({ ...f, reference_images: newImages }))
    if (currentId) await supabase.from('schedules').update({ reference_images: newImages }).eq('id', currentId)
    const path = url.split('/bagano-materiais/')[1]
    if (path) supabase.storage.from('bagano-materiais').remove([path])
  }

  async function handleSave() {
    if (!form.title.trim()) return
    setSaving(true)
    const payload = { ...form, scheduled_date: form.scheduled_date || null }
    if (!currentId) {
      const { data } = await supabase.from('schedules').insert({ client_id: clientId, month, year, post_number: postNumber, ...payload }).select().single()
      if (data) setCurrentId(data.id)
    } else {
      await supabase.from('schedules').update(payload).eq('id', currentId)
    }
    setSaving(false)
    toast('Post salvo!')
    onSaved()
    onClose()
  }

  async function handleDelete() {
    if (!postId) return
    setDeleting(true)
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

  return (
    <div className="fixed inset-0 bg-black/50 z-[70] flex items-center justify-center py-6 px-4"
      onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="bg-[var(--color-bg-alt)] rounded-2xl w-full max-w-[860px] max-h-[92vh] flex flex-col shadow-2xl overflow-hidden">

        {/* Colored accent bar */}
        <div className="h-[3px] flex-shrink-0 rounded-t-2xl" style={{ background: clientColor || typeObj.color }} />

        {/* HEADER — tipo + status chips */}
        <div className="flex items-center justify-between px-7 py-3.5 bg-[var(--color-bg-card)] border-b border-[var(--color-border)]">
          <div className="flex items-center gap-1">
            {postNumber && <span className="text-xs font-black text-[var(--color-border-strong)] mr-2">#{postNumber}</span>}
            <div className="flex items-center gap-1 mr-3">
              {POST_TYPES.map(t => (
                <button key={t.value} onClick={() => setForm(f => ({ ...f, post_type: t.value }))}
                  className="px-2.5 py-1 rounded-lg text-xs font-semibold transition-all"
                  style={form.post_type === t.value ? { background: t.color + '22', color: t.color } : { color: 'var(--color-text-faint)' }}>
                  {t.label}
                </button>
              ))}
            </div>
            <div className="w-px h-4 bg-[var(--color-border)] mx-1" />
            <div className="flex items-center gap-1 ml-1">
              {STATUSES.map(s => (
                <button key={s.value} onClick={() => setForm(f => ({ ...f, status: s.value }))}
                  className="px-2.5 py-1 rounded-lg text-xs font-semibold transition-all"
                  style={form.status === s.value ? { background: s.color + '22', color: s.color } : { color: 'var(--color-text-faint)' }}>
                  {s.label}
                </button>
              ))}
            </div>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-lg hover:bg-[var(--color-bg-subtle)] flex items-center justify-center text-[var(--color-text-secondary)] transition-colors">
            <X size={16} />
          </button>
        </div>

        {/* TITLE */}
        <div className="px-7 pt-6 pb-4 bg-[var(--color-bg-card)] border-b border-[var(--color-border)]">
          <input
            value={form.title}
            onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
            placeholder="Título do post…"
            autoFocus={isNew}
            className="w-full text-2xl font-bold text-[var(--color-text-primary)] bg-transparent outline-none placeholder:text-[var(--color-text-faint)] leading-tight"
          />
          {clientName && (
            <p className="text-xs text-[var(--color-text-muted)] mt-1.5">
              em <span className="font-semibold" style={{ color: clientColor }}>{clientName}</span>
              <span className="mx-1.5 text-[var(--color-text-faint)]">·</span>
              {MESES[month - 1]} {year}
            </p>
          )}
        </div>

        {/* BODY */}
        <div className="flex gap-0 overflow-y-auto flex-1 divide-x divide-[var(--color-border)]">

          {/* LEFT — copy/briefing + referências */}
          <div className="flex-1 min-w-0 flex flex-col overflow-y-auto">

            {/* Copy / Briefing */}
            <div className="px-7 py-5 flex-1 border-b border-[var(--color-border)]">
              <div className="flex items-center gap-2 mb-3">
                <AlignLeft size={14} className="text-[var(--color-text-muted)]" />
                <span className="text-xs font-semibold text-[var(--color-text-muted)] uppercase tracking-wider">Copy / Briefing</span>
              </div>
              <textarea
                value={form.copy}
                onChange={e => setForm(f => ({ ...f, copy: e.target.value }))}
                placeholder="Texto da legenda, briefing, instruções para o designer ou editor…"
                className="w-full bg-transparent text-sm text-[var(--color-text-primary)] outline-none resize-none leading-relaxed placeholder:text-[var(--color-text-faint)] min-h-[160px]"
                rows={8}
              />
            </div>

            {/* Referências */}
            <div className="px-7 py-5">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <Link2 size={14} className="text-[var(--color-text-muted)]" />
                  <span className="text-xs font-semibold text-[var(--color-text-muted)] uppercase tracking-wider">Referências</span>
                </div>
                <button onClick={() => refInputRef.current?.click()}
                  disabled={uploadingRef}
                  className="flex items-center gap-1 text-xs text-[var(--color-text-muted)] hover:text-[var(--color-brand)] transition-colors disabled:opacity-50">
                  <ImagePlus size={13} />
                  {uploadingRef ? 'Enviando…' : 'Imagem'}
                </button>
                <input ref={refInputRef} type="file" accept="image/*" className="hidden" onChange={handleRefImageUpload} />
              </div>
              <textarea
                value={form.reference_notes}
                onChange={e => setForm(f => ({ ...f, reference_notes: e.target.value }))}
                placeholder="Links de referência, observações, comentários…"
                className="w-full bg-transparent text-sm text-[var(--color-text-primary)] outline-none resize-none leading-relaxed placeholder:text-[var(--color-text-faint)]"
                rows={3}
              />
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

          {/* RIGHT — metadata */}
          <div className="w-72 flex-shrink-0 bg-[var(--color-bg-card)] flex flex-col overflow-y-auto">
            <div className="px-5 py-5 flex flex-col gap-0">

              {/* Data estimada */}
              <div className="flex items-center gap-3 py-2.5 border-b border-[var(--color-border)]">
                <Calendar size={13} className="text-[var(--color-text-muted)] flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-[10px] font-semibold text-[var(--color-text-muted)] uppercase tracking-wider mb-0.5">Data estimada</p>
                  <button onClick={() => setShowCal(true)}
                    className="text-xs font-medium transition-colors hover:opacity-80"
                    style={{ color: dueDateLabel ? dueDateLabel.color : 'var(--color-text-muted)' }}>
                    {dueDateLabel ? dueDateLabel.text : '+ Definir'}
                  </button>
                </div>
              </div>

              {/* Funil */}
              <div className="flex items-start gap-3 py-2.5 border-b border-[var(--color-border)]">
                <span className="text-[13px] text-[var(--color-text-muted)] flex-shrink-0 mt-0.5">🎯</span>
                <div className="flex-1 min-w-0">
                  <p className="text-[10px] font-semibold text-[var(--color-text-muted)] uppercase tracking-wider mb-1.5">Funil</p>
                  <div className="flex flex-wrap gap-1">
                    {FUNIL_OPTIONS.map(o => (
                      <button key={o} onClick={() => setForm(f => ({ ...f, funil: f.funil === o ? '' : o }))}
                        className="px-2 py-0.5 rounded-md text-[10px] font-medium transition-all border"
                        style={form.funil === o
                          ? { background: clientColor || 'var(--color-brand)', color: 'white', borderColor: 'transparent' }
                          : { borderColor: 'var(--color-border)', color: 'var(--color-text-muted)' }}>
                        {o}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Drive link */}
              <div className="flex items-start gap-3 py-2.5">
                <Link2 size={13} className="text-[var(--color-text-muted)] flex-shrink-0 mt-0.5" />
                <div className="flex-1 min-w-0">
                  <p className="text-[10px] font-semibold text-[var(--color-text-muted)] uppercase tracking-wider mb-1">Drive</p>
                  <input
                    value={form.drive_url}
                    onChange={e => setForm(f => ({ ...f, drive_url: e.target.value }))}
                    placeholder="https://drive.google.com/…"
                    className="w-full text-xs text-[var(--color-text-primary)] bg-transparent outline-none placeholder:text-[var(--color-text-faint)] border-b border-[var(--color-border)] pb-1 focus:border-[var(--color-brand)] transition-colors"
                  />
                  {form.drive_url && (
                    <a href={form.drive_url} target="_blank" rel="noopener noreferrer"
                      className="text-[10px] text-blue-500 hover:underline mt-0.5 block">Abrir →</a>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* FOOTER */}
        <div className="px-7 py-3.5 border-t border-[var(--color-border)] flex items-center justify-between bg-[var(--color-bg-card)]">
          {!isNew ? (
            confirmDelete ? (
              <div className="flex items-center gap-2">
                <span className="text-xs text-red-600 font-medium">Confirmar exclusão?</span>
                <button onClick={() => setConfirmDelete(false)} className="text-xs px-3 py-1.5 rounded-lg border border-[var(--color-border)] text-[var(--color-text-secondary)]">Cancelar</button>
                <button onClick={handleDelete} disabled={deleting} className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-red-500 text-white disabled:opacity-50">
                  {deleting ? 'Excluindo…' : 'Excluir'}
                </button>
              </div>
            ) : (
              <button onClick={() => setConfirmDelete(true)} className="flex items-center gap-1.5 text-xs text-[var(--color-text-muted)] hover:text-red-500 transition-colors">
                <Trash2 size={13} /> Excluir post
              </button>
            )
          ) : <div />}
          <div className="flex items-center gap-2">
            <button onClick={onClose} className="px-4 py-1.5 text-sm text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] transition-colors">Cancelar</button>
            <button onClick={handleSave} disabled={saving || !form.title.trim()}
              className="flex items-center gap-1.5 px-4 py-1.5 text-sm font-semibold bg-[var(--color-brand)] text-[var(--color-brand-fg)] rounded-lg disabled:opacity-40 transition-opacity">
              {saving ? 'Salvando…' : isNew ? 'Criar post' : 'Salvar'} {!saving && <ChevronRight size={14} />}
            </button>
          </div>
        </div>

        {/* CALENDAR PICKER */}
        {showCal && (() => {
          const startWeekday = new Date(calMonth.y, calMonth.m, 1).getDay()
          const daysInMonth  = new Date(calMonth.y, calMonth.m + 1, 0).getDate()
          const cells: (number|null)[] = [...Array(startWeekday).fill(null), ...Array.from({length:daysInMonth},(_,i)=>i+1)]
          function pick(d: number) {
            const mm = String(calMonth.m+1).padStart(2,'0'), dd = String(d).padStart(2,'0')
            setForm(f => ({ ...f, scheduled_date: `${calMonth.y}-${mm}-${dd}` }))
          }
          return (
            <div className="fixed inset-0 z-[80] flex items-center justify-center" onClick={() => setShowCal(false)}>
              <div className="bg-[var(--color-bg-card)] rounded-2xl border border-[var(--color-border)] p-5 w-72 shadow-xl" onClick={e => e.stopPropagation()}>
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
                  <button onClick={() => { setForm(f=>({...f,scheduled_date:''})); setShowCal(false) }} className="w-full py-1.5 text-xs text-[var(--color-text-secondary)] border border-[var(--color-border)] rounded-lg hover:bg-[var(--color-bg-subtle)]">
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
