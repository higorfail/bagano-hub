'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useState, useRef } from 'react'
import { createClient } from '@/lib/supabase'
import { UserProvider, useUser } from '@/lib/UserContext'
import { ChevronDown, Check } from 'lucide-react'
import { Home, Users, Calendar, Kanban, Smartphone, Megaphone, BookOpen, CalendarHeart, Bell, Package, Sun, Moon, Monitor, LayoutList, ClipboardCheck, CalendarDays, UserCircle2, CheckCircle2, XCircle, Camera, Clock, MessageCircle, Trash2, Zap, CalendarClock, ListChecks, Eye, AtSign } from 'lucide-react'
import CommandPalette from '@/components/CommandPalette'
import { ThemeProvider, useTheme } from '@/lib/ThemeProvider'
import { ToastProvider } from '@/lib/ToastContext'
import LogoIcon from '@/components/logos/LogoIcon'

const navItems = [
  { href: '/dashboard',          icon: Home,          label: 'Início' },
  { href: '/dashboard/clientes', icon: Users,         label: 'Clientes' },
  { href: '/dashboard/equipe',   icon: UserCircle2,   label: 'Equipe' },
]
const productionItems = [
  { href: '/dashboard/agenda',     icon: CalendarDays,   label: 'Agenda' },
  { href: '/dashboard/cronograma', icon: Calendar,       label: 'Cronograma' },
  { href: '/dashboard/criacao',    icon: Zap,            label: 'Criação' },
  { href: '/dashboard/kanban',     icon: Kanban,         label: 'Kanban' },
  { href: '/dashboard/aprovacao',  icon: ClipboardCheck, label: 'Aprovações' },
  { href: '/dashboard/feed',       icon: Smartphone,     label: 'Feed Visual' },
  { href: '/dashboard/materiais',  icon: Package,        label: 'Materiais' },
  { href: '/dashboard/campanhas',  icon: Megaphone,      label: 'Campanhas' },
  { href: '/dashboard/extras',     icon: LayoutList,     label: 'Extras' },
]
const contentItems = [
  { href: '/dashboard/calendario',                 icon: Calendar,      label: 'Calendário' },
  { href: 'https://sous-chef-bagano.netlify.app/', icon: BookOpen,      label: 'Manuais', external: true },
  { href: '/dashboard/datas-especiais',            icon: CalendarHeart, label: 'Datas especiais' },
  { href: '/dashboard/lixeira',                    icon: Trash2,        label: 'Lixeira' },
]

