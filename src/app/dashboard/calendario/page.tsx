'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import { ChevronLeft, ChevronRight } from 'lucide-react'

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
}

const STATUS_COLOR: Record<string, string> = {
  aprovado:       'bg-green-100 text-green-700 border-green-200',
  'não aprovado': 'bg-red-100 text-red-700 border-red-200',
  pendente:       'bg-yellow-100 text-yellow-700 border-yellow-200',
}

export default function CalendarioPage() {
  const now = new Date()
  const [month, setMonth] = useState(now.getMonth() + 1)
  const [year,  setYear]  = useState(now.getFullYear())
  const [posts, setPosts] = useState<Post[]>([])
  const [loading, setLoading] = useState(true)
  const [tooltip, setTooltip] = useState<Post | null>(null)

  useEffect(() => {
    async function load() {
      setLoading(true)
      const supabase = createClient()
      const { data } = await supabase
        .from('schedules')
        .select('id, title, scheduled_date, post_type, approval_status, client_id, clients(name, color_hex)')
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

  const postsWithoutDate = posts.filter(p => !p.scheduled_date)

  // unique clients for legend
  const clients = [...new Map(posts.map(p => [p.client_id, { name: p.client_name, color: p.client_color }])).values()]

  const today = new Date()
  const isToday = (day: number) =>
    day === today.getDate() && month === today.getMonth() + 1 && year === today.getFullYear()

  return (
    <div className="p-6 flex flex-col gap-5 h-full overflow-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[var(--color-text-primary)] tracking-tight">Calendário</h1>
          <p className="text-[var(--color-text-muted)] text-sm mt-0.5">{posts.length} posts em {MONTHS[month-1]} {year}</p>
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
      <div className="flex-1 flex flex-col bg-[var(--color-bg-card)] border border-[var(--color-border)] rounded-2xl overflow-hidden">
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
                    <span className={`text-xs font-semibold w-6 h-6 flex items-center justify-center rounded-full ${todayCell ? 'bg-[var(--color-brand)] text-[var(--color-brand-fg)]' : 'text-[var(--color-text-muted)]'}`}>
                      {day}
                    </span>
                    {dayPosts.length > 0 && (
                      <span className="text-[9px] text-[var(--color-text-faint)]">{dayPosts.length}</span>
                    )}
                  </div>
                )}
                {dayPosts.slice(0, 4).map(p => (
                  <div key={p.id}
                    onMouseEnter={() => setTooltip(p)}
                    onMouseLeave={() => setTooltip(null)}
                    className="relative group rounded-md px-1.5 py-0.5 text-[10px] font-medium truncate cursor-default border"
                    style={{ background: p.client_color + '22', color: p.client_color, borderColor: p.client_color + '44' }}>
                    <span className="truncate">{p.title}</span>
                    {/* Tooltip */}
                    {tooltip?.id === p.id && (
                      <div className="absolute left-0 top-full mt-1 z-50 w-52 bg-[var(--color-bg-card)] border border-[var(--color-border)] rounded-xl shadow-xl p-3 flex flex-col gap-1.5 pointer-events-none">
                        <p className="text-xs font-semibold text-[var(--color-text-primary)] leading-snug">{p.title}</p>
                        <div className="flex items-center gap-1.5">
                          <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: p.client_color }} />
                          <p className="text-[10px] text-[var(--color-text-muted)]">{p.client_name}</p>
                        </div>
                        {p.post_type && <p className="text-[10px] text-[var(--color-text-muted)] capitalize">{p.post_type}</p>}
                        {p.approval_status && (
                          <span className={`text-[9px] font-semibold px-1.5 py-0.5 rounded-full border self-start ${STATUS_COLOR[p.approval_status] || 'bg-[var(--color-bg-subtle)] text-[var(--color-text-muted)] border-[var(--color-border)]'}`}>
                            {p.approval_status}
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                ))}
                {dayPosts.length > 4 && (
                  <p className="text-[9px] text-[var(--color-text-faint)] px-1">+{dayPosts.length - 4} mais</p>
                )}
              </div>
            )
          })}
        </div>
      </div>

      {/* Posts sem data */}
      {postsWithoutDate.length > 0 && (
        <div className="bg-[var(--color-bg-card)] border border-[var(--color-border)] rounded-2xl p-4">
          <p className="text-xs font-semibold text-[var(--color-text-muted)] mb-3 uppercase tracking-wide">Sem data agendada</p>
          <div className="flex flex-wrap gap-2">
            {postsWithoutDate.map(p => (
              <div key={p.id} className="flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-lg border"
                style={{ background: p.client_color + '15', color: p.client_color, borderColor: p.client_color + '33' }}>
                <div className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: p.client_color }} />
                {p.title}
              </div>
            ))}
          </div>
        </div>
      )}

      {loading && (
        <div className="absolute inset-0 flex items-center justify-center bg-[var(--color-bg-page)]/60 backdrop-blur-sm rounded-2xl">
          <p className="text-sm text-[var(--color-text-muted)]">Carregando...</p>
        </div>
      )}
    </div>
  )
}
