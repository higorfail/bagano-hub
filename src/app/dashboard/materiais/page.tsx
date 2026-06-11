'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import { useUser } from '@/lib/UserContext'
import MaterialCard from '@/components/MaterialCard'

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
  const [cardOpen, setCardOpen] = useState<string | 'new' | null>(null)

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
          <button onClick={() => setCardOpen('new')} className="bg-[#1A1916] text-white rounded-lg px-4 py-1.5 text-sm font-medium">+ Novo material</button>
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
                    <div key={m.id} onClick={() => setCardOpen(m.id)} className="bg-white border border-[#EBEAE5] rounded-xl p-4 flex flex-col gap-2.5 hover:shadow-sm transition-all cursor-pointer">
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
    {cardOpen && (
        <MaterialCard
          materialId={cardOpen === 'new' ? undefined : cardOpen}
          clients={clients}
          onClose={() => setCardOpen(null)}
          onSaved={reload}
        />
      )}
    </div>
  )
}