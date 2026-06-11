'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import { useUser } from '@/lib/UserContext'
import MaterialFormModal from '@/components/MaterialFormModal'

type Material = {
  id: string
  client_id: string
  title: string
  type: string
  status: string
  description: string
  drive_url: string
  notes: string
  due_date: string | null
  assigned_to: string | null
  label: string | null
  created_at: string
}

const COLUMNS = [
  { key: 'producao', label: 'A fazer', color: '#F59E0B' },
  { key: 'aguardando_aprovacao', label: 'Em aprovação', color: '#EC4899' },
  { key: 'finalizado', label: 'Finalizados', color: '#22C55E' },
]

const MAT_TYPE_LABEL: Record<string,string> = { menu:'Menu', cardapio:'Cardápio', arte_avulsa:'Arte avulsa', logo:'Logo', manual:'Manual', outro:'Outro' }
const MAT_TYPE_COLOR: Record<string,string> = { menu:'bg-orange-100 text-orange-700', cardapio:'bg-amber-100 text-amber-700', arte_avulsa:'bg-purple-100 text-purple-700', logo:'bg-blue-100 text-blue-700', manual:'bg-green-100 text-green-700', outro:'bg-[#F2F0EB] text-[#6B6963]' }

function initials(name: string) { return (name||'?').split(' ').map(w=>w[0]).join('').slice(0,2).toUpperCase() }

