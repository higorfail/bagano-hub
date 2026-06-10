'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'

type Post = {
  id: string
  post_number: number
  title: string
  post_type: string
  status: string
  scheduled_date: string
  client_id: string
  month: number
  year: number
  approval_status: string
  approval_comment: string
}

type Client = { id: string; name: string; color_hex: string }

const COLUMNS = [
  { key: 'pendente', label: 'Pendente', color: 'var(--color-text-muted)' },
  { key: 'em produção', label: 'Em produção', color: '#F59E0B' },
  { key: 'aprovado', label: 'Aprovado', color: '#3B82F6' },
  { key: 'publicado', label: 'Publicado', color: '#22C55E' },
]

const typeColor: Record<string, string> = {
  'Reels': 'bg-red-50 text-red-600',
  'Carrossel': 'bg-blue-50 text-blue-600',
  'Stories': 'bg-purple-50 text-purple-600',
  'Carrossel/Stories': 'bg-indigo-50 text-indigo-600',
  'Post': 'bg-amber-50 text-amber-600',
}

const MONTHS_FULL = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro']

function ApprovalBadge({ status, comment }: { status: string; comment: string }) {
  if (!status || status === 'pendente') return null
  if (status === 'aprovado') return (
    <div className="flex items-center gap-1.5 bg-green-50 border border-green-200 rounded-lg px-2.5 py-1.5">
      <span className="text-green-600 text-sm">✓</span>
      <span className="text-xs font-semibold text-green-700">Cliente aprovou</span>
    </div>
  )
  if (status === 'não aprovado') return (
    <div className="flex flex-col gap-1 bg-red-50 border border-red-200 rounded-lg px-2.5 py-1.5">
      <div className="flex items-center gap-1.5">
        <span className="text-red-500 text-sm">✗</span>
        <span className="text-xs font-semibold text-red-700">Cliente não aprovou</span>
      </div>
      {comment && <p className="text-[10px] text-red-500 italic leading-snug">"{comment}"</p>}
    </div>
  )
  return null
}

