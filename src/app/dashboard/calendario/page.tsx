'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import PostCard from '@/components/PostCard'

const MONTHS = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro']
const WEEKDAYS = ['Dom','Seg','Ter','Qua','Qui','Sex','Sáb']

type Post = {
  id: string
  title: string
  scheduled_date: string | null
  post_type: string
  approval_status: string | null
  client_id: string
  client_name: string
  client_color: string
  month: number
  year: number
}

export default function CalendarioPage() {
  useEffect(() => { document.title = 'Calendário · Bagano Hub' }, [])
  const now = new Date()
  const [month, setMonth] = useState(now.getMonth() + 1)
  const [year,  setYear]  = useState(now.getFullYear())
  const [posts, setPosts] = useState<Post[]>([])
  const [loading, setLoading] = useState(true)

  const [showPostCard,   setShowPostCard]   = useState(false)
  const [editingPostId,  setEditingPostId]  = useState<string | null>(null)
  const [editingPostCtx, setEditingPostCtx] = useState<{
    clientId: string; clientName: string; clientColor: string; month: number; year: number
  } | null>(null)

  useEffect(() => {
    async function load() {
      setLoading(true)
      const supabase = createClient()
      const { data } = await supabase
        .from('schedules')
        .select('id, title, scheduled_date, post_type, approval_status, client_id, month, year, clients(name, color_hex)')
        .eq('month', month)
        .eq('year', year)
        .order('scheduled_date', { ascending: true })
      setPosts((data || []).map((d: any) => ({
        id: d.id,
        title: d.title || 'Sem título',
        scheduled_date: d.scheduled_date,
        post_type: d.post_type || '',
        approval_status: d.approval_status || null,
        client_id: d.client_id,
        client_name: d.clients?.name || '—',
        client_color: d.clients?.color_hex || '#94a3b8',
        month: d.month,
        year: d.year,
      })))
      setLoading(false)
    }
    load()
  }, [month, year])

  function prevMonth() {
    if (month === 1) { setMonth(12); setYear(y => y - 1) }
    else setMonth(m => m - 1)
  }
  function nextMonth() {
    if (month === 12) { setMonth(1); setYear(y => y + 1) }
    else setMonth(m => m + 1)
  }

  function openPost(p: Post) {
    setEditingPostId(p.id)
    setEditingPostCtx({
      clientId: p.client_id,
      clientName: p.client_name,
      clientColor: p.client_color,
      month: p.month,
      year: p.year,
    })
    setShowPostCard(true)
  }

  // Build calendar grid
  const firstDay = new Date(year, month - 1, 1).getDay()
  const daysInMonth = new Date(year, month, 0).getDate()
  const cells: (number | null)[] = [
    ...Array(firstDay).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ]
  while (cells.length % 7 !== 0) cells.push(null)

  function postsForDay(day: number) {
    const pad = String(day).padStart(2, '0')
    const m   = String(month).padStart(2, '0')
    const dateStr = `${year}-${m}-${pad}`
    return posts.filter(p => p.scheduled_date === dateStr)
  }

  // unique clients for legend
  const clients = [...new Map(posts.map(p => [p.client_id, { name: p.client_name, color: p.client_color }])).values()]

  const today = new Date()
  const isToday = (day: number) =>
    day === today.getDate() && month === today.getMonth() + 1 && year === today.getFullYear()

  return (
    <div className="p-6 flex flex-col gap-5 h-full overflow-auto page-content">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[var(--color-text-primary)] tracking-tight">Calendário</h1>
          <p className="text-[var(--color-text-muted)] text-sm mt-0.5">
            {loading ? 'Carregando…' : `${posts.length} post${posts.length !== 1 ? 's' : ''} em ${MONTHS[month-1]} ${year}`}
          </p>
        </div>
        <div className="flex items-center gap-1 bg-[var(--color-bg-card)] border border-[var(--color-border)] rounded-xl p-1">
          <button onClick={prevMonth} className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-[var(--color-bg-subtle)] transition-colors">
            <ChevronLeft size={16} className="text-[var(--color-text-secondary)]" />
          </button>
          <span className="text-sm font-semibold text-[var(--color-text-primary)] min-w-[140px] text-center">
            {MONTHS[month-1]} {year}
          </span>
          <button onClick={nextMonth} className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-[var(--color-bg-subtle)] transition-colors">
            <ChevronRight size={16} className="text-[var(--color-text-secondary)]" />
          </button>
        </div>
      </div>

      {/* Legend */}
      {clients.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {clients.map(c => (
            <div key={c.name} className="flex items-center gap-1.5 text-xs text-[var(--color-text-secondary)]">
              <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: c.color }} />
              {c.name}
            </div>
          ))}
        </div>
      )}

      {/* Calendar grid */}
      <div className="flex-1 flex flex-col bg-[var(--color-bg-card)] border border-[var(--color-border)] rounded-2xl overflow-hidden shadow-card">
        {/* Weekday headers */}
        <div className="grid grid-cols-7 border-b border-[var(--color-border)]">
          {WEEKDAYS.map(d => (
            <div key={d} className="py-2 text-center text-[10px] font-semibold text-[var(--color-text-muted)] uppercase tracking-wide">
              {d}
            </div>
          ))}
        </div>

        {/* Day cells */}
        <div className="grid grid-cols-7 flex-1">
          {cells.map((day, i) => {
            const dayPosts = day ? postsForDay(day) : []
            const todayCell = day ? isToday(day) : false
            return (
              <div key={i}
                className={`min-h-[100px] border-r border-b border-[var(--color-border)] p-1.5 flex flex-col gap-1 last:border-r-0 ${!day ? 'bg-[var(--color-bg-subtle)]' : ''}`}>
                {day && (
                  <div className="flex items-center justify-between mb-0.5 px-0.5">
                    <span className={`text-xs font-semibold w-6 h-6 flex items-center justify-center rounded-full ${todayCell ? 'bg-[var(--color-accent)] text-white' : 'text-[var(--color-text-muted)]'}`}>
                      {day}
                    </span>
                    {dayPosts.length > 0 && (
                      <span className="text-[9px] text-[var(--color-text-faint)]">{dayPosts.length}</span>
                    )}
                  </div>
                )}
                {dayPosts.slice(0, 4).map(p => (
                  <button
                    key={p.id}
                    onClick={() => openPost(p)}
                    className="rounded-md px-1.5 py-0.5 text-[10px] font-medium truncate border text-left w-full hover:opacity-80 transition-opacity"
                    style={{ background: p.client_color + '22', color: p.client_color, borderColor: p.client_color + '44' }}
                    title={p.title}
                  >
                    {p.title}
                  </button>
                ))}
                {dayPosts.length > 4 && (
                  <button
                    onClick={() => openPost(dayPosts[4])}
                    className="text-[9px] text-[var(--color-text-faint)] px-1 text-left hover:text-[var(--color-text-secondary)] transition-colors"
                  >
                    +{dayPosts.length - 4} mais
                  </button>
                )}
              </div>
            )
          })}
        </div>
      </div>

      {loading && (
        <div className="fixed inset-0 flex items-center justify-center pointer-events-none">
          <div className="w-5 h-5 border-2 border-[var(--color-border)] border-t-[var(--color-text-primary)] rounded-full animate-spin" />
        </div>
      )}

      {showPostCard && editingPostId && editingPostCtx && (
        <PostCard
          postId={editingPostId}
          clientId={editingPostCtx.clientId}
          clientName={editingPostCtx.clientName}
          clientColor={editingPostCtx.clientColor}
          month={editingPostCtx.month}
          year={editingPostCtx.year}
          onClose={() => { setShowPostCard(false); setEditingPostId(null); setEditingPostCtx(null) }}
          onSaved={() => {
            setShowPostCard(false)
            setEditingPostId(null)
            setEditingPostCtx(null)
            // reload to reflect any changes
            const supabase = createClient()
            supabase.from('schedules')
              .select('id, title, scheduled_date, post_type, approval_status, client_id, month, year, clients(name, color_hex)')
              .eq('month', month).eq('year', year)
              .order('scheduled_date', { ascending: true })
              .then(({ data }) => {
                setPosts((data || []).map((d: any) => ({
                  id: d.id,
                  title: d.title || 'Sem título',
                  scheduled_date: d.scheduled_date,
                  post_type: d.post_type || '',
                  approval_status: d.approval_status || null,
                  client_id: d.client_id,
                  client_name: d.clients?.name || '—',
                  client_color: d.clients?.color_hex || '#94a3b8',
                  month: d.month,
                  year: d.year,
                })))
              })
          }}
        />
      )}
    </div>
  )
}