export default function MateriaisPage() {
  const { currentMember, showOnlyMine, members } = useUser()
  const [materials, setMaterials] = useState<Material[]>([])
  const [clients, setClients] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [filterClient, setFilterClient] = useState('')
  const [selected, setSelected] = useState<Material | null>(null)
  const [editing, setEditing] = useState(false)
  const [form, setForm] = useState<any>({})
  const [saving, setSaving] = useState(false)
  const [showNew, setShowNew] = useState(false)
  const [editingMat, setEditingMat] = useState<any>(null)

  useEffect(() => {
    async function load() {
      const supabase = createClient()
      const [{ data: mats }, { data: cls }] = await Promise.all([
        supabase.from('materials').select('*').order('created_at', { ascending: false }),
        supabase.from('clients').select('id, name, color_hex').order('name'),
      ])
      setMaterials(mats || [])
      setClients(cls || [])
      setLoading(false)
    }
    load()
  }, [])

  const clientById = (id: string) => clients.find(c => c.id === id)
  const memberById = (id: string | null) => members.find(m => m.id === id)

  const visible = materials.filter(m => {
    if (filterClient && m.client_id !== filterClient) return false
    if (showOnlyMine && currentMember && m.assigned_to !== currentMember.id) return false
    return true
  })

  function colMaterials(colKey: string) {
    // status pode vir vazio/antigo — joga em "A fazer" por padrão
    return visible.filter(m => {
      const s = m.status || 'producao'
      if (colKey === 'producao') return s === 'producao' || (!['aguardando_aprovacao','finalizado'].includes(s))
      return s === colKey
    })
  }

  async function reload() {
    const supabase = createClient()
    const { data } = await supabase.from('materials').select('*').order('created_at', { ascending: false })
    setMaterials(data || [])
  }

  function openMaterial(m: Material) {
    setSelected(m)
    setEditing(false)
  }

  function startEdit() {
    if (!selected) return
    setForm({
      title: selected.title || '', type: selected.type || 'arte_avulsa', status: selected.status || 'producao',
      description: selected.description || '', drive_url: selected.drive_url || '', notes: selected.notes || '',
      due_date: selected.due_date || '', assigned_to: selected.assigned_to || '', label: selected.label || '',
    })
    setEditing(true)
  }

  async function saveMaterial() {
    if (!selected || !form.title?.trim()) return
    setSaving(true)
    const supabase = createClient()
    const payload = { ...form, due_date: form.due_date || null, assigned_to: form.assigned_to || null }
    await supabase.from('materials').update(payload).eq('id', selected.id)
    setMaterials(ms => ms.map(m => m.id === selected.id ? { ...m, ...payload } : m))
    setSelected((prev: any) => prev ? { ...prev, ...payload } : null)
    setSaving(false)
    setEditing(false)
  }

  async function changeStatus(matId: string, newStatus: string) {
    const supabase = createClient()
    await supabase.from('materials').update({ status: newStatus }).eq('id', matId)
    setMaterials(ms => ms.map(m => m.id === matId ? { ...m, status: newStatus } : m))
    setSelected((prev: any) => prev && prev.id === matId ? { ...prev, status: newStatus } : prev)
  }

  if (loading) return <div className="p-6 text-sm text-[#A8A59E]">Carregando materiais...</div>

  return (
    <div className="p-6 flex flex-col gap-5 h-full">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-[#1A1916] font-semibold text-lg">Materiais</h1>
          <p className="text-[#6B6963] text-sm mt-0.5">{visible.length} materiais · menus, cardápios, artes</p>
        </div>
        <div className="flex items-center gap-3">
          <select value={filterClient} onChange={e => setFilterClient(e.target.value)} className="border border-[#EBEAE5] rounded-lg px-3 py-1.5 text-sm bg-white outline-none text-[#1A1916]">
            <option value="">Todos os clientes</option>
            {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <button onClick={() => { setEditingMat(null); setShowNew(true) }} className="bg-[#1A1916] text-white rounded-lg px-4 py-1.5 text-sm font-medium">+ Novo material</button>
        </div>
      </div>

      <div className="flex gap-4 flex-1 overflow-x-auto">
        {COLUMNS.map(col => {
          const items = colMaterials(col.key)
          return (
            <div key={col.key} className="flex-1 min-w-[300px] flex flex-col">
              <div className="flex items-center gap-2 mb-3 px-1">
                <span className="w-2 h-2 rounded-full" style={{ background: col.color }} />
                <span className="text-sm font-semibold text-[#1A1916]">{col.label}</span>
                <span className="text-xs text-[#A8A59E]">{items.length}</span>
              </div>
              <div className="flex flex-col gap-2.5">
                {items.map(m => {
                  const client = clientById(m.client_id)
                  const assignee = memberById(m.assigned_to)
                  return (
                    <div key={m.id} onClick={() => openMaterial(m)} className="bg-white border border-[#EBEAE5] rounded-xl p-4 flex flex-col gap-2.5 hover:shadow-sm transition-all cursor-pointer">
                      {m.label && <span className="text-[10px] font-bold uppercase tracking-wide w-fit px-2 py-0.5 rounded bg-red-100 text-red-700">{m.label}</span>}
                      <p className="text-sm font-medium text-[#1A1916] leading-snug">{m.title}</p>
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${MAT_TYPE_COLOR[m.type]||'bg-[#F2F0EB] text-[#6B6963]'}`}>{MAT_TYPE_LABEL[m.type]||m.type}</span>
                        {client && <span className="text-[10px] font-medium px-2 py-0.5 rounded-full text-white" style={{ background: client.color_hex }}>{client.name}</span>}
                      </div>
                      <div className="flex items-center justify-between mt-1 pt-2 border-t border-[#F2F0EB]">
                        <span className="text-[11px] text-[#A8A59E]">{m.due_date ? new Date(m.due_date+'T12:00:00').toLocaleDateString('pt-BR',{day:'2-digit',month:'short'}) : 'Sem prazo'}</span>
                        {assignee && <div className="w-6 h-6 rounded-full bg-[#1A1916] flex items-center justify-center text-white text-[9px] font-semibold" title={assignee.name}>{initials(assignee.name)}</div>}
                      </div>
                    </div>
                  )
                })}
                {items.length === 0 && <p className="text-xs text-[#C8C5BE] px-1 py-4 text-center">Vazio</p>}
              </div>
            </div>
          )
        })}
      </div>
    {showNew && (
        <MaterialFormModal
          clients={clients}
          editingMaterial={editingMat}
          onClose={() => { setShowNew(false); setEditingMat(null) }}
          onSaved={reload}
        />
      )}

      {selected && (
        <div className="fixed inset-0 z-50 flex justify-end" onClick={(e) => { if (e.target === e.currentTarget) { setSelected(null); setEditing(false) } }}>
          <div className="absolute inset-0 bg-black/30" />
          <div className="relative w-[440px] max-w-full bg-white h-full overflow-y-auto flex flex-col">
            <div className="p-5 border-b border-[#EBEAE5] flex items-start justify-between gap-3 sticky top-0 bg-white z-10">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-2">
                  <select value={selected.status||'producao'} onChange={e => changeStatus(selected.id, e.target.value)} className="text-xs font-medium px-2 py-1 rounded-lg bg-[#F2F0EB] text-[#1A1916] outline-none cursor-pointer border-none">
                    {COLUMNS.map(c => <option key={c.key} value={c.key}>{c.label}</option>)}
                  </select>
                </div>
                <p className="text-lg font-bold text-[#1A1916] leading-snug">{selected.title}</p>
              </div>
              <div className="flex items-center gap-1 flex-shrink-0">
                {!editing && <button onClick={() => { setEditingMat(selected); setShowNew(true) }} className="w-8 h-8 rounded-lg hover:bg-[#F2F0EB] flex items-center justify-center text-[#6B6963]" title="Editar"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg></button>}
                <button onClick={() => { setSelected(null); setEditing(false) }} className="w-8 h-8 rounded-lg hover:bg-[#F2F0EB] flex items-center justify-center text-[#A8A59E] text-lg leading-none">×</button>
              </div>
            </div>

            {editing ? (
              <div className="p-5 flex flex-col gap-4">
                <div><label className="text-xs text-[#A8A59E] mb-1 block">Título *</label><input value={form.title} onChange={e => setForm((f:any)=>({...f,title:e.target.value}))} className="w-full border border-[#EBEAE5] rounded-lg px-3 py-2 text-sm outline-none focus:border-[#1A1916]" /></div>
                <div className="grid grid-cols-2 gap-3">
                  <div><label className="text-xs text-[#A8A59E] mb-1 block">Tipo</label><select value={form.type} onChange={e => setForm((f:any)=>({...f,type:e.target.value}))} className="w-full border border-[#EBEAE5] rounded-lg px-3 py-2 text-sm bg-white outline-none">{Object.entries(MAT_TYPE_LABEL).map(([v,l])=><option key={v} value={v}>{l}</option>)}</select></div>
                  <div><label className="text-xs text-[#A8A59E] mb-1 block">Prazo</label><input type="date" value={form.due_date} onChange={e => setForm((f:any)=>({...f,due_date:e.target.value}))} className="w-full border border-[#EBEAE5] rounded-lg px-3 py-2 text-sm outline-none focus:border-[#1A1916]" /></div>
                </div>
                <div><label className="text-xs text-[#A8A59E] mb-1 block">Responsável</label><select value={form.assigned_to} onChange={e => setForm((f:any)=>({...f,assigned_to:e.target.value}))} className="w-full border border-[#EBEAE5] rounded-lg px-3 py-2 text-sm bg-white outline-none"><option value="">Ninguém</option>{members.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}</select></div>
                <div><label className="text-xs text-[#A8A59E] mb-1 block">Etiqueta</label><input value={form.label} onChange={e => setForm((f:any)=>({...f,label:e.target.value}))} placeholder="Ex: FAZER DESIGN" className="w-full border border-[#EBEAE5] rounded-lg px-3 py-2 text-sm outline-none focus:border-[#1A1916]" /></div>
                <div><label className="text-xs text-[#A8A59E] mb-1 block">Descrição / Briefing</label><textarea value={form.description} onChange={e => setForm((f:any)=>({...f,description:e.target.value}))} rows={6} placeholder="Especificações, dimensões, instruções..." className="w-full border border-[#EBEAE5] rounded-lg px-3 py-2 text-sm outline-none focus:border-[#1A1916] resize-none" /></div>
                <div><label className="text-xs text-[#A8A59E] mb-1 block">Link do Drive</label><input value={form.drive_url} onChange={e => setForm((f:any)=>({...f,drive_url:e.target.value}))} className="w-full border border-[#EBEAE5] rounded-lg px-3 py-2 text-sm outline-none focus:border-[#1A1916]" /></div>
                <div className="flex gap-2 mt-2">
                  <button onClick={() => setEditing(false)} className="flex-1 py-2 text-sm border border-[#EBEAE5] rounded-lg text-[#6B6963]">Cancelar</button>
                  <button onClick={saveMaterial} disabled={saving||!form.title?.trim()} className="flex-1 py-2 text-sm bg-[#1A1916] text-white rounded-lg disabled:opacity-50">{saving?'Salvando...':'Salvar'}</button>
                </div>
              </div>
            ) : (
              <div className="p-5 flex flex-col gap-5">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${MAT_TYPE_COLOR[selected.type]||'bg-[#F2F0EB] text-[#6B6963]'}`}>{MAT_TYPE_LABEL[selected.type]||selected.type}</span>
                  {clientById(selected.client_id) && <span className="text-xs font-medium px-2.5 py-1 rounded-full text-white" style={{ background: clientById(selected.client_id).color_hex }}>{clientById(selected.client_id).name}</span>}
                  {selected.label && <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded bg-red-100 text-red-700">{selected.label}</span>}
                </div>
                <div className="flex gap-4">
                  <div className="flex-1"><p className="text-xs text-[#A8A59E] mb-1">Prazo</p><p className="text-sm font-medium text-[#1A1916]">{selected.due_date ? new Date(selected.due_date+'T12:00:00').toLocaleDateString('pt-BR') : '—'}</p></div>
                  <div className="flex-1"><p className="text-xs text-[#A8A59E] mb-1">Responsável</p><p className="text-sm font-medium text-[#1A1916]">{memberById(selected.assigned_to)?.name || '—'}</p></div>
                </div>
                {selected.description && <div><p className="text-xs text-[#A8A59E] mb-2">Descrição / Briefing</p><p className="text-sm text-[#1A1916] whitespace-pre-wrap leading-relaxed">{selected.description}</p></div>}
                {selected.drive_url && <div><p className="text-xs text-[#A8A59E] mb-1">Link do Drive</p><a href={selected.drive_url} target="_blank" rel="noopener noreferrer" className="text-sm text-blue-600 underline break-all">{selected.drive_url}</a></div>}
                {selected.notes && <div><p className="text-xs text-[#A8A59E] mb-1">Notas</p><p className="text-sm text-[#1A1916] whitespace-pre-wrap">{selected.notes}</p></div>}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
