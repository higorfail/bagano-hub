'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'

type Client = { id: string; name: string; color_hex: string }
type Post = {
  id: string; post_number: number; title: string; copy: string
  post_type: string; scheduled_date: string; status: string
  drive_url: string; reference_notes: string
  approval_status: string; approval_comment: string
}

const MONTHS = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro']
const POST_TYPES = ['Reels', 'Carrossel', 'Post', 'Stories', 'Carrossel/Stories']
const STATUSES = ['pendente', 'em produção', 'aprovado', 'publicado']
const EMPTY_FORM = { title: '', copy: '', post_type: 'Reels', scheduled_date: '', status: 'pendente', drive_url: '', reference_notes: '' }

function ReferenceLinks({ text }: { text: string }) {
  return (
    <div className="flex flex-col gap-1">
      {text.split('\n').map((line, i) =>
        line.startsWith('http') ? (
          <a key={i} href={line} target="_blank" rel="noopener noreferrer" className="text-sm text-blue-600 underline break-all">{line}</a>
        ) : <p key={i} className="text-sm text-[var(--color-text-primary)]">{line}</p>
      )}
    </div>
  )
}

const typeColor: Record<string,string> = { 'Reels':'bg-red-50 text-red-600','Carrossel':'bg-blue-50 text-blue-600','Stories':'bg-purple-50 text-purple-600','Carrossel/Stories':'bg-indigo-50 text-indigo-600','Post':'bg-amber-50 text-amber-600' }
const statusColor: Record<string,string> = { 'publicado':'bg-green-50 text-green-600','aprovado':'bg-blue-50 text-blue-600','em produção':'bg-yellow-50 text-yellow-700','pendente':'bg-[var(--color-bg-subtle)] text-[var(--color-text-secondary)]' }
const approvalColor: Record<string,string> = { 'aprovado':'bg-green-50 text-green-600','não aprovado':'bg-red-50 text-red-500' }

