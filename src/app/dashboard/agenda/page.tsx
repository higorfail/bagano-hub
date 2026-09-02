'use client'

import { useEffect, useState, useMemo, useCallback } from 'react'
import { createClient } from '@/lib/supabase'
import { useToast } from '@/lib/ToastContext'
import { dbError } from '@/lib/dbError'
import { Plus, ChevronLeft, ChevronRight, Camera, X, Check, Loader2, CalendarPlus, AlertTriangle } from 'lucide-react'
import { fromActiveClients } from '@/lib/activeClients'
import { detectarAusencia } from '@/lib/googleEventos'
import { sincronizarCaptacao, sincronizarCriacao, dataDaCriacao, removerDoCalendario, eventosDoGoogle } from '@/lib/calendarSync'
import { ensureWatching } from '@/lib/watch'
import { logActivity } from '@/lib/activity'
import { useUser } from '@/lib/UserContext'
import { withBase } from '@/lib/base'

type Client       = { id: string; name: string; color_hex: string; logo_url: string | null }
type Member       = { id: string; name: string; role: string }
type AgendaEntry  = { id: string; week_start: string; day_of_week: number; client_id: string; member_ids: string[] | null; notes: string | null }
type Captacao     = {
  id: string; client_id: string; scheduled_date: string; scheduled_time: string | null
  duration_minutes: number; status: string; notes: string | null
  team_member_ids: string[] | null; google_calendar_event_id: string | null; months_covered: number
}

const DAYS = ['Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta']
const DAYS_SHORT = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex']
// Formato curto pro celular — o toLocaleDateString pt-BR devolve "27 de jul.",
// longo demais pra caber na barra de navegação da semana.
const MONTH_SHORT_BR = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez']
const STATUS_LABEL: Record<string, string> = { agendada: 'Agendada', realizada: 'Realizada', cancelada: 'Cancelada' }
const STATUS_COLOR: Record<string, string> = {
  agendada:  'border bg-[var(--ds-info-bg)] text-[var(--ds-info-text)] border-[var(--ds-info-border)]',
  realizada: 'border bg-[var(--ds-success-bg)] text-[var(--ds-success-text)] border-[var(--ds-success-border)]',
  cancelada: 'border bg-[var(--color-bg-subtle)] text-[var(--color-text-muted)] border-[var(--color-border)]',
}

function getMonday(d: Date) {
  const date = new Date(d)
  const day  = date.getDay()
  const diff = date.getDate() - day + (day === 0 ? -6 : 1)
  date.setDate(diff)
  date.setHours(0, 0, 0, 0)
  return date
}

function addDays(d: Date, n: number) {
  const r = new Date(d)
  r.setDate(r.getDate() + n)
  return r
}

