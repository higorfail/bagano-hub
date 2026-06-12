'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase'
import IPhoneFeed, { FeedPost } from '@/components/IPhoneFeed'
import { Search, ChevronDown } from 'lucide-react'

interface Client {
  id: string
  name: string
  color_hex: string
}

export default function FeedPage() {
  const supabase = createClient()
  const [clients, setClients] = useState<Client[]>([])
  const [selected, setSelected] = useState<Client | null>(null)
  const [posts, setPosts] = useState<FeedPost[]>([])
  const [loading, setLoading] = useState(false)
  const [search, setSearch] = useState('')
  const [month, setMonth] = useState(new Date().getMonth() + 1)
  const [year, setYear] = useState(new Date().getFullYear())

  const months = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro']
  const initials = (name: string) => name.split(' ').slice(0, 2).map(w => w[0]).join('').toUpperCase()

  useEffect(() => {
    supabase.from('clients').select('id, name, color_hex').eq('status', 'active').order('name')
      .then(({ data }) => { if (data) setClients(data) })
  }, [])

  useEffect(() => {
    if (!selected) return
    setLoading(true)
    supabase.from('schedules').select('id, title, post_type, status, drive_url, drive_folder_url, copy, scheduled_date, feed_order').eq('client_id', selected.id).order('feed_order', { ascending: true })
      .then(({ data }) => {
        if (data) {
          setPosts(data.map(s => ({
            id: s.id,
            title: s.title || 'Post sem título',
            type: s.post_type === 'reels' ? 'reel' : s.post_type === 'carousel' ? 'carousel' : 'photo',
            status: s.status === 'approved' ? 'approved' : s.status === 'changes_requested' ? 'changes_requested' : s.status === 'draft' ? 'draft' : 'pending',
            drive_url: s.drive_url,
            drive_folder_url: s.drive_folder_url,
            copy: s.copy,
            scheduled_date: s.scheduled_date,
            feed_order: s.feed_order,
          })))
        }
        setLoading(false)
      })
  }, [selected, month, year])

  const handleReorder = async (reordered: FeedPost[]) => {
    await Promise.all(reordered.map(p => supabase.from('schedules').update({ feed_order: p.feed_order }).eq('id', p.id)))
  }

  const filtered = clients.filter(c => c.name.toLowerCase().includes(search.toLowerCase()))

  return (
    <div className="flex h-screen bg-[var(--color-bg-page)]">
      <aside className="w-60 flex-shrink-0 bg-white border-r border-gray-200 flex flex-col">
        <div className="px-4 pt-6 pb-4 border-b border-gray-100">
          <h2 className="text-sm font-semibold text-gray-900">Feed Visual</h2>
          <p className="text-xs text-gray-400 mt-0.5">Preview do Instagram</p>
        </div>
        <div className="px-3 py-3 border-b border-gray-100">
          <div className="flex items-center gap-2 bg-gray-50 rounded-lg px-3 py-2">
            <Search size={13} className="text-gray-400 flex-shrink-0" />
            <input type="text" placeholder="Buscar..." value={search} onChange={e => setSearch(e.target.value)} className="bg-transparent text-sm text-gray-700 placeholder-gray-400 outline-none w-full" />
          </div>
        </div>
        <div className="flex-1 overflow-y-auto py-2">
          {filtered.map(client => (
            <button key={client.id} onClick={() => setSelected(client)} className={`w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors ${selected?.id === client.id ? 'bg-gray-100' : 'hover:bg-gray-50'}`}>
              <div className="w-7 h-7 rounded-full flex items-center justify-center text-white text-[10px] font-medium flex-shrink-0" style={{ background: client.color_hex || '#1a1a1a' }}>{initials(client.name)}</div>
              <span className="text-sm text-gray-800 truncate">{client.name}</span>
            </button>
          ))}
        </div>
      </aside>

      <main className="flex-1 overflow-auto p-8">
        {selected ? (
          <>
            <div className="flex items-center justify-between mb-8">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-full flex items-center justify-center text-white font-medium" style={{ background: selected.color_hex }}>{initials(selected.name)}</div>
                <div>
                  <h1 className="text-lg font-semibold text-gray-900">{selected.name}</h1>
                  <p className="text-xs text-gray-400">Feed do Instagram</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <div className="relative">
                  <select value={month} onChange={e => setMonth(Number(e.target.value))} className="appearance-none bg-white border border-gray-200 rounded-lg px-3 py-2 pr-7 text-sm text-gray-700 cursor-pointer outline-none">
                    {months.map((m, i) => <option key={i} value={i + 1}>{m}</option>)}
                  </select>
                  <ChevronDown size={13} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                </div>
                <div className="relative">
                  <select value={year} onChange={e => setYear(Number(e.target.value))} className="appearance-none bg-white border border-gray-200 rounded-lg px-3 py-2 pr-7 text-sm text-gray-700 cursor-pointer outline-none">
                    {[2024, 2025, 2026].map(y => <option key={y} value={y}>{y}</option>)}
                  </select>
                  <ChevronDown size={13} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                </div>
              </div>
            </div>
            {loading ? (
              <div className="flex items-center justify-center py-20">
                <div className="w-5 h-5 border-2 border-gray-300 border-t-gray-700 rounded-full animate-spin" />
              </div>
            ) : (
              <IPhoneFeed posts={posts} clientName={selected.name} clientColor={selected.color_hex} clientInitials={initials(selected.name)} onReorder={handleReorder} />
            )}
          </>
        ) : (
          <div className="flex items-center justify-center h-full">
            <div className="text-center">
              <div className="w-12 h-12 rounded-2xl bg-gray-100 flex items-center justify-center mx-auto mb-3">
                <span className="text-xl">📱</span>
              </div>
              <p className="text-sm text-gray-400">Selecione um cliente para ver o feed</p>
            </div>
          </div>
        )}
      </main>
    </div>
  )
}
