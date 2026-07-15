'use client'

import { useEffect, useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import { useUser } from '@/lib/UserContext'
import {
  ArrowRight, AlertTriangle, Clock, CalendarDays, ChevronRight, ChevronDown,
  Zap, CheckCircle2, Camera, CheckSquare, SquarePen, CalendarClock, UserCheck, Send,
  Feather, ShieldCheck, LayoutGrid, Kanban, Package, Target,
} from 'lucide-react'
import Button from '@/components/ui/Button'
import { Card, SectionCard } from '@/components/ui/Card'
import IconBadge, { type BadgeTone } from '@/components/ui/IconBadge'
import DonutChart from '@/components/ui/DonutChart'
import LineChart from '@/components/ui/LineChart'

// ─── CFG — nomes de colunas/tabelas Supabase (corrigir aqui se mudar) ───────
const CFG = {
  t: {
    clients:      'clients',
    schedules:    'schedules',
    specialDates: 'special_dates',
  },
  S: {
    captacao:            'captacao',
    producao:            'producao',
    revisaoInterna:      'revisao_interna',
    aguardandoAprovacao: 'aguardando_aprovacao',
    ajuste:              'ajuste',
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

const TONE_BG: Record<BadgeTone, string> = {
  red: 'var(--color-accent-bg)', orange: 'var(--ds-warn-bg)', amber: 'var(--ds-caution-bg)',
  green: 'var(--ds-success-bg)', blue: 'var(--ds-info-bg)', purple: 'var(--ds-purple-bg)',
  neutral: 'var(--color-bg-subtle)',
}
const TONE_FG: Record<BadgeTone, string> = {
  red: 'var(--color-accent)', orange: 'var(--ds-warn-accent)', amber: 'var(--ds-caution-accent)',
  green: 'var(--ds-success-accent)', blue: 'var(--ds-info-accent)', purple: 'var(--ds-purple-accent)',
  neutral: 'var(--color-text-secondary)',
}

const MONTHS    = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro']
const DAYS      = ['Domingo','Segunda','Terça','Quarta','Quinta','Sexta','Sábado']
const WEEKDAY_SHORT = ['DOM','SEG','TER','QUA','QUI','SEX','SÁB']
const TYPE_SHORT: Record<string, string> = {
  reels: 'Reel', carrossel: 'Carrossel', post: 'Post', story: 'Story', carrossel_stories: 'Crsl/Story',
}

type Client   = { id: string; name: string; color_hex: string; logo_url?: string | null }
type Schedule = {
  id: string; client_id: string; title: string
  status: string; approval_status: string; post_type: string
  scheduled_date: string | null; funil: string | null
  month: number; year: number; created_at?: string | null
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

function pl(n: number, s: string, p: string) { return n === 1 ? s : p }

function dominantTypeLabel(posts: { post_type: string }[]) {
  const byType = posts.reduce((a, p) => { a[p.post_type] = (a[p.post_type] || 0) + 1; return a }, {} as Record<string, number>)
  const d = Object.entries(byType).sort((a, b) => b[1] - a[1])[0]
  return d ? `${d[1]}x ${TYPE_SHORT[d[0]] || d[0]}` : ''
}

export default function DashboardPage() {
  useEffect(() => { document.title = 'Início · Bagano Hub' }, [])
  const router    = useRouter()
  const supabase  = createClient()
  const { currentMember } = useUser()

  const [clients,      setClients]      = useState<Client[]>([])
  const [schedules,    setSchedules]    = useState<Schedule[]>([])
  const [specialDates, setSpecialDates] = useState<SpecialDate[]>([])
  const [captacoes,    setCaptacoes]    = useState<Captacao[]>([])
  const [clientTeam,   setClientTeam]   = useState<ClientTeamRow[]>([])
  const [myExtras,     setMyExtras]     = useState<any[]>([])
  const [loading,      setLoading]      = useState(true)
  const [loadError,    setLoadError]    = useState(false)

  // Visão geral do mês — mês e período selecionáveis (escopo do widget)
  const [ovMonth,     setOvMonth]     = useState(new Date().getMonth() + 1)
  const [ovYear,      setOvYear]      = useState(new Date().getFullYear())
  const [ovSchedules, setOvSchedules] = useState<{ status: string; approval_status: string }[]>([])
  const [ovPeriod,    setOvPeriod]    = useState(7)
  const [evoRows,     setEvoRows]     = useState<{ created_at: string | null }[]>([])

  const now      = new Date()
  const month    = now.getMonth() + 1
  const year     = now.getFullYear()
  const todayStr = now.toISOString().split('T')[0]
  const in7Str   = new Date(now.getTime() +   7 * 86400000).toISOString().split('T')[0]
  const in120Str = new Date(now.getTime() + 120 * 86400000).toISOString().split('T')[0]

  useEffect(() => {
    async function load() {
      try {
        const in90Str = new Date(now.getTime() + 90 * 86400000).toISOString().split('T')[0]
        const ago45Str = new Date(now.getTime() - 45 * 86400000).toISOString().split('T')[0]
        const [{ data: cls, error: e1 }, { data: sch }, { data: sd }, { data: cap }, { data: ct }] = await Promise.all([
          supabase.from(CFG.t.clients)
            .select('id, name, color_hex, logo_url')
            .eq('status', 'active')
            .order('name'),
          supabase.from(CFG.t.schedules)
            .select('id, client_id, title, status, approval_status, post_type, scheduled_date, funil, month, year, created_at')
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
        if (e1) { setLoadError(true); setLoading(false); return }
        setClients(cls || [])
        setSchedules(sch || [])
        setSpecialDates(sd || [])
        setCaptacoes(cap || [])
        setClientTeam(ct || [])
      } catch {
        setLoadError(true)
      }
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

  // Donut do "Visão geral" — busca o mês escolhido (só quando difere do mês atual; o atual reusa `schedules`)
  useEffect(() => {
    if (ovMonth === month && ovYear === year) return
    supabase.from(CFG.t.schedules).select('status, approval_status').eq('month', ovMonth).eq('year', ovYear)
      .then(({ data }) => setOvSchedules((data as any) || []))
  }, [ovMonth, ovYear])

  // Linha de evolução — posts criados nos últimos N dias (independente do mês)
  useEffect(() => {
    const since = new Date(Date.now() - ovPeriod * 86400000).toISOString()
    supabase.from(CFG.t.schedules).select('created_at').gte('created_at', since)
      .then(({ data }) => setEvoRows((data as any) || []))
  }, [ovPeriod])

  // ── Computed ─────────────────────────────────────────────────────────────
  const clientMap = useMemo(() => {
    const m: Record<string, Client> = {}
    clients.forEach(c => { m[c.id] = c })
    return m
  }, [clients])

  const delayed = useMemo(() =>
    schedules.filter(s =>
      s.scheduled_date && s.scheduled_date < todayStr &&
      ![CFG.S.publicado, CFG.S.agendado].includes(s.status)
    ), [schedules, todayStr])

  const rejected = useMemo(() =>
    schedules.filter(s => s.approval_status === CFG.A.naoAprovado && ![CFG.S.aprovado, CFG.S.agendado, CFG.S.publicado].includes(s.status)),
  [schedules])


  const upcoming7 = useMemo(() =>
    schedules
      .filter(s => s.scheduled_date && s.scheduled_date >= todayStr && s.scheduled_date <= in7Str)
      .sort((a, b) => (a.scheduled_date || '').localeCompare(b.scheduled_date || '')),
  [schedules, todayStr, in7Str])

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

  const roleStr = (currentMember?.role || '').toLowerCase()
  const isProducer   = ['video', 'post', 'foto', 'editor', 'design'].some(r => roleStr.includes(r))
  const isStrategist = ['estrategia', 'social'].some(r => roleStr.includes(r))

  const productionQueue = useMemo(() =>
    schedules
      .filter(s => [CFG.S.captacao, CFG.S.producao, CFG.S.revisaoInterna].includes(s.status))
      .sort((a, b) => {
        if (a.scheduled_date && !b.scheduled_date) return -1
        if (!a.scheduled_date && b.scheduled_date) return 1
        return (a.scheduled_date || '').localeCompare(b.scheduled_date || '')
      }),
  [schedules])

  const pendingApproval = useMemo(() =>
    schedules.filter(s => s.status === CFG.S.aguardandoAprovacao),
  [schedules])

  const myProductionQueue = useMemo(() => hasAssignments ? productionQueue.filter(isMine) : [], [productionQueue, myAssignments, hasAssignments])
  const myPendingApproval = useMemo(() => hasAssignments ? pendingApproval.filter(isMine) : [], [pendingApproval, myAssignments, hasAssignments])

  // Métricas
  const total      = schedules.length
  const published  = schedules.filter(s => s.status === CFG.S.publicado).length
  // "Aprovados" = aprovação do cliente confirmada OU já passou para agendado/publicado
  const approved   = schedules.filter(s =>
    s.approval_status === CFG.A.aprovado ||
    [CFG.S.aprovado, CFG.S.agendado, CFG.S.publicado].includes(s.status)
  ).length
  const inProd     = schedules.filter(s => [CFG.S.captacao, CFG.S.producao].includes(s.status)).length
  const withClient = schedules.filter(s => s.status === CFG.S.aguardandoAprovacao).length

  const metricCards: { label: string; value: number; icon: typeof SquarePen; tone: BadgeTone }[] = [
    { label: 'Posts do mês', value: total,      icon: SquarePen,     tone: 'red'     },
    { label: 'Em produção',  value: inProd,      icon: CalendarClock, tone: 'orange'  },
    { label: 'Aprovados',    value: approved,    icon: CheckCircle2,  tone: 'green'   },
    { label: 'Com cliente',  value: withClient,  icon: UserCheck,     tone: 'purple'  },
    { label: 'Publicados',   value: published,   icon: Send,          tone: 'neutral' },
  ]

  // Atalhos rápidos
  const approvalsBadge = rejected.length + pendingApproval.length
  const shortcuts: { label: string; icon: typeof Feather; tone: BadgeTone; href: string; badge?: number }[] = [
    { label: 'Novo post',   icon: Feather,     tone: 'red',     href: '/dashboard/cronograma' },
    { label: 'Calendário',  icon: CalendarDays, tone: 'amber',   href: '/dashboard/calendario' },
    { label: 'Aprovações',  icon: ShieldCheck, tone: 'green',   href: '/dashboard/aprovacao', badge: approvalsBadge },
    { label: 'Feed Visual', icon: LayoutGrid,  tone: 'purple',  href: '/dashboard/feed' },
    { label: 'Kanban',      icon: Kanban,      tone: 'blue',    href: '/dashboard/kanban' },
    { label: 'Materiais',   icon: Package,     tone: 'neutral', href: '/dashboard/materiais' },
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
      const clientPosts = schedules.filter(s => s.client_id === cl.id && !['publicado', 'agendado'].includes(s.status))
      if (clientPosts.length < 3 && schedules.some(s => s.client_id === cl.id)) postsAcabando.push(cl)
    })
    return { semAgendada, vencida, postsAcabando }
  }, [clients, captacoes, schedules, todayStr])

  const semAgendadaOnly = captacaoAlerts.semAgendada.filter(cl => !captacaoAlerts.vencida.some(v => v.id === cl.id))

  // Lista unificada de alertas (o primeiro vira o destaque do card "Atenção")
  type Alert = { n: number; label: string; sub: string; icon: typeof Clock; tone: BadgeTone; href: string; cta: string }
  const alertList: Alert[] = [
    delayed.length > 0 && { n: delayed.length, label: `${pl(delayed.length,'post vencido','posts vencidos')}`, sub: 'Data passou, não publicado', icon: Clock, tone: 'red' as BadgeTone, href: '/dashboard/cronograma', cta: 'Ver cronograma' },
    captacaoAlerts.vencida.length > 0 && { n: captacaoAlerts.vencida.length, label: 'clientes sem captação', sub: 'Resolver essa semana', icon: Camera, tone: 'red' as BadgeTone, href: '/dashboard/agenda', cta: 'Ver clientes' },
    rejected.length > 0 && { n: rejected.length, label: `${pl(rejected.length,'alteração solicitada','alterações solicitadas')}`, sub: 'Cliente pediu revisão', icon: AlertTriangle, tone: 'orange' as BadgeTone, href: '/dashboard/aprovacao', cta: 'Ver aprovações' },
    semAgendadaOnly.length > 0 && { n: semAgendadaOnly.length, label: 'sem captação futura', sub: 'Nenhuma captação agendada', icon: Camera, tone: 'purple' as BadgeTone, href: '/dashboard/agenda', cta: 'Ver agenda' },
    captacaoAlerts.postsAcabando.length > 0 && { n: captacaoAlerts.postsAcabando.length, label: 'com poucos posts', sub: 'Menos de 3 em produção', icon: Zap, tone: 'amber' as BadgeTone, href: '/dashboard/cronograma', cta: 'Ver cronograma' },
  ].filter(Boolean) as Alert[]

  // ── Visão geral do mês (mês + período selecionáveis) ──────────────────────
  const isCurrentOv = ovMonth === month && ovYear === year
  const donutSource = isCurrentOv ? schedules : ovSchedules
  const ovTotal     = donutSource.length
  // "Precisam ajuste" é transversal (approval_status), mostrado como alerta à parte
  const ovNotOk     = donutSource.filter(s => s.approval_status === CFG.A.naoAprovado && ![CFG.S.aprovado, CFG.S.agendado, CFG.S.publicado].includes(s.status)).length

  // Rosca = distribuição por status (exclusivos → soma sempre = total)
  const STATUS_SLICES: { key: string; label: string; tone: BadgeTone }[] = [
    { key: CFG.S.captacao,            label: 'Captação',        tone: 'blue'    },
    { key: CFG.S.producao,            label: 'Em produção',     tone: 'amber'   },
    { key: CFG.S.revisaoInterna,      label: 'Revisão interna', tone: 'orange'  },
    { key: CFG.S.aguardandoAprovacao, label: 'Com cliente',     tone: 'blue'    },
    { key: CFG.S.ajuste,              label: 'Ajuste',          tone: 'red'     },
    { key: CFG.S.aprovado,            label: 'Aprovado',        tone: 'purple'  },
    { key: CFG.S.agendado,            label: 'Agendado',        tone: 'green'   },
    { key: CFG.S.publicado,           label: 'Publicado',       tone: 'neutral' },
  ]
  const legend = STATUS_SLICES.map(s => ({ label: s.label, tone: s.tone, value: donutSource.filter(x => x.status === s.key).length }))
  const donutSegments = legend.map(l => ({ value: l.value, color: TONE_FG[l.tone] }))

  const monthOptions = Array.from({ length: 12 }, (_, k) => {
    const d = new Date(year, month - 1 - k, 1)
    return { y: d.getFullYear(), m: d.getMonth() + 1, label: `${MONTHS[d.getMonth()]} ${d.getFullYear()}` }
  })

  const evolution = (() => {
    const out: { label: string; value: number }[] = []
    for (let i = ovPeriod - 1; i >= 0; i--) {
      const d = new Date(); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() - i)
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
      const count = evoRows.filter(r => (r.created_at || '').slice(0, 10) === key).length
      const label = ovPeriod <= 7 ? (i === 0 ? 'HOJE' : WEEKDAY_SHORT[d.getDay()]) : `${d.getDate()}/${d.getMonth() + 1}`
      out.push({ label, value: count })
    }
    return out
  })()

  // "Para você": meu trabalho agrupado por cliente
  // Fallback quando não há assignments: filtra por tipo de acordo com o role
  const isVideoRole = ['video', 'editor'].some(r => roleStr.includes(r))
  const fallbackQueue = isProducer
    ? (isVideoRole ? productionQueue.filter(s => s.post_type === 'reels') : productionQueue)
    : []
  const workItems = hasAssignments
    ? [...myProductionQueue, ...myPendingApproval]
    : (isStrategist ? pendingApproval : fallbackQueue)
  const myClientCards = Object.values(workItems.reduce((acc, s) => {
    (acc[s.client_id] ||= { cid: s.client_id, posts: [] as Schedule[] }).posts.push(s)
    return acc
  }, {} as Record<string, { cid: string; posts: Schedule[] }>))

  const upcomingByClient = Object.values(upcoming7.reduce((acc, s) => {
    (acc[s.client_id] ||= { cid: s.client_id, posts: [] as Schedule[] }).posts.push(s)
    return acc
  }, {} as Record<string, { cid: string; posts: Schedule[] }>))

  if (loading) return (
    <div className="flex items-center justify-center h-full">
      <div className="w-5 h-5 border-2 border-[var(--color-border)] border-t-[var(--color-accent)] rounded-full animate-spin" />
    </div>
  )

  if (loadError) return (
    <div className="flex flex-col items-center justify-center h-full gap-3 text-center px-8">
      <p className="text-sm text-[var(--color-text-muted)]">Não foi possível carregar o dashboard.</p>
      <button onClick={() => window.location.reload()}
        className="text-xs px-4 py-2 rounded-xl border border-[var(--color-border)] text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-card)] transition-colors">
        Tentar novamente
      </button>
    </div>
  )

  // ── Helpers de UI ────────────────────────────────────────────────────────
  function ClientAvatar({ clientId, size = 36 }: { clientId: string; size?: number }) {
    const c = clientMap[clientId]
    if (!c) return null
    if (c.logo_url) return (
      <img src={c.logo_url} alt={c.name}
        style={{ width: size, height: size, borderRadius: '50%' }}
        className="object-cover flex-shrink-0"
        onError={e => { (e.target as HTMLImageElement).style.display = 'none' }}
      />
    )
    return (
      <div className="flex items-center justify-center text-white font-bold flex-shrink-0"
        style={{ width: size, height: size, borderRadius: '50%', fontSize: size / 3, background: c.color_hex }}>
        {getInitials(c.name)}
      </div>
    )
  }

  const firstName = currentMember?.name.split(' ')[0]
  const paraVoceContent = myClientCards.length > 0 || myExtras.length > 0

  return (
    <div className="min-h-screen bg-[var(--color-bg-page)]">
      <div className="max-w-[1440px] mx-auto px-4 md:px-8 py-5 md:py-8 space-y-5 md:space-y-6">

        {/* ── Header ──────────────────────────────────────────────────────── */}
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl md:text-3xl font-bold text-[var(--color-text-primary)] tracking-tight">
              {getDayGreeting()}{firstName ? `, ${firstName}` : ''} 👋
            </h1>
            <p className="text-sm text-[var(--color-text-muted)] mt-1">Aqui está o que está acontecendo hoje na Bagano.</p>
          </div>
          <p className="text-xs font-medium text-[var(--color-text-muted)] whitespace-nowrap mt-1">
            {DAYS[now.getDay()]}, {now.getDate()} de {MONTHS[now.getMonth()]} de {year}
          </p>
        </div>

        {/* ── Métricas ────────────────────────────────────────────────────── */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
          {metricCards.map(m => (
            <Card key={m.label} padded className="flex items-center gap-3.5">
              <IconBadge icon={m.icon} tone={m.tone} size="lg" />
              <div>
                <p className="text-3xl font-bold leading-none" style={{ color: TONE_FG[m.tone] }}>{m.value}</p>
                <p className="text-xs text-[var(--color-text-muted)] mt-1.5">{m.label}</p>
              </div>
            </Card>
          ))}
        </div>

        {/* ── Bento ───────────────────────────────────────────────────────── */}
        <div className="grid grid-cols-12 gap-5 items-start">

          {/* Região esquerda */}
          <div className="col-span-12 lg:col-span-8 space-y-5">

            <div className="grid grid-cols-1 md:grid-cols-2 gap-5 items-start">

              {/* Para você */}
              {currentMember && (
                <SectionCard title={`Para você, ${firstName}`} icon={Zap} iconTone="amber" bodyClassName="px-4 pb-4 space-y-2.5">
                  {!paraVoceContent && (
                    <p className="text-sm text-[var(--color-text-muted)] py-6 text-center">Nada pendente pra você 🎉</p>
                  )}

                  {myClientCards.slice(0, 3).map(({ cid, posts }) => {
                    const client = clientMap[cid]
                    const totalForClient = schedules.filter(s => s.client_id === cid).length
                    const pct = totalForClient ? Math.round((posts.length / totalForClient) * 100) : 0
                    return (
                      <button key={cid} onClick={() => router.push(`/dashboard/clientes/${cid}`)}
                        className="w-full text-left rounded-2xl border border-[var(--color-border)] bg-[var(--color-bg-card)] p-4 hover:border-[var(--color-border-hover)] hover:shadow-card transition-all">
                        <div className="flex items-center gap-3">
                          <ClientAvatar clientId={cid} size={40} />
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-semibold text-[var(--color-text-primary)] truncate">{client?.name}</p>
                            <p className="text-xs text-[var(--color-text-muted)] truncate">{dominantTypeLabel(posts)} · em produção</p>
                          </div>
                          <span className="text-xs font-semibold text-[var(--color-text-secondary)] tabular-nums flex-shrink-0">{posts.length} / {totalForClient} posts</span>
                        </div>
                        <div className="h-1.5 rounded-full bg-[var(--color-bg-subtle)] mt-3 overflow-hidden">
                          <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: 'var(--color-accent)' }} />
                        </div>
                        <div className="flex justify-end mt-3">
                          <span className="inline-flex items-center gap-1 text-xs font-semibold px-3 py-1.5 rounded-lg" style={{ background: 'var(--color-accent-bg)', color: 'var(--color-accent)' }}>
                            {posts.length} {pl(posts.length, 'post', 'posts')} →
                          </span>
                        </div>
                      </button>
                    )
                  })}

                  {myClientCards.length > 3 && (
                    <button onClick={() => router.push('/dashboard/cronograma')} className="w-full text-center text-xs font-semibold text-[var(--color-accent)] hover:underline py-1">
                      + {myClientCards.length - 3} {pl(myClientCards.length - 3, 'cliente', 'clientes')} →
                    </button>
                  )}

                  {myExtras.length > 0 && (
                    <button onClick={() => myExtras[0].client_id ? router.push(`/dashboard/clientes/${myExtras[0].client_id}?tab=extras`) : router.push('/dashboard/kanban')}
                      className="w-full text-left rounded-2xl bg-[var(--color-bg-subtle)] p-4 flex items-center gap-3 hover:bg-[var(--color-bg-page)] transition-colors">
                      <div className="w-10 h-10 rounded-xl border-2 border-dashed flex items-center justify-center flex-shrink-0" style={{ borderColor: 'var(--color-accent)' }}>
                        <CheckSquare size={15} style={{ color: 'var(--color-accent)' }} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-[var(--color-text-primary)]">{myExtras.length} {pl(myExtras.length, 'tarefa pendente', 'tarefas pendentes')}</p>
                        <p className="text-xs text-[var(--color-text-muted)] truncate">“{myExtras[0].title}”{clientMap[myExtras[0].client_id] ? ` · ${clientMap[myExtras[0].client_id].name}` : ''}</p>
                      </div>
                      <ChevronRight size={14} className="text-[var(--color-text-faint)] flex-shrink-0" />
                    </button>
                  )}
                </SectionCard>
              )}

              {/* Datas importantes */}
              <SectionCard
                title="Datas importantes" icon={CalendarDays} iconTone="neutral"
                action={specialDates.length > 0 && (
                  <button onClick={() => router.push('/dashboard/datas-especiais')} className="text-xs font-semibold text-[var(--color-accent)] hover:underline">Ver todas →</button>
                )}
                bodyClassName="px-3 pb-3"
              >
                {specialDates.length === 0 ? (
                  <p className="text-sm text-[var(--color-text-muted)] py-6 text-center">Nenhuma data próxima</p>
                ) : (
                  <div className="space-y-1">
                    {specialDates.slice(0, 3).map(sd => {
                      const d = new Date(sd.date + 'T12:00:00')
                      const diff = daysBetween(now, d)
                      return (
                        <div key={sd.id} className="flex items-center gap-3.5 px-2 py-2.5">
                          <div className="flex flex-col items-center w-9 flex-shrink-0">
                            <span className="text-2xl font-bold leading-none text-[var(--color-text-primary)] tabular-nums">{String(d.getDate()).padStart(2, '0')}</span>
                            <span className="text-[10px] font-bold uppercase tracking-wide leading-none mt-1" style={{ color: 'var(--color-accent)' }}>{MONTHS[d.getMonth()].slice(0, 3)}</span>
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-semibold text-[var(--color-text-primary)] truncate">{sd.name}</p>
                            <p className="text-xs text-[var(--color-text-muted)]">{diff === 0 ? 'hoje' : `em ${diff} ${pl(diff, 'dia', 'dias')}`}</p>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </SectionCard>
            </div>

            {/* Clientes do mês */}
            <div>
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-bold text-[var(--color-text-primary)] tracking-tight">Clientes do mês</h2>
                <button onClick={() => router.push('/dashboard/clientes')} className="flex items-center gap-1.5 text-xs font-semibold text-[var(--color-accent)] hover:underline">
                  Ver todos <ArrowRight size={13} />
                </button>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
                {clients.map(client => {
                  const cp        = schedules.filter(s => s.client_id === client.id)
                  const cpTotal   = cp.length
                  const cpPub     = cp.filter(s => s.status === CFG.S.publicado).length
                  const cpRej     = cp.filter(s => s.approval_status === CFG.A.naoAprovado).length
                  const cpDelayed = cp.filter(s => s.scheduled_date && s.scheduled_date < todayStr && ![CFG.S.publicado, CFG.S.agendado].includes(s.status)).length
                  const progress  = cpTotal > 0 ? (cpPub / cpTotal) * 100 : 0
                  const allDone   = cpTotal > 0 && cpPub === cpTotal
                  const hasIssue  = cpRej > 0 || cpDelayed > 0
                  return (
                    <Card key={client.id} hover padded className="cursor-pointer" onClick={() => router.push(`/dashboard/clientes/${client.id}`)}>
                      <div className="flex items-center gap-3 mb-3">
                        {client.logo_url
                          ? <img src={client.logo_url} alt={client.name} className="w-10 h-10 rounded-full object-cover flex-shrink-0" onError={e => { (e.target as HTMLImageElement).style.display = 'none' }} />
                          : <div className="w-10 h-10 rounded-full flex items-center justify-center text-white text-sm font-bold flex-shrink-0" style={{ background: client.color_hex }}>{getInitials(client.name)}</div>
                        }
                        <div className="flex-1 min-w-0">
                          <p className="font-semibold text-[var(--color-text-primary)] truncate text-sm">{client.name}</p>
                          <p className="text-xs text-[var(--color-text-muted)]">{cpTotal} {pl(cpTotal, 'post', 'posts')} · {allDone ? 'concluído' : cpTotal === 0 ? 'sem posts' : 'em andamento'}</p>
                        </div>
                      </div>
                      <div className="h-1.5 bg-[var(--color-bg-subtle)] rounded-full mb-2.5 overflow-hidden">
                        <div className="h-full rounded-full transition-all" style={{ width: `${progress}%`, background: client.color_hex }} />
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-[var(--color-text-muted)]">{cpPub}/{cpTotal} publicados</span>
                        <div className="flex items-center gap-1">
                          {cpDelayed > 0 && <span className="text-[10px] px-1.5 py-0.5 rounded-md font-semibold" style={{ background: 'var(--ds-error-bg)', color: 'var(--ds-error-text)' }}>{cpDelayed} atrasado{cpDelayed !== 1 ? 's' : ''}</span>}
                          {cpRej > 0 && <span className="text-[10px] px-1.5 py-0.5 rounded-md font-semibold" style={{ background: 'var(--ds-warn-bg)', color: 'var(--ds-warn-text)' }}>{cpRej} ajuste{cpRej !== 1 ? 's' : ''}</span>}
                          {!hasIssue && allDone && <span className="text-[10px] px-1.5 py-0.5 rounded-md font-semibold" style={{ background: 'var(--ds-success-bg)', color: 'var(--ds-success-text)' }}>✓ ok</span>}
                        </div>
                      </div>
                    </Card>
                  )
                })}
              </div>
            </div>
          </div>

          {/* Região direita */}
          <div className="col-span-12 lg:col-span-4 space-y-5">

            {/* Atalhos rápidos */}
            <SectionCard title="Atalhos rápidos">
              <div className="grid grid-cols-3 gap-2.5">
                {shortcuts.map(s => (
                  <button key={s.label} onClick={() => router.push(s.href)}
                    className="relative rounded-xl py-4 px-2 flex flex-col items-center gap-2 border border-[var(--color-border)] hover:-translate-y-0.5 hover:shadow-card transition-all"
                    style={{ background: TONE_BG[s.tone] }}>
                    <s.icon size={22} strokeWidth={2} style={{ color: TONE_FG[s.tone] }} />
                    <span className="text-[11px] font-medium text-[var(--color-text-primary)] text-center leading-tight">{s.label}</span>
                    {!!s.badge && s.badge > 0 && (
                      <span className="absolute top-1.5 right-1.5 min-w-[16px] h-[16px] rounded-full text-white text-[9px] font-bold flex items-center justify-center px-1" style={{ background: 'var(--color-accent)' }}>{s.badge}</span>
                    )}
                  </button>
                ))}
              </div>
            </SectionCard>

            {/* Próximos 7 dias */}
            <SectionCard
              title="Próximos 7 dias"
              action={<span className="text-xs text-[var(--color-text-muted)]">{upcoming7.length} {pl(upcoming7.length, 'post', 'posts')}</span>}
              bodyClassName="px-4 pb-4 space-y-2.5"
            >
              {upcoming7.length === 0 ? (
                <p className="text-sm text-[var(--color-text-muted)] py-6 text-center">Nada agendado</p>
              ) : (
                <>
                  {upcomingByClient.slice(0, 4).map(({ cid, posts }) => {
                    const client = clientMap[cid]
                    const totalForClient = schedules.filter(s => s.client_id === cid).length
                    const pct = totalForClient ? Math.round((posts.length / totalForClient) * 100) : 0
                    return (
                      <button key={cid} onClick={() => router.push(`/dashboard/clientes/${cid}`)}
                        className="w-full text-left rounded-2xl border border-[var(--color-border)] bg-[var(--color-bg-card)] p-4 hover:border-[var(--color-border-hover)] hover:shadow-card transition-all">
                        <div className="flex items-center gap-3">
                          <ClientAvatar clientId={cid} size={40} />
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-semibold text-[var(--color-text-primary)] truncate">{client?.name}</p>
                            <p className="text-xs text-[var(--color-text-muted)] truncate">{dominantTypeLabel(posts)} · esta semana</p>
                          </div>
                          <ChevronRight size={15} className="text-[var(--color-text-faint)] flex-shrink-0" />
                        </div>
                        <div className="h-1.5 rounded-full bg-[var(--color-bg-subtle)] mt-3 overflow-hidden">
                          <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: client?.color_hex || 'var(--color-accent)' }} />
                        </div>
                        <div className="flex items-center justify-between mt-2">
                          <span className="text-[11px] text-[var(--color-text-muted)] tabular-nums">{posts.length} / {totalForClient} posts</span>
                          <span className="text-[11px] font-semibold text-[var(--color-text-secondary)] tabular-nums">{pct}%</span>
                        </div>
                      </button>
                    )
                  })}
                  {upcomingByClient.length > 4 && (
                    <button onClick={() => router.push('/dashboard/cronograma')} className="w-full text-center text-xs font-semibold text-[var(--color-accent)] hover:underline py-1">
                      Ver cronograma →
                    </button>
                  )}
                </>
              )}
            </SectionCard>

            {/* Atenção */}
            <SectionCard title="Atenção" icon={Target} iconTone="red">
              {alertList.length === 0 ? (
                <div className="flex items-center gap-2.5 py-2">
                  <IconBadge icon={CheckCircle2} tone="green" size="sm" />
                  <p className="text-sm text-[var(--color-text-secondary)]">Tudo em dia por aqui ✨</p>
                </div>
              ) : (
                <div>
                  <button onClick={() => router.push(alertList[0].href)} className="w-full text-left">
                    <div className="flex items-baseline gap-2">
                      <span className="text-4xl font-bold" style={{ color: 'var(--color-accent)' }}>{alertList[0].n}</span>
                      <span className="text-sm font-medium text-[var(--color-text-secondary)]">{alertList[0].label}</span>
                    </div>
                    <p className="text-xs text-[var(--color-text-muted)] mt-1">{alertList[0].sub}</p>
                  </button>
                  {alertList.length > 1 && (
                    <div className="mt-4 space-y-2 pt-3 border-t border-[var(--color-border)]">
                      {alertList.slice(1, 3).map((a, i) => (
                        <button key={i} onClick={() => router.push(a.href)} className="w-full flex items-center gap-2.5 text-left group">
                          <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: TONE_FG[a.tone] }} />
                          <span className="text-xs text-[var(--color-text-secondary)] flex-1 truncate"><span className="font-semibold text-[var(--color-text-primary)]">{a.n}</span> {a.label}</span>
                          <ChevronRight size={12} className="text-[var(--color-text-faint)] flex-shrink-0" />
                        </button>
                      ))}
                    </div>
                  )}
                  <Button variant="ghost" size="sm" fullWidth className="mt-3 !text-[var(--color-accent)]" onClick={() => router.push(alertList[0].href)}>
                    {alertList[0].cta} →
                  </Button>
                </div>
              )}
            </SectionCard>
          </div>
        </div>

        {/* ── Visão geral do mês ──────────────────────────────────────────── */}
        <Card padded>
          <div className="flex items-center justify-between mb-6 gap-3 flex-wrap">
            <h2 className="text-lg font-bold text-[var(--color-text-primary)] tracking-tight">Visão geral do mês</h2>
            <div className="flex items-center gap-2">
              <div className="relative">
                <select
                  value={`${ovYear}-${ovMonth}`}
                  onChange={e => { const [y, m] = e.target.value.split('-').map(Number); setOvYear(y); setOvMonth(m) }}
                  className="appearance-none cursor-pointer text-xs font-medium text-[var(--color-text-secondary)] border border-[var(--color-border)] rounded-lg pl-3 pr-7 py-1.5 bg-[var(--color-bg-card)] outline-none hover:border-[var(--color-border-hover)] transition-colors"
                >
                  {monthOptions.map(o => <option key={`${o.y}-${o.m}`} value={`${o.y}-${o.m}`}>{o.label}</option>)}
                </select>
                <ChevronDown size={13} className="absolute right-2 top-1/2 -translate-y-1/2 text-[var(--color-text-muted)] pointer-events-none" />
              </div>
              <div className="relative">
                <select
                  value={ovPeriod}
                  onChange={e => setOvPeriod(Number(e.target.value))}
                  className="appearance-none cursor-pointer text-xs font-medium text-[var(--color-text-secondary)] border border-[var(--color-border)] rounded-lg pl-3 pr-7 py-1.5 bg-[var(--color-bg-card)] outline-none hover:border-[var(--color-border-hover)] transition-colors"
                >
                  <option value={7}>7 dias</option>
                  <option value={14}>14 dias</option>
                  <option value={30}>30 dias</option>
                </select>
                <ChevronDown size={13} className="absolute right-2 top-1/2 -translate-y-1/2 text-[var(--color-text-muted)] pointer-events-none" />
              </div>
            </div>
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            {/* Donut + legenda */}
            <div className="flex items-center gap-6">
              <DonutChart segments={donutSegments} size={150} thickness={16}>
                <span className="text-[10px] text-[var(--color-text-muted)]">Total de posts</span>
                <span className="text-3xl font-bold text-[var(--color-text-primary)] leading-tight">{ovTotal}</span>
                <span className="text-[10px] text-[var(--color-text-muted)]">posts</span>
              </DonutChart>
              <div className="flex-1 space-y-2.5">
                {legend.map(l => (
                  <div key={l.label} className="flex items-center gap-2.5">
                    <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: TONE_FG[l.tone] }} />
                    <span className="flex-1 text-sm text-[var(--color-text-secondary)]">{l.label}</span>
                    <span className="text-sm font-semibold text-[var(--color-text-primary)] tabular-nums">{l.value}</span>
                    <span className="text-xs text-[var(--color-text-muted)] w-9 text-right tabular-nums">{ovTotal > 0 ? Math.round((l.value / ovTotal) * 100) : 0}%</span>
                  </div>
                ))}
                {ovNotOk > 0 && (
                  <div className="flex items-center gap-2 pt-2.5 mt-1 border-t border-[var(--color-border)]">
                    <AlertTriangle size={13} style={{ color: 'var(--ds-error-accent)' }} className="flex-shrink-0" />
                    <span className="text-xs font-medium" style={{ color: 'var(--ds-error-text)' }}>
                      {ovNotOk} {pl(ovNotOk, 'post precisa', 'posts precisam')} de ajuste
                    </span>
                  </div>
                )}
              </div>
            </div>
            {/* Evolução */}
            <div>
              <p className="text-sm font-semibold text-[var(--color-text-primary)]">Evolução de posts</p>
              <p className="text-xs text-[var(--color-text-muted)] mb-4">Criados nos últimos {ovPeriod} dias</p>
              <LineChart data={evolution} />
            </div>
          </div>
        </Card>

      </div>
    </div>
  )
}
