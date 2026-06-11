'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase'
import { useUser } from '@/lib/UserContext'
import { X, Plus, Calendar, Tag, CheckSquare, Paperclip, Trash2, User, Link2, MessageSquare } from 'lucide-react'

const TYPE_OPTIONS = ['Menu', 'Cardápio', 'Arte avulsa', 'Logo', 'Manual', 'Placa', 'Cartão', 'Sacola', 'Sousplat', 'Story', 'Capas destaque', 'Fundos', 'Outro']
const STATUS_OPTIONS = [
  { value: 'producao', label: 'A fazer' },
  { value: 'aguardando_aprovacao', label: 'Em aprovação' },
  { value: 'finalizado', label: 'Finalizado' },
]
const LABEL_PALETTE = [
  { name: 'Vermelho', color: '#EF4444' },
  { name: 'Laranja', color: '#F59E0B' },
  { name: 'Amarelo', color: '#EAB308' },
  { name: 'Verde', color: '#22C55E' },
  { name: 'Azul', color: '#3B82F6' },
  { name: 'Roxo', color: '#8B5CF6' },
  { name: 'Rosa', color: '#EC4899' },
  { name: 'Cinza', color: '#6B7280' },
]

function initials(name: string) { return (name || '?').split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase() }

type Props = {
  materialId?: string          // se existe, modo edição/visualização
  fixedClientId?: string
  clients?: any[]
  onClose: () => void
  onSaved: () => void
}

