'use client'

import { useEffect, useState, useMemo, useRef } from 'react'
import { createClient } from '@/lib/supabase'
import { ChevronLeft, ChevronRight, Camera, PenLine, Filter, Users, Laptop, PartyPopper, CalendarDays, Plus, X, Loader2, Trash2, Check } from 'lucide-react'
import PostCard from '@/components/PostCard'

const MONTHS   = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro']
const WEEKDAYS = ['Seg','Ter','Qua','Qui','Sex','Sáb','Dom']

const EVENT_TYPES: Record<string, { label: string; color: string; Icon: any }> = {
  reuniao:          { label: 'Reunião',          color: '#3b82f6', Icon: Users },
  coworking:        { label: 'Coworking',        color: '#10b981', Icon: Laptop },
  confraternizacao: { label: 'Confraternização', color: '#ec4899', Icon: PartyPopper },
  outro:            { label: 'Outro',            color: '#6b7280', Icon: CalendarDays },
}

type Post = {
  id: string; title: string; scheduled_date: string | null
  post_type: string; approval_status: string | null
  client_id: string; client_name: string; client_color: string
  month: number; year: number
}

type Captacao = {
  id: string; client_id: string | null; scheduled_date: string
  scheduled_time: string | null; status: string; notes: string | null
  team_member_ids: string[] | null
  client_name: string | null; client_color: string | null
}

type CriacaoEntry = {
  id: string; client_id: string; day_of_week: number; week_start: string
  member_ids: string[] | null; notes: string | null
  client_name: string; client_color: string; date: string
}

type HubEvent = {
  id: string; title: string; event_type: string; date: string
  start_time: string | null; end_time: string | null
  description: string | null; location: string | null
  google_calendar_event_id: string | null
}

type Client = { id: string; name: string; color_hex: string }
type Member = { id: string; name: string }

const EMPTY_FORM = { title: '', event_type: 'reuniao', date: '', start_time: '', end_time: '', description: '', location: '' }