type Notification = {
  id: string
  type: 'approval' | 'rejection' | 'comment' | 'captacao' | 'deadline' | 'urgente' | 'extra_vencido' | 'cronograma_ok' | 'revisao_interna' | 'mention' | 'criacao_hoje'
  title: string
  subtitle: string
  body?: string
  client_name?: string
  client_color?: string
  created_at: string
  link: string
}

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'agora'
  if (mins < 60) return `${mins}min`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h`
  const days = Math.floor(hrs / 24)
  if (days < 7) return `${days}d`
  return `${Math.floor(days / 7)}sem`
}

function DashboardInner({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const { members, currentMember, setCurrentMember, showOnlyMine, setShowOnlyMine } = useUser()
  const [showMemberPicker, setShowMemberPicker] = useState(false)
  const memberRef = useRef<HTMLDivElement>(null)
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [approvalsCount, setApprovalsCount] = useState(0)
  const [stats, setStats] = useState({ total: 0, approved: 0, revision: 0 })
  const [seenApprovals, setSeenApprovals] = useState<number>(() => {
    if (typeof window === 'undefined') return 0
    return Number(localStorage.getItem('approvals-seen') || 0)
  })
  const [showNotifications, setShowNotifications] = useState(false)
  const [notifFilter, setNotifFilter] = useState<'all' | 'mentions'>('all')
  const notifRef = useRef<HTMLDivElement>(null)
  const { mode, setMode } = useTheme()

  const [readIds, setReadIds] = useState<Set<string>>(() => {
    if (typeof window === 'undefined') return new Set()
    try { return new Set(JSON.parse(localStorage.getItem('notif-read') || '[]')) }
    catch { return new Set() }
  })

  const [dismissedIds, setDismissedIds] = useState<Set<string>>(() => {
    if (typeof window === 'undefined') return new Set()
    try { return new Set(JSON.parse(localStorage.getItem('notif-dismissed') || '[]')) }
    catch { return new Set() }
  })

  function markRead(id: string) {
    setReadIds(prev => {
      const next = new Set(prev); next.add(id)
      localStorage.setItem('notif-read', JSON.stringify([...next]))
      return next
    })
  }

  function markAllRead() {
    setReadIds(prev => {
      const next = new Set([...prev, ...notifications.map(n => n.id)])
      localStorage.setItem('notif-read', JSON.stringify([...next]))
      return next
    })
  }

  function clearAll() {
    const ids = notifications.map(n => n.id)
    setDismissedIds(prev => {
      const next = new Set([...prev, ...ids])
      localStorage.setItem('notif-dismissed', JSON.stringify([...next]))
      return next
    })
    setReadIds(prev => {
      const next = new Set([...prev, ...ids])
      localStorage.setItem('notif-read', JSON.stringify([...next]))
      return next
    })
  }

  useEffect(() => {
    loadNotifications()
    const interval = setInterval(loadNotifications, 30000)
    return () => clearInterval(interval)
  }, [currentMember?.id])

  async function loadNotifications() {
    const supabase = createClient()
    const now = new Date()
    const month = now.getMonth() + 1
    const year  = now.getFullYear()
    const today           = now.toISOString().slice(0, 10)
    const tomorrow        = new Date(Date.now() + 1 * 86400000).toISOString().slice(0, 10)
    const threeDaysFromNow= new Date(Date.now() + 3 * 86400000).toISOString().slice(0, 10)
    const threeDaysAgo    = new Date(Date.now() - 3 * 86400000).toISOString().slice(0, 10)
    const sevenDaysAgo    = new Date(Date.now() - 7 * 86400000).toISOString()
    const fourteenDaysAgo = new Date(Date.now() - 14 * 86400000).toISOString()

    const [
      activityApprovalsRes,
      activityRevisaoRes,
      captacoesRes,
      pendingPostsRes,
      urgentPostsRes,
      overdueExtrasRes,
      extraCmtsRes,
      matCmtsRes,
      cronogramaFinalizadoRes,
      pendingCountRes,
      rejectedCountRes,
      totalMonthRes,
      approvedMonthRes,
      mentionsRes,
      materialMentionsRes,
      extraMentionsRes,
      criacaoHojeRes,
    ] = await Promise.all([
      // Aprovações/rejeições do cliente via activity_log (com timestamp real)
      supabase.from('activity_log')
        .select('id, record_id, action, description, client_id, created_at, clients(name, color_hex), schedules(title, month, year)')
        .in('action', ['client_approved', 'client_rejected', 'crono_approved', 'crono_rejected'])
        .gte('created_at', fourteenDaysAgo)
        .order('created_at', { ascending: false })
        .limit(20),
      // Posts enviados para revisão interna (últimas 48h)
      supabase.from('activity_log')
        .select('id, record_id, description, client_id, created_at, clients(name, color_hex), schedules(month, year)')
        .eq('action', 'revisao_interna')
        .gte('created_at', new Date(Date.now() - 48 * 3600000).toISOString())
        .order('created_at', { ascending: false })
        .limit(10),
      // Captações nos próximos 3 dias
      supabase.from('captacoes')
        .select('id, scheduled_date, clients(name, color_hex)')
        .gte('scheduled_date', today).lte('scheduled_date', threeDaysFromNow)
        .eq('status', 'agendada').order('scheduled_date').limit(10),
      // Posts aguardando aprovação há 3+ dias
      supabase.from('schedules')
        .select('id, title, client_id, month, year, clients(name, color_hex)')
        .eq('status', 'aguardando_aprovacao')
        .lte('scheduled_date', threeDaysAgo).limit(10),
      // Posts urgentes: publicar hoje ou amanhã e ainda não estão prontos
      supabase.from('schedules')
        .select('id, title, scheduled_date, client_id, month, year, clients(name, color_hex)')
        .gte('scheduled_date', today).lte('scheduled_date', tomorrow)
        .not('status', 'in', '(agendado,publicado,aprovado)').limit(10),
      // Extras vencidos
      supabase.from('extras')
        .select('id, title, due_date, client_id, clients(name, color_hex)')
        .lt('due_date', today).neq('status', 'done').limit(10),
      // Comentários em extras (7 dias)
      supabase.from('extra_comments')
        .select('id, body, author_name, created_at, extra_id, extras(title)')
        .gte('created_at', sevenDaysAgo).order('created_at', { ascending: false }).limit(10),
      // Comentários em materiais (7 dias)
      supabase.from('material_comments')
        .select('id, body, author_name, created_at, material_id, materials(title)')
        .gte('created_at', sevenDaysAgo).order('created_at', { ascending: false }).limit(10),
      // Cronogramas finalizados recentemente (7 dias)
      supabase.from('cronograma_status')
        .select('id, month, year, finalized_by, finalized_at, client_id, clients(name, color_hex)')
        .eq('status', 'finalizado').gte('finalized_at', sevenDaysAgo)
        .order('finalized_at', { ascending: false }).limit(5),
      supabase.from('schedules').select('id', { count: 'exact', head: true }).eq('status', 'aguardando_aprovacao'),
      supabase.from('schedules').select('id', { count: 'exact', head: true }).eq('approval_status', 'não aprovado').not('status', 'in', '(aprovado,agendado,publicado,aguardando_aprovacao)'),
      supabase.from('schedules').select('id', { count: 'exact', head: true }).eq('month', month).eq('year', year),
      supabase.from('schedules').select('id', { count: 'exact', head: true }).eq('month', month).eq('year', year).in('status', ['aprovado', 'agendado', 'publicado']),
      // Menções ao currentMember nos comentários de posts (14 dias)
      currentMember
        ? supabase.from('schedule_comments')
            .select('id, body, author_name, created_at, schedule_id, schedules(id, title, client_id, month, year, clients(name, color_hex))')
            .ilike('body', `%@${currentMember.name.split(' ')[0]}%`)
            .neq('author_name', currentMember.name)
            .gte('created_at', fourteenDaysAgo)
            .order('created_at', { ascending: false })
            .limit(15)
        : Promise.resolve({ data: [] }),
      // Menções em materiais (14 dias)
      currentMember
        ? supabase.from('material_comments')
            .select('id, body, author_name, created_at, material_id, materials(id, title)')
            .ilike('body', `%@${currentMember.name.split(' ')[0]}%`)
            .neq('author_name', currentMember.name)
            .gte('created_at', fourteenDaysAgo)
            .order('created_at', { ascending: false })
            .limit(10)
        : Promise.resolve({ data: [] }),
      // Menções em extras (14 dias)
      currentMember
        ? supabase.from('extra_comments')
            .select('id, body, author_name, created_at, extra_id, extras(id, title)')
            .ilike('body', `%@${currentMember.name.split(' ')[0]}%`)
            .neq('author_name', currentMember.name)
            .gte('created_at', fourteenDaysAgo)
            .order('created_at', { ascending: false })
            .limit(10)
        : Promise.resolve({ data: [] }),
      // Criação hoje: agenda_criacao do dia atual para o membro logado
      (() => {
        if (!currentMember) return Promise.resolve({ data: [] })
        const d = new Date()
        const dow = d.getDay() // 0=Dom, 1=Seg...5=Sex
        if (dow === 0 || dow === 6) return Promise.resolve({ data: [] })
        const monday = new Date(d)
        monday.setDate(d.getDate() - dow + 1)
        monday.setHours(0, 0, 0, 0)
        const weekStart = monday.toISOString().slice(0, 10)
        return supabase.from('agenda_criacao')
          .select('id, client_id, member_ids, notes, clients(name, color_hex)')
          .eq('week_start', weekStart)
          .eq('day_of_week', dow)
          .contains('member_ids', [currentMember.id])
      })(),
    ])

    setApprovalsCount((pendingCountRes.count || 0) + (rejectedCountRes.count || 0))
    setStats({ total: totalMonthRes.count || 0, approved: approvedMonthRes.count || 0, revision: rejectedCountRes.count || 0 })

    const result: Notification[] = []

    // Aprovações/rejeições com timestamp real
    ;(activityApprovalsRes.data || []).forEach((d: any) => {
      const isCrono = d.action === 'crono_approved' || d.action === 'crono_rejected'
      const isApproval = d.action === 'client_approved' || d.action === 'crono_approved'
      const clientId = d.client_id || ''
      const recordId = d.record_id || ''
      const schedule = d.schedules as any
      const postMonth = schedule?.month ? `&m=${schedule.month}` : ''
      const postYear  = schedule?.year  ? `&y=${schedule.year}`  : ''
      // Link always goes to the right client; for content rejections, also opens the specific post
      const link = isCrono
        ? `/dashboard/cronograma?client=${clientId}`
        : isApproval
          ? `/dashboard/cronograma?client=${clientId}${postMonth}${postYear}`
          : `/dashboard/cronograma?client=${clientId}&post=${recordId}${postMonth}${postYear}`
      result.push({
        id: `activity-${d.id}`,
        type: isApproval ? 'approval' : 'rejection',
        title: isApproval
          ? (isCrono ? 'Cliente aprovou o cronograma' : 'Cliente aprovou o conteúdo')
          : (isCrono ? 'Ajuste pedido no cronograma' : 'Ajuste pedido no conteúdo'),
        subtitle: (d.schedules as any)?.title || 'Post',
        body: isApproval ? '' : d.description?.replace(/^Cliente (pediu ajuste na estratégia|solicitou alterações): "|"$/g, '') || '',
        client_name: (d.clients as any)?.name || '',
        client_color: (d.clients as any)?.color_hex || '',
        created_at: d.created_at,
        link,
      })
    })

    // Posts enviados para revisão interna
    ;(activityRevisaoRes.data || []).forEach((d: any) => {
      const sch = d.schedules as any
      const mq = sch?.month ? `&m=${sch.month}` : ''
      const yq = sch?.year  ? `&y=${sch.year}`  : ''
      result.push({
        id: `revisao-${d.id}`,
        type: 'revisao_interna' as const,
        title: 'Conteúdo enviado para revisão',
        subtitle: d.description?.replace(/^"(.+)".*$/, '$1') || 'Post',
        client_name: (d.clients as any)?.name || '',
        client_color: (d.clients as any)?.color_hex || '',
        created_at: d.created_at,
        link: `/dashboard/cronograma?client=${d.client_id || ''}&post=${d.record_id || ''}${mq}${yq}`,
      })
    })

    // Posts urgentes (publicar hoje/amanhã, não prontos)
    ;(urgentPostsRes.data || []).forEach((d: any) => {
      const date = new Date(d.scheduled_date + 'T12:00:00')
      const isToday = d.scheduled_date === today
      const mq = d.month ? `&m=${d.month}` : ''
      const yq = d.year  ? `&y=${d.year}`  : ''
      result.push({
        id: `urgente-${d.id}`,
        type: 'urgente',
        title: isToday ? 'Publicar hoje — ainda não pronto' : 'Publicar amanhã — ainda não pronto',
        subtitle: d.title || 'Post sem título',
        client_name: (d.clients as any)?.name || '',
        client_color: (d.clients as any)?.color_hex || '',
        created_at: date.toISOString(),
        link: d.client_id
          ? `/dashboard/cronograma?client=${d.client_id}&post=${d.id}${mq}${yq}`
          : '/dashboard/cronograma',
      })
    })

    // Captações próximas
    ;(captacoesRes.data || []).forEach((d: any) => {
      const date = new Date(d.scheduled_date + 'T12:00:00')
      const diffDays = Math.ceil((date.getTime() - Date.now()) / 86400000)
      const when = diffDays === 0 ? 'hoje' : diffDays === 1 ? 'amanhã' : `em ${diffDays} dias`
      result.push({
        id: `capt-${d.id}`,
        type: 'captacao',
        title: `Captação ${when}`,
        subtitle: (d.clients as any)?.name || 'Cliente',
        client_name: date.toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' }),
        client_color: (d.clients as any)?.color_hex || '',
        created_at: date.toISOString(),
        link: '/dashboard/agenda',
      })
    })

    // Posts aguardando há 3+ dias
    ;(pendingPostsRes.data || []).forEach((d: any) => {
      const mq = d.month ? `&m=${d.month}` : ''
      const yq = d.year  ? `&y=${d.year}`  : ''
      result.push({
        id: `pending-${d.id}`,
        type: 'deadline',
        title: 'Aguardando aprovação há 3+ dias',
        subtitle: d.title || 'Post sem título',
        client_name: (d.clients as any)?.name || '',
        client_color: (d.clients as any)?.color_hex || '',
        created_at: new Date(Date.now() - 3 * 86400000).toISOString(),
        link: d.client_id
          ? `/dashboard/cronograma?client=${d.client_id}&post=${d.id}${mq}${yq}`
          : '/dashboard/aprovacao',
      })
    })

    // Extras vencidos
    ;(overdueExtrasRes.data || []).forEach((d: any) => {
      const date = new Date(d.due_date + 'T12:00:00')
      const diffDays = Math.floor((Date.now() - date.getTime()) / 86400000)
      result.push({
        id: `extra-overdue-${d.id}`,
        type: 'extra_vencido',
        title: diffDays === 1 ? 'Extra venceu ontem' : `Extra venceu há ${diffDays} dias`,
        subtitle: d.title || 'Extra sem título',
        client_name: (d.clients as any)?.name || '',
        client_color: (d.clients as any)?.color_hex || '',
        created_at: date.toISOString(),
        link: `/dashboard/extras?post=${d.id}`,
      })
    })

    // Cronogramas finalizados recentemente
    ;(cronogramaFinalizadoRes.data || []).forEach((d: any) => {
      const MONTHS_PT = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez']
      result.push({
        id: `crono-${d.id}`,
        type: 'cronograma_ok',
        title: 'Cronograma finalizado',
        subtitle: `${(d.clients as any)?.name || ''} · ${MONTHS_PT[(d.month||1)-1]} ${d.year}`,
        client_name: d.finalized_by ? `por ${d.finalized_by.split(' ')[0]}` : '',
        client_color: (d.clients as any)?.color_hex || '',
        created_at: d.finalized_at,
        link: d.client_id ? `/dashboard/cronograma?client=${d.client_id}&m=${d.month}&y=${d.year}` : '/dashboard/cronograma',
      })
    })

    // Comentários em extras
    ;(extraCmtsRes.data || []).forEach((d: any) => {
      result.push({
        id: `extra-cmt-${d.id}`,
        type: 'comment',
        title: 'Comentário em extra',
        subtitle: (d.extras as any)?.title || 'Extra',
        body: d.body || '',
        client_name: d.author_name || '',
        created_at: d.created_at,
        link: d.extra_id ? `/dashboard/extras?post=${d.extra_id}` : '/dashboard/extras',
      })
    })

    // Comentários em materiais
    ;(matCmtsRes.data || []).forEach((d: any) => {
      result.push({
        id: `mat-cmt-${d.id}`,
        type: 'comment',
        title: 'Comentário em material',
        subtitle: (d.materials as any)?.title || 'Material',
        body: d.body || '',
        client_name: d.author_name || '',
        created_at: d.created_at,
        link: d.material_id ? `/dashboard/materiais?post=${d.material_id}` : '/dashboard/materiais',
      })
    })

    // Menções ao membro atual em comentários de posts
    ;(mentionsRes.data || []).forEach((d: any) => {
      const sch = d.schedules as any
      const mq = sch?.month ? `&m=${sch.month}` : ''
      const yq = sch?.year  ? `&y=${sch.year}`  : ''
      result.push({
        id: `mention-${d.id}`,
        type: 'mention',
        title: `${d.author_name || 'Alguém'} te mencionou`,
        subtitle: sch?.title || 'Post',
        body: d.body || '',
        client_name: (sch?.clients as any)?.name || '',
        client_color: (sch?.clients as any)?.color_hex || '',
        created_at: d.created_at,
        link: sch?.client_id
          ? `/dashboard/cronograma?client=${sch.client_id}&post=${d.schedule_id}${mq}${yq}`
          : '/dashboard/cronograma',
      })
    })

    // Menções em materiais
    ;(materialMentionsRes.data || []).forEach((d: any) => {
      const mat = d.materials as any
      result.push({
        id: `mention-mat-${d.id}`,
        type: 'mention' as const,
        title: `${d.author_name || 'Alguém'} te mencionou`,
        subtitle: mat?.title || 'Material',
        body: d.body || '',
        created_at: d.created_at,
        link: `/dashboard/materiais?post=${d.material_id}`,
      })
    })

    // Menções em extras
    ;(extraMentionsRes.data || []).forEach((d: any) => {
      const ext = d.extras as any
      result.push({
        id: `mention-ext-${d.id}`,
        type: 'mention' as const,
        title: `${d.author_name || 'Alguém'} te mencionou`,
        subtitle: ext?.title || 'Extra',
        body: d.body || '',
        created_at: d.created_at,
        link: `/dashboard/extras?post=${d.extra_id}`,
      })
    })

    // Criação hoje — aparecem no topo (prioridade alta)
    ;(criacaoHojeRes.data || []).forEach((entry: any) => {
      const cl = entry.clients as any
      result.push({
        id: `criacao-hoje-${entry.id}`,
        type: 'criacao_hoje' as const,
        title: 'Criação hoje',
        subtitle: cl?.name || 'Cliente',
        client_name: cl?.name,
        client_color: cl?.color_hex,
        body: entry.notes || '',
        created_at: new Date(new Date().setHours(9, 0, 0, 0)).toISOString(),
        link: '/dashboard/criacao',
      })
    })

    result.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    setNotifications(result)
  }

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (notifRef.current && !notifRef.current.contains(e.target as Node)) setShowNotifications(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  useEffect(() => {
    function h(e: MouseEvent) {
      if (memberRef.current && !memberRef.current.contains(e.target as Node)) setShowMemberPicker(false)
    }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [])

  // Ao abrir a página de Aprovações, marca a contagem atual como "vista" → esconde o badge
  useEffect(() => {
    if (pathname === '/dashboard/aprovacao') {
      setSeenApprovals(approvalsCount)
      localStorage.setItem('approvals-seen', String(approvalsCount))
    }
  }, [pathname, approvalsCount])

  const visibleNotifications = notifications.filter(n => !dismissedIds.has(n.id))
  const filteredNotifs = notifFilter === 'mentions'
    ? visibleNotifications.filter(n => n.type === 'mention')
    : visibleNotifications
  const unread = visibleNotifications.filter(n => !readIds.has(n.id)).length
  const mentionUnread = visibleNotifications.filter(n => n.type === 'mention' && !readIds.has(n.id)).length
  const approvalsBadge = approvalsCount > seenApprovals ? approvalsCount : 0
  const approvalPct = stats.total > 0 ? Math.round((stats.approved / stats.total) * 100) : 0

  function NavItem({ href, icon: Icon, label, external, badge }: { href: string; icon: any; label: string; external?: boolean; badge?: number }) {
    const active = pathname === href
    const cls = `relative flex items-center gap-2.5 px-3 py-2 rounded-xl text-sm transition-all ${
      active
        ? 'text-[var(--color-accent)] font-semibold'
        : 'text-[var(--color-text-muted)] font-normal hover:bg-[var(--color-bg-subtle)] hover:text-[var(--color-text-secondary)]'
    }`
    const content = <>
      {active && <span className="absolute inset-0 rounded-xl -z-0" style={{ background: 'var(--color-accent-bg)' }} />}
      <Icon size={15} strokeWidth={active ? 2.25 : 1.75} className="flex-shrink-0 relative z-10" />
      <span className="truncate relative z-10">{label}</span>
      {!!badge && badge > 0 && (
        <span className="ml-auto relative z-10 min-w-[18px] h-[18px] rounded-full text-white text-[10px] font-bold flex items-center justify-center px-1" style={{ background: 'var(--color-accent)' }}>
          {badge > 9 ? '9+' : badge}
        </span>
      )}
      {active && <span className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-4 rounded-r-full z-10" style={{ background: 'var(--color-accent)' }} />}
    </>
    if (external) return <a href={href} target="_blank" rel="noopener noreferrer" className={cls}>{content}</a>
    return <Link href={href} className={cls}>{content}</Link>
  }

  return (
    <div className="flex h-screen bg-[var(--color-bg-page)] overflow-hidden">
      <aside className="w-56 flex-shrink-0 bg-[var(--color-bg-page)] border-r border-[var(--color-border)] flex flex-col overflow-hidden py-6 px-4 relative">
        <Link href="/dashboard" className="flex items-center gap-2.5 px-2 mb-8 rounded-xl hover:opacity-80 transition-opacity" title="Ir para o início">
          <LogoIcon size={34} className="text-[var(--color-logo)] flex-shrink-0" />
          <span className="text-sm font-bold text-[var(--color-text-primary)] tracking-tight">Bagano Hub</span>
        </Link>

        <div className="flex-1 overflow-y-auto min-h-0">
          <p className="text-[10px] font-semibold text-[var(--color-text-faint)] uppercase tracking-widest px-3 mb-2">Geral</p>
          <nav className="flex flex-col gap-0.5 mb-6">
            {navItems.map(item => <NavItem key={item.href} {...item} />)}
          </nav>

          <p className="text-[10px] font-semibold text-[var(--color-text-faint)] uppercase tracking-widest px-3 mb-2">Produção</p>
          <nav className="flex flex-col gap-0.5 mb-6">
            {productionItems.map(item => <NavItem key={item.href} {...item} badge={item.href === '/dashboard/aprovacao' ? approvalsBadge : undefined} />)}
          </nav>

          <p className="text-[10px] font-semibold text-[var(--color-text-faint)] uppercase tracking-widest px-3 mb-2">Conteúdo</p>
          <nav className="flex flex-col gap-0.5">
            {contentItems.map(item => <NavItem key={item.href} {...item} />)}
          </nav>
        </div>

        <div className="pt-4 border-t border-[var(--color-border)]" ref={memberRef}>
          <button
            onClick={() => setShowMemberPicker(v => !v)}
            className="w-full flex items-center gap-2.5 px-2 py-1.5 rounded-xl hover:bg-[var(--color-bg-subtle)] transition-colors text-left group"
          >
            {currentMember ? (
              <>
                <div className="w-8 h-8 rounded-xl flex items-center justify-center text-white text-xs font-bold flex-shrink-0" style={{ background: currentMember.color || 'var(--color-brand)' }}>
                  {currentMember.name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-[var(--color-text-primary)] truncate leading-tight">{currentMember.name.split(' ')[0]}</p>
                  <p className="text-[10px] text-[var(--color-text-muted)] capitalize truncate">{currentMember.role.replace('_', ' ')}</p>
                </div>
                <ChevronDown size={13} className="text-[var(--color-text-faint)] group-hover:text-[var(--color-text-muted)] flex-shrink-0 transition-colors" />
              </>
            ) : (
              <span className="text-sm text-[var(--color-text-muted)] px-1">Quem é você?</span>
            )}
          </button>

          {currentMember && (
            <div className="flex items-center mt-2 bg-[var(--color-bg-subtle)] rounded-lg p-0.5">
              <button
                onClick={() => setShowOnlyMine(true)}
                className={`flex-1 py-1 rounded-md text-[11px] font-medium transition-all ${showOnlyMine ? 'bg-[var(--color-bg-card)] text-[var(--color-text-primary)] shadow-sm' : 'text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)]'}`}
              >
                Meus
              </button>
              <button
                onClick={() => setShowOnlyMine(false)}
                className={`flex-1 py-1 rounded-md text-[11px] font-medium transition-all ${!showOnlyMine ? 'bg-[var(--color-bg-card)] text-[var(--color-text-primary)] shadow-sm' : 'text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)]'}`}
              >
                Todos
              </button>
            </div>
          )}

          {showMemberPicker && (
            <div className="absolute bottom-16 left-3 right-3 bg-[var(--color-bg-card)] rounded-2xl border border-[var(--color-border)] shadow-xl overflow-hidden z-50 max-h-72 overflow-y-auto">
              {members.map(m => (
                <button
                  key={m.id}
                  onClick={() => { setCurrentMember(m); setShowMemberPicker(false) }}
                  className="w-full flex items-center gap-2.5 px-4 py-2.5 hover:bg-[var(--color-bg-subtle)] transition-colors text-left"
                >
                  <div className="w-6 h-6 rounded-lg flex items-center justify-center text-white text-[10px] font-bold flex-shrink-0" style={{ background: m.color || 'var(--color-brand)' }}>
                    {m.name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-[var(--color-text-primary)] truncate">{m.name}</p>
                    <p className="text-[10px] text-[var(--color-text-muted)] capitalize">{m.role.replace('_', ' ')}</p>
                  </div>
                  {currentMember?.id === m.id && <Check size={14} className="text-[var(--color-text-primary)]" />}
                </button>
              ))}
            </div>
          )}
        </div>
      </aside>

      <div className="flex-1 flex flex-col overflow-hidden">
        <div className="h-14 border-b border-[var(--color-border)] bg-[var(--color-bg-page)] flex items-center justify-between px-8">
          <div className="flex items-center gap-3">
            <CommandPalette />
          </div>

          <div className="flex items-center gap-1">
            {/* Theme toggle */}
            <div className="flex items-center bg-[var(--color-bg-subtle)] rounded-xl p-0.5 mr-1">
              {([['auto', Monitor], ['light', Sun], ['dark', Moon]] as const).map(([m, Icon]) => (
                <button
                  key={m}
                  onClick={() => setMode(m)}
                  title={m === 'auto' ? 'Automático (sistema)' : m === 'light' ? 'Claro' : 'Escuro'}
                  className={`w-7 h-7 rounded-lg flex items-center justify-center transition-all ${mode === m ? 'bg-[var(--color-bg-card)] shadow-sm text-[var(--color-text-primary)]' : 'text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]'}`}
                >
                  <Icon size={13} strokeWidth={1.75} />
                </button>
              ))}
            </div>

          <div ref={notifRef} className="relative">
            <button onClick={() => { if (!showNotifications) markAllRead(); setShowNotifications(v => !v) }}
              className="relative w-9 h-9 rounded-xl hover:bg-[var(--color-bg-subtle)] flex items-center justify-center transition-all">
              <Bell size={18} strokeWidth={1.75} className="text-[var(--color-text-secondary)]" />
              {unread > 0 && (
                <span className="absolute top-1 right-1 min-w-[14px] h-3.5 rounded-full text-white text-[8px] font-bold flex items-center justify-center px-0.5" style={{ background: 'var(--ds-error-accent)' }}>
                  {unread > 9 ? '9+' : unread}
                </span>
              )}
            </button>
            {showNotifications && (
              <div className="absolute right-0 top-11 w-96 bg-[var(--color-bg-card)] rounded-2xl border border-[var(--color-border)] shadow-xl overflow-hidden z-50 flex flex-col" style={{ maxHeight: '520px' }}>
                {/* Header */}
                <div className="px-4 py-3.5 border-b border-[var(--color-border)] flex items-center justify-between flex-shrink-0">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-bold text-[var(--color-text-primary)]">Notificações</p>
                    {unread > 0 && (
                      <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full text-white" style={{ background: 'var(--ds-error-accent)' }}>{unread} nova{unread !== 1 ? 's' : ''}</span>
                    )}
                  </div>
                  <div className="flex items-center gap-3">
                    {unread > 0 && (
                      <button onClick={markAllRead} className="text-xs text-[var(--color-text-muted)] hover:text-[var(--color-brand)] transition-colors">
                        Marcar como lido
                      </button>
                    )}
                    {visibleNotifications.length > 0 && (
                      <button onClick={clearAll} className="text-xs text-[var(--color-text-muted)] hover:text-[var(--color-brand)] transition-colors">
                        Limpar
                      </button>
                    )}
                  </div>
                </div>

                {/* Resumo divertido de aprovações */}
                {stats.total > 0 && (
                  <div className="px-4 py-3 flex items-center gap-3 flex-shrink-0 border-b border-[var(--color-border)]" style={{ background: 'var(--color-accent-bg)' }}>
                    <span className="text-2xl leading-none">{approvalPct >= 80 ? '🎉' : approvalPct >= 50 ? '💪' : '📈'}</span>
                    <div className="min-w-0">
                      <p className="text-xs font-bold text-[var(--color-text-primary)]">
                        {approvalPct >= 80 ? 'Uhuul! ' : ''}{approvalPct}% dos posts aprovados
                      </p>
                      <p className="text-[11px] text-[var(--color-text-secondary)]">
                        {stats.revision > 0
                          ? `${stats.revision} ${stats.revision === 1 ? 'post precisa' : 'posts precisam'} de ajuste`
                          : 'nenhum ajuste pendente ✨'}
                      </p>
                    </div>
                  </div>
                )}

                {/* Filtros */}
                {currentMember && (
                  <div className="px-4 py-2 flex items-center gap-1.5 border-b border-[var(--color-border)] flex-shrink-0">
                    <button onClick={() => setNotifFilter('all')}
                      className="text-[11px] font-semibold px-2.5 py-1 rounded-full transition-colors"
                      style={notifFilter === 'all' ? { background: 'var(--color-accent)', color: '#fff' } : { color: 'var(--color-text-muted)' }}>
                      Todas
                    </button>
                    <button onClick={() => setNotifFilter('mentions')}
                      className="flex items-center gap-1 text-[11px] font-semibold px-2.5 py-1 rounded-full transition-colors"
                      style={notifFilter === 'mentions' ? { background: 'var(--color-accent)', color: '#fff' } : { color: 'var(--color-text-muted)' }}>
                      <AtSign size={10} /> Menções
                      {mentionUnread > 0 && notifFilter !== 'mentions' && (
                        <span className="min-w-[14px] h-3.5 rounded-full text-white text-[8px] font-bold flex items-center justify-center px-0.5" style={{ background: 'var(--ds-error-accent)' }}>
                          {mentionUnread > 9 ? '9+' : mentionUnread}
                        </span>
                      )}
                    </button>
                  </div>
                )}

                {/* List */}
                <div className="overflow-y-auto flex-1">
                  {filteredNotifs.length === 0 ? (
                    <div className="px-5 py-12 text-center flex flex-col items-center gap-2">
                      {notifFilter === 'mentions'
                        ? <><AtSign size={28} strokeWidth={1.5} className="text-[var(--color-text-faint)]" /><p className="text-sm text-[var(--color-text-muted)]">Nenhuma menção</p><p className="text-xs text-[var(--color-text-faint)]">Quando alguém usar @{currentMember?.name.split(' ')[0]} em um comentário, vai aparecer aqui</p></>
                        : <><Bell size={28} strokeWidth={1.5} className="text-[var(--color-text-faint)]" /><p className="text-sm text-[var(--color-text-muted)]">Nenhuma notificação</p><p className="text-xs text-[var(--color-text-faint)]">Aprovações e comentários aparecerão aqui</p></>
                      }
                    </div>
                  ) : filteredNotifs.map(n => {
                    const isRead = readIds.has(n.id)
                    const isApproval = n.type === 'approval'
                    const isRejection = n.type === 'rejection'
                    const isMention = n.type === 'mention'
                    return (
                      <Link key={n.id} href={n.link}
                        onClick={() => { markRead(n.id); setShowNotifications(false) }}
                        className={`flex items-start gap-3 px-4 py-3.5 border-b border-[var(--color-border)] hover:bg-[var(--color-bg-subtle)] transition-colors cursor-pointer ${!isRead ? 'bg-[var(--color-bg-subtle)]' : ''}`}>
                        {/* Icon */}
                        <div className={`w-8 h-8 rounded-xl flex-shrink-0 flex items-center justify-center mt-0.5`} style={{
                          background: isApproval ? 'var(--ds-success-bg)' : isRejection ? 'var(--ds-error-bg)' : isMention ? 'var(--ds-purple-bg)' : n.type === 'captacao' ? 'var(--ds-purple-bg)' : n.type === 'urgente' ? 'var(--ds-error-bg)' : n.type === 'deadline' || n.type === 'extra_vencido' ? 'var(--ds-warn-bg)' : n.type === 'cronograma_ok' ? 'var(--ds-success-bg)' : n.type === 'revisao_interna' ? 'var(--ds-caution-bg)' : n.type === 'criacao_hoje' ? 'var(--ds-caution-bg)' : 'var(--ds-info-bg)',
                          color: isApproval ? 'var(--ds-success-accent)' : isRejection ? 'var(--ds-error-accent)' : isMention ? 'var(--ds-purple-accent)' : n.type === 'captacao' ? 'var(--ds-purple-accent)' : n.type === 'urgente' ? 'var(--ds-error-accent)' : n.type === 'deadline' || n.type === 'extra_vencido' ? 'var(--ds-warn-accent)' : n.type === 'cronograma_ok' ? 'var(--ds-success-accent)' : n.type === 'revisao_interna' ? 'var(--ds-caution-accent)' : n.type === 'criacao_hoje' ? 'var(--ds-caution-accent)' : 'var(--ds-info-accent)',
                        }}>
                          {isApproval              ? <CheckCircle2 size={15} strokeWidth={2} /> :
                           isRejection             ? <XCircle      size={15} strokeWidth={2} /> :
                           isMention               ? <AtSign       size={15} strokeWidth={2} /> :
                           n.type === 'captacao'   ? <Camera       size={15} strokeWidth={2} /> :
                           n.type === 'urgente'    ? <Zap          size={15} strokeWidth={2} /> :
                           n.type === 'revisao_interna' ? <Eye     size={15} strokeWidth={2} /> :
                           n.type === 'extra_vencido' ? <ListChecks size={15} strokeWidth={2} /> :
                           n.type === 'cronograma_ok' ? <CalendarClock size={15} strokeWidth={2} /> :
                           n.type === 'criacao_hoje' ? <LayoutList   size={15} strokeWidth={2} /> :
                           n.type === 'deadline'   ? <Clock        size={15} strokeWidth={2} /> :
                           <MessageCircle size={15} strokeWidth={2} />}
                        </div>

                        {/* Content */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-start justify-between gap-2">
                            <p className="text-xs font-semibold leading-snug" style={{ color: isApproval ? 'var(--ds-success-text)' : isRejection ? 'var(--ds-error-text)' : 'var(--color-text-primary)' }}>
                              {n.title}
                            </p>
                            {n.created_at !== new Date(0).toISOString() && (
                              <span className="text-[10px] text-[var(--color-text-faint)] flex-shrink-0">{timeAgo(n.created_at)}</span>
                            )}
                          </div>
                          <p className="text-xs text-[var(--color-text-primary)] font-medium truncate mt-0.5">{n.subtitle}</p>
                          {n.client_name && <p className="text-[10px] text-[var(--color-text-muted)] mt-0.5">{n.client_name}</p>}
                          {n.body && <p className="text-[11px] text-[var(--color-text-secondary)] mt-1 italic line-clamp-2">"{n.body}"</p>}
                        </div>

                        {/* Unread dot */}
                        {!isRead && <div className="w-2 h-2 rounded-full flex-shrink-0 mt-2" style={{ background: 'var(--ds-info-accent)' }} />}
                      </Link>
                    )
                  })}
                </div>
              </div>
            )}
          </div>
          </div>{/* flex items-center gap-1 */}
        </div>

        <main className="flex-1 overflow-auto page-content">
          {children}
        </main>
      </div>
    </div>
  )
}


export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider>
      <UserProvider>
        <ToastProvider>
          <DashboardInner>{children}</DashboardInner>
        </ToastProvider>
      </UserProvider>
    </ThemeProvider>
  )
}
