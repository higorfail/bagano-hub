'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase'
import { useUser } from '@/lib/UserContext'

const TYPE_OPTIONS = ['Menu', 'Cardápio', 'Arte avulsa', 'Logo', 'Manual', 'Placa', 'Cartão', 'Sacola', 'Sousplat', 'Story', 'Capas destaque', 'Fundos', 'Outro']
const LABEL_PRESETS = [
  { text: 'FAZER DESIGN', color: '#EF4444' },
  { text: 'URGENTE', color: '#F59E0B' },
  { text: 'REVISÃO', color: '#8B5CF6' },
  { text: 'IMPRESSÃO', color: '#3B82F6' },
  { text: 'AGUARDANDO CLIENTE', color: '#EC4899' },
]
const STATUS_OPTIONS = [
  { value: 'producao', label: 'A fazer' },
  { value: 'aguardando_aprovacao', label: 'Em aprovação' },
  { value: 'finalizado', label: 'Finalizado' },
]

type Props = {
  fixedClientId?: string        // quando aberto dentro de um cliente
  clients?: any[]               // quando aberto na página global
  editingMaterial?: any         // se passado, edita em vez de criar
  onClose: () => void
  onSaved: () => void
}

export default function MaterialFormModal({ fixedClientId, clients = [], editingMaterial, onClose, onSaved }: Props) {
  const { members } = useUser()
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState<any>({
    title: '', type: 'Arte avulsa', status: 'producao', client_id: fixedClientId || '',
    description: '', drive_url: '', notes: '', due_date: '', assigned_to: '', label: '',
  })

  useEffect(() => {
    if (editingMaterial) {
      setForm({
        title: editingMaterial.title || '', type: editingMaterial.type || 'Arte avulsa',
        status: editingMaterial.status || 'producao', client_id: editingMaterial.client_id || fixedClientId || '',
        description: editingMaterial.description || '', drive_url: editingMaterial.drive_url || '',
        notes: editingMaterial.notes || '', due_date: editingMaterial.due_date || '',
        assigned_to: editingMaterial.assigned_to || '', label: editingMaterial.label || '',
      })
    }
  }, [editingMaterial, fixedClientId])

  // Detecção local inteligente: sugere cliente e tipo a partir do título
  function detectFromTitle(title: string) {
    if (!title.trim()) return
    const lower = title.toLowerCase()

    // Detectar cliente (só se ainda não escolhido manualmente)
    if (!fixedClientId && !form.client_id) {
      const match = clients.find(c => {
        const name = c.name.toLowerCase()
        // tenta nome completo ou primeira palavra significativa
        const firstWord = name.split(' ')[0]
        return lower.includes(name) || (firstWord.length > 3 && lower.includes(firstWord))
      })
      if (match) setForm((f:any) => ({ ...f, client_id: match.id }))
    }

    // Detectar tipo
    const typeMap: Record<string,string> = {
      'menu': 'Menu', 'cardapio': 'Cardápio', 'cardápio': 'Cardápio', 'logo': 'Logo',
      'placa': 'Placa', 'cartao': 'Cartão', 'cartão': 'Cartão', 'sacola': 'Sacola',
      'sousplat': 'Sousplat', 'story': 'Story', 'stories': 'Story', 'capa': 'Capas destaque',
      'fundo': 'Fundos', 'manual': 'Manual',
    }
    for (const [key, val] of Object.entries(typeMap)) {
      if (lower.includes(key)) { setForm((f:any) => ({ ...f, type: val })); break }
    }
  }

  async function save() {
    if (!form.title.trim()) return
    if (!form.client_id) { alert('Escolha um cliente'); return }
    setSaving(true)
    const supabase = createClient()
    const payload = { ...form, due_date: form.due_date || null, assigned_to: form.assigned_to || null }
    if (editingMaterial) {
      await supabase.from('materials').update(payload).eq('id', editingMaterial.id)
    } else {
      await supabase.from('materials').insert(payload)
    }
    setSaving(false)
    onSaved()
    onClose()
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-[70] p-4" onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="bg-white rounded-2xl w-full max-w-lg flex flex-col max-h-[92vh]">
        <div className="p-5 border-b border-[#EBEAE5] flex items-center justify-between">
          <h2 className="text-sm font-semibold text-[#1A1916]">{editingMaterial ? 'Editar material' : 'Novo material'}</h2>
          <button onClick={onClose} className="text-[#A8A59E] hover:text-[#1A1916] text-lg leading-none">×</button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 flex flex-col gap-4">
          <div><label className="text-xs text-[#A8A59E] mb-1 block">Título *</label><input value={form.title} onChange={e => { const v = e.target.value; setForm((f:any)=>({...f,title:v})); detectFromTitle(v) }} placeholder="Ex: Menu entrada Piastro" className="w-full border border-[#EBEAE5] rounded-lg px-3 py-2 text-sm outline-none focus:border-[#1A1916]" /></div>

          {!fixedClientId && (
            <div><label className="text-xs text-[#A8A59E] mb-1 block">Cliente *</label><select value={form.client_id} onChange={e => setForm((f:any)=>({...f,client_id:e.target.value}))} className="w-full border border-[#EBEAE5] rounded-lg px-3 py-2 text-sm bg-white outline-none"><option value="">Selecione...</option>{clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-[#A8A59E] mb-1 block">Tipo</label>
              <input list="mat-types" value={form.type} onChange={e => setForm((f:any)=>({...f,type:e.target.value}))} placeholder="Escolha ou escreva..." className="w-full border border-[#EBEAE5] rounded-lg px-3 py-2 text-sm bg-white outline-none focus:border-[#1A1916]" />
              <datalist id="mat-types">{TYPE_OPTIONS.map(t => <option key={t} value={t} />)}</datalist>
            </div>
            <div>
              <label className="text-xs text-[#A8A59E] mb-1 block">Status</label>
              <select value={form.status} onChange={e => setForm((f:any)=>({...f,status:e.target.value}))} className="w-full border border-[#EBEAE5] rounded-lg px-3 py-2 text-sm bg-white outline-none">{STATUS_OPTIONS.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}</select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div><label className="text-xs text-[#A8A59E] mb-1 block">Prazo de entrega</label><input type="date" value={form.due_date} onChange={e => setForm((f:any)=>({...f,due_date:e.target.value}))} className="w-full border border-[#EBEAE5] rounded-lg px-3 py-2 text-sm outline-none focus:border-[#1A1916]" /></div>
            <div><label className="text-xs text-[#A8A59E] mb-1 block">Responsável</label><select value={form.assigned_to} onChange={e => setForm((f:any)=>({...f,assigned_to:e.target.value}))} className="w-full border border-[#EBEAE5] rounded-lg px-3 py-2 text-sm bg-white outline-none"><option value="">Ninguém</option>{members.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}</select></div>
          </div>

          <div>
            <label className="text-xs text-[#A8A59E] mb-1 block">Etiqueta</label>
            <input list="mat-labels" value={form.label} onChange={e => setForm((f:any)=>({...f,label:e.target.value}))} placeholder="Escolha ou crie uma etiqueta..." className="w-full border border-[#EBEAE5] rounded-lg px-3 py-2 text-sm bg-white outline-none focus:border-[#1A1916]" />
            <datalist id="mat-labels">{LABEL_PRESETS.map(l => <option key={l.text} value={l.text} />)}</datalist>
            <div className="flex flex-wrap gap-1.5 mt-2">
              {LABEL_PRESETS.map(l => (
                <button key={l.text} type="button" onClick={() => setForm((f:any)=>({...f,label:l.text}))} className="text-[10px] font-bold uppercase px-2 py-0.5 rounded text-white" style={{ background: l.color }}>{l.text}</button>
              ))}
            </div>
          </div>

          <div><label className="text-xs text-[#A8A59E] mb-1 block">Descrição / Briefing</label><textarea value={form.description} onChange={e => setForm((f:any)=>({...f,description:e.target.value}))} rows={5} placeholder="Especificações, dimensões, instruções, referências..." className="w-full border border-[#EBEAE5] rounded-lg px-3 py-2 text-sm outline-none focus:border-[#1A1916] resize-none" /></div>

          <div><label className="text-xs text-[#A8A59E] mb-1 block">Link do Drive</label><input value={form.drive_url} onChange={e => setForm((f:any)=>({...f,drive_url:e.target.value}))} placeholder="https://drive.google.com/..." className="w-full border border-[#EBEAE5] rounded-lg px-3 py-2 text-sm outline-none focus:border-[#1A1916]" /></div>

          <div><label className="text-xs text-[#A8A59E] mb-1 block">Notas</label><textarea value={form.notes} onChange={e => setForm((f:any)=>({...f,notes:e.target.value}))} rows={2} placeholder="Observações extras..." className="w-full border border-[#EBEAE5] rounded-lg px-3 py-2 text-sm outline-none focus:border-[#1A1916] resize-none" /></div>
        </div>

        <div className="p-5 border-t border-[#EBEAE5] flex gap-3 justify-end">
          <button onClick={onClose} className="px-4 py-2 text-sm text-[#6B6963] border border-[#EBEAE5] rounded-lg hover:bg-[#F2F0EB]">Cancelar</button>
          <button onClick={save} disabled={saving||!form.title.trim()} className="px-4 py-2 text-sm text-white bg-[#1A1916] rounded-lg disabled:opacity-50">{saving?'Salvando...':'Salvar material'}</button>
        </div>
      </div>
    </div>
  )
}