export default function MaterialCard({ materialId, fixedClientId, clients = [], onClose, onSaved }: Props) {
  const { members } = useUser()
  const supabase = createClient()

  const [loading, setLoading] = useState(!!materialId)
  const [saving, setSaving] = useState(false)
  const [id, setId] = useState<string | undefined>(materialId)

  // campos principais
  const [title, setTitle] = useState('')
  const [type, setType] = useState('Arte avulsa')
  const [typeManual, setTypeManual] = useState(false)
  const [status, setStatus] = useState('producao')
  const [clientId, setClientId] = useState(fixedClientId || '')
  const [clientManual, setClientManual] = useState(false)
  const [extraClient, setExtraClient] = useState('')
  const [description, setDescription] = useState('')
  const [dueDate, setDueDate] = useState('')
  const [dueTime, setDueTime] = useState('')
  const [reminder, setReminder] = useState('')
  const [assignedTo, setAssignedTo] = useState('')
  const [labels, setLabels] = useState<{ text: string; color: string }[]>([])
  const [driveUrl, setDriveUrl] = useState('')

  // sub-entidades
  const [comments, setComments] = useState<any[]>([])
  const [newComment, setNewComment] = useState('')
  const [attachments, setAttachments] = useState<any[]>([])
  const [newAttachUrl, setNewAttachUrl] = useState('')
  const [newAttachTitle, setNewAttachTitle] = useState('')
  const [checklist, setChecklist] = useState<any[]>([])
  const [newCheckText, setNewCheckText] = useState('')

  // popovers
  const [showLabelPicker, setShowLabelPicker] = useState(false)
  const [showDatePicker, setShowDatePicker] = useState(false)
  const [showAttachInput, setShowAttachInput] = useState(false)
  const [labelDraft, setLabelDraft] = useState({ text: '', color: '#3B82F6' })
  const [globalLabels, setGlobalLabels] = useState<any[]>([])
  const [calMonth, setCalMonth] = useState(() => { const d = new Date(); return { y: d.getFullYear(), m: d.getMonth() } })

  // membros ordenados inteligentemente: designers primeiro
  const orderedMembers = [...members].sort((a, b) => {
    const score = (m: any) => (m.role === 'designer' ? 0 : m.role === 'editor' ? 1 : 2)
    return score(a) - score(b)
  })

  const loadSub = useCallback(async (mid: string) => {
    const [{ data: cms }, { data: atts }, { data: chk }] = await Promise.all([
      supabase.from('material_comments').select('*').eq('material_id', mid).order('created_at', { ascending: true }),
      supabase.from('material_attachments').select('*').eq('material_id', mid).order('created_at', { ascending: true }),
      supabase.from('material_checklist').select('*').eq('material_id', mid).order('position', { ascending: true }),
    ])
    setComments(cms || [])
    setAttachments(atts || [])
    setChecklist(chk || [])
  }, [])

  useEffect(() => {
    if (!materialId) return
    async function load() {
      const { data } = await supabase.from('materials').select('*').eq('id', materialId).single()
      if (data) {
        setTitle(data.title || ''); setType(data.type || 'Arte avulsa'); setStatus(data.status || 'producao')
        setClientId(data.client_id || ''); setExtraClient(data.extra_client || ''); setDescription(data.description || '')
        setDueDate(data.due_date || ''); setAssignedTo(data.assigned_to || ''); setDriveUrl(data.drive_url || '')
        setLabels(Array.isArray(data.labels) ? data.labels : [])
        setTypeManual(true); setClientManual(true)
      }
      await loadSub(materialId!)
      setLoading(false)
    }
    load()
  }, [materialId, loadSub])

  useEffect(() => {
    supabase.from('labels').select('*').order('created_at', { ascending: true }).then(({ data }) => {
      if (data) setGlobalLabels(data)
    })
  }, [])

  async function createGlobalLabel(text: string, color: string) {
    const { data } = await supabase.from('labels').insert({ text, color }).select().single()
    if (data) setGlobalLabels(g => [...g, data])
    return data
  }

  // detecção inteligente reativa
  function onTitleChange(v: string) {
    setTitle(v)
    const lower = v.toLowerCase()
    if (!fixedClientId && !clientManual) {
      const match = clients.find(c => {
        const name = c.name.toLowerCase(); const fw = name.split(' ')[0]
        return lower.includes(name) || (fw.length > 3 && lower.includes(fw))
      })
      setClientId(match ? match.id : '')
    }
    if (!typeManual) {
      const map: Record<string, string> = { menu: 'Menu', cardapio: 'Cardápio', 'cardápio': 'Cardápio', logo: 'Logo', placa: 'Placa', cartao: 'Cartão', 'cartão': 'Cartão', sacola: 'Sacola', sousplat: 'Sousplat', story: 'Story', stories: 'Story', capa: 'Capas destaque', fundo: 'Fundos', manual: 'Manual' }
      for (const [k, val] of Object.entries(map)) { if (lower.includes(k)) { setType(val); break } }
    }
  }

  async function persist(patch: any) {
    // salva (cria na primeira vez) e devolve o id
    if (!id) {
      const payload = {
        title, type, status, client_id: clientId || null, extra_client: extraClient || null,
        description, due_date: dueDate || null, assigned_to: assignedTo || null,
        labels, drive_url: driveUrl, ...patch,
      }
      const { data } = await supabase.from('materials').insert(payload).select().single()
      if (data) { setId(data.id); return data.id }
      return undefined
    } else {
      await supabase.from('materials').update(patch).eq('id', id)
      return id
    }
  }

  async function handleSaveMain() {
    if (!title.trim()) return
    setSaving(true)
    const payload = {
      title, type, status, client_id: clientId || null, extra_client: extraClient || null,
      description, due_date: dueDate || null, assigned_to: assignedTo || null, labels, drive_url: driveUrl,
    }
    if (!id) {
      const { data } = await supabase.from('materials').insert(payload).select().single()
      if (data) setId(data.id)
    } else {
      await supabase.from('materials').update(payload).eq('id', id)
    }
    setSaving(false)
    onSaved()
  }

  // comentários
  async function addComment() {
    if (!newComment.trim()) return
    const mid = await persist({})
    if (!mid) return
    const { data } = await supabase.from('material_comments').insert({
      material_id: mid, body: newComment, author_name: 'Você',
    }).select().single()
    if (data) setComments(c => [...c, data])
    setNewComment('')
  }

  // anexos
  async function addAttachment() {
    if (!newAttachUrl.trim()) return
    const mid = await persist({})
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

  // checklist
  async function addCheck() {
    if (!newCheckText.trim()) return
    const mid = await persist({})
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

  const checkDone = checklist.filter(c => c.done).length
  const checkPct = checklist.length ? Math.round((checkDone / checklist.length) * 100) : 0
  const clientName = clients.find(c => c.id === clientId)?.name

  if (loading) return (
    <div className="fixed inset-0 bg-black/40 z-[70] flex items-center justify-center">
      <div className="bg-white rounded-2xl px-6 py-4 text-sm text-[#A8A59E]">Carregando...</div>
    </div>
  )

  return (
    <div className="fixed inset-0 bg-black/50 z-[70] flex items-start justify-center overflow-y-auto py-8 px-4" onClick={e => { if (e.target === e.currentTarget) { handleSaveMain(); onClose() } }}>
      <div className="bg-[#FBFAF8] rounded-2xl w-full max-w-4xl flex flex-col shadow-xl">
        {/* topo: status + fechar */}
        <div className="flex items-center justify-between px-6 pt-5 pb-3">
          <select value={status} onChange={e => setStatus(e.target.value)} className="text-sm font-semibold px-3 py-1.5 rounded-lg bg-[#EFEDE8] text-[#1A1916] outline-none cursor-pointer border-none">
            {STATUS_OPTIONS.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
          </select>
          <button onClick={() => { handleSaveMain(); onClose() }} className="w-8 h-8 rounded-lg hover:bg-[#EFEDE8] flex items-center justify-center text-[#6B6963]"><X size={18} /></button>
        </div>

        {/* título grande */}
        <div className="px-6 pb-4">
          <input
            value={title}
            onChange={e => onTitleChange(e.target.value)}
            placeholder="Nome do material…"
            className="w-full text-2xl font-bold text-[#1A1916] bg-transparent outline-none placeholder-[#C8C5BE]"
          />
          {(clientName || extraClient) && (
            <p className="text-sm text-[#6B6963] mt-1">em <span className="font-medium">{clientName || extraClient}</span></p>
          )}
        </div>

        {/* corpo: 2 colunas */}
        <div className="flex gap-6 px-6 pb-6">
          {/* esquerda: conteúdo */}
          <div className="flex-1 min-w-0 flex flex-col gap-6">
            {/* barra de ações */}
            <div className="flex items-center gap-2 flex-wrap">
              <button onClick={() => setShowLabelPicker(v => !v)} className="flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg bg-white border border-[#EBEAE5] text-[#6B6963] hover:border-[#D4D1CB]"><Tag size={13} /> Etiquetas</button>
              <button onClick={() => setShowDatePicker(v => !v)} className="flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg bg-white border border-[#EBEAE5] text-[#6B6963] hover:border-[#D4D1CB]"><Calendar size={13} /> Datas</button>
              <button onClick={() => { if (!checklist.length) setNewCheckText(' ') ; document.getElementById('check-input')?.focus() }} className="flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg bg-white border border-[#EBEAE5] text-[#6B6963] hover:border-[#D4D1CB]"><CheckSquare size={13} /> Checklist</button>
              <button onClick={() => setShowAttachInput(v => !v)} className="flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg bg-white border border-[#EBEAE5] text-[#6B6963] hover:border-[#D4D1CB]"><Paperclip size={13} /> Anexo</button>
            </div>

            {/* etiquetas aplicadas */}
            {labels.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {labels.map((l, i) => (
                  <span key={i} className="text-[11px] font-bold uppercase tracking-wide px-2.5 py-1 rounded text-white flex items-center gap-1" style={{ background: l.color }}>
                    {l.text}
                    <button onClick={() => setLabels(ls => ls.filter((_, idx) => idx !== i))}><X size={11} /></button>
                  </span>
                ))}
              </div>
            )}

            {/* descrição */}
            <div>
              <div className="flex items-center gap-2 mb-2">
                <MessageSquare size={15} className="text-[#6B6963]" />
                <p className="text-sm font-semibold text-[#1A1916]">Descrição / Briefing</p>
              </div>
              <textarea
                value={description}
                onChange={e => setDescription(e.target.value)}
                rows={5}
                placeholder="Especificações, dimensões, instruções, referências…"
                className="w-full bg-white border border-[#EBEAE5] rounded-xl px-4 py-3 text-sm text-[#1A1916] outline-none focus:border-[#1A1916] resize-none leading-relaxed"
              />
            </div>

            {/* checklist */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <CheckSquare size={15} className="text-[#6B6963]" />
                  <p className="text-sm font-semibold text-[#1A1916]">Checklist</p>
                </div>
                {checklist.length > 0 && <span className="text-xs text-[#A8A59E]">{checkPct}%</span>}
              </div>
              {checklist.length > 0 && (
                <div className="w-full h-1.5 bg-[#EFEDE8] rounded-full mb-3 overflow-hidden">
                  <div className="h-full bg-[#22C55E] transition-all" style={{ width: `${checkPct}%` }} />
                </div>
              )}
              <div className="flex flex-col gap-1.5">
                {checklist.map(item => (
                  <div key={item.id} className="group flex items-center gap-2.5 px-2 py-1.5 rounded-lg hover:bg-white">
                    <button onClick={() => toggleCheck(item)} className={`w-4 h-4 rounded border flex items-center justify-center flex-shrink-0 ${item.done ? 'bg-[#22C55E] border-[#22C55E]' : 'border-[#C8C5BE]'}`}>
                      {item.done && <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3"><polyline points="20 6 9 17 4 12" /></svg>}
                    </button>
                    <span className={`text-sm flex-1 ${item.done ? 'line-through text-[#A8A59E]' : 'text-[#1A1916]'}`}>{item.text}</span>
                    <button onClick={() => removeCheck(item.id)} className="opacity-0 group-hover:opacity-100 text-[#A8A59E] hover:text-red-500"><Trash2 size={13} /></button>
                  </div>
                ))}
              </div>
              <div className="flex items-center gap-2 mt-2">
                <input
                  id="check-input"
                  value={newCheckText}
                  onChange={e => setNewCheckText(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') addCheck() }}
                  placeholder="Adicionar item…"
                  className="flex-1 bg-white border border-[#EBEAE5] rounded-lg px-3 py-1.5 text-sm outline-none focus:border-[#1A1916]"
                />
                <button onClick={addCheck} className="text-xs font-medium px-3 py-1.5 rounded-lg bg-[#1A1916] text-white">Adicionar</button>
              </div>
            </div>

            {/* anexos */}
            <div>
              <div className="flex items-center gap-2 mb-2">
                <Paperclip size={15} className="text-[#6B6963]" />
                <p className="text-sm font-semibold text-[#1A1916]">Anexos & Links</p>
              </div>
              <div className="flex flex-col gap-2">
                {attachments.map(a => (
                  <div key={a.id} className="group flex items-center gap-3 bg-white border border-[#EBEAE5] rounded-lg px-3 py-2">
                    <div className="w-8 h-8 rounded bg-[#F2F0EB] flex items-center justify-center flex-shrink-0"><Link2 size={15} className="text-[#6B6963]" /></div>
                    <a href={a.url} target="_blank" rel="noopener noreferrer" className="flex-1 min-w-0 text-sm text-blue-600 hover:underline truncate">{a.title}</a>
                    <button onClick={() => removeAttachment(a.id)} className="opacity-0 group-hover:opacity-100 text-[#A8A59E] hover:text-red-500"><Trash2 size={13} /></button>
                  </div>
                ))}
              </div>
              {showAttachInput ? (
                <div className="flex flex-col gap-2 mt-2 bg-white border border-[#EBEAE5] rounded-lg p-3">
                  <input value={newAttachUrl} onChange={e => setNewAttachUrl(e.target.value)} placeholder="Cole o link (Drive, etc.)" className="border border-[#EBEAE5] rounded-lg px-3 py-1.5 text-sm outline-none focus:border-[#1A1916]" />
                  <input value={newAttachTitle} onChange={e => setNewAttachTitle(e.target.value)} placeholder="Nome (opcional)" className="border border-[#EBEAE5] rounded-lg px-3 py-1.5 text-sm outline-none focus:border-[#1A1916]" />
                  <div className="flex gap-2 justify-end">
                    <button onClick={() => setShowAttachInput(false)} className="text-xs px-3 py-1.5 rounded-lg border border-[#EBEAE5] text-[#6B6963]">Cancelar</button>
                    <button onClick={addAttachment} className="text-xs font-medium px-3 py-1.5 rounded-lg bg-[#1A1916] text-white">Anexar</button>
                  </div>
                </div>
              ) : (
                <button onClick={() => setShowAttachInput(true)} className="flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg text-[#6B6963] hover:bg-white mt-2"><Plus size={13} /> Adicionar anexo</button>
              )}
            </div>
          </div>

          {/* direita: propriedades + comentários */}
          <div className="w-72 flex-shrink-0 flex flex-col gap-5">
            {/* propriedades */}
            <div className="bg-white border border-[#EBEAE5] rounded-xl p-4 flex flex-col gap-4">
              {/* cliente */}
              {!fixedClientId && (
                <div>
                  <label className="text-[11px] font-semibold uppercase tracking-wide text-[#A8A59E] mb-1.5 block">Cliente</label>
                  <select value={clientId} onChange={e => { setClientManual(true); setClientId(e.target.value) }} className="w-full border border-[#EBEAE5] rounded-lg px-2.5 py-1.5 text-sm bg-white outline-none">
                    <option value="">— avulso —</option>
                    {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                  {!clientId && (
                    <input value={extraClient} onChange={e => setExtraClient(e.target.value)} placeholder="Nome avulso (sem cliente)" className="w-full mt-1.5 border border-[#EBEAE5] rounded-lg px-2.5 py-1.5 text-sm outline-none focus:border-[#1A1916]" />
                  )}
                </div>
              )}
              {/* tipo */}
              <div>
                <label className="text-[11px] font-semibold uppercase tracking-wide text-[#A8A59E] mb-1.5 block">Tipo</label>
                <input list="mc-types" value={type} onChange={e => { setTypeManual(true); setType(e.target.value) }} className="w-full border border-[#EBEAE5] rounded-lg px-2.5 py-1.5 text-sm bg-white outline-none focus:border-[#1A1916]" />
                <datalist id="mc-types">{TYPE_OPTIONS.map(t => <option key={t} value={t} />)}</datalist>
              </div>
              {/* responsável */}
              <div>
                <label className="text-[11px] font-semibold uppercase tracking-wide text-[#A8A59E] mb-1.5 block">Responsável</label>
                <select value={assignedTo} onChange={e => setAssignedTo(e.target.value)} className="w-full border border-[#EBEAE5] rounded-lg px-2.5 py-1.5 text-sm bg-white outline-none">
                  <option value="">Ninguém</option>
                  {orderedMembers.map(m => <option key={m.id} value={m.id}>{m.name}{m.role === 'designer' ? ' · design' : ''}</option>)}
                </select>
              </div>
              {/* prazo (abre o calendario completo) */}
              <div>
                <label className="text-[11px] font-semibold uppercase tracking-wide text-[#A8A59E] mb-1.5 block">Entrega</label>
                <button onClick={() => setShowDatePicker(true)} className="w-full border border-[#EBEAE5] rounded-lg px-2.5 py-1.5 text-sm text-left bg-white hover:border-[#D4D1CB] flex items-center gap-2">
                  <Calendar size={14} className="text-[#A8A59E]" />
                  {dueDate ? <span className="text-[#1A1916]">{new Date(dueDate+'T12:00:00').toLocaleDateString('pt-BR')}{dueTime ? ` · ${dueTime}` : ''}</span> : <span className="text-[#A8A59E]">Definir data</span>}
                </button>
              </div>
            </div>

            {/* comentários */}
            <div className="flex flex-col gap-2">
              <p className="text-sm font-semibold text-[#1A1916] flex items-center gap-2"><MessageSquare size={15} className="text-[#6B6963]" /> Comentários</p>
              <textarea value={newComment} onChange={e => setNewComment(e.target.value)} rows={2} placeholder="Escrever um comentário…" className="w-full bg-white border border-[#EBEAE5] rounded-lg px-3 py-2 text-sm outline-none focus:border-[#1A1916] resize-none" />
              {newComment.trim() && <button onClick={addComment} className="self-end text-xs font-medium px-3 py-1.5 rounded-lg bg-[#1A1916] text-white">Comentar</button>}
              <div className="flex flex-col gap-3 mt-1">
                {[...comments].reverse().map(c => (
                  <div key={c.id} className="flex gap-2.5">
                    <div className="w-7 h-7 rounded-full bg-[#1A1916] flex items-center justify-center text-white text-[9px] font-semibold flex-shrink-0">{initials(c.author_name)}</div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs"><span className="font-semibold text-[#1A1916]">{c.author_name}</span> <span className="text-[#A8A59E]">{new Date(c.created_at).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}</span></p>
                      <p className="text-sm text-[#1A1916] bg-white border border-[#EBEAE5] rounded-lg px-3 py-1.5 mt-1 whitespace-pre-wrap">{c.body}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* footer */}
        <div className="px-6 py-4 border-t border-[#EBEAE5] flex justify-end gap-3 bg-white rounded-b-2xl">
          <button onClick={() => { handleSaveMain(); onClose() }} className="px-5 py-2 text-sm font-medium bg-[#1A1916] text-white rounded-lg disabled:opacity-50">{saving ? 'Salvando…' : 'Salvar e fechar'}</button>
        </div>

        {/* popover etiquetas globais */}
        {showLabelPicker && (
          <div className="fixed inset-0 z-[80] flex items-center justify-center" onClick={() => setShowLabelPicker(false)}>
            <div className="bg-white rounded-xl border border-[#EBEAE5] p-4 w-72 shadow-lg" onClick={e => e.stopPropagation()}>
              <p className="text-sm font-semibold text-[#1A1916] mb-3">Etiquetas</p>

              {/* etiquetas existentes (globais) */}
              {globalLabels.length > 0 && (
                <div className="flex flex-col gap-1.5 mb-3 max-h-40 overflow-y-auto">
                  {globalLabels.map(gl => {
                    const applied = labels.some(l => l.text === gl.text && l.color === gl.color)
                    return (
                      <button
                        key={gl.id}
                        onClick={() => {
                          if (applied) setLabels(ls => ls.filter(l => !(l.text === gl.text && l.color === gl.color)))
                          else setLabels(ls => [...ls, { text: gl.text, color: gl.color }])
                        }}
                        className="flex items-center gap-2 group"
                      >
                        <span className="flex-1 text-left text-[11px] font-bold uppercase tracking-wide px-2.5 py-1.5 rounded text-white" style={{ background: gl.color }}>{gl.text}</span>
                        {applied && <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#1A1916" strokeWidth="3"><polyline points="20 6 9 17 4 12" /></svg>}
                      </button>
                    )
                  })}
                </div>
              )}

              <div className="border-t border-[#EBEAE5] pt-3">
                <p className="text-xs text-[#A8A59E] mb-2">Criar nova</p>
                <input value={labelDraft.text} onChange={e => setLabelDraft(d => ({ ...d, text: e.target.value }))} placeholder="Texto da etiqueta" className="w-full border border-[#EBEAE5] rounded-lg px-3 py-1.5 text-sm outline-none focus:border-[#1A1916] mb-2" />
                <div className="flex flex-wrap gap-1.5 mb-3">
                  {LABEL_PALETTE.map(p => (
                    <button key={p.color} onClick={() => setLabelDraft(d => ({ ...d, color: p.color }))} className={`w-7 h-7 rounded-lg ${labelDraft.color === p.color ? 'ring-2 ring-offset-1 ring-[#1A1916]' : ''}`} style={{ background: p.color }} />
                  ))}
                </div>
                <button onClick={async () => { if (labelDraft.text.trim()) { await createGlobalLabel(labelDraft.text, labelDraft.color); setLabels(ls => [...ls, { ...labelDraft }]); setLabelDraft({ text: '', color: '#3B82F6' }) } }} className="w-full py-2 text-sm font-medium bg-[#1A1916] text-white rounded-lg">Criar e aplicar</button>
              </div>
            </div>
          </div>
        )}

        {/* popover datas - calendario completo estilo Trello */}
        {showDatePicker && (() => {
          const MESES = ['janeiro','fevereiro','março','abril','maio','junho','julho','agosto','setembro','outubro','novembro','dezembro']
          const DIAS = ['dom','seg','ter','qua','qui','sex','sáb']
          const first = new Date(calMonth.y, calMonth.m, 1)
          const startWeekday = first.getDay()
          const daysInMonth = new Date(calMonth.y, calMonth.m + 1, 0).getDate()
          const cells: (number|null)[] = []
          for (let i = 0; i < startWeekday; i++) cells.push(null)
          for (let d = 1; d <= daysInMonth; d++) cells.push(d)
          const selectedDateStr = dueDate
          function pick(d: number) {
            const mm = String(calMonth.m + 1).padStart(2,'0')
            const dd = String(d).padStart(2,'0')
            setDueDate(`${calMonth.y}-${mm}-${dd}`)
          }
          function prevMonth() { setCalMonth(c => c.m === 0 ? { y: c.y-1, m: 11 } : { y: c.y, m: c.m-1 }) }
          function nextMonth() { setCalMonth(c => c.m === 11 ? { y: c.y+1, m: 0 } : { y: c.y, m: c.m+1 }) }
          return (
            <div className="fixed inset-0 z-[80] flex items-center justify-center" onClick={() => setShowDatePicker(false)}>
              <div className="bg-white rounded-2xl border border-[#EBEAE5] p-5 w-80 shadow-xl" onClick={e => e.stopPropagation()}>
                <div className="flex items-center justify-between mb-4">
                  <p className="text-sm font-semibold text-[#1A1916]">Datas</p>
                  <button onClick={() => setShowDatePicker(false)} className="w-7 h-7 rounded-lg hover:bg-[#F2F0EB] flex items-center justify-center text-[#6B6963]"><X size={16} /></button>
                </div>

                <div className="flex items-center justify-between mb-3">
                  <button onClick={prevMonth} className="w-7 h-7 rounded-lg hover:bg-[#F2F0EB] flex items-center justify-center text-[#6B6963]">‹</button>
                  <span className="text-sm font-semibold text-[#1A1916] capitalize">{MESES[calMonth.m]} {calMonth.y}</span>
                  <button onClick={nextMonth} className="w-7 h-7 rounded-lg hover:bg-[#F2F0EB] flex items-center justify-center text-[#6B6963]">›</button>
                </div>

                <div className="grid grid-cols-7 gap-1 mb-1">
                  {DIAS.map(d => <div key={d} className="text-center text-[10px] font-semibold text-[#A8A59E] py-1">{d}</div>)}
                </div>
                <div className="grid grid-cols-7 gap-1 mb-4">
                  {cells.map((d, i) => {
                    if (d === null) return <div key={i} />
                    const mm = String(calMonth.m + 1).padStart(2,'0')
                    const dd = String(d).padStart(2,'0')
                    const thisStr = `${calMonth.y}-${mm}-${dd}`
                    const isSel = selectedDateStr === thisStr
                    const today = new Date()
                    const isToday = today.getFullYear()===calMonth.y && today.getMonth()===calMonth.m && today.getDate()===d
                    return (
                      <button key={i} onClick={() => pick(d)} className={`h-8 rounded-lg text-sm transition-colors ${isSel ? 'bg-[#1A1916] text-white font-semibold' : isToday ? 'text-[#1A1916] font-bold underline' : 'text-[#1A1916] hover:bg-[#F2F0EB]'}`}>{d}</button>
                    )
                  })}
                </div>

                <label className="text-[11px] font-semibold uppercase tracking-wide text-[#A8A59E] mb-1 block">Data de entrega</label>
                <div className="flex gap-2 mb-3">
                  <input type="date" value={dueDate} onChange={e => setDueDate(e.target.value)} className="flex-1 border border-[#EBEAE5] rounded-lg px-2.5 py-1.5 text-sm outline-none focus:border-[#1A1916]" />
                  <input type="time" value={dueTime} onChange={e => setDueTime(e.target.value)} className="w-24 border border-[#EBEAE5] rounded-lg px-2.5 py-1.5 text-sm outline-none focus:border-[#1A1916]" />
                </div>

                <label className="text-[11px] font-semibold uppercase tracking-wide text-[#A8A59E] mb-1 block">Lembrete</label>
                <select value={reminder} onChange={e => setReminder(e.target.value)} className="w-full border border-[#EBEAE5] rounded-lg px-2.5 py-1.5 text-sm bg-white outline-none mb-4">
                  <option value="">Nenhum</option>
                  <option value="0">No dia da entrega</option>
                  <option value="1">1 dia antes</option>
                  <option value="2">2 dias antes</option>
                  <option value="7">1 semana antes</option>
                </select>

                <div className="flex flex-col gap-2">
                  <button onClick={() => setShowDatePicker(false)} className="w-full py-2 text-sm font-medium bg-[#1A1916] text-white rounded-lg">Salvar</button>
                  {dueDate && <button onClick={() => { setDueDate(''); setDueTime(''); setReminder(''); setShowDatePicker(false) }} className="w-full py-2 text-sm font-medium border border-[#EBEAE5] text-[#6B6963] rounded-lg">Remover</button>}
                </div>
              </div>
            </div>
          )
        })()}
      </div>
    </div>
  )
}
