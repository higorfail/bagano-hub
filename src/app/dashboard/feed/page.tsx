'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase'
import IPhoneFeed, { FeedPost } from '@/components/IPhoneFeed'
import { Search, ChevronDown } from 'lucide-react'

interface Client {
  id: string
  name: string
  color_hex: string
  instagram_url: string | null
  instagram_followers: number | null
  instagram_following: number | null
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
    supabase.from('clients').select('id, name, color_hex, instagram_url, instagram_followers, instagram_following').eq('status', 'active').order('name')
      .then(({ data }) => { if (data) setClients(data) })
  }, [])

  useEffect(() => {
    if (!selected) return
    setLoading(true)
    supabase.from('schedules').select('id, title, post_type, status, approval_status, drive_url, drive_folder_url, copy, scheduled_date, feed_order').eq('client_id', selected.id).order('feed_order', { ascending: true })
      .then(({ data }) => {
        if (data) {
          setPosts(data.map(s => ({
            id: s.id,
            title: s.title || 'Post sem título',
            type: s.post_type === 'reels' ? 'reel' : (s.post_type === 'carrossel' || s.post_type === 'carrossel_stories') ? 'carousel' : 'photo',
            status: s.approval_status === 'aprovado' ? 'approved' : s.approval_status === 'não aprovado' ? 'changes_requested' : s.status === 'publicado' ? 'approved' : 'pending',
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
      <aside className="w-60 flex-shrink-0 bg-[var(--color-bg-card)] border-r border-[var(--color-border)] flex flex-col">
        <div className="px-4 pt-6 pb-4 border-b border-[var(--color-border)]">
          <h2 className="text-sm font-semibold text-[var(--color-text-primary)]">Feed Visual</h2>
          <p className="text-xs text-[var(--color-text-muted)] mt-0.5">Preview do Instagram</p>
        </div>
        <div className="px-3 py-3 border-b border-[var(--color-border)]">
          <div className="flex items-center gap-2 bg-[var(--color-bg-subtle)] rounded-lg px-3 py-2">
            <Search size={13} className="text-[var(--color-text-muted)] flex-shrink-0" />
            <input type="text" placeholder="Buscar..." value={search} onChange={e => setSearch(e.target.value)} className="bg-transparent text-sm text-[var(--color-text-primary)] outline-none w-full placeholder:text-[var(--color-text-faint)]" />
          </div>
        </div>
        <div className="flex-1 overflow-y-auto py-2">
          {filtered.map(client => (
            <button key={client.id} onClick={() => setSelected(client)} className={`w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors ${selected?.id === client.id ? 'bg-[var(--color-bg-subtle)]' : 'hover:bg-[var(--color-bg-subtle)]'}`}>
              <div className="w-7 h-7 rounded-full flex items-center justify-center text-white text-[10px] font-medium flex-shrink-0" style={{ background: client.color_hex || '#1a1a1a' }}>{initials(client.name)}</div>
              <span className="text-sm text-[var(--color-text-primary)] truncate">{client.name}</span>
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
                  <h1 className="text-lg font-semibold text-[var(--color-text-primary)]">{selected.name}</h1>
                  <p className="text-xs text-[var(--color-text-muted)]">Feed do Instagram</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <div className="relative">
                  <select value={month} onChange={e => setMonth(Number(e.target.value))} className="appearance-none bg-[var(--color-bg-card)] border border-[var(--color-border)] rounded-lg px-3 py-2 pr-7 text-sm text-[var(--color-text-primary)] cursor-pointer outline-none">
                    {months.map((m, i) => <option key={i} value={i + 1}>{m}</option>)}
                  </select>
                  <ChevronDown size={13} className="absolute right-2 top-1/2 -translate-y-1/2 text-[var(--color-text-muted)] pointer-events-none" />
                </div>
                <div className="relative">
                  <select value={year} onChange={e => setYear(Number(e.target.value))} className="appearance-none bg-[var(--color-bg-card)] border border-[var(--color-border)] rounded-lg px-3 py-2 pr-7 text-sm text-[var(--color-text-primary)] cursor-pointer outline-none">
                    {[2024, 2025, 2026].map(y => <option key={y} value={y}>{y}</option>)}
                  </select>
                  <ChevronDown size={13} className="absolute right-2 top-1/2 -translate-y-1/2 text-[var(--color-text-muted)] pointer-events-none" />
                </div>
              </div>
            </div>
            {loading ? (
              <div className="flex items-center justify-center py-20">
                <div className="w-5 h-5 border-2 border-[var(--color-border)] border-t-[var(--color-text-muted)] rounded-full animate-spin" />
              </div>
            ) : (
              <IPhoneFeed
                posts={posts}
                clientName={selected.name}
                clientColor={selected.color_hex}
                clientInitials={initials(selected.name)}
                instagramUrl={selected.instagram_url || undefined}
                followersCount={selected.instagram_followers ?? undefined}
                followingCount={selected.instagram_following ?? undefined}
                onReorder={handleReorder}
              />
            )}
          </>
        ) : (
          <div className="flex items-center justify-center h-full">
            <div className="text-center">
              <div className="w-12 h-12 rounded-2xl bg-[var(--color-bg-subtle)] flex items-center justify-center mx-auto mb-3">
                <span className="text-xl">📱</span>
              </div>
              <p className="text-sm text-[var(--color-text-muted)]">Selecione um cliente para ver o feed</p>
            </div>
          </div>
        )}
      </main>
    </div>
  )
}