function pad(n: number) { return String(n).padStart(2, '0') }
function toISO(d: Date)  { return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}` }

export default function CalendarioPage() {
  useEffect(() => { document.title = 'Calendário · Bagano Hub' }, [])

  const now = new Date()
  const [month, setMonth] = useState(now.getMonth() + 1)
  const [year,  setYear]  = useState(now.getFullYear())

  const [posts,          setPosts]          = useState<Post[]>([])
  const [captacoes,      setCaptacoes]      = useState<Captacao[]>([])
  const [criacaoEntries, setCriacaoEntries] = useState<CriacaoEntry[]>([])
  const [hubEvents,      setHubEvents]      = useState<HubEvent[]>([])
  const [allClients,     setAllClients]     = useState<Client[]>([])
  const [memberMap,      setMemberMap]      = useState<Record<string, Member>>({})
  const [loading,        setLoading]        = useState(true)

  const [filterClient,  setFilterClient]  = useState('')
  const [showPosts,     setShowPosts]     = useState(true)
  const [showCriacao,   setShowCriacao]   = useState(true)
  const [showCaptacao,  setShowCaptacao]  = useState(true)
  const [showEventos,   setShowEventos]   = useState(true)

  const [showPostCard,   setShowPostCard]   = useState(false)
  const [editingPostId,  setEditingPostId]  = useState<string | null>(null)
  const [editingPostCtx, setEditingPostCtx] = useState<{
    clientId: string; clientName: string; clientColor: string; month: number; year: number
  } | null>(null)

  // Event modal state
  const [showEventModal, setShowEventModal] = useState(false)
  const [editingEvent,   setEditingEvent]   = useState<HubEvent | null>(null)
  const [eventForm,      setEventForm]      = useState({ ...EMPTY_FORM })
  const [savingEvent,    setSavingEvent]    = useState(false)
  const [deletingEvent,  setDeletingEvent]  = useState(false)
  const [calSyncStatus,  setCalSyncStatus]  = useState<'idle'|'syncing'|'ok'|'error'>('idle')
  const modalRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    async function load() {
      setLoading(true)
      const supabase   = createClient()
      const daysInM    = new Date(year, month, 0).getDate()
      const startISO   = `${year}-${pad(month)}-01`
      const endISO     = `${year}-${pad(month)}-${pad(daysInM)}`
      const agStart    = toISO(new Date(new Date(year, month - 1, 1).getTime() - 7 * 86400000))
      const agEnd      = toISO(new Date(new Date(year, month - 1, daysInM).getTime() + 7 * 86400000))

      const [{ data: postsData }, { data: captData }, { data: criacaoData }, { data: eventsData }, { data: clientData }, { data: memberData }] = await Promise.all([
        supabase.from('schedules')
          .select('id, title, scheduled_date, post_type, approval_status, client_id, month, year, clients(name, color_hex)')
          .eq('month', month).eq('year', year)
          .order('scheduled_date', { ascending: true }),
        supabase.from('captacoes')
          .select('id, client_id, scheduled_date, scheduled_time, status, notes, team_member_ids, clients(name, color_hex)')
          .gte('scheduled_date', startISO).lte('scheduled_date', endISO),
        supabase.from('agenda_criacao')
          .select('id, client_id, day_of_week, week_start, member_ids, notes, clients(name, color_hex)')
          .gte('week_start', agStart).lte('week_start', agEnd),
        supabase.from('hub_events')
          .select('id, title, event_type, date, start_time, end_time, description, location, google_calendar_event_id')
          .gte('date', startISO).lte('date', endISO)
          .order('date', { ascending: true }),
        supabase.from('clients').select('id, name, color_hex').eq('status', 'active').order('name'),
        supabase.from('team_members').select('id, name').order('name'),
      ])

      setPosts((postsData || []).map((d: any) => ({
        id: d.id, title: d.title || 'Sem título', scheduled_date: d.scheduled_date,
        post_type: d.post_type || '', approval_status: d.approval_status || null,
        client_id: d.client_id, client_name: d.clients?.name || '—',
        client_color: d.clients?.color_hex || '#94a3b8', month: d.month, year: d.year,
      })))

      setCaptacoes((captData || []).map((d: any) => ({
        id: d.id, client_id: d.client_id || null, scheduled_date: d.scheduled_date,
        scheduled_time: d.scheduled_time || null, status: d.status,
        notes: d.notes || null, team_member_ids: d.team_member_ids || null,
        client_name: d.clients?.name || null, client_color: d.clients?.color_hex || null,
      })))

      const criacao: CriacaoEntry[] = []
      ;(criacaoData || []).forEach((d: any) => {
        const monday = new Date(d.week_start + 'T12:00:00')
        const actual = new Date(monday)
        actual.setDate(monday.getDate() + d.day_of_week - 1)
        const dateISO = toISO(actual)
        if (dateISO >= startISO && dateISO <= endISO) {
          criacao.push({
            id: d.id, client_id: d.client_id, day_of_week: d.day_of_week,
            week_start: d.week_start, member_ids: d.member_ids, notes: d.notes,
            client_name: d.clients?.name || '—', client_color: d.clients?.color_hex || '#94a3b8',
            date: dateISO,
          })
        }
      })
      setCriacaoEntries(criacao)
      setHubEvents((eventsData || []).map((d: any) => ({
        id: d.id, title: d.title, event_type: d.event_type || 'outro',
        date: d.date, start_time: d.start_time || null, end_time: d.end_time || null,
        description: d.description || null, location: d.location || null,
        google_calendar_event_id: d.google_calendar_event_id || null,
      })))

      setAllClients(clientData || [])
      const mm: Record<string, Member> = {}
      ;(memberData || []).forEach((m: any) => { mm[m.id] = m })
      setMemberMap(mm)
      setLoading(false)
    }
    load()
  }, [month, year])

  // Close modal on outside click
  useEffect(() => {
    function h(e: MouseEvent) {
      if (modalRef.current && !modalRef.current.contains(e.target as Node)) closeEventModal()
    }
    if (showEventModal) document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [showEventModal])

  function prevMonth() { if (month === 1) { setMonth(12); setYear(y => y - 1) } else setMonth(m => m - 1) }
  function nextMonth() { if (month === 12) { setMonth(1); setYear(y => y + 1) } else setMonth(m => m + 1) }

  const firstDay   = (new Date(year, month - 1, 1).getDay() + 6) % 7 // semana começa na segunda
  const daysInMonth = new Date(year, month, 0).getDate()
  const cells: (number | null)[] = [...Array(firstDay).fill(null), ...Array.from({ length: daysInMonth }, (_, i) => i + 1)]
  while (cells.length % 7 !== 0) cells.push(null)

  const todayISO = toISO(new Date())
  const isToday = (day: number) => `${year}-${pad(month)}-${pad(day)}` === todayISO

  function dayISO(day: number) { return `${year}-${pad(month)}-${pad(day)}` }

  function itemsForDay(day: number) {
    const d = dayISO(day)
    return {
      posts:     showPosts    ? posts.filter(p => p.scheduled_date === d && (!filterClient || p.client_id === filterClient)) : [],
      captacoes: showCaptacao ? captacoes.filter(c => c.scheduled_date === d && (!filterClient || c.client_id === filterClient)) : [],
      criacao:   showCriacao  ? criacaoEntries.filter(e => e.date === d && (!filterClient || e.client_id === filterClient)) : [],
      eventos:   showEventos  ? hubEvents.filter(ev => ev.date === d) : [],
    }
  }

  const legendClients = useMemo(() => {
    const map = new Map<string, { id: string; name: string; color: string }>()
    if (showPosts)    posts.filter(p => !filterClient || p.client_id === filterClient).forEach(p => map.set(p.client_id, { id: p.client_id, name: p.client_name, color: p.client_color }))
    if (showCaptacao) captacoes.filter(c => c.client_id && (!filterClient || c.client_id === filterClient)).forEach(c => map.set(c.client_id!, { id: c.client_id!, name: c.client_name || '—', color: c.client_color || '#94a3b8' }))
    if (showCriacao)  criacaoEntries.filter(e => !filterClient || e.client_id === filterClient).forEach(e => map.set(e.client_id, { id: e.client_id, name: e.client_name, color: e.client_color }))
    return [...map.values()]
  }, [posts, captacoes, criacaoEntries, showPosts, showCaptacao, showCriacao, filterClient])

  // ── Event modal ────────────────────────────────────────────────────────────

  function openNewEvent(date: string) {
    setEditingEvent(null)
    setEventForm({ ...EMPTY_FORM, date })
    setCalSyncStatus('idle')
    setShowEventModal(true)
  }

  function openEditEvent(ev: HubEvent) {
    setEditingEvent(ev)
    setEventForm({
      title: ev.title, event_type: ev.event_type, date: ev.date,
      start_time: ev.start_time || '', end_time: ev.end_time || '',
      description: ev.description || '', location: ev.location || '',
    })
    setCalSyncStatus(ev.google_calendar_event_id ? 'ok' : 'idle')
    setShowEventModal(true)
  }

  function closeEventModal() {
    setShowEventModal(false)
    setEditingEvent(null)
    setSavingEvent(false)
    setDeletingEvent(false)
  }

  async function saveEvent() {
    if (!eventForm.title.trim() || !eventForm.date) return
    setSavingEvent(true)
    const supabase = createClient()

    const payload = {
      title: eventForm.title.trim(),
      event_type: eventForm.event_type,
      date: eventForm.date,
      start_time: eventForm.start_time || null,
      end_time: eventForm.end_time || null,
      description: eventForm.description || null,
      location: eventForm.location || null,
    }

    let savedId = editingEvent?.id
    let gcalId  = editingEvent?.google_calendar_event_id || null

    if (editingEvent) {
      // If date/time changed and has gcal event, delete old one first
      const dateChanged = editingEvent.date !== eventForm.date ||
        editingEvent.start_time !== (eventForm.start_time || null) ||
        editingEvent.end_time !== (eventForm.end_time || null)
      if (dateChanged && gcalId) {
        await fetch('/api/calendar', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ eventId: gcalId }) })
        gcalId = null
      }
      await supabase.from('hub_events').update({ ...payload, google_calendar_event_id: gcalId }).eq('id', editingEvent.id)
    } else {
      const { data } = await supabase.from('hub_events').insert(payload).select('id').single()
      savedId = data?.id
    }

    // Sync to Google Calendar if not already synced
    if (!gcalId && savedId) {
      setCalSyncStatus('syncing')
      const et = EVENT_TYPES[eventForm.event_type] || EVENT_TYPES.outro
      const descParts = [et.label, eventForm.location, eventForm.description].filter(Boolean)
      try {
        const res = await fetch('/api/calendar', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            summary: eventForm.title.trim(),
            description: descParts.join(' · '),
            date: eventForm.date,
            startTime: eventForm.start_time || undefined,
            endTime: eventForm.end_time || undefined,
            location: eventForm.location || undefined,
          }),
        })
        const json = await res.json()
        if (json.eventId) {
          gcalId = json.eventId
          await supabase.from('hub_events').update({ google_calendar_event_id: gcalId }).eq('id', savedId)
          setCalSyncStatus('ok')
        } else {
          setCalSyncStatus('error')
        }
      } catch {
        setCalSyncStatus('error')
      }
    }

    // Refresh local state
    const { data: fresh } = await supabase.from('hub_events')
      .select('id, title, event_type, date, start_time, end_time, description, location, google_calendar_event_id')
      .eq('id', savedId!).single()
    if (fresh) {
      const mapped: HubEvent = {
        id: fresh.id, title: fresh.title, event_type: fresh.event_type || 'outro',
        date: fresh.date, start_time: fresh.start_time || null, end_time: fresh.end_time || null,
        description: fresh.description || null, location: fresh.location || null,
        google_calendar_event_id: fresh.google_calendar_event_id || null,
      }
      if (editingEvent) {
        setHubEvents(prev => prev.map(e => e.id === mapped.id ? mapped : e))
      } else {
        setHubEvents(prev => [...prev, mapped])
      }
    }

    setSavingEvent(false)
    if (calSyncStatus !== 'error') closeEventModal()
  }

  async function deleteEvent() {
    if (!editingEvent) return
    setDeletingEvent(true)
    const supabase = createClient()
    if (editingEvent.google_calendar_event_id) {
      await fetch('/api/calendar', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ eventId: editingEvent.google_calendar_event_id }) })
    }
    await supabase.from('hub_events').delete().eq('id', editingEvent.id)
    setHubEvents(prev => prev.filter(e => e.id !== editingEvent.id))
    closeEventModal()
  }

  return (
    <div className="p-6 flex flex-col gap-4 h-full overflow-auto page-content">

      {/* Header */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-[var(--color-text-primary)] tracking-tight">Calendário</h1>
          <p className="text-[var(--color-text-muted)] text-sm mt-0.5">{MONTHS[month-1]} {year}</p>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          {/* Client filter */}
          <div className="flex items-center gap-1.5">
            <Filter size={12} className="text-[var(--color-text-muted)]" />
            <select value={filterClient} onChange={e => setFilterClient(e.target.value)}
              className="text-xs rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-card)] px-2.5 py-1.5 text-[var(--color-text-secondary)] outline-none">
              <option value="">Todos os clientes</option>
              {allClients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>

          {/* Type toggles */}
          <div className="flex items-center gap-1.5">
            {([
              { key: 'posts',    label: 'Posts',    active: showPosts,    toggle: () => setShowPosts(v => !v),    color: '#3b82f6', icon: null },
              { key: 'criacao',  label: 'Criação',  active: showCriacao,  toggle: () => setShowCriacao(v => !v),  color: '#f59e0b', icon: <PenLine size={9} /> },
              { key: 'captacao', label: 'Captação', active: showCaptacao, toggle: () => setShowCaptacao(v => !v), color: '#8b5cf6', icon: <Camera size={9} /> },
              { key: 'eventos',  label: 'Eventos',  active: showEventos,  toggle: () => setShowEventos(v => !v),  color: '#10b981', icon: <CalendarDays size={9} /> },
            ] as const).map(({ key, label, active, toggle, color, icon }) => (
              <button key={key} onClick={toggle}
                className="flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-full border transition-all"
                style={active
                  ? { background: color + '22', color, borderColor: color + '66' }
                  : { color: 'var(--color-text-faint)', borderColor: 'var(--color-border)' }}>
                {icon}{label}
              </button>
            ))}
          </div>

          {/* New event button */}
          <button onClick={() => openNewEvent(todayISO)}
            className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-xl border transition-all hover:opacity-90"
            style={{ background: '#10b98122', color: '#059669', borderColor: '#10b98166' }}>
            <Plus size={12} /> Novo evento
          </button>

          {/* Month nav */}
          <div className="flex items-center gap-1 bg-[var(--color-bg-card)] border border-[var(--color-border)] rounded-xl p-1">
            <button onClick={prevMonth} className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-[var(--color-bg-subtle)] transition-colors">
              <ChevronLeft size={14} className="text-[var(--color-text-secondary)]" />
            </button>
            <span className="text-xs font-semibold text-[var(--color-text-primary)] min-w-[110px] text-center">{MONTHS[month-1]} {year}</span>
            <button onClick={nextMonth} className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-[var(--color-bg-subtle)] transition-colors">
              <ChevronRight size={14} className="text-[var(--color-text-secondary)]" />
            </button>
          </div>
        </div>
      </div>

      {/* Legend */}
      {legendClients.length > 0 && (
        <div className="flex flex-wrap gap-2 items-center">
          {legendClients.map(c => (
            <button key={c.id}
              onClick={() => setFilterClient(fc => fc === c.id ? '' : c.id)}
              className="flex items-center gap-1.5 text-xs text-[var(--color-text-secondary)] rounded-full px-2 py-1 hover:bg-[var(--color-bg-subtle)] transition-colors"
              style={filterClient === c.id ? { color: c.color, fontWeight: 600 } : {}}>
              <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: c.color }} />
              {c.name}
            </button>
          ))}
          {filterClient && (
            <button onClick={() => setFilterClient('')} className="text-[10px] text-[var(--color-text-faint)] hover:text-[var(--color-text-secondary)] px-1">✕ limpar</button>
          )}
        </div>
      )}

      {/* Calendar grid */}
      <div className="flex-1 flex flex-col bg-[var(--color-bg-card)] border border-[var(--color-border)] rounded-2xl overflow-hidden shadow-card">
        <div className="grid grid-cols-7 border-b border-[var(--color-border)]">
          {WEEKDAYS.map(d => (
            <div key={d} className="py-2 text-center text-[10px] font-semibold text-[var(--color-text-muted)] uppercase tracking-wide">{d}</div>
          ))}
        </div>

        <div className="grid grid-cols-7 flex-1">
          {cells.map((day, i) => {
            const { posts: dp, captacoes: dc, criacao: dr, eventos: dev } = day ? itemsForDay(day) : { posts: [], captacoes: [], criacao: [], eventos: [] }
            const totalItems = dp.length + dc.length + dr.length + dev.length
            const todayCell  = day ? isToday(day) : false
            const maxShow = 3

            const allItems = [
              ...dev.map(ev => ({ type: 'evento'  as const, id: ev.id, label: ev.title, color: EVENT_TYPES[ev.event_type]?.color || '#6b7280', data: ev })),
              ...dr.map(e  => ({ type: 'criacao'  as const, id: e.id,  label: e.client_name, color: e.client_color, notes: e.notes, members: e.member_ids, data: e })),
              ...dc.map(c  => ({ type: 'captacao' as const, id: c.id,  label: c.client_name || c.notes?.split('\n')[0] || 'Captação', color: '#8b5cf6', notes: c.notes, time: c.scheduled_time, data: c })),
              ...dp.map(p  => ({ type: 'post'     as const, id: p.id,  label: p.title, color: p.client_color, data: p })),
            ]

            return (
              <div key={i}
                className={`group/cell min-h-[110px] border-r border-b border-[var(--color-border)] p-1.5 flex flex-col gap-1 last:border-r-0 ${!day ? 'bg-[var(--color-bg-subtle)]' : ''}`}>
                {day && (
                  <div className="flex items-center justify-between mb-0.5 px-0.5">
                    <span className={`text-xs font-semibold w-6 h-6 flex items-center justify-center rounded-full ${todayCell ? 'bg-[var(--color-accent)] text-white' : 'text-[var(--color-text-muted)]'}`}>
                      {day}
                    </span>
                    <div className="flex items-center gap-1">
                      {totalItems > 0 && <span className="text-[9px] text-[var(--color-text-faint)]">{totalItems}</span>}
                      <button
                        onClick={() => openNewEvent(dayISO(day))}
                        className="opacity-0 group-hover/cell:opacity-100 w-5 h-5 rounded-md flex items-center justify-center transition-all hover:bg-[var(--color-bg-subtle)] text-[var(--color-text-faint)] hover:text-[var(--color-text-secondary)]"
                        title="Novo evento">
                        <Plus size={10} />
                      </button>
                    </div>
                  </div>
                )}

                {allItems.slice(0, maxShow).map(item => {
                  if (item.type === 'evento') {
                    const ev = item.data as HubEvent
                    const et = EVENT_TYPES[ev.event_type] || EVENT_TYPES.outro
                    return (
                      <button key={`ev-${item.id}`}
                        onClick={() => openEditEvent(ev)}
                        className="rounded-md px-1.5 py-0.5 text-[10px] font-medium truncate border text-left w-full flex items-center gap-1 hover:opacity-80 transition-opacity"
                        style={{ background: et.color + '22', color: et.color, borderColor: et.color + '44' }}
                        title={`${et.label}: ${ev.title}${ev.start_time ? ' · ' + ev.start_time.slice(0,5) : ''}`}>
                        <et.Icon size={8} className="flex-shrink-0" />
                        <span className="truncate">{ev.start_time ? ev.start_time.slice(0,5) + ' ' : ''}{ev.title}</span>
                      </button>
                    )
                  }
                  if (item.type === 'criacao') {
                    const e = item.data as CriacaoEntry
                    const memberNames = (e.member_ids || []).map(mid => memberMap[mid]?.name.split(' ')[0]).filter(Boolean)
                    return (
                      <div key={`cr-${item.id}`}
                        className="rounded-md px-1.5 py-0.5 text-[10px] font-medium truncate border flex items-center gap-1"
                        style={{ background: '#f59e0b22', color: '#b45309', borderColor: '#f59e0b44' }}
                        title={`Criação: ${e.client_name}${memberNames.length ? ' · ' + memberNames.join(', ') : ''}`}>
                        <PenLine size={8} className="flex-shrink-0" />
                        <span className="truncate">{e.client_name}</span>
                      </div>
                    )
                  }
                  if (item.type === 'captacao') {
                    const c = item.data as Captacao
                    return (
                      <div key={`cap-${item.id}`}
                        className="rounded-md px-1.5 py-0.5 text-[10px] font-medium truncate border flex items-center gap-1"
                        style={{ background: '#8b5cf622', color: '#6d28d9', borderColor: '#8b5cf644' }}
                        title={`Captação${c.scheduled_time ? ' ' + c.scheduled_time.slice(0,5) : ''}: ${item.label}`}>
                        <Camera size={8} className="flex-shrink-0" />
                        <span className="truncate">{c.scheduled_time ? c.scheduled_time.slice(0,5) + ' ' : ''}{item.label}</span>
                      </div>
                    )
                  }
                  // post
                  const p = item.data as Post
                  return (
                    <button key={`p-${item.id}`}
                      onClick={() => { setEditingPostId(p.id); setEditingPostCtx({ clientId: p.client_id, clientName: p.client_name, clientColor: p.client_color, month: p.month, year: p.year }); setShowPostCard(true) }}
                      className="rounded-md px-1.5 py-0.5 text-[10px] font-medium truncate border text-left w-full hover:opacity-80 transition-opacity"
                      style={{ background: p.client_color + '22', color: p.client_color, borderColor: p.client_color + '44' }}
                      title={p.title}>
                      {p.title}
                    </button>
                  )
                })}

                {totalItems > maxShow && (
                  <span className="text-[9px] text-[var(--color-text-faint)] px-1">+{totalItems - maxShow} mais</span>
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

      {/* Event modal */}
      {showEventModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div ref={modalRef} className="bg-[var(--color-bg-card)] rounded-2xl border border-[var(--color-border)] shadow-xl w-full max-w-md flex flex-col">
            {/* Modal header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--color-border)]">
              <h2 className="text-sm font-bold text-[var(--color-text-primary)]">
                {editingEvent ? 'Editar evento' : 'Novo evento'}
              </h2>
              <button onClick={closeEventModal} className="w-7 h-7 rounded-lg flex items-center justify-center hover:bg-[var(--color-bg-subtle)] transition-colors text-[var(--color-text-muted)]">
                <X size={14} />
              </button>
            </div>

            {/* Modal body */}
            <div className="p-5 flex flex-col gap-4">
              {/* Tipo */}
              <div className="flex gap-2 flex-wrap">
                {Object.entries(EVENT_TYPES).map(([key, et]) => (
                  <button key={key}
                    onClick={() => setEventForm(f => ({ ...f, event_type: key }))}
                    className="flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1.5 rounded-xl border transition-all"
                    style={eventForm.event_type === key
                      ? { background: et.color + '22', color: et.color, borderColor: et.color + '66' }
                      : { color: 'var(--color-text-muted)', borderColor: 'var(--color-border)' }}>
                    <et.Icon size={11} />{et.label}
                  </button>
                ))}
              </div>

              {/* Título */}
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-medium text-[var(--color-text-muted)]">Título</label>
                <input
                  autoFocus
                  value={eventForm.title}
                  onChange={e => setEventForm(f => ({ ...f, title: e.target.value }))}
                  placeholder="Ex: Reunião de planejamento"
                  className="w-full border border-[var(--color-border)] rounded-xl px-3 py-2 text-sm text-[var(--color-text-primary)] bg-[var(--color-bg-card)] placeholder-[var(--color-text-muted)] outline-none focus:border-[var(--color-accent)] transition-colors"
                />
              </div>

              {/* Data */}
              <div className="flex gap-3">
                <div className="flex flex-col gap-1.5 flex-1">
                  <label className="text-xs font-medium text-[var(--color-text-muted)]">Data</label>
                  <input type="date" value={eventForm.date}
                    onChange={e => setEventForm(f => ({ ...f, date: e.target.value }))}
                    className="w-full border border-[var(--color-border)] rounded-xl px-3 py-2 text-sm text-[var(--color-text-primary)] bg-[var(--color-bg-card)] outline-none focus:border-[var(--color-accent)] transition-colors" />
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-medium text-[var(--color-text-muted)]">Início</label>
                  <input type="time" value={eventForm.start_time}
                    onChange={e => setEventForm(f => ({ ...f, start_time: e.target.value }))}
                    className="border border-[var(--color-border)] rounded-xl px-3 py-2 text-sm text-[var(--color-text-primary)] bg-[var(--color-bg-card)] outline-none focus:border-[var(--color-accent)] transition-colors" />
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-medium text-[var(--color-text-muted)]">Fim</label>
                  <input type="time" value={eventForm.end_time}
                    onChange={e => setEventForm(f => ({ ...f, end_time: e.target.value }))}
                    className="border border-[var(--color-border)] rounded-xl px-3 py-2 text-sm text-[var(--color-text-primary)] bg-[var(--color-bg-card)] outline-none focus:border-[var(--color-accent)] transition-colors" />
                </div>
              </div>

              {/* Local */}
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-medium text-[var(--color-text-muted)]">Local (opcional)</label>
                <input value={eventForm.location}
                  onChange={e => setEventForm(f => ({ ...f, location: e.target.value }))}
                  placeholder="Ex: Escritório, Google Meet..."
                  className="w-full border border-[var(--color-border)] rounded-xl px-3 py-2 text-sm text-[var(--color-text-primary)] bg-[var(--color-bg-card)] placeholder-[var(--color-text-muted)] outline-none focus:border-[var(--color-accent)] transition-colors" />
              </div>

              {/* Descrição */}
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-medium text-[var(--color-text-muted)]">Descrição (opcional)</label>
                <textarea value={eventForm.description}
                  onChange={e => setEventForm(f => ({ ...f, description: e.target.value }))}
                  placeholder="Detalhes do evento..."
                  rows={2}
                  className="w-full border border-[var(--color-border)] rounded-xl px-3 py-2 text-sm text-[var(--color-text-primary)] bg-[var(--color-bg-card)] placeholder-[var(--color-text-muted)] outline-none focus:border-[var(--color-accent)] transition-colors resize-none" />
              </div>

              {/* GCal status */}
              {calSyncStatus !== 'idle' && (
                <div className="flex items-center gap-2 text-xs rounded-xl px-3 py-2"
                  style={
                    calSyncStatus === 'ok'      ? { background: 'var(--ds-success-bg)', color: 'var(--ds-success-text)' } :
                    calSyncStatus === 'error'   ? { background: 'var(--ds-error-bg)',   color: 'var(--ds-error-text)' }   :
                    { background: 'var(--color-bg-subtle)', color: 'var(--color-text-muted)' }
                  }>
                  {calSyncStatus === 'syncing' && <Loader2 size={12} className="animate-spin" />}
                  {calSyncStatus === 'ok'      && <Check   size={12} />}
                  {calSyncStatus === 'ok'      ? 'Sincronizado com Google Calendar' :
                   calSyncStatus === 'error'   ? 'Erro ao sincronizar com Google Calendar — evento salvo localmente' :
                   'Sincronizando...'}
                </div>
              )}
            </div>

            {/* Modal footer */}
            <div className="flex items-center justify-between px-5 py-4 border-t border-[var(--color-border)]">
              <div>
                {editingEvent && (
                  <button onClick={deleteEvent} disabled={deletingEvent}
                    className="flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-xl border border-[var(--ds-error-border)] text-[var(--ds-error-text)] hover:bg-[var(--ds-error-bg)] transition-colors disabled:opacity-50">
                    {deletingEvent ? <Loader2 size={11} className="animate-spin" /> : <Trash2 size={11} />}
                    Excluir
                  </button>
                )}
              </div>
              <div className="flex items-center gap-2">
                <button onClick={closeEventModal} className="text-xs font-medium px-3 py-1.5 rounded-xl text-[var(--color-text-muted)] hover:bg-[var(--color-bg-subtle)] transition-colors">
                  Cancelar
                </button>
                <button onClick={saveEvent} disabled={savingEvent || !eventForm.title.trim() || !eventForm.date}
                  className="flex items-center gap-1.5 text-xs font-semibold px-4 py-1.5 rounded-xl transition-all disabled:opacity-50"
                  style={{ background: 'var(--color-accent)', color: '#fff' }}>
                  {savingEvent ? <Loader2 size={11} className="animate-spin" /> : null}
                  {editingEvent ? 'Salvar' : 'Criar evento'}
                </button>
              </div>
            </div>
          </div>
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
          onSaved={() => { setShowPostCard(false); setEditingPostId(null); setEditingPostCtx(null) }}
        />
      )}
    </div>
  )
}
