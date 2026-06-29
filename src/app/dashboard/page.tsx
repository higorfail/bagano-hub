'use client'

import { useEffect, useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import { useUser } from '@/lib/UserContext'
import { ArrowRight, AlertTriangle, Clock, Calendar, ChevronRight, Zap, CheckCircle2, Camera } from 'lucide-react'

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

const MONTHS = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro']
const DAYS   = ['Domingo','Segunda','Terça','Quarta','Quinta','Sexta','Sábado']

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

  const [clients,      setClients]      = useState<Client[]>([])
  const [schedules,    setSchedules]    = useState<Schedule[]>([])
  const [specialDates, setSpecialDates] = useState<SpecialDate[]>([])
  const [captacoes,    setCaptacoes]    = useState<Captacao[]>([])
  const [loading,      setLoading]      = useState(true)

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
      const [{ data: cls }, { data: sch }, { data: sd }, { data: cap }] = await Promise.all([
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
      ])
      setClients(cls || [])
      setSchedules(sch || [])
      setSpecialDates(sd || [])
      setCaptacoes(cap || [])
      setLoading(false)
    }
    load()
  }, [])

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

  // Viés por função
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

  // Métricas
  const total      = schedules.length
  const published  = schedules.filter(s => s.status === CFG.S.publicado).length
  const approved   = schedules.filter(s => s.approval_status === CFG.A.aprovado).length
  const inProd     = schedules.filter(s => s.status === CFG.S.producao).length
  const withClient = schedules.filter(s => s.status === CFG.S.aguardandoAprovacao).length
  const notOk      = rejected.length

  const metrics = [
    { label: 'Posts no mês',    value: total,      color: '#1A1916' },
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

  return (
    <div className="min-h-screen bg-[var(--color-bg-page)]">
      <div className="max-w-7xl mx-auto px-8 py-10 space-y-8">

        {/* ── Header ─────────────────────────────────────────────────────── */}
        <div>
          <p className="text-sm text-[var(--color-text-muted)] mb-1.5">
            {DAYS[now.getDay()]}, {now.getDate()} de {MONTHS[now.getMonth()]} {year}
          </p>
          <h1 className="text-4xl font-bold text-[var(--color-text-primary)] tracking-tight">
            {getDayGreeting()}{currentMember ? `, ${currentMember.name.split(' ')[0]}` : ''} 👋
          </h1>
        </div>

        {/* ── Alertas inteligentes ────────────────────────────────────────── */}
        {hasAlerts && (
          <div className="space-y-2">

            {/* Posts com data vencida */}
            {delayed.length > 0 && (
              <div className="bg-red-50 border border-red-100 rounded-2xl p-5">
                <div className="flex items-center gap-2 mb-3">
                  <Clock size={14} className="text-red-500" />
                  <p className="text-sm font-semibold text-red-700">
                    {delayed.length} post{delayed.length !== 1 ? 's' : ''} com data vencida
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {delayed.slice(0, 7).map(s => (
                    <PostPill key={s.id} s={s} accent="border-red-100 hover:border-red-300" />
                  ))}
                  {delayed.length > 7 && (
                    <button
                      onClick={() => router.push('/dashboard/cronograma')}
                      className="flex items-center gap-1 text-xs text-red-500 hover:text-red-700 font-medium px-2"
                    >
                      +{delayed.length - 7} mais <ArrowRight size={10} />
                    </button>
                  )}
                </div>
              </div>
            )}

            {/* Alterações solicitadas */}
            {rejected.length > 0 && (
              <div className="bg-orange-50 border border-orange-100 rounded-2xl p-5">
                <div className="flex items-center gap-2 mb-3">
                  <AlertTriangle size={14} className="text-orange-500" />
                  <p className="text-sm font-semibold text-orange-700">
                    {rejected.length} post{rejected.length !== 1 ? 's' : ''} com alteração solicitada
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {rejected.slice(0, 7).map(s => (
                    <PostPill key={s.id} s={s} accent="border-orange-100 hover:border-orange-300" />
                  ))}
                </div>
              </div>
            )}

            {/* Datas comemorativas urgentes */}
            {urgentDates.length > 0 && (
              <div className="bg-amber-50 border border-amber-100 rounded-2xl p-5">
                <div className="flex items-center gap-2 mb-3">
                  <Calendar size={14} className="text-amber-600" />
                  <p className="text-sm font-semibold text-amber-700">
                    Datas comemorativas chegando — hora de produzir
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {urgentDates.map(sd => {
                    const d    = new Date(sd.date + 'T12:00:00')
                    const diff = daysBetween(now, d)
                    const hot  = diff <= 7
                    return (
                      <div
                        key={sd.id}
                        className={`flex items-center gap-2 bg-[var(--color-bg-card)] border rounded-xl px-3 py-2 ${hot ? 'border-red-200' : 'border-amber-100'}`}
                      >
                        <span className={`text-xs font-bold tabular-nums ${hot ? 'text-red-500' : 'text-amber-600'}`}>{diff}d</span>
                        <span className="text-xs font-medium text-[var(--color-text-primary)]">{sd.name}</span>
                        <span className="text-[10px] text-[var(--color-text-muted)]">
                          {d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })}
                        </span>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

            {/* Captação vencida */}
            {captacaoAlerts.vencida.length > 0 && (
              <div className="bg-red-50 border border-red-100 rounded-2xl p-5">
                <div className="flex items-center gap-2 mb-3">
                  <Camera size={14} className="text-red-500" />
                  <p className="text-sm font-semibold text-red-700">
                    {captacaoAlerts.vencida.length} cliente{captacaoAlerts.vencida.length !== 1 ? 's' : ''} sem captação recente ou agendada
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {captacaoAlerts.vencida.map(cl => (
                    <button key={cl.id} onClick={() => router.push(`/dashboard/clientes/${cl.id}`)}
                      className="flex items-center gap-1.5 bg-[var(--color-bg-card)] border border-red-100 hover:border-red-300 rounded-xl px-3 py-2 text-xs font-medium text-[var(--color-text-primary)] transition-all">
                      <span className="w-4 h-4 rounded flex items-center justify-center text-white text-[8px] font-bold" style={{ background: cl.color_hex }}>
                        {getInitials(cl.name)}
                      </span>
                      {cl.name}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Sem captação agendada (mas tem recente) */}
            {captacaoAlerts.semAgendada.filter(cl => !captacaoAlerts.vencida.some(v => v.id === cl.id)).length > 0 && (
              <div className="bg-purple-50 border border-purple-100 rounded-2xl p-5">
                <div className="flex items-center gap-2 mb-3">
                  <Camera size={14} className="text-purple-500" />
                  <p className="text-sm font-semibold text-purple-700">
                    Clientes sem captação futura agendada
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {captacaoAlerts.semAgendada
                    .filter(cl => !captacaoAlerts.vencida.some(v => v.id === cl.id))
                    .map(cl => (
                      <button key={cl.id} onClick={() => router.push(`/dashboard/agenda`)}
                        className="flex items-center gap-1.5 bg-[var(--color-bg-card)] border border-purple-100 hover:border-purple-300 rounded-xl px-3 py-2 text-xs font-medium text-[var(--color-text-primary)] transition-all">
                        <span className="w-4 h-4 rounded flex items-center justify-center text-white text-[8px] font-bold" style={{ background: cl.color_hex }}>
                          {getInitials(cl.name)}
                        </span>
                        {cl.name}
                      </button>
                    ))}
                </div>
              </div>
            )}

            {/* Posts acabando */}
            {captacaoAlerts.postsAcabando.length > 0 && (
              <div className="bg-yellow-50 border border-yellow-100 rounded-2xl p-5">
                <div className="flex items-center gap-2 mb-3">
                  <Zap size={14} className="text-yellow-600" />
                  <p className="text-sm font-semibold text-yellow-700">
                    {captacaoAlerts.postsAcabando.length} cliente{captacaoAlerts.postsAcabando.length !== 1 ? 's' : ''} com poucos posts em produção
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {captacaoAlerts.postsAcabando.map(cl => (
                    <button key={cl.id} onClick={() => router.push(`/dashboard/clientes/${cl.id}`)}
                      className="flex items-center gap-1.5 bg-[var(--color-bg-card)] border border-yellow-100 hover:border-yellow-300 rounded-xl px-3 py-2 text-xs font-medium text-[var(--color-text-primary)] transition-all">
                      <span className="w-4 h-4 rounded flex items-center justify-center text-white text-[8px] font-bold" style={{ background: cl.color_hex }}>
                        {getInitials(cl.name)}
                      </span>
                      {cl.name}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── Métricas ────────────────────────────────────────────────────── */}
        <div className="grid grid-cols-6 gap-4">
          {metrics.map(m => (
            <div key={m.label} className="bg-[var(--color-bg-card)] rounded-2xl p-5 border border-[var(--color-border)]">
              <p className="text-xs font-medium text-[var(--color-text-muted)] uppercase tracking-wider mb-3">{m.label}</p>
              <p className="text-4xl font-bold tracking-tight" style={{ color: m.color }}>{m.value}</p>
            </div>
          ))}
        </div>

        {/* ── Timeline — próximos 7 dias ──────────────────────────────────── */}
        {upcoming7.length > 0 && (
          <div className="bg-[var(--color-bg-card)] rounded-2xl p-6 border border-[var(--color-border)]">
            <div className="flex items-center justify-between mb-5">
              <p className="text-xs font-semibold text-[var(--color-text-muted)] uppercase tracking-wider">Próximos 7 dias</p>
              <span className="text-xs text-[var(--color-text-muted)]">
                {upcoming7.length} post{upcoming7.length !== 1 ? 's' : ''} agendado{upcoming7.length !== 1 ? 's' : ''}
              </span>
            </div>
            <div className="space-y-1">
              {upcoming7.map(s => {
                const client  = clientMap[s.client_id]
                const d       = s.scheduled_date ? new Date(s.scheduled_date + 'T12:00:00') : null
                const isToday = s.scheduled_date === todayStr
                return (
                  <button
                    key={s.id}
                    onClick={() => navigateToPost(s)}
                    className="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-[var(--color-bg-page)] transition-colors text-left group"
                  >
                    <div className={`w-10 h-10 rounded-xl flex flex-col items-center justify-center flex-shrink-0 ${isToday ? 'bg-[var(--color-brand)]' : 'bg-[var(--color-bg-page)] border border-[var(--color-border)]'}`}>
                      {d ? (
                        <>
                          <span className={`text-sm font-bold leading-none ${isToday ? 'text-white' : 'text-[var(--color-text-primary)]'}`}>{d.getDate()}</span>
                          <span className={`text-[9px] leading-none mt-0.5 ${isToday ? 'text-white/60' : 'text-[var(--color-text-muted)]'}`}>{MONTHS[d.getMonth()].slice(0, 3)}</span>
                        </>
                      ) : <span className="text-[10px] text-[var(--color-text-muted)]">—</span>}
                    </div>
                    <ClientAvatar clientId={s.client_id} />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-[var(--color-text-primary)] truncate">{s.title || 'Sem título'}</p>
                      <p className="text-xs text-[var(--color-text-muted)]">{client?.name} · {s.post_type}</p>
                    </div>
                    <span className={`text-[10px] font-semibold px-2 py-1 rounded-lg ${STATUS_COLOR[s.status] || 'bg-[var(--color-bg-page)] text-[var(--color-text-secondary)]'}`}>
                      {STATUS_LABEL[s.status] || s.status}
                    </span>
                    <ChevronRight size={14} className="text-[#EBEAE5] group-hover:text-[var(--color-text-muted)] transition-colors flex-shrink-0" />
                  </button>
                )
              })}
            </div>
          </div>
        )}

        {/* ── Fila de produção (designers/editores/fotógrafos) ─────────────── */}
        {isProducer && productionQueue.length > 0 && (
          <div className="bg-[var(--color-bg-card)] rounded-2xl p-6 border border-[var(--color-border)]">
            <div className="flex items-center gap-2 mb-5">
              <Zap size={14} className="text-amber-500" />
              <p className="text-xs font-semibold text-[var(--color-text-muted)] uppercase tracking-wider">Sua fila de produção</p>
              <span className="ml-auto text-xs text-[var(--color-text-muted)]">{productionQueue.length} posts</span>
            </div>
            <div className="space-y-1">
              {productionQueue.slice(0, 10).map((s, i) => {
                const client = clientMap[s.client_id]
                return (
                  <button
                    key={s.id}
                    onClick={() => navigateToPost(s)}
                    className="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-[var(--color-bg-page)] transition-colors text-left group"
                  >
                    <span className="text-xs font-bold text-[var(--color-text-faint)] w-5 text-center tabular-nums">{i + 1}</span>
                    <ClientAvatar clientId={s.client_id} />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-[var(--color-text-primary)] truncate">{s.title || 'Sem título'}</p>
                      <p className="text-xs text-[var(--color-text-muted)]">
                        {client?.name}
                        {s.scheduled_date ? ` · ${new Date(s.scheduled_date + 'T12:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })}` : ''}
                      </p>
                    </div>
                    <span className={`text-[10px] font-semibold px-2 py-1 rounded-lg ${STATUS_COLOR[s.status] || 'bg-[var(--color-bg-page)] text-[var(--color-text-secondary)]'}`}>
                      {STATUS_LABEL[s.status]}
                    </span>
                    <ChevronRight size={14} className="text-[#EBEAE5] group-hover:text-[var(--color-text-muted)] flex-shrink-0" />
                  </button>
                )
              })}
              {productionQueue.length > 10 && (
                <p className="text-xs text-[var(--color-text-muted)] px-3 pt-1">+{productionQueue.length - 10} posts na fila</p>
              )}
            </div>
          </div>
        )}

        {/* ── Aguardando aprovação (estrategistas/social) ──────────────────── */}
        {isStrategist && pendingApproval.length > 0 && (
          <div className="bg-[var(--color-bg-card)] rounded-2xl p-6 border border-[var(--color-border)]">
            <div className="flex items-center gap-2 mb-5">
              <CheckCircle2 size={14} className="text-blue-500" />
              <p className="text-xs font-semibold text-[var(--color-text-muted)] uppercase tracking-wider">Aguardando aprovação dos clientes</p>
              <span className="ml-auto text-xs text-[var(--color-text-muted)]">{pendingApproval.length} posts</span>
            </div>
            <div className="space-y-1">
              {pendingApproval.map(s => {
                const client = clientMap[s.client_id]
                return (
                  <button
                    key={s.id}
                    onClick={() => navigateToPost(s)}
                    className="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-[var(--color-bg-page)] transition-colors text-left group"
                  >
                    <ClientAvatar clientId={s.client_id} />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-[var(--color-text-primary)] truncate">{s.title || 'Sem título'}</p>
                      <p className="text-xs text-[var(--color-text-muted)]">{client?.name}</p>
                    </div>
                    <ChevronRight size={14} className="text-[#EBEAE5] group-hover:text-[var(--color-text-muted)] flex-shrink-0" />
                  </button>
                )
              })}
            </div>
          </div>
        )}

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
                        <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-red-50 text-red-500 font-semibold">
                          {cpDelayed} atrasado{cpDelayed !== 1 ? 's' : ''}
                        </span>
                      )}
                      {cpRej > 0 && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-orange-50 text-orange-500 font-semibold">
                          {cpRej} ajuste{cpRej !== 1 ? 's' : ''}
                        </span>
                      )}
                      {noReels && !hasIssue && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-purple-50 text-purple-500 font-medium">
                          sem reel
                        </span>
                      )}
                      {cpTotal === 0 ? (
                        <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-[var(--color-bg-page)] text-[var(--color-text-muted)]">sem posts</span>
                      ) : allDone ? (
                        <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-green-50 text-green-600 font-semibold">✓ ok</span>
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