function toLocalISO(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function getInitials(name: string) {
  return name.split(' ').slice(0, 2).map(w => w[0]).join('').toUpperCase()
}

const BLANK_CAPTACAO = {
  client_id: '', scheduled_date: '', scheduled_time: '',
  duration_minutes: 120, status: 'agendada', notes: '',
  team_member_ids: [] as string[], months_covered: 1,
}

export default function AgendaPage() {
  useEffect(() => { document.title = 'Agenda · Bagano Hub' }, [])
  const supabase = createClient()
  const { toast } = useToast()
  const { currentMember } = useUser()
  const [weekStart, setWeekStart] = useState<Date>(() => getMonday(new Date()))
  const [clients,      setClients]      = useState<Client[]>([])
  const [members,      setMembers]      = useState<Member[]>([])
  const [clientTeam,   setClientTeam]   = useState<Record<string, string[]>>({})
  const [entries,      setEntries]      = useState<AgendaEntry[]>([])
  const [captacoes,    setCaptacoes]    = useState<Captacao[]>([])
  const [loading,      setLoading]      = useState(true)

  // Agenda entry modal
  const [entryModal,   setEntryModal]   = useState<{ dayIndex: number } | null>(null)
  const [editingEntry, setEditingEntry] = useState<AgendaEntry | null>(null)
  const [entryClient,  setEntryClient]  = useState('')
  const [entryMembers, setEntryMembers] = useState<string[]>([])
  const [entryNotes,   setEntryNotes]   = useState('')
  const [savingEntry,  setSavingEntry]  = useState(false)

  // Drag-and-drop entre dias
  const [dragEntryId, setDragEntryId] = useState<string | null>(null)
  const [dragOverDay, setDragOverDay] = useState<number | null>(null)

  async function moveEntry(entryId: string, newDayIndex: number) {
    const entry = entries.find(e => e.id === entryId)
    if (!entry || entry.day_of_week === newDayIndex + 1) return
    setEntries(prev => prev.map(e => e.id === entryId ? { ...e, day_of_week: newDayIndex + 1 } : e))
    const { error } = await supabase.from('agenda_criacao').update({ day_of_week: newDayIndex + 1 }).eq('id', entryId)
    if (error) {
      setEntries(prev => prev.map(e => e.id === entryId ? { ...e, day_of_week: entry.day_of_week } : e))
      dbError(error, toast, 'mover entrada')
    }
  }

  // Captação modal
  const [captModal,   setCaptModal]   = useState(false)
  const [captForm,    setCaptForm]    = useState({ ...BLANK_CAPTACAO })
  const [savingCapt,  setSavingCapt]  = useState(false)
  const [syncingId,   setSyncingId]   = useState<string | null>(null)
  const [calendarOk,  setCalendarOk]  = useState<boolean | null>(null)

  const weekKey = toLocalISO(weekStart)
  const weekEnd = addDays(weekStart, 6)

  const clientMap = useMemo(() => {
    const m: Record<string, Client> = {}
    clients.forEach(c => { m[c.id] = c })
    return m
  }, [clients])

  const memberMap = useMemo(() => {
    const m: Record<string, Member> = {}
    members.forEach(x => { m[x.id] = x })
    return m
  }, [members])

  const load = useCallback(async () => {
    setLoading(true)
    const start = toLocalISO(weekStart)
    const end   = toLocalISO(addDays(weekStart, 90)) // captações até 90 dias

    const [{ data: cl }, { data: mb }, { data: en }, { data: cap }, { data: ct }] = await Promise.all([
      supabase.from('clients').select('id, name, color_hex, logo_url').eq('status', 'active').order('name'),
      supabase.from('team_members').select('id, name, role').order('name'),
      supabase.from('agenda_criacao').select('*').eq('week_start', start),
      supabase.from('captacoes').select('*').gte('scheduled_date', start).lte('scheduled_date', end).order('scheduled_date'),
      // Quem é de cada cliente. É o que o Google não tem como saber: lá o
      // evento é texto solto, sem vínculo com pessoa nenhuma.
      supabase.from('client_team').select('client_id, member_id'),
    ])
    // Captação e agenda de criação são buscadas por semana, sem passar por
    // cliente. Sem este recorte, cliente desativado seguia ocupando dia na
    // agenda de quem ainda trabalha.
    const ativos = new Set((cl || []).map(c => c.id))
    setClients(cl || [])
    setMembers(mb || [])
    setEntries(fromActiveClients<any>(en, ativos))
    setCaptacoes(fromActiveClients<any>(cap, ativos))
    const eq: Record<string, string[]> = {}
    for (const t of (ct || [])) (eq[t.client_id] ||= []).push(t.member_id)
    setClientTeam(eq)
    setLoading(false)
  }, [weekStart])

  useEffect(() => { load() }, [load])

  // O calendário está ligado? Perguntar lendo um intervalo vazio custa o mesmo
  // que o POST vazio que existia aqui — e aquele virava uma tentativa de criar
  // evento sem título nem data, uma escrita fadada a falhar a cada abertura.
  useEffect(() => {
    fetch(withBase('/api/calendar?start=2000-01-01&end=2000-01-01'))
      .then(r => setCalendarOk(r.status !== 503))
      .catch(() => setCalendarOk(false))
  }, [])

  // ── Agenda de criação ───────────────────────────────────────────────
  // Quem precisa saber de uma captação: quem vai nela, mais a equipe do
  // cliente. O hub já sabe as duas coisas — `team_member_ids` e `client_team` —
  // e é justamente isso que o Google não sabe, porque lá é tudo texto solto.
  async function avisarCaptacao(capt: any, descricao: string) {
    const daEquipe = (clientTeam[capt.client_id] || [])
    const ids = [...new Set([...(capt.team_member_ids || []), ...daEquipe])]
    await ensureWatching('captacoes', capt.id, ids)
    await logActivity({
      tableName: 'captacoes', recordId: capt.id, clientId: capt.client_id,
      action: 'created', actorName: currentMember?.name, actorId: currentMember?.id,
      description: descricao,
    })
  }

  // A criação avisa só quem foi marcado no dia — e não a equipe inteira do
  // cliente, como a captação faz. São coisas diferentes: captação é o cliente
  // inteiro se organizando em torno de um dia; dia de criação é a agenda de
  // quem vai sentar e fazer.
  async function avisarCriacao(entry: any) {
    const ids = entry.member_ids || []
    if (!ids.length) return
    await ensureWatching('agenda_criacao', entry.id, ids)
    await logActivity({
      tableName: 'agenda_criacao', recordId: entry.id, clientId: entry.client_id,
      action: 'created', actorName: currentMember?.name, actorId: currentMember?.id,
      description: `${currentMember?.name || 'Alguém'} marcou você na criação do ${clientMap[entry.client_id]?.name || 'cliente'} · ${formatarData(dataDaCriacao(entry.week_start, entry.day_of_week))}`,
    })
  }

  const formatarData = (iso: string) =>
    new Date(iso + 'T12:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })

  // Um caminho só pro Google, pras três operações da agenda de criação.
  const nomesDe = (ids: string[] | null | undefined) =>
    (ids || []).map(id => memberMap[id]?.name).filter(Boolean).join(', ')

  async function criacaoPraGoogle(entry: any) {
    if (calendarOk === false || !entry?.client_id) return
    const { ok, eventId } = await sincronizarCriacao(
      { id: entry.id, client_id: entry.client_id,
        date: dataDaCriacao(entry.week_start, entry.day_of_week),
        notes: entry.notes ?? null,
        google_calendar_event_id: entry.google_calendar_event_id ?? null },
      clientMap[entry.client_id]?.name || '', nomesDe(entry.member_ids),
    )
    if (ok) setEntries(prev => prev.map(e => e.id === entry.id ? { ...e, google_calendar_event_id: eventId } : e))
  }

  async function addEntry() {
    if (!entryClient) return
    setSavingEntry(true)
    const dayIndex = entryModal!.dayIndex
    const { data, error } = await supabase.from('agenda_criacao').insert({
      week_start: weekKey, day_of_week: dayIndex + 1,
      client_id: entryClient,
      member_ids: entryMembers.length > 0 ? entryMembers : null,
      notes: entryNotes || null,
    }).select().single()
    if (dbError(error, toast, 'adicionar à agenda')) { setSavingEntry(false); return }
    if (data) {
      setEntries(prev => [...prev, data])
      // Dia de criação também é compromisso de pessoa com data. Ia só a
      // captação pro Google, então metade do que ocupa a semana da equipe
      // ficava invisível pra quem olha o calendário.
      void criacaoPraGoogle(data)
      void avisarCriacao(data)
    }
    setEntryModal(null)
    setEntryClient('')
    setEntryMembers([])
    setEntryNotes('')
    setSavingEntry(false)
  }

  async function updateEntry() {
    if (!editingEntry || !entryClient) return
    setSavingEntry(true)
    const { error } = await supabase.from('agenda_criacao').update({
      client_id:  entryClient,
      member_ids: entryMembers.length > 0 ? entryMembers : null,
      notes:      entryNotes || null,
    }).eq('id', editingEntry.id)
    if (dbError(error, toast, 'editar entrada')) { setSavingEntry(false); return }
    void criacaoPraGoogle({ ...editingEntry, client_id: entryClient, member_ids: entryMembers, notes: entryNotes })
    setEntries(prev => prev.map(e => e.id === editingEntry.id
      ? { ...e, client_id: entryClient, member_ids: entryMembers.length > 0 ? entryMembers : null, notes: entryNotes || null }
      : e))
    setEntryModal(null)
    setEditingEntry(null)
    setSavingEntry(false)
  }

  async function removeEntry(id: string) {
    const alvo = entries.find(e => e.id === id)
    await removerDoCalendario((alvo as any)?.google_calendar_event_id, 'criacao')
    const { error } = await supabase.from('agenda_criacao').delete().eq('id', id)
    if (dbError(error, toast, 'remover da agenda')) return
    setEntries(prev => prev.filter(e => e.id !== id))
  }

  // ── Captações ──────────────────────────────────────────────────────
  async function saveCapt() {
    if (!captForm.scheduled_date) return
    setSavingCapt(true)
    const { data, error } = await supabase.from('captacoes').insert({
      client_id: captForm.client_id || null,
      scheduled_date: captForm.scheduled_date,
      scheduled_time: captForm.scheduled_time || null,
      duration_minutes: captForm.duration_minutes,
      status: captForm.status,
      notes: captForm.notes || null,
      team_member_ids: captForm.team_member_ids.length > 0 ? captForm.team_member_ids : null,
      months_covered: captForm.months_covered,
    }).select().single()
    if (dbError(error, toast, 'salvar captação')) { setSavingCapt(false); return }
    if (data) {
      setCaptacoes(prev => [...prev, data].sort((a, b) => a.scheduled_date.localeCompare(b.scheduled_date)))
      // Vai pro Google junto com o salvar, sem botão. O botão existia e era
      // esquecido: 5 das 7 captações nunca viraram evento, incluindo as 4 que
      // ainda estavam por acontecer.
      void enviarPraGoogle(data)
      // E avisa quem vai. Assinar o calendário resolve pra quem assinou; o push
      // é o que alcança todo mundo hoje, sem depender de configuração no Google
      // de cada um. Observador ANTES do log — é o log que dispara o push.
      void avisarCaptacao(data, `${currentMember?.name || 'Alguém'} marcou captação do ${clientMap[data.client_id]?.name || 'cliente'} pra ${formatarData(data.scheduled_date)}`)
    }
    setCaptModal(false)
    setCaptForm({ ...BLANK_CAPTACAO })
    setSavingCapt(false)
  }

  async function deleteCapt(id: string) {
    const capt = captacoes.find(c => c.id === id)
    await removerDoCalendario(capt?.google_calendar_event_id)
    const { error } = await supabase.from('captacoes').delete().eq('id', id)
    if (dbError(error, toast, 'excluir captação')) return
    setCaptacoes(prev => prev.filter(c => c.id !== id))
  }

  // Um caminho só pro Google, usado pelo salvar, pelo mudar de status e pelo
  // botão de reenviar — antes cada um teria que remontar o mesmo payload, e o
  // que existia só sabia CRIAR: mudar a data deixava o evento no dia velho.
  async function enviarPraGoogle(capt: Captacao) {
    if (calendarOk === false) return
    setSyncingId(capt.id)
    const teamNames = (capt.team_member_ids || []).map(mid => memberMap[mid]?.name).filter(Boolean).join(', ')
    const { ok, eventId } = await sincronizarCaptacao(
      capt as any, clientMap[capt.client_id]?.name || '', teamNames,
    )
    if (ok) setCaptacoes(prev => prev.map(c => c.id === capt.id ? { ...c, google_calendar_event_id: eventId } : c))
    else toast('Captação salva, mas não entrou no Google Agenda', 'error')
    setSyncingId(null)
  }

  async function updateStatus(id: string, status: string) {
    const prev = captacoes
    const capt = captacoes.find(c => c.id === id)
    setCaptacoes(p => p.map(c => c.id === id ? { ...c, status } : c))
    const { error } = await supabase.from('captacoes').update({ status }).eq('id', id)
    if (error) { setCaptacoes(prev); dbError(error, toast, 'mudar status'); return }
    // Captação cancelada sai do Google. Deixar o evento de pé é pior que não
    // ter enviado: a equipe reserva o dia por causa de algo que não acontece.
    if (capt && status === 'cancelada' && capt.google_calendar_event_id) {
      await removerDoCalendario(capt.google_calendar_event_id)
      await supabase.from('captacoes').update({ google_calendar_event_id: null }).eq('id', id)
      setCaptacoes(p => p.map(c => c.id === id ? { ...c, google_calendar_event_id: null } : c))
    }
  }

  // ── Rendering helpers ──────────────────────────────────────────────
  const dayDates = Array.from({ length: 5 }, (_, i) => addDays(weekStart, i))
  // ── Quem está fora ────────────────────────────────────────────────
  //
  // O calendário da Bagano já registra ausência há tempos: "GEE OFF" aparece 72
  // vezes entre 2026 e 2027, toda semana. O hub nunca soube disso, então marcava
  // captação e dia de criação em cima da folga de alguém sem nem piscar — e a
  // descoberta acontecia depois, na conversa.
  //
  // O dado já existe e não custa nada ler. Aqui ele vira aviso.
  const [ausencias, setAusencias] = useState<{ date: string; memberId: string | null; nome: string }[]>([])
  useEffect(() => {
    if (calendarOk === false) return
    const ini = toLocalISO(weekStart)
    const fim = toLocalISO(addDays(weekStart, 120))
    // Só o calendário de captação: é onde a filmaker marca "GEE OFF", e
    // ausência é o único dado que esta tela busca aqui.
    eventosDoGoogle(ini, fim).then(evs => {
      const out: { date: string; memberId: string | null; nome: string }[] = []
      for (const e of evs) {
        const a = detectarAusencia(e.summary, members)
        if (a) out.push({ date: e.date, memberId: a.memberId, nome: a.nome })
      }
      setAusencias(out)
    })
  }, [weekStart, members, calendarOk])

  /** Quem, dos escolhidos, está fora naquele dia. */
  const foraNoDia = (dateISO: string, ids: string[]) => {
    const noDia = ausencias.filter(a => a.date === dateISO)
    if (!noDia.length) return []
    return noDia.filter(a => a.memberId && ids.includes(a.memberId)).map(a => a.nome)
  }

  const todayStr = toLocalISO(new Date())

  const upcomingCaptacoes = captacoes.filter(c => c.scheduled_date >= todayStr || c.status === 'agendada')
  const pastCaptacoes     = captacoes.filter(c => c.scheduled_date < todayStr && c.status !== 'agendada')

  if (loading) return (
    <div className="flex items-center justify-center h-full">
      <div className="w-5 h-5 border-2 border-[var(--color-border)] border-t-[var(--color-text-primary)] rounded-full animate-spin" />
    </div>
  )

  return (
    <div className="min-h-screen bg-[var(--color-bg-page)]">
      <div className="max-w-6xl mx-auto px-4 md:px-8 py-6 md:py-10 space-y-6 md:space-y-10">

        {/* Header */}
        <div>
          <h1 className="text-3xl font-bold text-[var(--color-text-primary)] tracking-tight">Agenda</h1>
          <p className="text-sm text-[var(--color-text-muted)] mt-1">Criação semanal e agenda de captações</p>
        </div>

        {/* ── AGENDA DE CRIAÇÃO ─────────────────────────────────────────────── */}
        <div>
          <div className="flex items-center justify-between mb-4 gap-2 flex-wrap">
            <h2 className="text-lg font-bold text-[var(--color-text-primary)]">Agenda de criação</h2>
            <div className="flex items-center gap-2">
              <button onClick={() => setWeekStart(d => getMonday(addDays(d, -7)))}
                className="w-8 h-8 flex items-center justify-center rounded-xl border border-[var(--color-border)] hover:bg-[var(--color-bg-subtle)] transition-colors text-[var(--color-text-secondary)] flex-shrink-0">
                <ChevronLeft size={14} />
              </button>
              {/* Versão curta no celular: o formato longo ("27 de jul. – 02 de
                  ago. de 2026") não cabia na largura fixa e quebrava em duas
                  linhas, esticando a barra e desalinhando as setas. */}
              <span className="text-xs md:text-sm font-medium text-[var(--color-text-primary)] tabular-nums w-[7.5rem] md:w-40 text-center flex-shrink-0">
                <span className="md:hidden">
                  {weekStart.getDate()} {MONTH_SHORT_BR[weekStart.getMonth()]} – {weekEnd.getDate()} {MONTH_SHORT_BR[weekEnd.getMonth()]}
                </span>
                <span className="hidden md:inline">
                  {weekStart.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })} –{' '}
                  {weekEnd.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' })}
                </span>
              </span>
              <button onClick={() => setWeekStart(d => getMonday(addDays(d, 7)))}
                className="w-8 h-8 flex items-center justify-center rounded-xl border border-[var(--color-border)] hover:bg-[var(--color-bg-subtle)] transition-colors text-[var(--color-text-secondary)] flex-shrink-0">
                <ChevronRight size={14} />
              </button>
              <button onClick={() => setWeekStart(getMonday(new Date()))}
                className="h-8 text-xs px-3 rounded-xl border border-[var(--color-border)] text-[var(--color-text-muted)] hover:bg-[var(--color-bg-subtle)] transition-colors flex-shrink-0">
                Hoje
              </button>
            </div>
          </div>

          {/* Uma coluna no celular: em duas, os 5 dias davam 2+2+1 (o último
              órfão) e o nome do cliente não cabia — virava "Mundo Selvage…".
              Em largura cheia o nome aparece inteiro e os cards ficam iguais. */}
          <div className="grid grid-cols-1 sm:grid-cols-5 gap-2 sm:gap-2.5 md:gap-3">
            {dayDates.map((date, dayIndex) => {
              const dateStr  = toLocalISO(date)
              const isToday  = dateStr === todayStr
              const dayEntries = entries.filter(e => e.day_of_week === dayIndex + 1)

              return (
                <div key={dayIndex}
                  onDragOver={e => { e.preventDefault(); setDragOverDay(dayIndex) }}
                  onDragLeave={e => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragOverDay(null) }}
                  onDrop={() => { if (dragEntryId !== null) moveEntry(dragEntryId, dayIndex); setDragOverDay(null) }}
                  className={`bg-[var(--color-bg-card)] rounded-2xl border p-3 md:p-4 flex flex-col gap-2 min-h-0 sm:min-h-[150px] md:min-h-[180px] transition-colors ${isToday ? 'border-[var(--color-brand)]' : dragOverDay === dayIndex ? 'border-[var(--color-brand)] bg-[var(--color-brand)]/5' : 'border-[var(--color-border)]'}`}>
                  {/* Day header — dia e número lado a lado no celular: em card
                      de largura cheia, empilhados só gastavam altura. */}
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex items-baseline gap-2 sm:block">
                      <p className={`text-xs font-semibold uppercase tracking-wider ${isToday ? 'text-[var(--color-text-primary)]' : 'text-[var(--color-text-muted)]'}`}>
                        {DAYS_SHORT[dayIndex]}
                      </p>
                      <p className={`text-lg font-bold leading-none ${isToday ? 'text-[var(--color-text-primary)]' : 'text-[var(--color-text-secondary)]'}`}>
                        {date.getDate()}
                      </p>
                    </div>
                    {/* Avisa só sobre quem está MARCADO neste dia de criação.
                        Antes mostrava qualquer ausência da data, e o resultado
                        era "Gee fora" na agenda de criação — a Gee é filmaker,
                        ela não faz criação. Ausência só é informação onde a
                        pessoa faria falta: a da filmaker importa na captação, a
                        do designer importa aqui. */}
                    {(() => {
                      const marcados = dayEntries.flatMap(e => e.member_ids || [])
                      const fora = foraNoDia(dateStr, marcados)
                      return fora.length > 0 ? (
                        <span className="text-[10px] flex items-center gap-1 px-1.5 py-0.5 rounded-full"
                          style={{ background: 'var(--ds-warning-bg, #fef3c7)', color: 'var(--ds-warning-text, #b45309)' }}
                          title="Segundo o Google Agenda">
                          <AlertTriangle size={9} />
                          {fora.map(n => n.split(' ')[0]).join(', ')} fora
                        </span>
                      ) : null
                    })()}
                    <button
                      onClick={() => { setEntryModal({ dayIndex }); setEntryClient(''); setEntryMembers([]); setEntryNotes('') }}
                      className="w-6 h-6 rounded-lg hover:bg-[var(--color-bg-subtle)] flex items-center justify-center text-[var(--color-text-muted)] transition-colors">
                      <Plus size={13} />
                    </button>
                  </div>

                  {/* Entries */}
                  {dayEntries.map(entry => {
                    const client = clientMap[entry.client_id]
                    if (!client) return null
                    const assignedMembers = (entry.member_ids || []).map(mid => memberMap[mid]).filter(Boolean)
                    return (
                      <div key={entry.id}
                        draggable
                        onDragStart={() => setDragEntryId(entry.id)}
                        onDragEnd={() => { setDragEntryId(null); setDragOverDay(null) }}
                        onClick={() => { setEditingEntry(entry); setEntryClient(entry.client_id); setEntryMembers(entry.member_ids || []); setEntryNotes(entry.notes || ''); setEntryModal({ dayIndex: entry.day_of_week - 1 }) }}
                        className={`group flex items-start gap-2 bg-[var(--color-bg-page)] rounded-xl p-2.5 relative cursor-pointer active:opacity-50 transition-opacity ${dragEntryId === entry.id ? 'opacity-40' : ''}`}>
                        <div className="w-6 h-6 rounded-lg flex items-center justify-center text-white text-[9px] font-bold flex-shrink-0 overflow-hidden"
                          style={{ background: client.color_hex }}>
                          {client.logo_url ? <img src={client.logo_url} alt={client.name} className="w-full h-full object-cover" /> : getInitials(client.name)}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-semibold text-[var(--color-text-primary)] leading-snug truncate">{client.name}</p>
                          {assignedMembers.length > 0 && (
                            <p className="text-[10px] text-[var(--color-text-muted)] leading-snug">
                              {assignedMembers.map(m => m!.name.split(' ')[0]).join(', ')}
                            </p>
                          )}
                          {entry.notes && (
                            <p className="text-[10px] text-[var(--color-text-faint)] italic leading-snug mt-0.5 truncate">{entry.notes}</p>
                          )}
                        </div>
                        <button
                          onClick={e => { e.stopPropagation(); removeEntry(entry.id) }}
                          className="absolute top-1 right-1 w-4 h-4 rounded flex items-center justify-center text-[var(--color-text-faint)] opacity-0 group-hover:opacity-100 transition-all" onMouseEnter={e => (e.currentTarget.style.color = 'var(--ds-error-text)')} onMouseLeave={e => (e.currentTarget.style.color = '')}>
                          <X size={10} />
                        </button>
                      </div>
                    )
                  })}

                  {dayEntries.length === 0 && (
                    <button
                      onClick={() => { setEntryModal({ dayIndex }); setEntryClient(''); setEntryMembers([]); setEntryNotes('') }}
                      className="flex-1 flex items-center justify-center text-xs text-[var(--color-text-faint)] hover:text-[var(--color-text-muted)] border border-dashed border-[var(--color-border)] rounded-xl transition-colors">
                      + cliente
                    </button>
                  )}
                </div>
              )
            })}
          </div>
        </div>

        {/* ── CAPTAÇÕES ─────────────────────────────────────────────────────── */}
        <div>
          <div className="flex items-center justify-between mb-4 gap-2 flex-wrap">
            <h2 className="text-lg font-bold text-[var(--color-text-primary)]">Captações</h2>
            <div className="flex items-center gap-2 md:gap-3 flex-wrap">
              {calendarOk === false && (
                <span className="text-xs px-3 py-1.5 rounded-xl border" style={{ color: 'var(--ds-caution-text)', background: 'var(--ds-caution-bg)', borderColor: 'var(--ds-caution-border)' }}>
                  Google Calendar não configurado
                </span>
              )}
              <button
                onClick={() => { setCaptForm({ ...BLANK_CAPTACAO, scheduled_date: toLocalISO(new Date()) }); setCaptModal(true) }}
                className="flex items-center gap-2 bg-[var(--color-brand)] text-[var(--color-brand-fg)] rounded-xl px-4 py-2 text-sm font-semibold hover:opacity-90 transition-opacity"
              >
                <Camera size={14} /> Nova captação
              </button>
            </div>
          </div>

          {upcomingCaptacoes.length === 0 && pastCaptacoes.length === 0 ? (
            <div className="bg-[var(--color-bg-card)] border border-[var(--color-border)] rounded-2xl p-10 text-center shadow-card">
              <Camera size={28} className="mx-auto text-[var(--color-text-faint)] mb-3" />
              <p className="text-sm text-[var(--color-text-muted)]">Nenhuma captação agendada</p>
            </div>
          ) : (
            <div className="space-y-3">
              {upcomingCaptacoes.map(c => <CaptacaoRow key={c.id} c={c} clientMap={clientMap} memberMap={memberMap} syncing={syncingId === c.id} calendarOk={!!calendarOk} onSync={() => enviarPraGoogle(c)} onDelete={() => deleteCapt(c.id)} onStatus={s => updateStatus(c.id, s)} />)}

              {pastCaptacoes.length > 0 && (
                <>
                  <p className="text-xs font-semibold text-[var(--color-text-faint)] uppercase tracking-widest pt-4 pb-1">Realizadas</p>
                  {pastCaptacoes.map(c => <CaptacaoRow key={c.id} c={c} clientMap={clientMap} memberMap={memberMap} syncing={false} calendarOk={false} onSync={() => {}} onDelete={() => deleteCapt(c.id)} onStatus={s => updateStatus(c.id, s)} />)}
                </>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ── Modal: nova entrada de agenda ────────────────────────────────────── */}
      {entryModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={() => { setEntryModal(null); setEditingEntry(null) }}>
          <div className="bg-[var(--color-bg-card)] rounded-2xl border border-[var(--color-border)] p-6 w-full max-w-sm animate-scale-in" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-5">
              <p className="font-semibold text-[var(--color-text-primary)]">{editingEntry ? 'Editar' : 'Adicionar'} — {DAYS[entryModal.dayIndex]}</p>
              <button onClick={() => { setEntryModal(null); setEditingEntry(null) }} className="w-7 h-7 rounded-lg hover:bg-[var(--color-bg-subtle)] flex items-center justify-center text-[var(--color-text-muted)]"><X size={14} /></button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="text-xs font-medium text-[var(--color-text-secondary)] mb-1.5 block">Cliente</label>
                <select value={entryClient} onChange={e => setEntryClient(e.target.value)}
                  className="w-full border border-[var(--color-border)] rounded-xl px-3 py-2.5 text-sm text-[var(--color-text-primary)] outline-none focus:border-[var(--color-brand)] bg-[var(--color-bg-card)]">
                  <option value="">Selecione...</option>
                  {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>

              <div>
                <label className="text-xs font-medium text-[var(--color-text-secondary)] mb-1.5 block">Responsáveis (opcional)</label>
                <div className="flex flex-wrap gap-2">
                  {members.map(m => (
                    <button key={m.id} onClick={() => setEntryMembers(prev => prev.includes(m.id) ? prev.filter(x => x !== m.id) : [...prev, m.id])}
                      className={`text-xs px-2.5 py-1 rounded-full border transition-all ${entryMembers.includes(m.id) ? 'bg-[var(--color-brand)] text-[var(--color-brand-fg)] border-transparent' : 'border-[var(--color-border)] text-[var(--color-text-secondary)] hover:border-[var(--color-border-strong)]'}`}>
                      {m.name.split(' ')[0]}
                    </button>
                  ))}
                </div>
                {/* O calendário já sabia disso e o hub não perguntava: marcar
                    captação em cima da folga de alguém só era descoberto depois,
                    na conversa. Aviso, não bloqueio — às vezes a pessoa troca a
                    folga de propósito, e o hub não é quem decide isso. */}
                {(() => {
                  const fora = foraNoDia(captForm.scheduled_date, captForm.team_member_ids)
                  return fora.length > 0 ? (
                    <p className="mt-2 text-[11px] flex items-start gap-1.5" style={{ color: 'var(--ds-warning-text, #b45309)' }}>
                      <AlertTriangle size={12} className="flex-shrink-0 mt-px" />
                      <span>{fora.join(' e ')} {fora.length > 1 ? 'estão' : 'está'} fora nesse dia, segundo o Google Agenda.</span>
                    </p>
                  ) : null
                })()}
              </div>

              <div>
                <label className="text-xs font-medium text-[var(--color-text-secondary)] mb-1.5 block">Observação (opcional)</label>
                <input type="text" value={entryNotes} onChange={e => setEntryNotes(e.target.value)}
                  placeholder="ex: só posts estáticos"
                  className="w-full border border-[var(--color-border)] rounded-xl px-3 py-2 text-sm outline-none focus:border-[var(--color-brand)] text-[var(--color-text-primary)]" />
              </div>
            </div>

            <div className="flex gap-2 mt-6">
              <button onClick={() => { setEntryModal(null); setEditingEntry(null) }} className="flex-1 py-2.5 text-sm border border-[var(--color-border)] rounded-xl text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-subtle)] transition-colors">Cancelar</button>
              <button onClick={editingEntry ? updateEntry : addEntry} disabled={!entryClient || savingEntry}
                className="flex-1 py-2.5 text-sm bg-[var(--color-brand)] text-[var(--color-brand-fg)] rounded-xl font-semibold disabled:opacity-40 hover:opacity-90 transition-opacity">
                {savingEntry ? 'Salvando...' : editingEntry ? 'Salvar' : 'Adicionar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal: nova captação ──────────────────────────────────────────────── */}
      {captModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={() => setCaptModal(false)}>
          <div className="bg-[var(--color-bg-card)] rounded-2xl border border-[var(--color-border)] p-6 w-full max-w-md animate-scale-in" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-5">
              <p className="font-semibold text-[var(--color-text-primary)]">Nova captação</p>
              <button onClick={() => setCaptModal(false)} className="w-7 h-7 rounded-lg hover:bg-[var(--color-bg-subtle)] flex items-center justify-center text-[var(--color-text-muted)]"><X size={14} /></button>
            </div>

            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-[var(--color-text-secondary)] mb-1.5 block">Cliente <span className="text-[var(--color-text-faint)]">(opcional)</span></label>
                  <select value={captForm.client_id} onChange={e => setCaptForm(f => ({ ...f, client_id: e.target.value }))}
                    className="w-full border border-[var(--color-border)] rounded-xl px-3 py-2.5 text-sm text-[var(--color-text-primary)] outline-none focus:border-[var(--color-brand)] bg-[var(--color-bg-card)]">
                    <option value="">Sem cliente</option>
                    {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs font-medium text-[var(--color-text-secondary)] mb-1.5 block">Data</label>
                  <input type="date" value={captForm.scheduled_date} onChange={e => setCaptForm(f => ({ ...f, scheduled_date: e.target.value }))}
                    className="w-full border border-[var(--color-border)] rounded-xl px-3 py-2.5 text-sm outline-none focus:border-[var(--color-brand)] text-[var(--color-text-primary)]" />
                </div>
              </div>
              {!captForm.client_id && (
                <div>
                  <label className="text-xs font-medium text-[var(--color-text-secondary)] mb-1.5 block">O que é essa captação?</label>
                  <input type="text" value={captForm.notes} onChange={e => setCaptForm(f => ({ ...f, notes: e.target.value }))}
                    placeholder="ex: Sessão para evento, teste de produto..."
                    className="w-full border border-[var(--color-border)] rounded-xl px-3 py-2 text-sm outline-none focus:border-[var(--color-brand)] text-[var(--color-text-primary)]" />
                </div>
              )}

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="text-xs font-medium text-[var(--color-text-secondary)] mb-1.5 block">Horário</label>
                  <input type="time" value={captForm.scheduled_time} onChange={e => setCaptForm(f => ({ ...f, scheduled_time: e.target.value }))}
                    className="w-full border border-[var(--color-border)] rounded-xl px-3 py-2.5 text-sm outline-none focus:border-[var(--color-brand)] text-[var(--color-text-primary)]" />
                </div>
                <div>
                  <label className="text-xs font-medium text-[var(--color-text-secondary)] mb-1.5 block">Duração (min)</label>
                  <input type="number" value={captForm.duration_minutes} onChange={e => setCaptForm(f => ({ ...f, duration_minutes: Number(e.target.value) }))}
                    className="w-full border border-[var(--color-border)] rounded-xl px-3 py-2.5 text-sm outline-none focus:border-[var(--color-brand)] text-[var(--color-text-primary)]" />
                </div>
                <div>
                  <label className="text-xs font-medium text-[var(--color-text-secondary)] mb-1.5 block">Meses cobertos</label>
                  <input type="number" min={1} max={3} value={captForm.months_covered} onChange={e => setCaptForm(f => ({ ...f, months_covered: Number(e.target.value) }))}
                    className="w-full border border-[var(--color-border)] rounded-xl px-3 py-2.5 text-sm outline-none focus:border-[var(--color-brand)] text-[var(--color-text-primary)]" />
                </div>
              </div>

              <div>
                <label className="text-xs font-medium text-[var(--color-text-secondary)] mb-1.5 block">Equipe</label>
                <div className="flex flex-wrap gap-2">
                  {members.map(m => (
                    <button key={m.id} onClick={() => setCaptForm(f => ({ ...f, team_member_ids: f.team_member_ids.includes(m.id) ? f.team_member_ids.filter(x => x !== m.id) : [...f.team_member_ids, m.id] }))}
                      className={`text-xs px-2.5 py-1 rounded-full border transition-all ${captForm.team_member_ids.includes(m.id) ? 'bg-[var(--color-brand)] text-[var(--color-brand-fg)] border-transparent' : 'border-[var(--color-border)] text-[var(--color-text-secondary)] hover:border-[var(--color-border-strong)]'}`}>
                      {m.name.split(' ')[0]}
                    </button>
                  ))}
                </div>
                {/* Mesmo aviso da captação, aqui pra quem faz a criação: marcar
                    um designer num dia em que ele está fora é o mesmo erro, só
                    que na outra ponta. */}
                {(() => {
                  const dia = entryModal ? toLocalISO(dayDates[entryModal.dayIndex])
                            : editingEntry ? dataDaCriacao(editingEntry.week_start, editingEntry.day_of_week) : ''
                  const fora = dia ? foraNoDia(dia, entryMembers) : []
                  return fora.length > 0 ? (
                    <p className="mt-2 text-[11px] flex items-start gap-1.5" style={{ color: 'var(--ds-warning-text, #b45309)' }}>
                      <AlertTriangle size={12} className="flex-shrink-0 mt-px" />
                      <span>{fora.join(' e ')} {fora.length > 1 ? 'estão' : 'está'} fora nesse dia, segundo o Google Agenda.</span>
                    </p>
                  ) : null
                })()}
              </div>

              <div>
                <label className="text-xs font-medium text-[var(--color-text-secondary)] mb-1.5 block">Observações</label>
                <textarea value={captForm.notes} onChange={e => setCaptForm(f => ({ ...f, notes: e.target.value }))}
                  rows={2} placeholder="Local, instruções, detalhes..."
                  className="w-full border border-[var(--color-border)] rounded-xl px-3 py-2 text-sm outline-none focus:border-[var(--color-brand)] text-[var(--color-text-primary)] resize-none" />
              </div>
            </div>

            <div className="flex gap-2 mt-6">
              <button onClick={() => setCaptModal(false)} className="flex-1 py-2.5 text-sm border border-[var(--color-border)] rounded-xl text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-subtle)] transition-colors">Cancelar</button>
              <button onClick={saveCapt} disabled={!captForm.scheduled_date || savingCapt}
                className="flex-1 py-2.5 text-sm bg-[var(--color-brand)] text-[var(--color-brand-fg)] rounded-xl font-semibold disabled:opacity-40 hover:opacity-90 transition-opacity">
                {savingCapt ? 'Salvando...' : 'Agendar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function CaptacaoRow({ c, clientMap, memberMap, syncing, calendarOk, onSync, onDelete, onStatus }: {
  c: Captacao; clientMap: Record<string, Client>; memberMap: Record<string, Member>
  syncing: boolean; calendarOk: boolean
  onSync: () => void; onDelete: () => void; onStatus: (s: string) => void
}) {
  const client  = c.client_id ? clientMap[c.client_id] : null
  const label   = client?.name || c.notes?.split('\n')[0] || 'Captação avulsa'
  const members = (c.team_member_ids || []).map(mid => memberMap[mid]).filter(Boolean)
  const date    = new Date(c.scheduled_date + 'T12:00:00')
  const [menuOpen, setMenuOpen] = useState(false)

  return (
    <div className={`bg-[var(--color-bg-card)] border border-[var(--color-border)] rounded-2xl p-4 flex flex-wrap items-center gap-x-4 gap-y-2 ${c.status === 'cancelada' ? 'opacity-50' : ''}`}>
      {/* Date box */}
      <div className="w-12 h-12 rounded-xl bg-[var(--color-bg-page)] border border-[var(--color-border)] flex flex-col items-center justify-center flex-shrink-0">
        <span className="text-sm font-bold text-[var(--color-text-primary)] leading-none">{date.getDate()}</span>
        <span className="text-[9px] text-[var(--color-text-muted)] leading-none mt-0.5">
          {date.toLocaleDateString('pt-BR', { month: 'short' }).replace('.', '')}
        </span>
      </div>

      {/* Client / label */}
      <div className="flex items-center gap-2 min-w-[140px]">
        {client
          ? <div className="w-7 h-7 rounded-lg flex items-center justify-center text-white text-[10px] font-bold flex-shrink-0 overflow-hidden" style={{ background: client.color_hex }}>{client.logo_url ? <img src={client.logo_url} alt={client.name} className="w-full h-full object-cover" /> : getInitials(client.name)}</div>
          : <div className="w-7 h-7 rounded-lg flex items-center justify-center text-[var(--color-text-muted)] bg-[var(--color-bg-subtle)] flex-shrink-0"><Camera size={12} /></div>
        }
        <span className="text-sm font-semibold text-[var(--color-text-primary)] truncate">{label}</span>
      </div>

      {/* Time + duration */}
      {c.scheduled_time && (
        <span className="text-xs text-[var(--color-text-muted)] tabular-nums flex-shrink-0">
          {c.scheduled_time.slice(0, 5)} · {c.duration_minutes}min
        </span>
      )}

      {/* Team */}
      {members.length > 0 && (
        <div className="flex items-center gap-1 flex-wrap flex-1">
          {members.map(m => (
            <span key={m!.id} className="text-[10px] px-2 py-0.5 rounded-full bg-[var(--color-bg-subtle)] text-[var(--color-text-secondary)] font-medium">
              {m!.name.split(' ')[0]}
            </span>
          ))}
        </div>
      )}

      <div className="ml-auto flex items-center gap-2 flex-shrink-0">
        {/* Months covered */}
        {c.months_covered > 1 && (
          <span className="text-[10px] px-2 py-0.5 rounded-full font-semibold border" style={{ background: 'var(--ds-purple-bg)', color: 'var(--ds-purple-text)', borderColor: 'var(--ds-purple-border)' }}>
            {c.months_covered} meses
          </span>
        )}

        {/* Status badge */}
        <div className="relative">
          <button onClick={() => setMenuOpen(v => !v)}
            className={`text-xs font-semibold px-2.5 py-1 rounded-full border cursor-pointer hover:opacity-80 transition-opacity ${STATUS_COLOR[c.status] || STATUS_COLOR.agendada}`}>
            {STATUS_LABEL[c.status] || c.status}
          </button>
          {menuOpen && (
            <div className="absolute right-0 top-full mt-1 bg-[var(--color-bg-card)] border border-[var(--color-border)] rounded-xl shadow-lg z-10 overflow-hidden"
              onBlur={() => setMenuOpen(false)}>
              {['agendada', 'realizada', 'cancelada'].map(s => (
                <button key={s} onClick={() => { onStatus(s); setMenuOpen(false) }}
                  className="w-full flex items-center gap-2 px-4 py-2 text-xs text-[var(--color-text-primary)] hover:bg-[var(--color-bg-subtle)] text-left">
                  {c.status === s && <Check size={10} />}
                  {STATUS_LABEL[s]}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Google Calendar. O envio agora é automático, então este botão é
            indicador, não gatilho — mas continua clicável de propósito: se a
            nota ou a equipe mudou depois de criada, ou se o envio falhou, dá
            pra reenviar sem apagar e refazer a captação. */}
        {calendarOk && c.status !== 'cancelada' && (
          <button onClick={onSync} disabled={syncing} title={c.google_calendar_event_id ? 'No Google Agenda — clique pra reenviar' : 'Enviar ao Google Agenda'}
            className={`w-8 h-8 rounded-xl flex items-center justify-center transition-all ${c.google_calendar_event_id ? 'bg-[var(--ds-success-bg)]' : 'text-[var(--color-text-muted)] hover:bg-[var(--color-bg-subtle)]'}`} style={c.google_calendar_event_id ? { color: 'var(--ds-success-text)' } : {}}>
            {syncing ? <Loader2 size={14} className="animate-spin" /> : c.google_calendar_event_id ? <Check size={14} /> : <CalendarPlus size={14} />}
          </button>
        )}

        {/* Delete */}
        <button onClick={onDelete}
          className="w-8 h-8 rounded-xl flex items-center justify-center text-[var(--color-text-faint)] transition-all" onMouseEnter={e => { e.currentTarget.style.color = 'var(--ds-error-text)'; e.currentTarget.style.background = 'var(--ds-error-bg)' }} onMouseLeave={e => { e.currentTarget.style.color = ''; e.currentTarget.style.background = '' }}>
          <X size={14} />
        </button>
      </div>
    </div>
  )
}