export default function KanbanPage() {
  const [posts, setPosts] = useState<Post[]>([])
  const [clients, setClients] = useState<Client[]>([])
  const [loading, setLoading] = useState(true)
  const [dragging, setDragging] = useState<string | null>(null)
  const [dragOver, setDragOver] = useState<string | null>(null)
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth() + 1)
  const [selectedYear] = useState(new Date().getFullYear())

  useEffect(() => {
    async function load() {
      const supabase = createClient()
      const [{ data: clientData }, { data: postData }] = await Promise.all([
        supabase.from('clients').select('id, name, color_hex').eq('status', 'active'),
        supabase.from('schedules').select('id, post_number, title, post_type, status, scheduled_date, client_id, month, year, approval_status, approval_comment')
          .eq('month', selectedMonth)
          .eq('year', selectedYear)
          .order('post_number'),
      ])
      setClients(clientData || [])
      setPosts(postData || [])
      setLoading(false)
    }
    load()
  }, [selectedMonth, selectedYear])

  async function movePost(postId: string, newStatus: string) {
    const supabase = createClient()
    await supabase.from('schedules').update({ status: newStatus }).eq('id', postId)
    setPosts(p => p.map(post => post.id === postId ? { ...post, status: newStatus } : post))
  }

  function getClient(clientId: string) {
    return clients.find(c => c.id === clientId)
  }

  if (loading) return <div className="p-6 text-sm text-[var(--color-text-muted)]">Carregando...</div>

  const totalPosts = posts.length
  const publishedPosts = posts.filter(p => p.status === 'publicado').length
  const pendingApproval = posts.filter(p => p.approval_status === 'não aprovado').length

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="p-6 border-b border-[#EBEAE5] flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-4">
          <div>
            <h1 className="text-[var(--color-text-primary)] font-semibold text-lg">Kanban</h1>
            <p className="text-[var(--color-text-secondary)] text-sm mt-0.5">{publishedPosts}/{totalPosts} posts publicados em {MONTHS_FULL[selectedMonth - 1]}</p>
          </div>
          {pendingApproval > 0 && (
            <div className="flex items-center gap-1.5 bg-red-50 border border-red-200 rounded-lg px-3 py-1.5">
              <span className="text-red-500 text-sm">✗</span>
              <span className="text-xs font-semibold text-red-700">{pendingApproval} {pendingApproval === 1 ? 'post não aprovado' : 'posts não aprovados'} pelo cliente</span>
            </div>
          )}
        </div>
        <div className="flex items-center gap-1">
          <button onClick={() => setSelectedMonth(m => m === 1 ? 12 : m - 1)} className="w-8 h-8 rounded-lg border border-[#EBEAE5] flex items-center justify-center text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-subtle)]">‹</button>
          <span className="text-sm font-medium text-[var(--color-text-primary)] w-28 text-center">{MONTHS_FULL[selectedMonth - 1]} {selectedYear}</span>
          <button onClick={() => setSelectedMonth(m => m === 12 ? 1 : m + 1)} className="w-8 h-8 rounded-lg border border-[#EBEAE5] flex items-center justify-center text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-subtle)]">›</button>
        </div>
      </div>

      {/* Board */}
      <div className="flex-1 overflow-x-auto p-6">
        <div className="flex gap-4 h-full min-w-max">
          {COLUMNS.map(col => {
            const colPosts = posts.filter(p => p.status === col.key)
            const isDragOver = dragOver === col.key
            return (
              <div
                key={col.key}
                className={`flex flex-col w-72 rounded-2xl overflow-hidden transition-all ${isDragOver ? 'ring-2 ring-[#1A1A18] ring-offset-2' : ''}`}
                style={{ background: isDragOver ? '#F0EEE9' : '#F8F7F4' }}
                onDragOver={e => { e.preventDefault(); setDragOver(col.key) }}
                onDragLeave={() => setDragOver(null)}
                onDrop={() => { movePost(dragging!, col.key); setDragging(null); setDragOver(null) }}
              >
                {/* Column header */}
                <div className="px-4 py-3 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: col.color }} />
                    <span className="text-sm font-semibold text-[var(--color-text-primary)]">{col.label}</span>
                  </div>
                  <span className="text-xs font-bold text-[var(--color-text-muted)] bg-white rounded-full w-6 h-6 flex items-center justify-center">
                    {colPosts.length}
                  </span>
                </div>

                {/* Cards */}
                <div className="flex-1 overflow-y-auto px-3 pb-3 flex flex-col gap-2">
                  {colPosts.length === 0 && (
                    <div className={`flex items-center justify-center h-20 border-2 border-dashed rounded-xl transition-all ${isDragOver ? 'border-[var(--color-text-primary)]' : 'border-[#EBEAE5]'}`}>
                      <p className="text-xs text-[var(--color-text-faint)]">Arraste aqui</p>
                    </div>
                  )}
                  {colPosts.map(post => {
                    const client = getClient(post.client_id)
                    return (
                      <div
                        key={post.id}
                        draggable
                        onDragStart={() => setDragging(post.id)}
                        onDragEnd={() => setDragging(null)}
                        className={`bg-white rounded-xl p-4 flex flex-col gap-3 cursor-grab active:cursor-grabbing shadow-sm hover:shadow-md transition-all ${dragging === post.id ? 'opacity-50' : ''}`}
                        style={{ borderLeft: `3px solid ${client?.color_hex || '#EBEAE5'}` }}
                      >
                        {/* Approval badge — sempre no topo se existir */}
                        <ApprovalBadge status={post.approval_status} comment={post.approval_comment} />

                        {/* Client + number */}
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <div className="w-5 h-5 rounded-md flex items-center justify-center text-white text-[10px] font-bold flex-shrink-0" style={{ background: client?.color_hex || '#A8A59E' }}>
                              {client?.name?.slice(0, 1)}
                            </div>
                            <span className="text-xs text-[var(--color-text-muted)] font-medium truncate max-w-[110px]">{client?.name}</span>
                          </div>
                          <span className="text-xs font-bold text-[var(--color-text-faint)]">#{post.post_number}</span>
                        </div>

                        {/* Title */}
                        <p className="text-sm font-semibold text-[var(--color-text-primary)] leading-snug line-clamp-2">{post.title}</p>

                        {/* Footer */}
                        <div className="flex items-center justify-between">
                          <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${typeColor[post.post_type] || 'bg-[var(--color-bg-subtle)] text-[var(--color-text-secondary)]'}`}>
                            {post.post_type || '—'}
                          </span>
                          {post.scheduled_date && (
                            <span className="text-[10px] text-[var(--color-text-muted)]">
                              {new Date(post.scheduled_date + 'T12:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })}
                            </span>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
