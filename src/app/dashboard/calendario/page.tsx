'use client'

import { useEffect, useState, useMemo, useRef } from 'react'
import { createClient } from '@/lib/supabase'
import { ChevronLeft, ChevronRight, Camera, PenLine, Filter, Users, Laptop, PartyPopper, CalendarDays, Plus, X, Loader2, Trash2, Check } from 'lucide-react'
import PostCard from '@/components/PostCard'
import { fromActiveClients } from '@/lib/activeClients'
import { eventosDoGoogle, type EventoGoogle } from '@/lib/calendarSync'
import { diasDaSemana, segundaDe, ordenarDoDia, type CalItem } from '@/lib/calendarItems'
import WeekView from '@/components/calendario/WeekView'
import ListView from '@/components/calendario/ListView'
import DayPanel from '@/components/calendario/DayPanel'
import { ehBloqueio, identificarCliente } from '@/lib/googleEventos'
import ItemChip from '@/components/calendario/ItemChip'
import { useRouter } from 'next/navigation'
import { withBase } from '@/lib/base'

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

const EMPTY_FORM = { title: '', event_type: 'reuniao', date: '', start_time: '', end_time: '', description: '', location: '' }

type Vista = 'mes' | 'semana' | 'dia' | 'lista'
const VISTAS: { key: Vista; label: string }[] = [
  { key: 'mes',    label: 'Mês' },
  { key: 'semana', label: 'Semana' },
  { key: 'dia',    label: 'Dia' },
  { key: 'lista',  label: 'Lista' },
]