export default function CronogramaPage() {
  const [clients, setClients] = useState<Client[]>([])
  const [posts, setPosts] = useState<Post[]>([])
  const [selectedClient, setSelectedClient] = useState<string>('')
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth() + 1)
  const [selectedYear] = useState(new Date().getFullYear())
  const [selected, setSelected] = useState<Post | null>(null)
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [showApprovalModal, setShowApprovalModal] = useState(false)
  const [approvalLink, setApprovalLink] = useState('')
  const [generatingLink, setGeneratingLink] = useState(false)
  const [aiMessage, setAiMessage] = useState('')
  const [loadingAi, setLoadingAi] = useState(false)
  const [copied, setCopied] = useState(false)
  const [form, setForm] = useState(EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const [editing, setEditing] = useState(false)
  const [editForm, setEditForm] = useState(EMPTY_FORM)
  const [deleting, setDeleting] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)

  useEffect(() => {
    async function loadClients() {
      const supabase = createClient()
      const { data } = await supabase.from('clients').select('id, name, color_hex').eq('status', 'active').order('name')
      setClients(data || [])
      if (data && data.length > 0) setSelectedClient(data[0].id)
      setLoading(false)
    }
    loadClients()
  }, [])

  useEffect(() => {
    if (!selectedClient) return
    loadPosts()
  }, [selectedClient, selectedMonth, selectedYear])

  async function loadPosts() {
    const supabase = createClient()
    const { data } = await supabase.from('schedules').select('*').eq('client_id', selectedClient).eq('month', selectedMonth).eq('year', selectedYear).order('post_number')
    setPosts(data || [])
  }

  async function savePost() {
    if (!form.title.trim()) return
    setSaving(true)
    const supabase = createClient()
    await supabase.from('schedules').insert({ client_id: selectedClient, month: selectedMonth, year: selectedYear, post_number: posts.length + 1, ...form, scheduled_date: form.scheduled_date || null })
    await loadPosts()
    setShowModal(false)
    setForm(EMPTY_FORM)
    setSaving(false)
  }

  async function saveEdit() {
    if (!selected || !editForm.title.trim()) return
    setSaving(true)
    const supabase = createClient()
    await supabase.from('schedules').update({ ...editForm, scheduled_date: editForm.scheduled_date || null }).eq('id', selected.id)
    await loadPosts()
    setEditing(false)
    setSelected(prev => prev ? { ...prev, ...editForm } : null)
    setSaving(false)
  }

  async function deletePost() {
    if (!selected) return
    setDeleting(true)
    const supabase = createClient()
    await supabase.from('schedules').delete().eq('id', selected.id)
    await loadPosts()
    setSelected(null)
    setConfirmDelete(false)
    setDeleting(false)
  }

  function startEdit() {
    if (!selected) return
    setEditForm({ title: selected.title, copy: selected.copy || '', post_type: selected.post_type || 'Reels', scheduled_date: selected.scheduled_date || '', status: selected.status || 'pendente', drive_url: selected.drive_url || '', reference_notes: selected.reference_notes || '' })
    setEditing(true)
  }

  async function generateApprovalLink() {
    setGeneratingLink(true)
    const supabase = createClient()
    await supabase.from('approval_tokens').delete().eq('client_id', selectedClient).eq('month', selectedMonth).eq('year', selectedYear)
    const { data } = await supabase.from('approval_tokens').insert({ client_id: selectedClient, month: selectedMonth, year: selectedYear }).select().single()
    const link = `${window.location.origin}/aprovar/${data.token}`
    setApprovalLink(link)
    setGeneratingLink(false)
    generateAiMessage(link)
  }

  async function generateAiMessage(link: string) {
    setLoadingAi(true)
    const client = clients.find(c => c.id === selectedClient)
    const month = MONTHS[selectedMonth - 1]
    try {
      const res = await fetch('https://api.anthropic.com/v1/messages', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ model: 'claude-sonnet-4-20250514', max_tokens: 300, messages: [{ role: 'user', content: `Crie uma mensagem curta e profissional para enviar via WhatsApp para o cliente "${client?.name}" pedindo que ele acesse o link abaixo para aprovar o cronograma de ${month}. A mensagem deve ser amigável, direta e conter o link. Use no máximo 4 linhas. Link: ${link}` }] }) })
      const data = await res.json()
      setAiMessage(data.content?.[0]?.text || '')
    } catch {
      setAiMessage(`Olá! 👋 O cronograma de ${month} para ${client?.name} está pronto para aprovação.\n\nAcesse o link abaixo para revisar e aprovar os posts:\n${link}`)
    }
    setLoadingAi(false)
  }

  async function openApprovalModal() { setShowApprovalModal(true); setApprovalLink(''); setAiMessage(''); await generateApprovalLink() }
  function copyLink() { navigator.clipboard.writeText(approvalLink); setCopied(true); setTimeout(() => setCopied(false), 2000) }
  function openWhatsApp() { window.open(`https://wa.me/?text=${encodeURIComponent(aiMessage || approvalLink)}`, '_blank') }

  const client = clients.find(c => c.id === selectedClient)
  if (loading) return <div className="p-6 text-sm text-[var(--color-text-muted)]">Carregando...</div>

  return (
    <div className="flex h-full">
      <div className="flex-1 flex flex-col overflow-hidden">
        <div className="p-6 border-b border-[var(--color-border)] flex items-center justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-[var(--color-text-primary)] font-semibold text-lg">Cronograma</h1>
            <p className="text-[var(--color-text-secondary)] text-sm mt-0.5">{posts.length} posts · {MONTHS[selectedMonth-1]} {selectedYear}</p>
          </div>
          <div className="flex items-center gap-3 flex-wrap">
            <select value={selectedClient} onChange={e => { setSelectedClient(e.target.value); setSelected(null) }} className="border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm text-[var(--color-text-primary)] bg-white outline-none">
              {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
            <div className="flex items-center gap-1">
              <button onClick={() => setSelectedMonth(m => m===1?12:m-1)} className="w-8 h-8 rounded-lg border border-[var(--color-border)] flex items-center justify-center text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-subtle)]">‹</button>
              <span className="text-sm font-medium text-[var(--color-text-primary)] w-24 text-center">{MONTHS[selectedMonth-1]} {selectedYear}</span>
              <button onClick={() => setSelectedMonth(m => m===12?1:m+1)} className="w-8 h-8 rounded-lg border border-[var(--color-border)] flex items-center justify-center text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-subtle)]">›</button>
            </div>
            {posts.length > 0 && <button onClick={openApprovalModal} className="border border-[var(--color-text-primary)] text-[var(--color-text-primary)] rounded-lg px-4 py-2 text-sm font-medium hover:bg-[var(--color-bg-subtle)]">Enviar para aprovação</button>}
            <button onClick={() => setShowModal(true)} className="bg-[var(--color-text-primary)] text-white rounded-lg px-4 py-2 text-sm font-medium">+ Novo post</button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          {posts.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-48 text-center">
              <p className="text-[var(--color-text-muted)] text-sm">Nenhum post em {MONTHS[selectedMonth-1]}.</p>
              <p className="text-[var(--color-text-faint)] text-xs mt-1">Clique em "+ Novo post" para começar.</p>
            </div>
          ) : (
            <div className="grid grid-cols-3 gap-4">
              {posts.map(post => (
                <button key={post.id} onClick={() => { setSelected(selected?.id===post.id?null:post); setEditing(false); setConfirmDelete(false) }}
                  className={`text-left bg-white border rounded-2xl p-5 flex flex-col gap-3 hover:shadow-md transition-all ${selected?.id===post.id?'ring-2 border-transparent':'border-[var(--color-border)]'}`}
                  style={selected?.id===post.id?{ringColor:client?.color_hex,outlineColor:client?.color_hex,boxShadow:`0 0 0 2px ${client?.color_hex}`}:{}}>
                  <div className="flex items-center justify-between">
                    <span className="text-3xl font-black text-[var(--color-border)]">#{post.post_number}</span>
                    <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${typeColor[post.post_type]||'bg-[var(--color-bg-subtle)] text-[var(--color-text-secondary)]'}`}>{post.post_type||'—'}</span>
                  </div>
                  <p className="text-[var(--color-text-primary)] font-semibold text-base leading-snug line-clamp-2">{post.title}</p>
                  {post.copy && <p className="text-[var(--color-text-muted)] text-xs leading-relaxed line-clamp-2">{post.copy}</p>}
                  <div className="flex items-center justify-between mt-auto pt-2 border-t border-[var(--color-bg-subtle)]">
                    <span className="text-xs text-[var(--color-text-muted)]">{post.scheduled_date?new Date(post.scheduled_date+'T12:00:00').toLocaleDateString('pt-BR',{day:'2-digit',month:'short'}):'Sem data'}</span>
                    <div className="flex items-center gap-1.5">
                      {post.approval_status&&post.approval_status!=='pendente'&&<span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${approvalColor[post.approval_status]||''}`}>{post.approval_status==='aprovado'?'✓':'✗'}</span>}
                      <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${statusColor[post.status]||'bg-[var(--color-bg-subtle)] text-[var(--color-text-secondary)]'}`}>{post.status}</span>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Drawer */}
      {selected && (
        <div className="w-96 border-l border-[var(--color-border)] flex flex-col overflow-hidden bg-white">
          <div className="p-5 border-b border-[var(--color-border)] flex items-start justify-between gap-3">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-xs font-bold text-[var(--color-text-muted)]">#{selected.post_number}</span>
                <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${typeColor[selected.post_type]||'bg-[var(--color-bg-subtle)] text-[var(--color-text-secondary)]'}`}>{selected.post_type}</span>
              </div>
              <p className="text-base font-semibold text-[var(--color-text-primary)] leading-snug">{selected.title}</p>
            </div>
            <div className="flex items-center gap-1 flex-shrink-0">
              {!editing && (
                <>
                  <button onClick={startEdit} className="w-8 h-8 rounded-lg hover:bg-[var(--color-bg-subtle)] flex items-center justify-center text-[var(--color-text-secondary)] text-sm" title="Editar">✏️</button>
                  <button onClick={() => setConfirmDelete(true)} className="w-8 h-8 rounded-lg hover:bg-red-50 flex items-center justify-center text-sm" title="Excluir">🗑️</button>
                </>
              )}
              <button onClick={() => { setSelected(null); setEditing(false); setConfirmDelete(false) }} className="w-8 h-8 rounded-lg hover:bg-[var(--color-bg-subtle)] flex items-center justify-center text-[var(--color-text-muted)] text-lg leading-none">×</button>
            </div>
          </div>

          {/* Confirm delete */}
          {confirmDelete && (
            <div className="p-4 bg-red-50 border-b border-red-100 flex items-center justify-between gap-3">
              <p className="text-sm text-red-700 font-medium">Excluir este post?</p>
              <div className="flex gap-2">
                <button onClick={() => setConfirmDelete(false)} className="px-3 py-1.5 text-xs border border-[var(--color-border)] rounded-lg bg-white text-[var(--color-text-secondary)]">Cancelar</button>
                <button onClick={deletePost} disabled={deleting} className="px-3 py-1.5 text-xs bg-red-500 text-white rounded-lg disabled:opacity-50">{deleting?'Excluindo...':'Excluir'}</button>
              </div>
            </div>
          )}

          {editing ? (
            <div className="flex-1 overflow-y-auto p-5 flex flex-col gap-4">
              <div><label className="text-xs text-[var(--color-text-muted)] mb-1 block">Título *</label><input value={editForm.title} onChange={e => setEditForm(f=>({...f,title:e.target.value}))} className="w-full border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm text-[var(--color-text-primary)] outline-none focus:border-[var(--color-text-primary)]" /></div>
              <div className="grid grid-cols-2 gap-3">
                <div><label className="text-xs text-[var(--color-text-muted)] mb-1 block">Tipo</label><select value={editForm.post_type} onChange={e => setEditForm(f=>({...f,post_type:e.target.value}))} className="w-full border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm text-[var(--color-text-primary)] bg-white outline-none">{POST_TYPES.map(t=><option key={t}>{t}</option>)}</select></div>
                <div><label className="text-xs text-[var(--color-text-muted)] mb-1 block">Status</label><select value={editForm.status} onChange={e => setEditForm(f=>({...f,status:e.target.value}))} className="w-full border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm text-[var(--color-text-primary)] bg-white outline-none">{STATUSES.map(s=><option key={s}>{s}</option>)}</select></div>
              </div>
              <div><label className="text-xs text-[var(--color-text-muted)] mb-1 block">Data estimada</label><input type="date" value={editForm.scheduled_date} onChange={e => setEditForm(f=>({...f,scheduled_date:e.target.value}))} className="w-full border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm text-[var(--color-text-primary)] outline-none focus:border-[var(--color-text-primary)]" /></div>
              <div><label className="text-xs text-[var(--color-text-muted)] mb-1 block">Copy / Briefing</label><textarea value={editForm.copy} onChange={e => setEditForm(f=>({...f,copy:e.target.value}))} rows={4} className="w-full border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm text-[var(--color-text-primary)] outline-none focus:border-[var(--color-text-primary)] resize-none" /></div>
              <div><label className="text-xs text-[var(--color-text-muted)] mb-1 block">Link Drive</label><input value={editForm.drive_url} onChange={e => setEditForm(f=>({...f,drive_url:e.target.value}))} className="w-full border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm text-[var(--color-text-primary)] outline-none focus:border-[var(--color-text-primary)]" /></div>
              <div><label className="text-xs text-[var(--color-text-muted)] mb-1 block">Referências</label><textarea value={editForm.reference_notes} onChange={e => setEditForm(f=>({...f,reference_notes:e.target.value}))} rows={2} className="w-full border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm text-[var(--color-text-primary)] outline-none focus:border-[var(--color-text-primary)] resize-none" /></div>
              <div className="flex gap-2 pt-2">
                <button onClick={() => setEditing(false)} className="flex-1 py-2 text-sm border border-[var(--color-border)] rounded-lg text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-subtle)]">Cancelar</button>
                <button onClick={saveEdit} disabled={saving||!editForm.title.trim()} className="flex-1 py-2 text-sm bg-[var(--color-text-primary)] text-white rounded-lg disabled:opacity-50">{saving?'Salvando...':'Salvar'}</button>
              </div>
            </div>
          ) : (
            <div className="flex-1 overflow-y-auto p-5 flex flex-col gap-5">
              <div className="flex gap-4">
                <div className="flex-1"><p className="text-xs text-[var(--color-text-muted)] mb-1">Data estimada</p><p className="text-sm font-medium text-[var(--color-text-primary)]">{selected.scheduled_date?new Date(selected.scheduled_date+'T12:00:00').toLocaleDateString('pt-BR'):'—'}</p></div>
                <div className="flex-1"><p className="text-xs text-[var(--color-text-muted)] mb-1">Status</p><span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${statusColor[selected.status]||''}`}>{selected.status}</span></div>
              </div>
              {selected.approval_status&&selected.approval_status!=='pendente'&&(
                <div><p className="text-xs text-[var(--color-text-muted)] mb-2">Aprovação do cliente</p>
                <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${approvalColor[selected.approval_status]||''}`}>{selected.approval_status}</span>
                {selected.approval_comment&&<p className="text-sm text-[var(--color-text-secondary)] mt-2 italic">"{selected.approval_comment}"</p>}</div>
              )}
              {selected.copy&&<div><p className="text-xs text-[var(--color-text-muted)] mb-2">Copy / Briefing</p><p className="text-sm text-[var(--color-text-primary)] whitespace-pre-wrap leading-relaxed">{selected.copy}</p></div>}
              {selected.drive_url&&<div><p className="text-xs text-[var(--color-text-muted)] mb-1">Link Drive</p><a href={selected.drive_url} target="_blank" rel="noopener noreferrer" className="text-sm text-blue-600 underline break-all">{selected.drive_url}</a></div>}
              {selected.reference_notes&&<div><p className="text-xs text-[var(--color-text-muted)] mb-1">Referências</p><ReferenceLinks text={selected.reference_notes}/></div>}
            </div>
          )}
        </div>
      )}

      {/* Modal novo post */}
      {showModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg mx-4 flex flex-col max-h-[90vh]">
            <div className="p-5 border-b border-[var(--color-border)] flex items-center justify-between">
              <h2 className="text-sm font-semibold text-[var(--color-text-primary)]">Novo post · {client?.name}</h2>
              <button onClick={() => { setShowModal(false); setForm(EMPTY_FORM) }} className="text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] text-lg leading-none">×</button>
            </div>
            <div className="flex-1 overflow-y-auto p-5 flex flex-col gap-4">
              <div><label className="text-xs text-[var(--color-text-muted)] mb-1 block">Título *</label><input value={form.title} onChange={e => setForm(f=>({...f,title:e.target.value}))} placeholder="Ex: Abertura do forno a lenha" className="w-full border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm text-[var(--color-text-primary)] outline-none focus:border-[var(--color-text-primary)]" /></div>
              <div className="grid grid-cols-2 gap-3">
                <div><label className="text-xs text-[var(--color-text-muted)] mb-1 block">Tipo</label><select value={form.post_type} onChange={e => setForm(f=>({...f,post_type:e.target.value}))} className="w-full border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm text-[var(--color-text-primary)] bg-white outline-none focus:border-[var(--color-text-primary)]">{POST_TYPES.map(t=><option key={t}>{t}</option>)}</select></div>
                <div><label className="text-xs text-[var(--color-text-muted)] mb-1 block">Status</label><select value={form.status} onChange={e => setForm(f=>({...f,status:e.target.value}))} className="w-full border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm text-[var(--color-text-primary)] bg-white outline-none focus:border-[var(--color-text-primary)]">{STATUSES.map(s=><option key={s}>{s}</option>)}</select></div>
              </div>
              <div><label className="text-xs text-[var(--color-text-muted)] mb-1 block">Data estimada</label><input type="date" value={form.scheduled_date} onChange={e => setForm(f=>({...f,scheduled_date:e.target.value}))} className="w-full border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm text-[var(--color-text-primary)] outline-none focus:border-[var(--color-text-primary)]" /></div>
              <div><label className="text-xs text-[var(--color-text-muted)] mb-1 block">Copy / Briefing</label><textarea value={form.copy} onChange={e => setForm(f=>({...f,copy:e.target.value}))} rows={4} placeholder="Texto da legenda ou briefing do post..." className="w-full border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm text-[var(--color-text-primary)] outline-none focus:border-[var(--color-text-primary)] resize-none" /></div>
              <div><label className="text-xs text-[var(--color-text-muted)] mb-1 block">Link Drive</label><input value={form.drive_url} onChange={e => setForm(f=>({...f,drive_url:e.target.value}))} placeholder="https://drive.google.com/..." className="w-full border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm text-[var(--color-text-primary)] outline-none focus:border-[var(--color-text-primary)]" /></div>
              <div><label className="text-xs text-[var(--color-text-muted)] mb-1 block">Referências / Comentários</label><textarea value={form.reference_notes} onChange={e => setForm(f=>({...f,reference_notes:e.target.value}))} rows={2} placeholder="Links de referência, observações..." className="w-full border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm text-[var(--color-text-primary)] outline-none focus:border-[var(--color-text-primary)] resize-none" /></div>
            </div>
            <div className="p-5 border-t border-[var(--color-border)] flex gap-3 justify-end">
              <button onClick={() => { setShowModal(false); setForm(EMPTY_FORM) }} className="px-4 py-2 text-sm text-[var(--color-text-secondary)] border border-[var(--color-border)] rounded-lg hover:bg-[var(--color-bg-subtle)]">Cancelar</button>
              <button onClick={savePost} disabled={saving||!form.title.trim()} className="px-4 py-2 text-sm text-white bg-[var(--color-text-primary)] rounded-lg disabled:opacity-50">{saving?'Salvando...':'Salvar post'}</button>
            </div>
          </div>
        </div>
      )}

      {/* Modal aprovação */}
      {showApprovalModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg mx-4 flex flex-col max-h-[90vh]">
            <div className="p-5 border-b border-[var(--color-border)] flex items-center justify-between">
              <div><h2 className="text-sm font-semibold text-[var(--color-text-primary)]">Enviar para aprovação</h2><p className="text-xs text-[var(--color-text-muted)] mt-0.5">{client?.name} · {MONTHS[selectedMonth-1]} {selectedYear}</p></div>
              <button onClick={() => setShowApprovalModal(false)} className="text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] text-lg leading-none">×</button>
            </div>
            <div className="flex-1 overflow-y-auto p-5 flex flex-col gap-4">
              {generatingLink ? (
                <div className="flex items-center justify-center py-8"><p className="text-sm text-[var(--color-text-muted)]">Gerando link...</p></div>
              ) : (
                <>
                  <div className="bg-[var(--color-bg-input)] rounded-xl p-3"><span className="text-xs text-[var(--color-text-secondary)] break-all">{approvalLink}</span></div>
                  <div className="border-2 border-[var(--color-border)] rounded-xl p-4 flex flex-col gap-3">
                    <div className="flex items-center gap-2">
                      <span className="w-6 h-6 rounded-full bg-[var(--color-text-primary)] text-white text-xs flex items-center justify-center font-bold flex-shrink-0">1</span>
                      <div><p className="text-sm font-semibold text-[var(--color-text-primary)]">Copiar link e enviar manualmente</p><p className="text-xs text-[var(--color-text-muted)]">Cole no WhatsApp, e-mail ou onde preferir</p></div>
                    </div>
                    <button onClick={copyLink} className="w-full py-2.5 rounded-lg border-2 border-[var(--color-text-primary)] text-sm font-semibold text-[var(--color-text-primary)] hover:bg-[var(--color-bg-subtle)]">{copied?'✓ Link copiado!':'Copiar link'}</button>
                  </div>
                  <div className="border-2 border-[#25D366] rounded-xl p-4 flex flex-col gap-3">
                    <div className="flex items-center gap-2">
                      <span className="w-6 h-6 rounded-full bg-[#25D366] text-white text-xs flex items-center justify-center font-bold flex-shrink-0">2</span>
                      <div><p className="text-sm font-semibold text-[var(--color-text-primary)]">Enviar pelo WhatsApp</p><p className="text-xs text-[var(--color-text-muted)]">Mensagem gerada por IA — edite se quiser</p></div>
                    </div>
                    <div className="bg-[#F0FDF4] rounded-lg p-3 min-h-[80px]">
                      {loadingAi ? <p className="text-xs text-[var(--color-text-muted)]">Gerando mensagem com IA...</p> : <textarea value={aiMessage} onChange={e => setAiMessage(e.target.value)} rows={5} className="w-full text-xs text-[var(--color-text-primary)] bg-transparent outline-none resize-none" />}
                    </div>
                    <button onClick={openWhatsApp} disabled={loadingAi} className="w-full py-2.5 rounded-lg bg-[#25D366] text-sm font-semibold text-white hover:bg-[#20BD5A] disabled:opacity-50">Abrir WhatsApp</button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
