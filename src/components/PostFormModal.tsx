'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase'

const POST_TYPES = [
  { value: 'reels', label: 'Reels' },
  { value: 'carrossel', label: 'Carrossel' },
  { value: 'post', label: 'Post' },
  { value: 'story', label: 'Story' },
  { value: 'carrossel_stories', label: 'Carrossel/Stories' },
]
const STATUSES = [
  { value: 'producao', label: 'Produção' },
  { value: 'revisao_interna', label: 'Revisão interna' },
  { value: 'aguardando_aprovacao', label: 'Aguardando aprovação' },
  { value: 'aprovado', label: 'Aprovado' },
  { value: 'agendado', label: 'Agendado' },
  { value: 'publicado', label: 'Publicado' },
]
const FUNIL_OPTIONS = ['Topo de funil', 'Meio de funil', 'Fundo de funil', 'Institucional', 'Promocional', 'Engajamento', 'Venda']

const EMPTY = { title: '', copy: '', post_type: 'reels', scheduled_date: '', status: 'producao', drive_url: '', reference_notes: '', funil: '' }

type Props = {
  clientId: string
  clientName: string
  month: number
  year: number
  nextPostNumber: number
  onClose: () => void
  onSaved: () => void
}

export default function PostFormModal({ clientId, clientName, month, year, nextPostNumber, onClose, onSaved }: Props) {
  const [form, setForm] = useState(EMPTY)
  const [saving, setSaving] = useState(false)

  async function save() {
    if (!form.title.trim()) return
    setSaving(true)
    const supabase = createClient()
    await supabase.from('schedules').insert({
      client_id: clientId, month, year, post_number: nextPostNumber,
      ...form, scheduled_date: form.scheduled_date || null,
    })
    setSaving(false)
    onSaved()
    onClose()
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-[60]" onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="bg-white rounded-2xl w-full max-w-lg mx-4 flex flex-col max-h-[90vh]">
        <div className="p-5 border-b border-[#EBEAE5] flex items-center justify-between">
          <h2 className="text-sm font-semibold text-[#1A1916]">Novo post · {clientName}</h2>
          <button onClick={onClose} className="text-[#A8A59E] hover:text-[#1A1916] text-lg leading-none">×</button>
        </div>
        <div className="flex-1 overflow-y-auto p-5 flex flex-col gap-4">
          <div><label className="text-xs text-[#A8A59E] mb-1 block">Título *</label><input value={form.title} onChange={e=>setForm(f=>({...f,title:e.target.value}))} placeholder="Ex: Abertura do forno a lenha" className="w-full border border-[#EBEAE5] rounded-lg px-3 py-2 text-sm text-[#1A1916] outline-none focus:border-[#1A1916]" /></div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className="text-xs text-[#A8A59E] mb-1 block">Tipo</label><select value={form.post_type} onChange={e=>setForm(f=>({...f,post_type:e.target.value}))} className="w-full border border-[#EBEAE5] rounded-lg px-3 py-2 text-sm text-[#1A1916] bg-white outline-none">{POST_TYPES.map(t=><option key={t.value} value={t.value}>{t.label}</option>)}</select></div>
            <div><label className="text-xs text-[#A8A59E] mb-1 block">Status</label><select value={form.status} onChange={e=>setForm(f=>({...f,status:e.target.value}))} className="w-full border border-[#EBEAE5] rounded-lg px-3 py-2 text-sm text-[#1A1916] bg-white outline-none">{STATUSES.map(s=><option key={s.value} value={s.value}>{s.label}</option>)}</select></div>
          </div>
          <div><label className="text-xs text-[#A8A59E] mb-1 block">Funil</label><input list="funil-opts-modal" value={form.funil} onChange={e=>setForm(f=>({...f,funil:e.target.value}))} placeholder="Escolha ou escreva..." className="w-full border border-[#EBEAE5] rounded-lg px-3 py-2 text-sm text-[#1A1916] bg-white outline-none focus:border-[#1A1916]" /><datalist id="funil-opts-modal">{FUNIL_OPTIONS.map(o=><option key={o} value={o} />)}</datalist></div>
          <div><label className="text-xs text-[#A8A59E] mb-1 block">Data estimada</label><input type="date" value={form.scheduled_date} onChange={e=>setForm(f=>({...f,scheduled_date:e.target.value}))} className="w-full border border-[#EBEAE5] rounded-lg px-3 py-2 text-sm text-[#1A1916] outline-none focus:border-[#1A1916]" /></div>
          <div><label className="text-xs text-[#A8A59E] mb-1 block">Copy / Briefing</label><textarea value={form.copy} onChange={e=>setForm(f=>({...f,copy:e.target.value}))} rows={4} placeholder="Texto da legenda ou briefing..." className="w-full border border-[#EBEAE5] rounded-lg px-3 py-2 text-sm text-[#1A1916] outline-none focus:border-[#1A1916] resize-none" /></div>
          <div><label className="text-xs text-[#A8A59E] mb-1 block">Link Drive</label><input value={form.drive_url} onChange={e=>setForm(f=>({...f,drive_url:e.target.value}))} placeholder="https://drive.google.com/..." className="w-full border border-[#EBEAE5] rounded-lg px-3 py-2 text-sm text-[#1A1916] outline-none focus:border-[#1A1916]" /></div>
          <div><label className="text-xs text-[#A8A59E] mb-1 block">Referências / Comentários</label><textarea value={form.reference_notes} onChange={e=>setForm(f=>({...f,reference_notes:e.target.value}))} rows={2} placeholder="Links de referência, observações..." className="w-full border border-[#EBEAE5] rounded-lg px-3 py-2 text-sm text-[#1A1916] outline-none focus:border-[#1A1916] resize-none" /></div>
        </div>
        <div className="p-5 border-t border-[#EBEAE5] flex gap-3 justify-end">
          <button onClick={onClose} className="px-4 py-2 text-sm text-[#6B6963] border border-[#EBEAE5] rounded-lg hover:bg-[#F2F0EB]">Cancelar</button>
          <button onClick={save} disabled={saving||!form.title.trim()} className="px-4 py-2 text-sm text-white bg-[#1A1916] rounded-lg disabled:opacity-50">{saving?'Salvando...':'Salvar post'}</button>
        </div>
      </div>
    </div>
  )
}