function pad(n: number) { return String(n).padStart(2, '0') }
function toISO(d: Date)  { return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}` }

export default function CalendarioPage() {
  useEffect(() => { document.title = 'Calendário · Bagano Hub' }, [])
  const router = useRouter()

  // Uma âncora só, e mês/ano derivados dela. Com quatro visões, guardar mês e
  // ano soltos obrigaria cada uma a converter pra data e de volta — e a semana
  // que atravessa a virada do mês não tem "um mês" pra guardar.
  const [view,   setView]   = useState<Vista>('mes')
  const [anchor, setAnchor] = useState<Date>(() => { const d = new Date(); d.setHours(12, 0, 0, 0); return d })
  const month = anchor.getMonth() + 1
  const year  = anchor.getFullYear()

  const [posts,          setPosts]          = useState<Post[]>([])
  const [captacoes,      setCaptacoes]      = useState<Captacao[]>([])
  const [criacaoEntries, setCriacaoEntries] = useState<CriacaoEntry[]>([])
  const [hubEvents,      setHubEvents]      = useState<HubEvent[]>([])
  // O que existe no Google e NÃO nasceu aqui. Era o lado cego da ponte: a
  // equipe marca captação direto no Google (UNI FLORIPA, NIHAO, STATION63…) e
  // o hub não via nada disso — dos 8 eventos do calendário, só 1 tinha saído
  // daqui.
  const [googleEvents,   setGoogleEvents]   = useState<EventoGoogle[]>([])
  const [allClients,     setAllClients]     = useState<Client[]>([])
  const [loading,        setLoading]        = useState(true)

  const [filterClient,  setFilterClient]  = useState('')
  // Post começa DESLIGADO. São 162 num mês contra um punhado de captações,
  // dias de criação e eventos — ligados por padrão, afogam tudo o que é
  // compromisso de gente com data, que é pra isso que se abre um calendário. O
  // cronograma de posts já tem tela própria; aqui eles são consulta eventual, e
  // o filtro continua a um clique.
  const [showPosts,     setShowPosts]     = useState(false)
  const [showCriacao,   setShowCriacao]   = useState(true)
  const [showCaptacao,  setShowCaptacao]  = useState(true)
  const [showEventos,   setShowEventos]   = useState(true)
  const [showGoogle,    setShowGoogle]    = useState(true)

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

  // O dia aberto no painel. É o que responde ao "+N mais", que até agora era
  // um <span> sem nenhum caminho pra chegar no que ele contava.
  const [diaAberto, setDiaAberto] = useState<string | null>(null)

  // O período que a tela mostra, por visão. Na semana ele atravessa a virada do
  // mês — que é justamente o que a consulta antiga não sabia fazer: ela pedia
  // os posts por `month`/`year`, então a semana de 31/08 a 06/09 perdia setembro
  // inteiro.
  const periodo = useMemo(() => {
    if (view === 'dia') {
      const d = toISO(anchor)
      return { inicio: d, fim: d }
    }
    if (view === 'semana') {
      const dias = diasDaSemana(segundaDe(anchor))
      return { inicio: toISO(dias[0]), fim: toISO(dias[6]) }
    }
    const ultimo = new Date(year, month, 0).getDate()
    return { inicio: `${year}-${pad(month)}-01`, fim: `${year}-${pad(month)}-${pad(ultimo)}` }
  }, [view, anchor, month, year])

  useEffect(() => {
    async function load() {
      setLoading(true)
      const supabase   = createClient()
      const startISO   = periodo.inicio
      const endISO     = periodo.fim
      // A agenda de criação é guardada pela SEGUNDA da semana, não pelo dia —
      // então buscar só o intervalo perderia a semana que começou antes dele.
      const agStart    = toISO(new Date(new Date(startISO + 'T12:00:00').getTime() - 7 * 86400000))
      const agEnd      = toISO(new Date(new Date(endISO   + 'T12:00:00').getTime() + 7 * 86400000))

      const [{ data: postsData }, { data: captData }, { data: criacaoData }, { data: eventsData }, { data: clientData }] = await Promise.all([
        supabase.from('schedules')
          .select('id, title, scheduled_date, post_type, approval_status, client_id, month, year, clients(name, color_hex)')
          .gte('scheduled_date', startISO).lte('scheduled_date', endISO)
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
      ])

      // Calendário busca por mês, nunca por cliente — então o recorte de
      // cliente ativo precisa ser feito aqui, senão o mês segue pintado com os
      // posts de quem já saiu.
      const ativos = new Set((clientData || []).map(c => c.id))

      setPosts(fromActiveClients<any>(postsData, ativos).map((d: any) => ({
        id: d.id, title: d.title || 'Sem título', scheduled_date: d.scheduled_date,
        post_type: d.post_type || '', approval_status: d.approval_status || null,
        client_id: d.client_id, client_name: d.clients?.name || '—',
        client_color: d.clients?.color_hex || '#94a3b8', month: d.month, year: d.year,
      })))

      setCaptacoes(fromActiveClients<any>(captData, ativos).map((d: any) => ({
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

      // Os eventos do Google entram DEPOIS, sem segurar a tela: são um extra,
      // e travar o mês inteiro esperando a API do Google seria pagar caro por
      // eles. `ignorar` tira o que o hub já desenha por conta própria — sem
      // isso a captação criada aqui apareceria duas vezes no mesmo dia.
      const jaMostrados = new Set<string>([
        ...(eventsData || []).map((d: any) => d.google_calendar_event_id),
        ...(captData   || []).map((d: any) => d.google_calendar_event_id),
      ].filter(Boolean) as string[])
      eventosDoGoogle(startISO, endISO, jaMostrados).then(setGoogleEvents)

      setAllClients(clientData || [])
      setLoading(false)
    }
    load()
  }, [periodo])

  // Close modal on outside click
  useEffect(() => {
    function h(e: MouseEvent) {
      if (modalRef.current && !modalRef.current.contains(e.target as Node)) closeEventModal()
    }
    if (showEventModal) document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [showEventModal])

  // Avançar quer dizer coisas diferentes em cada visão: um mês, uma semana, um
  // dia. Na lista segue o mês, que é o período que ela mostra.
  function andar(passo: number) {
    setAnchor(a => {
      const d = new Date(a)
      if (view === 'semana')   d.setDate(d.getDate() + 7 * passo)
      else if (view === 'dia') d.setDate(d.getDate() + passo)
      else                     d.setMonth(d.getMonth() + passo)
      return d
    })
  }
  const prevMonth = () => andar(-1)
  const nextMonth = () => andar(1)

  const firstDay   = (new Date(year, month - 1, 1).getDay() + 6) % 7 // semana começa na segunda
  const daysInMonth = new Date(year, month, 0).getDate()
  const cells: (number | null)[] = [...Array(firstDay).fill(null), ...Array.from({ length: daysInMonth }, (_, i) => i + 1)]
  while (cells.length % 7 !== 0) cells.push(null)

  const todayISO = toISO(new Date())
  const isToday = (day: number) => `${year}-${pad(month)}-${pad(day)}` === todayISO

  function dayISO(day: number) { return `${year}-${pad(month)}-${pad(day)}` }

  // As cinco fontes viram uma lista só. Os filtros de tipo e de cliente entram
  // AQUI, não em cada visão — do contrário mês, semana, dia e lista teriam
  // quatro cópias da mesma regra pra discordarem entre si.
  const itensDoPeriodo: CalItem[] = useMemo(() => {
    const out: CalItem[] = []
    const cabe = (cid: string | null) => !filterClient || cid === filterClient

    if (showPosts) for (const p of posts) {
      if (!p.scheduled_date || !cabe(p.client_id)) continue
      out.push({ key: `post-${p.id}`, kind: 'post', id: p.id, title: p.title,
        date: p.scheduled_date, startTime: null, endTime: null,
        color: p.client_color, clientId: p.client_id, clientName: p.client_name, href: null, data: p })
    }

    if (showCaptacao) for (const c of captacoes) {
      if (!cabe(c.client_id)) continue
      const ini = c.scheduled_time ? c.scheduled_time.slice(0, 5) : null
      out.push({ key: `cap-${c.id}`, kind: 'captacao', id: c.id,
        title: c.client_name || c.notes?.split('\n')[0] || 'Captação',
        date: c.scheduled_date, startTime: ini, endTime: null,
        color: '#8b5cf6', clientId: c.client_id, clientName: c.client_name, href: null, data: c })
    }

    if (showCriacao) for (const e of criacaoEntries) {
      if (!cabe(e.client_id)) continue
      out.push({ key: `cri-${e.id}`, kind: 'criacao', id: e.id, title: e.client_name,
        date: e.date, startTime: null, endTime: null,
        color: e.client_color, clientId: e.client_id, clientName: e.client_name, href: null, data: e })
    }

    if (showEventos) for (const ev of hubEvents) {
      out.push({ key: `ev-${ev.id}`, kind: 'evento', id: ev.id, title: ev.title,
        date: ev.date,
        startTime: ev.start_time ? ev.start_time.slice(0, 5) : null,
        endTime:   ev.end_time   ? ev.end_time.slice(0, 5)   : null,
        color: EVENT_TYPES[ev.event_type]?.color || '#6b7280',
        clientId: null, clientName: null, href: null, data: ev })
    }

    // O evento do Google não traz cliente nenhum no dado — mas traz no TÍTULO,
    // que é onde a equipe sempre escreveu ("ZEBUÍNO + ISRA", "NIHAO", "N7").
    // Reconhecer isso é o que faz o filtro por cliente valer também pro que vem
    // de fora, e o que dá cor de cliente a um evento que antes era cinza
    // anônimo. Medido nos 132 eventos reais: 36 identificados, e os que sobram
    // ou são cliente inativo ou não são cliente — nenhum erro.
    if (showGoogle) for (const g of googleEvents) {
      const bloqueio = ehBloqueio(g.summary)
      const cli = bloqueio ? null : identificarCliente(g.summary, allClients)
      if (filterClient && cli?.id !== filterClient) continue
      out.push({ key: `g-${g.id}`, kind: bloqueio ? 'bloqueio' : 'google', id: g.id,
        title: g.summary, date: g.date,
        startTime: g.allDay ? null : g.startTime, endTime: g.allDay ? null : g.endTime,
        color: cli ? (allClients.find(c => c.id === cli.id)?.color_hex || '#64748b') : '#64748b',
        clientId: cli?.id || null, clientName: cli?.name || null, href: g.htmlLink, data: g })
    }

    return out
  }, [posts, captacoes, criacaoEntries, hubEvents, googleEvents, allClients,
      showPosts, showCaptacao, showCriacao, showEventos, showGoogle, filterClient])

  // O que a navegação anuncia muda com a visão: "Agosto 2026" não diz nada
  // quando a tela mostra uma semana, e menos ainda um dia.
  // Um caminho só pra abrir qualquer item, seja de que visão for. Sem isto,
  // cada visão precisaria saber que post abre o PostCard, captação leva pra
  // Agenda e evento abre o modal daqui — quatro cópias da mesma decisão.
  function abrirItem(item: CalItem) {
    if (item.kind === 'post') {
      const p = item.data as Post
      setEditingPostId(p.id)
      setEditingPostCtx({ clientId: p.client_id, clientName: p.client_name, clientColor: p.client_color, month: p.month, year: p.year })
      setShowPostCard(true)
      setDiaAberto(null)
      return
    }
    if (item.kind === 'evento') { openEditEvent(item.data as HubEvent); setDiaAberto(null); return }
    if (item.kind === 'captacao') { router.push('/dashboard/agenda'); return }
    if (item.kind === 'criacao')  { router.push('/dashboard/agenda'); return }
    // google e bloqueio abrem no Google pelo próprio <a> do chip.
  }

  // No celular a célula do mês tem ~50px de largura: o título vira uma letra e
  // meia, e as iniciais do cliente pelo menos dizem de quem é.
  const [estreito, setEstreito] = useState(false)
  useEffect(() => {
    const m = window.matchMedia('(max-width: 767px)')
    const ler = () => setEstreito(m.matches)
    ler()
    m.addEventListener('change', ler)
    return () => m.removeEventListener('change', ler)
  }, [])

  const rotuloPeriodo = useMemo(() => {
    if (view === 'dia') {
      return anchor.toLocaleDateString('pt-BR', { day: 'numeric', month: 'short', year: 'numeric' })
    }
    if (view === 'semana') {
      const d = diasDaSemana(segundaDe(anchor))
      const fmt = (x: Date) => x.toLocaleDateString('pt-BR', { day: 'numeric', month: 'short' })
      return `${fmt(d[0])} – ${fmt(d[6])}`
    }
    return `${MONTHS[month - 1]} ${year}`
  }, [view, anchor, month, year])

  const itensPorDia = useMemo(() => {
    const m = new Map<string, CalItem[]>()
    for (const i of itensDoPeriodo) {
      if (!m.has(i.date)) m.set(i.date, [])
      m.get(i.date)!.push(i)
    }
    return m
  }, [itensDoPeriodo])

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
        await fetch(withBase('/api/calendar'), { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ eventId: gcalId }) })
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
        const res = await fetch(withBase('/api/calendar'), {
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
      await fetch(withBase('/api/calendar'), { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ eventId: editingEvent.google_calendar_event_id }) })
    }
    await supabase.from('hub_events').delete().eq('id', editingEvent.id)
    setHubEvents(prev => prev.filter(e => e.id !== editingEvent.id))
    closeEventModal()
  }

  return (
    <div className="p-4 md:p-6 flex flex-col gap-3 md:gap-4 h-full overflow-auto page-content">

      {/* Header */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="min-w-0">
          <h1 className="text-xl md:text-2xl font-bold text-[var(--color-text-primary)] tracking-tight">Calendário</h1>
          {/* O mês já aparece na navegação ao lado — repetir aqui só gastava linha */}
          <p className="hidden md:block text-[var(--color-text-muted)] text-sm mt-0.5">{MONTHS[month-1]} {year}</p>
        </div>
        <div className="flex flex-col gap-2 w-full md:w-auto md:flex-row md:items-center md:gap-3 md:flex-wrap">

          {/* Filtro de cliente + novo evento dividem a linha no celular */}
          <div className="flex items-center gap-2 md:contents">
            <div className="flex items-center gap-1.5 flex-1 md:flex-none min-w-0">
              <Filter size={12} className="text-[var(--color-text-muted)] flex-shrink-0 hidden md:block" />
              <select value={filterClient} onChange={e => setFilterClient(e.target.value)}
                className="w-full md:w-auto h-8 min-w-0 text-xs rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-card)] px-2.5 text-[var(--color-text-secondary)] outline-none">
                <option value="">Todos os clientes</option>
                {allClients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>

            <button onClick={() => openNewEvent(todayISO)}
              className="h-8 flex-shrink-0 flex items-center gap-1.5 text-xs font-semibold px-3 rounded-xl border transition-all hover:opacity-90"
              style={{ background: '#10b98122', color: '#059669', borderColor: '#10b98166' }}>
              <Plus size={12} /> <span className="hidden sm:inline">Novo </span>evento
            </button>
          </div>

          {/* Type toggles — células iguais no celular, em vez de larguras
              diferentes ("Posts" vs "Captação") quebrando torto. Três colunas
              (e não cinco) porque com o filtro do Google cinco não cabem numa
              linha de celular sem virar texto ilegível: duas fileiras de três
              é melhor que uma fileira apertada. */}
          <div className="grid grid-cols-3 md:flex gap-1.5 md:items-center">
            {([
              { key: 'posts',    label: 'Posts',    active: showPosts,    toggle: () => setShowPosts(v => !v),    color: '#3b82f6', icon: null },
              { key: 'criacao',  label: 'Criação',  active: showCriacao,  toggle: () => setShowCriacao(v => !v),  color: '#f59e0b', icon: <PenLine size={9} /> },
              { key: 'captacao', label: 'Captação', active: showCaptacao, toggle: () => setShowCaptacao(v => !v), color: '#8b5cf6', icon: <Camera size={9} /> },
              { key: 'eventos',  label: 'Eventos',  active: showEventos,  toggle: () => setShowEventos(v => !v),  color: '#10b981', icon: <CalendarDays size={9} /> },
              { key: 'google',   label: 'Google',   active: showGoogle,   toggle: () => setShowGoogle(v => !v),   color: '#64748b', icon: <CalendarDays size={9} /> },
            ] as const).map(({ key, label, active, toggle, color, icon }) => (
              <button key={key} onClick={toggle}
                className="h-7 flex items-center justify-center gap-1 text-[11px] md:text-xs font-semibold px-1.5 md:px-2.5 rounded-full border transition-all"
                style={active
                  ? { background: color + '22', color, borderColor: color + '66' }
                  : { color: 'var(--color-text-faint)', borderColor: 'var(--color-border)' }}>
                {icon}{label}
              </button>
            ))}
          </div>

          {/* Seletor de visão. Quatro, e não só mês, porque a célula do mês tem
              teto de espaço: em agosto são 5,2 itens por dia e pico de 10, num
              lugar que mostra 3. */}
          <div className="flex bg-[var(--color-bg-card)] border border-[var(--color-border)] rounded-xl p-0.5 gap-0.5">
            {VISTAS.map(v => (
              <button key={v.key} onClick={() => setView(v.key)}
                className={`h-7 px-2.5 text-xs font-semibold rounded-lg transition-colors ${
                  view === v.key
                    ? 'bg-[var(--color-bg-subtle)] text-[var(--color-text-primary)]'
                    : 'text-[var(--color-text-faint)] hover:text-[var(--color-text-secondary)]'}`}>
                {v.label}
              </button>
            ))}
          </div>

          {/* Month nav */}
          <div className="flex items-center justify-between md:justify-start gap-1 bg-[var(--color-bg-card)] border border-[var(--color-border)] rounded-xl p-1">
            <button onClick={prevMonth} className="w-7 h-7 flex-shrink-0 flex items-center justify-center rounded-lg hover:bg-[var(--color-bg-subtle)] transition-colors">
              <ChevronLeft size={14} className="text-[var(--color-text-secondary)]" />
            </button>
            <span className="text-xs font-semibold text-[var(--color-text-primary)] min-w-[110px] text-center">{rotuloPeriodo}</span>
            <button onClick={nextMonth} className="w-7 h-7 flex-shrink-0 flex items-center justify-center rounded-lg hover:bg-[var(--color-bg-subtle)] transition-colors">
              <ChevronRight size={14} className="text-[var(--color-text-secondary)]" />
            </button>
          </div>
        </div>
      </div>

      {/* Legenda de clientes — some no celular: são 17 clientes, ~7 fileiras,
          quase meia tela só de chave de cores, e o filtro "Todos os clientes"
          logo acima já faz o mesmo trabalho de recortar por cliente. */}
      {legendClients.length > 0 && (
        <div className="hidden md:flex flex-wrap gap-2 items-center">
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

      {/* As quatro visões. Todas leem a MESMA lista de itens — o mês não tem
          mais o seu próprio jeito de desenhar uma captação, nem a semana o
          dela. Era assim que a mesma coisa aparecia diferente em cada canto. */}

      {view === 'mes' && (
        <div className="flex-1 flex flex-col bg-[var(--color-bg-card)] border border-[var(--color-border)] rounded-2xl overflow-hidden shadow-sm">
          <div className="grid grid-cols-7 border-b border-[var(--color-border)]">
            {WEEKDAYS.map(d => (
              <div key={d} className="py-2 text-center text-[10px] font-semibold text-[var(--color-text-muted)] uppercase tracking-wide">{d}</div>
            ))}
          </div>

          <div className="grid grid-cols-7 flex-1">
            {cells.map((day, i) => {
              const iso = day ? dayISO(day) : ''
              const doDia = day ? [...(itensPorDia.get(iso) || [])].sort(ordenarDoDia) : []
              const todayCell = day ? isToday(day) : false
              const maxShow = 3

              return (
                <div key={i}
                  className={`group/cell min-h-[74px] md:min-h-[110px] border-r border-b border-[var(--color-border)] p-0.5 md:p-1.5 flex flex-col gap-0.5 ${todayCell ? 'bg-[var(--color-bg-subtle)]' : ''}`}>
                  {day && (
                    <div className="flex items-center justify-between mb-0.5 px-0.5">
                      <span className={`text-[10px] md:text-xs font-semibold w-4 h-4 md:w-6 md:h-6 flex items-center justify-center rounded-full flex-shrink-0 ${todayCell ? 'bg-[var(--color-accent)] text-white' : 'text-[var(--color-text-secondary)]'}`}>
                        {day}
                      </span>
                      <div className="flex items-center gap-1">
                        {doDia.length > 0 && <span className="text-[9px] text-[var(--color-text-faint)]">{doDia.length}</span>}
                        <button onClick={() => openNewEvent(iso)}
                          className="hidden md:flex opacity-0 group-hover/cell:opacity-100 w-5 h-5 rounded-md items-center justify-center transition-opacity text-[var(--color-text-faint)] hover:bg-[var(--color-bg-subtle)]"
                          title="Novo evento">
                          <Plus size={10} />
                        </button>
                      </div>
                    </div>
                  )}

                  {doDia.slice(0, maxShow).map(item => (
                    <ItemChip key={item.key} item={item} compacto={estreito}
                      onClick={() => abrirItem(item)}
                      className="!text-[9px] md:!text-[10px] !py-px md:!py-0.5" />
                  ))}

                  {/* Era um <span>. Não era botão, não abria nada, e não havia
                      outro caminho: em agosto isso escondia 76 de 162 itens,
                      46% do mês, sem NENHUMA forma de chegar neles. */}
                  {doDia.length > maxShow && (
                    <button onClick={() => setDiaAberto(iso)}
                      className="text-[9px] text-[var(--color-text-faint)] hover:text-[var(--color-text-primary)] px-1 text-left transition-colors">
                      +{doDia.length - maxShow} mais
                    </button>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}

      {(view === 'semana' || view === 'dia') && (
        <WeekView
          dias={view === 'dia' ? [anchor] : diasDaSemana(segundaDe(anchor))}
          itens={itensDoPeriodo}
          hoje={todayISO}
          onOpen={abrirItem}
          onDia={setDiaAberto}
        />
      )}

      {view === 'lista' && (
        <ListView itens={itensDoPeriodo} hoje={todayISO} onOpen={abrirItem} />
      )}

      {diaAberto && (
        <DayPanel
          date={diaAberto}
          items={[...(itensPorDia.get(diaAberto) || [])]}
          onClose={() => setDiaAberto(null)}
          onOpen={abrirItem}
          onNovoEvento={d => { setDiaAberto(null); openNewEvent(d) }}
        />
      )}

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
