'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import { useUser } from '@/lib/UserContext'

type Client = {
  id: string
  name: string
  color_hex: string
  status: string
}

function getInitials(name: string) {
  return name.split(' ').map((w: string) => w[0]).join('').slice(0, 2).toUpperCase()
}

export default function ClientesPage() {
  const { currentMember, showOnlyMine } = useUser()
  const [clients, setClients] = useState<Client[]>([])
  const [myClientIds, setMyClientIds] = useState<string[]>([])
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      const supabase = createClient()
      const { data } = await supabase
        .from('clients')
        .select('*')
        .eq('status', 'active')
        .order('name')
      setClients(data || [])
      const { data: teamData } = await supabase.from('client_team').select('client_id, member_id')
      if (currentMember && teamData) {
        setMyClientIds(teamData.filter(t => t.member_id === currentMember.id).map(t => t.client_id))
      }
      setLoading(false)
    }
    load()
  }, [currentMember])

  const filtered = clients.filter(c => c.name.toLowerCase().includes(search.toLowerCase()) && (!showOnlyMine || !currentMember || myClientIds.includes(c.id)))

  if (loading) return (
    <div className="p-6 flex items-center justify-center h-full">
      <p className="text-[var(--color-text-muted)] text-sm">Carregando clientes...</p>
    </div>
  )

  return (
    <div className="p-6 flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-[var(--color-text-primary)] font-semibold text-lg">Clientes</h1>
          <p className="text-[var(--color-text-secondary)] text-sm mt-0.5">{clients.length} clientes ativos</p>
        </div>
        <button className="bg-[var(--color-text-primary)] text-white rounded-lg px-4 py-2 text-sm font-medium">
          + Novo cliente
        </button>
      </div>
      <input
        type="text"
        placeholder="Buscar cliente..."
        value={search}
        onChange={e => setSearch(e.target.value)}
        className="w-full max-w-xs border border-[#EBEAE5] rounded-lg px-3 py-2 text-sm outline-none focus:border-[#1A1916] bg-white"
      />
      <div className="grid grid-cols-4 gap-4">
        {filtered.map(client => (
          <a
            key={client.id}
            href={'/dashboard/clientes/' + client.id}
            className="bg-white border border-[#EBEAE5] rounded-2xl p-4 block hover:shadow-sm transition-all"
            style={{ borderLeftWidth: 3, borderLeftColor: client.color_hex }}
          >
            <div className="flex items-center gap-3 mb-4">
              <div
                className="w-10 h-10 rounded-xl flex items-center justify-center text-sm font-semibold text-white flex-shrink-0"
                style={{ background: client.color_hex }}
              >
                {getInitials(client.name)}
              </div>
              <div className="min-w-0">
                <p className="text-sm font-medium text-[var(--color-text-primary)] truncate">{client.name}</p>
                <p className="text-xs text-[var(--color-text-muted)]">Junho 2026</p>
              </div>
            </div>
            <div className="w-full bg-[var(--color-bg-subtle)] rounded-full h-1 mb-2">
              <div className="h-1 rounded-full w-0" style={{ background: client.color_hex }} />
            </div>
            <div className="flex items-center justify-between">
              <span className="text-xs text-[var(--color-text-muted)]">0/0 aprovados</span>
              <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-[#F1EFE8] text-[var(--color-text-secondary)]">em andamento</span>
            </div>
          </a>
        ))}
      </div>
    </div>
  )
}