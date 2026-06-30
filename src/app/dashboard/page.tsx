'use client'

import { useEffect, useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import { useUser } from '@/lib/UserContext'
import { ArrowRight, AlertTriangle, Clock, Calendar, CalendarHeart, ChevronRight, ChevronDown, Zap, CheckCircle2, Camera, CheckSquare } from 'lucide-react'

// ─── CFG — nomes de colunas/tabelas Supabase (corrigir aqui se mudar) ───────
const CFG = {
  t: {
    clients:      'clients',
    schedules:    'schedules',
    specialDates: 'special_dates',
  },
  S: {
    producao:            'producao',
    revisaoInterna:      'revisao_interna',
    aguardandoAprovacao: 'aguardando_aprovacao',
    aprovado:            'aprovado',
    agendado:            'agendado',
    publicado:           'publicado',
  },
  A: {
    pendente:    'pendente',
    aprovado:    'aprovado',
    naoAprovado: 'não aprovado',
  },
}

const STATUS_LABEL: Record<string, string> = {
  producao:            'Produção',
  revisao_interna:     'Revisão interna',
  aguardando_aprovacao:'Aguardando aprovação',
  aprovado:            'Aprovado',
  agendado:            'Agendado',
  publicado:           'Publicado',
}

const STATUS_COLOR: Record<string, string> = {
  producao:            'bg-yellow-50 text-yellow-700',
  revisao_interna:     'bg-purple-50 text-purple-600',
  aguardando_aprovacao:'bg-blue-50 text-blue-600',
  aprovado:            'bg-blue-50 text-blue-600',
  agendado:            'bg-green-50 text-green-600',
  publicado:           'bg-green-50 text-green-700',
}

const MONTHS    = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro']
const DAYS      = ['Domingo','Segunda','Terça','Quarta','Quinta','Sexta','Sábado']
const TYPE_SHORT: Record<string, string> = {
  reels: 'Reel', carrossel: 'Carrossel', post: 'Post', story: 'Story', carrossel_stories: 'Crsl/Story',
}

const PRODUCTION_LEAD_DAYS = 14

type Client   = { id: string; name: string; color_hex: string }
type Schedule = {
  id: string; client_id: string; title: string
  status: string; approval_status: string; post_type: string
  scheduled_date: string | null; funil: string | null
  month: number; year: number
}
type SpecialDate = { id: string; name: string; date: string }
type Captacao    = { id: string; client_id: string; scheduled_date: string; status: string; months_covered: number }
type ClientTeamRow = { client_id: string; member_id: string; funcao: string }

// Quais tipos de post cada função cobre. null = cobre todos os tipos do cliente.
const FUNCAO_POST_TYPES: Record<string, string[] | null> = {
  videos: ['reels'],
  posts:  ['carrossel', 'story', 'carrossel_stories', 'post'],
}

function getInitials(name: string) {
  return name.split(' ').slice(0, 2).map((w: string) => w[0]).join('').toUpperCase()
}

function getDayGreeting() {
  const h = new Date().getHours()
  if (h < 12) return 'Bom dia'
  if (h < 18) return 'Boa tarde'
  return 'Boa noite'
}

function daysBetween(a: Date, b: Date) {
  return Math.ceil((b.getTime() - a.getTime()) / (1000 * 60 * 60 * 24))
}

export default function DashboardPage() {
  const router    = useRouter()
  const supabase  = createClient()
  const { currentMember } = useUser()

  const [clients,        setClients]        = useState<Client[]>([])
  const [schedules,      setSchedules]      = useState<Schedule[]>([])
  const [specialDates,   setSpecialDates]   = useState<SpecialDate[]>([])
  const [captacoes,      setCaptacoes]      = useState<Captacao[]>([])
  const [clientTeam,     setClientTeam]     = useState<ClientTeamRow[]>([])
  const [myExtras,       setMyExtras]       = useState<any[]>([])
  const [loading,        setLoading]        = useState(true)
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set())

  function toggleGroup(key: string) {
    setExpandedGroups(prev => {
      const next = new Set(prev)
      next.has(key) ? next.delete(key) : next.add(key)
      return next
    })
  }

  const now      = new Date()
  const month    = now.getMonth() + 1
  const year     = now.getFullYear()
  const todayStr = now.toISOString().split('T')[0]
  const in7Str   = new Date(now.getTime() +   7 * 86400000).toISOString().split('T')[0]
  const in120Str = new Date(now.getTime() + 120 * 86400000).toISOString().split('T')[0]

  useEffect(() => {
    async function load() {
      const in90Str = new Date(now.getTime() + 90 * 86400000).toISOString().split('T')[0]
      const ago45Str = new Date(now.getTime() - 45 * 86400000).toISOString().split('T')[0]
      const [{ data: cls }, { data: sch }, { data: sd }, { data: cap }, { data: ct }] = await Promise.all([
        supabase.from(CFG.t.clients)
          .select('id, name, color_hex')
          .eq('status', 'active')
          .order('name'),
        supabase.from(CFG.t.schedules)
          .select('id, client_id, title, status, approval_status, post_type, scheduled_date, funil, month, year')
          .eq('month', month)
          .eq('year', year),
        supabase.from(CFG.t.specialDates)
          .select('id, name, date')
          .gte('date', todayStr)
          .lte('date', in120Str)
          .order('date'),
        supabase.from('captacoes')
          .select('id, client_id, scheduled_date, status, months_covered')
          .gte('scheduled_date', ago45Str)
          .lte('scheduled_date', in90Str)
          .order('scheduled_date'),
        supabase.from('client_team')
          .select('client_id, member_id, funcao'),
      ])
      setClients(cls || [])
      setSchedules(sch || [])
      setSpecialDates(sd || [])
      setCaptacoes(cap || [])
      setClientTeam(ct || [])
      setLoading(false)
    }
    load()
  }, [])

  useEffect(() => {
    if (!currentMember?.id) return
    supabase
      .from('extras')
      .select('id, title, type, status, priority, client_id, due_date')
      .neq('status', 'done')
      .contains('assigned_members', [currentMember.id])
      .order('due_date', { ascending: true, nullsFirst: false })
      .then(({ data }) => { if (data) setMyExtras(data) })
  }, [currentMember?.id])

  // ── Computed ─────────────────────────────────────────────────────────────
  const clientMap = useMemo(() => {
    const m: Record<string, Client> = {}
    clients.forEach(c => { m[c.id] = c })
    return m
  }, [clients])

  // Posts atrasados: data vencida e não publicado/agendado
  const delayed = useMemo(() =>
    schedules.filter(s =>
      s.scheduled_date &&
      s.scheduled_date < todayStr &&
      ![CFG.S.publicado, CFG.S.agendado].includes(s.status)
    ), [schedules, todayStr])

  // Alterações solicitadas pelo cliente
  const rejected = useMemo(() =>
    schedules.filter(s => s.approval_status === CFG.A.naoAprovado),
  [schedules])

  // Clientes sem Reels no mês
  const clientsWithReels = useMemo(() =>
    new Set(schedules.filter(s => s.post_type === 'reels').map(s => s.client_id)),
  [schedules])

  // Datas comemorativas urgentes (dentro da janela de produção)
  const urgentDates = useMemo(() =>
    specialDates.filter(sd => {
      const diff = daysBetween(now, new Date(sd.date + 'T12:00:00'))
      return diff <= PRODUCTION_LEAD_DAYS
    }),
  [specialDates])

  // Timeline: posts agendados nos próximos 7 dias
  const upcoming7 = useMemo(() =>
    schedules
      .filter(s => s.scheduled_date && s.scheduled_date >= todayStr && s.scheduled_date <= in7Str)
      .sort((a, b) => (a.scheduled_date || '').localeCompare(b.scheduled_date || '')),
  [schedules, todayStr, in7Str])

  // Atribuições do membro atual: em quais clientes e funções ele atua
  const myAssignments = useMemo(() =>
    clientTeam.filter(t => t.member_id === currentMember?.id),
  [clientTeam, currentMember])
  const hasAssignments = myAssignments.length > 0

  function isMine(s: Schedule) {
    return myAssignments.some(a => {
      if (a.client_id !== s.client_id) return false
      const types = FUNCAO_POST_TYPES[a.funcao]
      return types ? types.includes(s.post_type) : true
    })
  }

  // Viés por função (fallback para quem ainda não tem atribuição em client_team)
  const roleStr = (currentMember?.role || '').toLowerCase()
  const isProducer   = ['video', 'post', 'foto', 'editor', 'design'].some(r => roleStr.includes(r))
  const isStrategist = ['estrategia', 'social'].some(r => roleStr.includes(r))

  // Fila de produção (para produtores/designers)
  const productionQueue = useMemo(() =>
    schedules
      .filter(s => [CFG.S.producao, CFG.S.revisaoInterna].includes(s.status))
      .sort((a, b) => {
        if (a.scheduled_date && !b.scheduled_date) return -1
        if (!a.scheduled_date && b.scheduled_date) return 1
        return (a.scheduled_date || '').localeCompare(b.scheduled_date || '')
      }),
  [schedules])

  // Posts aguardando aprovação (para estrategistas)
  const pendingApproval = useMemo(() =>
    schedules.filter(s => s.status === CFG.S.aguardandoAprovacao),
  [schedules])

  // ── Minhas tarefas — filtradas por atribuição em client_team ────────────
  const myRejected = useMemo(() => hasAssignments ? rejected.filter(isMine) : [], [rejected, myAssignments, hasAssignments])
  const myProductionQueue = useMemo(() => hasAssignments ? productionQueue.filter(isMine) : [], [productionQueue, myAssignments, hasAssignments])
  const myPendingApproval = useMemo(() => hasAssignments ? pendingApproval.filter(isMine) : [], [pendingApproval, myAssignments, hasAssignments])

  // Métricas
  const total      = schedules.length
  const published  = schedules.filter(s => s.status === CFG.S.publicado).length
  const approved   = schedules.filter(s => s.approval_status === CFG.A.aprovado).length
  const inProd     = schedules.filter(s => s.status === CFG.S.producao).length
  const withClient = schedules.filter(s => s.status === CFG.S.aguardandoAprovacao).length
  const notOk      = rejected.length

  const metrics = [
    { label: 'Posts no mês',    value: total,      color: 'var(--color-text-primary)' },
    { label: 'Publicados',      value: published,  color: '#16a34a' },
    { label: 'Aprovados',       value: approved,   color: '#2563eb' },
    { label: 'Em produção',     value: inProd,     color: '#d97706' },
    { label: 'Com cliente',     value: withClient, color: '#7c3aed' },
    { label: 'Precisam ajuste', value: notOk,      color: notOk > 0 ? '#dc2626' : '#A8A59E' },
  ]

  // ── Alertas de captação ──────────────────────────────────────────────────
  const captacaoAlerts = useMemo(() => {
    const futureCaptacoes  = captacoes.filter(c => c.scheduled_date >= todayStr && c.status === 'agendada')
    const recentCaptacoes  = captacoes.filter(c => c.scheduled_date < todayStr && c.status === 'realizada')
    const clientsWithFuture = new Set(futureCaptacoes.map(c => c.client_id))
    const clientsWithRecent = new Set(recentCaptacoes.map(c => c.client_id))

    const semAgendada: Client[] = []
    const vencida:     Client[] = []
    const postsAcabando: Client[] = []

    clients.forEach(cl => {
      const hasFuture = clientsWithFuture.has(cl.id)
      const hasRecent = clientsWithRecent.has(cl.id)
      if (!hasFuture) semAgendada.push(cl)
      if (!hasFuture && !hasRecent) vencida.push(cl)

      // posts acabando: menos de 5 posts futuros no cronograma deste mês
      const clientPosts = schedules.filter(s =>
        s.client_id === cl.id &&
        !['publicado', 'agendado'].includes(s.status)
      )
      if (clientPosts.length < 3 && schedules.some(s => s.client_id === cl.id)) {
        postsAcabando.push(cl)
      }
    })

    return { semAgendada, vencida, postsAcabando }
  }, [clients, captacoes, schedules, todayStr])

  const hasAlerts = delayed.length > 0 || rejected.length > 0 || urgentDates.length > 0
    || captacaoAlerts.vencida.length > 0 || captacaoAlerts.semAgendada.length > 0 || captacaoAlerts.postsAcabando.length > 0

  if (loading) return (
    <div className="flex items-center justify-center h-full">
      <div className="w-5 h-5 border-2 border-[var(--color-border)] border-t-[#1A1916] rounded-full animate-spin" />
    </div>
  )

  // ── Helpers de UI ────────────────────────────────────────────────────────
  function navigateToPost(s: Schedule) {
    router.push(`/dashboard/clientes/${s.client_id}?post=${s.id}&m=${s.month}&y=${s.year}`)
  }

  function ClientAvatar({ clientId, size = 'sm' }: { clientId: string; size?: 'sm' | 'xs' }) {
    const c = clientMap[clientId]
    if (!c) return null
    const dim = size === 'xs' ? 'w-5 h-5 text-[9px] rounded-md' : 'w-6 h-6 text-[10px] rounded-lg'
    return (
      <div className={`${dim} flex items-center justify-center text-white font-bold flex-shrink-0`} style={{ background: c.color_hex }}>
        {getInitials(c.name)}
      </div>
    )
  }

  function PostPill({ s, accent }: { s: Schedule; accent: string }) {
    return (
      <button
        onClick={() => navigateToPost(s)}
        className={`flex items-center gap-2 bg-[var(--color-bg-card)] border ${accent} rounded-xl px-3 py-2 hover:shadow-sm hover:-translate-y-px transition-all text-left group`}
      >
        <ClientAvatar clientId={s.client_id} size="xs" />
        <span className="text-xs font-medium text-[var(--color-text-primary)] max-w-[150px] truncate">{s.title || 'Sem título'}</span>
        {s.scheduled_date && (
          <span className="text-[10px] text-[var(--color-text-muted)]">
            {new Date(s.scheduled_date + 'T12:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })}
          </span>
        )}
        <ChevronRight size={10} className="text-[var(--color-text-faint)] group-hover:text-[var(--color-text-muted)] transition-colors" />
      </button>
    )
  }

  function PostRow({ s, rank }: { s: Schedule; rank?: number }) {
    const client = clientMap[s.client_id]
    return (
      <button
        onClick={() => navigateToPost(s)}
        className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-[var(--color-bg-page)] transition-colors text-left group"
      >
        {rank !== undefined && <span className="text-xs font-bold text-[var(--color-text-faint)] w-4 tabular-nums flex-shrink-0">{rank}</span>}
        <ClientAvatar clientId={s.client_id} />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-[var(--color-text-primary)] truncate">{s.title || 'Sem título'}</p>
          <p className="text-xs text-[var(--color-text-muted)] truncate">
            {client?.name}{s.scheduled_date ? ` · ${new Date(s.scheduled_date + 'T12:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })}` : ''}
          </p>
        </div>
        <span className={`text-[10px] font-semibold px-2 py-1 rounded-lg flex-shrink-0 ${STATUS_COLOR[s.status] || 'bg-[var(--color-bg-page)] text-[var(--color-text-secondary)]'}`}>
          {STATUS_LABEL[s.status] || s.status}
        </span>
        <ChevronRight size={12} className="text-[var(--color-text-faint)] group-hover:text-[var(--color-text-muted)] flex-shrink-0" />
      </button>
    )
  }

  function renderClientGroup(clientId: string, posts: Schedule[], sectionKey: string) {
    const groupKey = `${sectionKey}:${clientId}`
    const isExpanded = expandedGroups.has(groupKey)
    const client = clientMap[clientId]
    const byType = posts.reduce((acc, p) => {
      const t = TYPE_SHORT[p.post_type] || p.post_type
      acc[t] = (acc[t] || 0) + 1
      return acc
    }, {} as Record<string, number>)
    const summary = Object.entries(byType).map(([t, n]) => `${n}× ${t}`).join(', ')
    return (
      <div key={groupKey}>
        <button
          onClick={() => toggleGroup(groupKey)}
          className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-[var(--color-bg-page)] transition-colors text-left group"
        >
          <ClientAvatar clientId={clientId} />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-[var(--color-text-primary)] truncate">{client?.name}</p>
            <p className="text-xs text-[var(--color-text-muted)] truncate">{summary}</p>
          </div>
          <span className="text-[10px] font-semibold px-2 py-1 rounded-lg bg-[var(--color-bg-page)] text-[var(--color-text-secondary)] flex-shrink-0">
            {posts.length} post{posts.length !== 1 ? 's' : ''}
          </span>
          {isExpanded
            ? <ChevronDown size={12} className="text-[var(--color-text-muted)] flex-shrink-0" />
            : <ChevronRight size={12} className="text-[var(--color-text-faint)] group-hover:text-[var(--color-text-muted)] flex-shrink-0" />
          }
        </button>
        {isExpanded && (
          <div className="ml-9 pl-3 border-l border-[var(--color-border)] flex flex-col mb-1">
            {posts.map((s, i) => <PostRow key={s.id} s={s} rank={i + 1} />)}
            <button
              onClick={() => router.push(`/dashboard/clientes/${clientId}`)}
              className="text-xs text-[var(--color-text-muted)] hover:text-[var(--color-brand)] px-3 py-1.5 transition-colors text-left"
            >
              Abrir cliente →
            </button>
          </div>
        )}
      </div>
    )
  }

  function renderSmartList(posts: Schedule[], sectionKey: string, threshold = 3) {
    if (posts.length <= threshold) {
      return posts.map((s, i) => <PostRow key={s.id} s={s} rank={i + 1} />)
    }
    const groups: Record<string, Schedule[]> = {}
    for (const s of posts) {
      if (!groups[s.client_id]) groups[s.client_id] = []
      groups[s.client_id].push(s)
    }
    return Object.entries(groups).map(([cid, cp]) => renderClientGroup(cid, cp, sectionKey))
  }

  const semAgendadaOnly = captacaoAlerts.semAgendada.filter(cl => !captacaoAlerts.vencida.some(v => v.id === cl.id))

  return (
    <div className="min-h-screen bg-[var(--color-bg-page)]">
      <div className="max-w-7xl mx-auto px-8 py-8 space-y-6">

        {/* ── Header + Métricas ──────────────────────────────────────────── */}
        <div className="grid grid-cols-2 gap-5">
          <div>
            <p className="text-xs text-[var(--color-text-muted)] mb-1">
              {DAYS[now.getDay()]}, {now.getDate()} de {MONTHS[now.getMonth()]} {year}
            </p>
            <h1 className="text-3xl font-bold text-[var(--color-text-primary)] tracking-tight">
              {getDayGreeting()}{currentMember ? `, ${currentMember.name.split(' ')[0]}` : ''} 👋
            </h1>
          </div>
          <div className="flex items-center justify-end gap-2">
            {metrics.map(m => (
              <div key={m.label} className="bg-[var(--color-bg-card)] border border-[var(--color-border)] rounded-xl px-4 py-2.5 text-center min-w-[72px]">
                <p className="text-2xl font-bold leading-none" style={{ color: m.color }}>{m.value}</p>
                <p className="text-[10px] text-[var(--color-text-muted)] mt-1 leading-tight">{m.label}</p>
              </div>
            ))}
          </div>
        </div>

        {/* ── Grid dinâmico (masonry 2 colunas) ─────────────────────────── */}
        <div className="columns-2 gap-5">

            {/* Para você */}
            {currentMember && (hasAssignments || myExtras.length > 0) && (myRejected.length > 0 || myProductionQueue.length > 0 || myPendingApproval.length > 0 || myExtras.length > 0) && (
              <div className="break-inside-avoid mb-5 bg-[var(--color-bg-card)] rounded-2xl border border-[var(--color-border)] overflow-hidden">
                <div className="px-5 py-4 border-b border-[var(--color-border)] flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-[var(--color-brand)]" />
                  <p className="text-xs font-bold text-[var(--color-text-primary)] uppercase tracking-wider">Para você, {currentMember.name.split(' ')[0]}</p>
                </div>

                {myRejected.length > 0 && (
                  <div className="px-5 py-3 border-b border-[var(--color-border)]">
                    <p className="text-[10px] font-semibold text-orange-500 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                      <AlertTriangle size={10} /> {myRejected.length} precisam de ajuste
                    </p>
                    <div className="space-y-0.5">
                      {renderSmartList(myRejected, 'rejected')}
                    </div>
                  </div>
                )}

                {myProductionQueue.length > 0 && (
                  <div className="px-5 py-3 border-b border-[var(--color-border)]">
                    <p className="text-[10px] font-semibold uppercase tracking-wider mb-2 flex items-center gap-1.5" style={{ color: 'var(--ds-caution-accent)' }}>
                      <Zap size={10} /> {myProductionQueue.length} em produção
                    </p>
                    <div className="space-y-0.5">
                      {renderSmartList(myProductionQueue, 'my-prod')}
                    </div>
                  </div>
                )}

                {myPendingApproval.length > 0 && (
                  <div className={`px-5 py-3 ${myExtras.length > 0 ? 'border-b border-[var(--color-border)]' : ''}`}>
                    <p className="text-[10px] font-semibold uppercase tracking-wider mb-2 flex items-center gap-1.5" style={{ color: 'var(--ds-info-accent)' }}>
                      <CheckCircle2 size={10} /> {myPendingApproval.length} com cliente
                    </p>
                    <div className="space-y-0.5">
                      {renderSmartList(myPendingApproval, 'my-approval')}
                    </div>
                  </div>
                )}

                {myExtras.length > 0 && (
                  <div className="px-5 py-3">
                    <p className="text-[10px] font-semibold uppercase tracking-wider mb-2 flex items-center gap-1.5" style={{ color: 'var(--ds-purple-accent)' }}>
                      <CheckSquare size={10} /> {myExtras.length} tarefa{myExtras.length !== 1 ? 's' : ''} pendente{myExtras.length !== 1 ? 's' : ''}
                    </p>
                    <div className="space-y-0.5">
                      {myExtras.map(e => {
                        const clientInfo = clientMap[e.client_id]
                        const overdue = e.due_date && new Date(e.due_date + 'T23:59:59') < now
                        return (
                          <button
                            key={e.id}
                            onClick={() => e.client_id ? router.push(`/dashboard/clientes/${e.client_id}?tab=extras`) : router.push('/dashboard/kanban?tab=extras')}
                            className="w-full flex items-center gap-3 px-3 py-2 rounded-xl hover:bg-[var(--color-bg-page)] transition-colors text-left group"
                          >
                            <div className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: e.priority === 'high' ? '#ef4444' : e.priority === 'low' ? '#94a3b8' : '#6b7280' }} />
                            <span className="flex-1 text-sm text-[var(--color-text-primary)] truncate">{e.title}</span>
                            {clientInfo && (
                              <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full text-white flex-shrink-0" style={{ background: clientInfo.color_hex }}>{clientInfo.name}</span>
                            )}
                            {e.due_date && (
                              <span className="text-[10px] flex-shrink-0" style={{ color: overdue ? 'var(--ds-error-text)' : 'var(--color-text-muted)' }}>
                                {overdue ? '⚠ ' : ''}{new Date(e.due_date + 'T12:00:00').toLocaleDateString('pt-BR', { day: 'numeric', month: 'short' })}
                              </span>
                            )}
                          </button>
                        )
                      })}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Fallback fila de produção */}
            {!hasAssignments && isProducer && productionQueue.length > 0 && (
              <div className="break-inside-avoid mb-5 bg-[var(--color-bg-card)] rounded-2xl border border-[var(--color-border)] overflow-hidden">
                <div className="px-5 py-4 border-b border-[var(--color-border)] flex items-center gap-2">
                  <Zap size={13} style={{ color: 'var(--ds-caution-accent)' }} />
                  <p className="text-xs font-bold text-[var(--color-text-primary)] uppercase tracking-wider">Fila de produção</p>
                  <span className="ml-auto text-xs text-[var(--color-text-muted)]">{productionQueue.length} posts</span>
                </div>
                <div className="p-2 space-y-0.5">
                  {renderSmartList(productionQueue, 'prod')}
                </div>
              </div>
            )}

            {/* Fallback aguardando aprovação */}
            {!hasAssignments && isStrategist && pendingApproval.length > 0 && (
              <div className="break-inside-avoid mb-5 bg-[var(--color-bg-card)] rounded-2xl border border-[var(--color-border)] overflow-hidden">
                <div className="px-5 py-4 border-b border-[var(--color-border)] flex items-center gap-2">
                  <CheckCircle2 size={13} style={{ color: 'var(--ds-info-accent)' }} />
                  <p className="text-xs font-bold text-[var(--color-text-primary)] uppercase tracking-wider">Aguardando aprovação</p>
                  <span className="ml-auto text-xs text-[var(--color-text-muted)]">{pendingApproval.length} posts</span>
                </div>
                <div className="p-2 space-y-0.5">
                  {renderSmartList(pendingApproval, 'approval')}
                </div>
              </div>
            )}

            {/* Alertas compactos */}
            {hasAlerts && (
              <div className="break-inside-avoid mb-5 bg-[var(--color-bg-card)] rounded-2xl border border-[var(--color-border)] overflow-hidden">
                <div className="px-4 py-3.5 border-b border-[var(--color-border)]">
                  <p className="text-xs font-bold text-[var(--color-text-primary)] uppercase tracking-wider">Atenção</p>
                </div>
                <div className="divide-y divide-[var(--color-border)]">
                  {delayed.length > 0 && (
                    <button onClick={() => router.push('/dashboard/cronograma')} className="w-full flex items-center gap-3 px-4 py-3 hover:bg-[var(--color-bg-subtle)] transition-colors text-left">
                      <div className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: 'var(--ds-error-bg)' }}><Clock size={13} style={{ color: 'var(--ds-error-accent)' }} /></div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-semibold text-[var(--color-text-primary)]">{delayed.length} post{delayed.length !== 1 ? 's' : ''} vencido{delayed.length !== 1 ? 's' : ''}</p>
                        <p className="text-[10px] text-[var(--color-text-muted)]">Data passou, não publicado</p>
                      </div>
                      <ChevronRight size={11} className="text-[var(--color-text-faint)] flex-shrink-0" />
                    </button>
                  )}
                  {rejected.length > 0 && (
                    <button onClick={() => router.push('/dashboard/aprovacao')} className="w-full flex items-center gap-3 px-4 py-3 hover:bg-[var(--color-bg-subtle)] transition-colors text-left">
                      <div className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: 'var(--ds-warn-bg)' }}><AlertTriangle size={13} style={{ color: 'var(--ds-warn-accent)' }} /></div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-semibold text-[var(--color-text-primary)]">{rejected.length} alteraç{rejected.length !== 1 ? 'ões' : 'ão'} solicitada{rejected.length !== 1 ? 's' : ''}</p>
                        <p className="text-[10px] text-[var(--color-text-muted)]">Cliente pediu revisão</p>
                      </div>
                      <ChevronRight size={11} className="text-[var(--color-text-faint)] flex-shrink-0" />
                    </button>
                  )}
                  {captacaoAlerts.vencida.length > 0 && (
                    <button onClick={() => router.push('/dashboard/agenda')} className="w-full flex items-center gap-3 px-4 py-3 hover:bg-[var(--color-bg-subtle)] transition-colors text-left">
                      <div className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: 'var(--ds-error-bg)' }}><Camera size={13} style={{ color: 'var(--ds-error-accent)' }} /></div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-semibold text-[var(--color-text-primary)]">{captacaoAlerts.vencida.length} sem captação</p>
                        <p className="text-[10px] text-[var(--color-text-muted)]">Sem captação recente ou futura</p>
                      </div>
                      <ChevronRight size={11} className="text-[var(--color-text-faint)] flex-shrink-0" />
                    </button>
                  )}
                  {semAgendadaOnly.length > 0 && (
                    <button onClick={() => router.push('/dashboard/agenda')} className="w-full flex items-center gap-3 px-4 py-3 hover:bg-[var(--color-bg-subtle)] transition-colors text-left">
                      <div className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: 'var(--ds-purple-bg)' }}><Camera size={13} style={{ color: 'var(--ds-purple-accent)' }} /></div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-semibold text-[var(--color-text-primary)]">{semAgendadaOnly.length} sem captação futura</p>
                        <p className="text-[10px] text-[var(--color-text-muted)]">Nenhuma captação agendada</p>
                      </div>
                      <ChevronRight size={11} className="text-[var(--color-text-faint)] flex-shrink-0" />
                    </button>
                  )}
                  {captacaoAlerts.postsAcabando.length > 0 && (
                    <button onClick={() => router.push('/dashboard/cronograma')} className="w-full flex items-center gap-3 px-4 py-3 hover:bg-[var(--color-bg-subtle)] transition-colors text-left">
                      <div className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: 'var(--ds-caution-bg)' }}><Zap size={13} style={{ color: 'var(--ds-caution-accent)' }} /></div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-semibold text-[var(--color-text-primary)]">{captacaoAlerts.postsAcabando.length} com poucos posts</p>
                        <p className="text-[10px] text-[var(--color-text-muted)]">Menos de 3 em produção</p>
                      </div>
                      <ChevronRight size={11} className="text-[var(--color-text-faint)] flex-shrink-0" />
                    </button>
                  )}
                </div>
              </div>
            )}

            {/* Datas comemorativas */}
            {specialDates.length > 0 && (
              <div className="break-inside-avoid mb-5 bg-[var(--color-bg-card)] rounded-2xl border border-[var(--color-border)] overflow-hidden">
                <div className="px-4 py-3.5 border-b border-[var(--color-border)] flex items-center gap-2">
                  <CalendarHeart size={13} className="text-[var(--color-text-muted)]" />
                  <p className="text-xs font-bold text-[var(--color-text-primary)] uppercase tracking-wider">Datas próximas</p>
                </div>
                <div className="divide-y divide-[var(--color-border)]">
                  {specialDates.slice(0, 6).map(sd => {
                    const d    = new Date(sd.date + 'T12:00:00')
                    const diff = daysBetween(now, d)
                    const hot  = diff <= 7
                    return (
                      <div key={sd.id} className="flex items-center gap-3 px-4 py-3">
                        <div className="w-9 h-9 rounded-lg flex flex-col items-center justify-center flex-shrink-0" style={{ background: hot ? 'var(--ds-error-bg)' : 'var(--color-bg-page)' }}>
                          <span className="text-sm font-bold leading-none" style={{ color: hot ? 'var(--ds-error-accent)' : 'var(--color-text-primary)' }}>{d.getDate()}</span>
                          <span className="text-[9px] text-[var(--color-text-muted)] leading-none mt-0.5">{MONTHS[d.getMonth()].slice(0, 3)}</span>
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-semibold text-[var(--color-text-primary)] truncate">{sd.name}</p>
                          <p className="text-[10px] font-medium" style={{ color: hot ? 'var(--ds-error-accent)' : 'var(--color-text-muted)' }}>{diff === 0 ? 'hoje' : `em ${diff}d`}</p>
                        </div>
                      </div>
                    )
                  })}
                </div>
                {specialDates.length > 6 && (
                  <div className="px-4 py-3 border-t border-[var(--color-border)]">
                    <button onClick={() => router.push('/dashboard/datas-especiais')} className="text-xs text-[var(--color-text-muted)] hover:text-[var(--color-brand)] transition-colors">
                      Ver todas →
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* Timeline próximos 7 dias */}
            {upcoming7.length > 0 && (
              <div className="break-inside-avoid mb-5 bg-[var(--color-bg-card)] rounded-2xl border border-[var(--color-border)] overflow-hidden">
                <div className="px-5 py-4 border-b border-[var(--color-border)] flex items-center gap-2">
                  <Calendar size={13} className="text-[var(--color-text-muted)]" />
                  <p className="text-xs font-bold text-[var(--color-text-primary)] uppercase tracking-wider">Próximos 7 dias</p>
                  <span className="ml-auto text-xs text-[var(--color-text-muted)]">{upcoming7.length} posts</span>
                </div>
                <div className="p-2 space-y-0.5">
                  {upcoming7.length <= 3
                    ? upcoming7.map(s => {
                        const d = s.scheduled_date ? new Date(s.scheduled_date + 'T12:00:00') : null
                        const isToday = s.scheduled_date === todayStr
                        return (
                          <button
                            key={s.id}
                            onClick={() => navigateToPost(s)}
                            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-[var(--color-bg-page)] transition-colors text-left group"
                          >
                            <div className={`w-9 h-9 rounded-lg flex flex-col items-center justify-center flex-shrink-0 ${isToday ? 'bg-[var(--color-brand)]' : 'bg-[var(--color-bg-page)] border border-[var(--color-border)]'}`}>
                              {d ? <>
                                <span className={`text-xs font-bold leading-none ${isToday ? 'text-white' : 'text-[var(--color-text-primary)]'}`}>{d.getDate()}</span>
                                <span className={`text-[9px] leading-none mt-0.5 ${isToday ? 'text-white/70' : 'text-[var(--color-text-muted)]'}`}>{MONTHS[d.getMonth()].slice(0, 3)}</span>
                              </> : <span className="text-[10px] text-[var(--color-text-muted)]">—</span>}
                            </div>
                            <ClientAvatar clientId={s.client_id} />
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium text-[var(--color-text-primary)] truncate">{s.title || 'Sem título'}</p>
                              <p className="text-xs text-[var(--color-text-muted)]">{clientMap[s.client_id]?.name} · {s.post_type}</p>
                            </div>
                            <span className={`text-[10px] font-semibold px-2 py-1 rounded-lg flex-shrink-0 ${STATUS_COLOR[s.status] || ''}`}>{STATUS_LABEL[s.status] || s.status}</span>
                            <ChevronRight size={12} className="text-[var(--color-text-faint)] group-hover:text-[var(--color-text-muted)] flex-shrink-0" />
                          </button>
                        )
                      })
                    : renderSmartList(upcoming7, 'upcoming')
                  }
                </div>
              </div>
            )}
        </div>

        {/* ── Grid de clientes ─────────────────────────────────────────────── */}
        <div>
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-2xl font-bold text-[var(--color-text-primary)]">Clientes — {MONTHS[now.getMonth()]}</h2>
            <button
              onClick={() => router.push('/dashboard/clientes')}
              className="flex items-center gap-1.5 text-sm text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] transition-colors"
            >
              Ver todos <ArrowRight size={14} />
            </button>
          </div>

          <div className="grid grid-cols-4 gap-4">
            {clients.map(client => {
              const cp         = schedules.filter(s => s.client_id === client.id)
              const cpTotal    = cp.length
              const cpPub      = cp.filter(s => s.status === CFG.S.publicado).length
              const cpRej      = cp.filter(s => s.approval_status === CFG.A.naoAprovado).length
              const cpDelayed  = cp.filter(s =>
                s.scheduled_date && s.scheduled_date < todayStr &&
                ![CFG.S.publicado, CFG.S.agendado].includes(s.status)
              ).length
              const noReels  = !clientsWithReels.has(client.id) && cpTotal > 0
              const progress = cpTotal > 0 ? (cpPub / cpTotal) * 100 : 0
              const allDone  = cpTotal > 0 && cpPub === cpTotal
              const hasIssue = cpRej > 0 || cpDelayed > 0

              return (
                <button
                  key={client.id}
                  onClick={() => router.push(`/dashboard/clientes/${client.id}`)}
                  className="bg-[var(--color-bg-card)] rounded-2xl p-5 border border-[var(--color-border)] text-left hover:border-[var(--color-border-strong)] hover:-translate-y-0.5 transition-all duration-150 group"
                >
                  <div className="flex items-center gap-3 mb-4">
                    <div
                      className="w-10 h-10 rounded-xl flex items-center justify-center text-white text-sm font-bold flex-shrink-0"
                      style={{ background: client.color_hex }}
                    >
                      {getInitials(client.name)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-[var(--color-text-primary)] truncate text-sm">{client.name}</p>
                      <p className="text-xs text-[var(--color-text-muted)]">{cpTotal} post{cpTotal !== 1 ? 's' : ''}</p>
                    </div>
                    <ArrowRight size={14} className="text-[#EBEAE5] group-hover:text-[var(--color-text-muted)] transition-colors flex-shrink-0" />
                  </div>

                  {/* Barra de progresso (publicados / total) */}
                  <div className="h-1 bg-[var(--color-bg-subtle)] rounded-full mb-3 overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all"
                      style={{ width: `${progress}%`, background: client.color_hex }}
                    />
                  </div>

                  <div className="flex items-center justify-between">
                    <span className="text-xs text-[var(--color-text-muted)]">{cpPub}/{cpTotal} publicados</span>
                    <div className="flex items-center gap-1 flex-wrap justify-end">
                      {cpDelayed > 0 && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded-md font-semibold" style={{ background: 'var(--ds-error-bg)', color: 'var(--ds-error-text)' }}>
                          {cpDelayed} atrasado{cpDelayed !== 1 ? 's' : ''}
                        </span>
                      )}
                      {cpRej > 0 && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded-md font-semibold" style={{ background: 'var(--ds-warn-bg)', color: 'var(--ds-warn-text)' }}>
                          {cpRej} ajuste{cpRej !== 1 ? 's' : ''}
                        </span>
                      )}
                      {noReels && !hasIssue && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded-md font-medium" style={{ background: 'var(--ds-purple-bg)', color: 'var(--ds-purple-text)' }}>
                          sem reel
                        </span>
                      )}
                      {cpTotal === 0 ? (
                        <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-[var(--color-bg-page)] text-[var(--color-text-muted)]">sem posts</span>
                      ) : allDone ? (
                        <span className="text-[10px] px-1.5 py-0.5 rounded-md font-semibold" style={{ background: 'var(--ds-success-bg)', color: 'var(--ds-success-text)' }}>✓ ok</span>
                      ) : !hasIssue && !noReels ? (
                        <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-[var(--color-bg-page)] text-[var(--color-text-secondary)]">em andamento</span>
                      ) : null}
                    </div>
                  </div>
                </button>
              )
            })}
          </div>
        </div>

        {/* ── Datas no horizonte (não urgentes) ──────────────────────────── */}
        {specialDates.filter(sd => !urgentDates.some(u => u.id === sd.id)).length > 0 && (
          <div className="bg-[var(--color-bg-card)] rounded-2xl p-6 border border-[var(--color-border)] max-w-sm">
            <p className="text-xs font-semibold text-[var(--color-text-muted)] uppercase tracking-wider mb-5">No horizonte</p>
            <div className="space-y-4">
              {specialDates
                .filter(sd => !urgentDates.some(u => u.id === sd.id))
                .slice(0, 6)
                .map(sd => {
                  const d    = new Date(sd.date + 'T12:00:00')
                  const diff = daysBetween(now, d)
                  return (
                    <div key={sd.id} className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-[var(--color-bg-page)] border border-[var(--color-border)] flex flex-col items-center justify-center flex-shrink-0">
                        <span className="text-sm font-bold text-[var(--color-text-primary)] leading-none">{d.getDate()}</span>
                        <span className="text-[9px] text-[var(--color-text-muted)] leading-none mt-0.5">{MONTHS[d.getMonth()].slice(0, 3)}</span>
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-[var(--color-text-primary)]">{sd.name}</p>
                        <p className="text-xs text-[var(--color-text-muted)]">em {diff} dia{diff !== 1 ? 's' : ''}</p>
                      </div>
                    </div>
                  )
                })}
            </div>
          </div>
        )}

      </div>
    </div>
  )
}
