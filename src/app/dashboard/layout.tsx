'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useState, useRef } from 'react'
import { createClient } from '@/lib/supabase'
import { UserProvider, useUser } from '@/lib/UserContext'
import { ChevronDown, Check } from 'lucide-react'
import { Home, Users, Calendar, Kanban, Smartphone, Megaphone, BookOpen, CalendarHeart, Bell, Package, Sun, Moon, Monitor, LayoutList, ClipboardCheck, CalendarDays, UserCircle2, CheckCircle2, XCircle, Camera, Clock, MessageCircle, Trash2 } from 'lucide-react'
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
  type: 'approval' | 'rejection' | 'comment' | 'captacao' | 'deadline'
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
  const [showNotifications, setShowNotifications] = useState(false)
  const notifRef = useRef<HTMLDivElement>(null)
  const { mode, setMode } = useTheme()

  const [readIds, setReadIds] = useState<Set<string>>(() => {
    if (typeof window === 'undefined') return new Set()
    try { return new Set(JSON.parse(localStorage.getItem('notif-read') || '[]')) }
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

  useEffect(() => {
    loadNotifications()
    const interval = setInterval(loadNotifications, 30000)
    return () => clearInterval(interval)
  }, [])

  async function loadNotifications() {
    const supabase = createClient()
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
    const threeDaysFromNow = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
    const today = new Date().toISOString().slice(0, 10)
    const threeDaysAgoDate = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)

    const [approvalsRes, extraCmtsRes, matCmtsRes, captacoesRes, pendingPostsRes, pendingCountRes, rejectedCountRes] = await Promise.all([
      supabase.from('schedules')
        .select('id, title, approval_status, approval_comment, clients(name, color_hex)')
        .in('approval_status', ['aprovado', 'não aprovado'])
        .limit(30),
      supabase.from('extra_comments')
        .select('id, body, author_name, created_at, extras(title)')
        .gte('created_at', sevenDaysAgo)
        .order('created_at', { ascending: false })
        .limit(15),
      supabase.from('material_comments')
        .select('id, body, author_name, created_at, materials(title)')
        .gte('created_at', sevenDaysAgo)
        .order('created_at', { ascending: false })
        .limit(15),
      supabase.from('captacoes')
        .select('id, scheduled_date, clients(name, color_hex)')
        .gte('scheduled_date', today)
        .lte('scheduled_date', threeDaysFromNow)
        .eq('status', 'agendada')
        .order('scheduled_date')
        .limit(10),
      supabase.from('schedules')
        .select('id, title, clients(name, color_hex)')
        .eq('status', 'aguardando_aprovacao')
        .lte('scheduled_date', threeDaysAgoDate)
        .limit(10),
      supabase.from('schedules')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'aguardando_aprovacao'),
      supabase.from('schedules')
        .select('id', { count: 'exact', head: true })
        .eq('approval_status', 'não aprovado'),
    ])

    setApprovalsCount((pendingCountRes.count || 0) + (rejectedCountRes.count || 0))

    const result: Notification[] = []

    ;(approvalsRes.data || []).forEach((d: any) => {
      result.push({
        id: `approval-${d.id}`,
        type: d.approval_status === 'aprovado' ? 'approval' : 'rejection',
        title: d.approval_status === 'aprovado' ? 'Post aprovado pelo cliente' : 'Alterações solicitadas',
        subtitle: d.title || 'Post sem título',
        body: d.approval_comment || '',
        client_name: d.clients?.name || '',
        client_color: d.clients?.color_hex || '',
        created_at: new Date(0).toISOString(),
        link: '/dashboard/cronograma',
      })
    })

    ;(captacoesRes.data || []).forEach((d: any) => {
      const date = new Date(d.scheduled_date + 'T12:00:00')
      const diffDays = Math.ceil((date.getTime() - Date.now()) / 86400000)
      const when = diffDays === 0 ? 'hoje' : diffDays === 1 ? 'amanhã' : `em ${diffDays} dias`
      result.push({
        id: `capt-${d.id}`,
        type: 'captacao',
        title: `Captação ${when}`,
        subtitle: d.clients?.name || 'Cliente',
        client_name: date.toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' }),
        client_color: d.clients?.color_hex || '',
        created_at: new Date(0).toISOString(),
        link: '/dashboard/agenda',
      })
    })

    ;(pendingPostsRes.data || []).forEach((d: any) => {
      result.push({
        id: `pending-${d.id}`,
        type: 'deadline',
        title: 'Aguardando aprovação há 3+ dias',
        subtitle: d.title || 'Post sem título',
        client_name: d.clients?.name || '',
        client_color: d.clients?.color_hex || '',
        created_at: new Date(0).toISOString(),
        link: '/dashboard/aprovacao',
      })
    })

    ;(extraCmtsRes.data || []).forEach((d: any) => {
      result.push({
        id: `extra-cmt-${d.id}`,
        type: 'comment',
        title: 'Comentário em extra',
        subtitle: (d.extras as any)?.title || 'Extra',
        body: d.body || '',
        client_name: d.author_name || '',
        created_at: d.created_at,
        link: '/dashboard/extras',
      })
    })

    ;(matCmtsRes.data || []).forEach((d: any) => {
      result.push({
        id: `mat-cmt-${d.id}`,
        type: 'comment',
        title: 'Comentário em material',
        subtitle: (d.materials as any)?.title || 'Material',
        body: d.body || '',
        client_name: d.author_name || '',
        created_at: d.created_at,
        link: '/dashboard/materiais',
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

  const unread = notifications.filter(n => !readIds.has(n.id)).length

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
      <aside className="w-56 flex-shrink-0 bg-[var(--color-bg-page)] border-r border-[var(--color-border)] flex flex-col py-6 px-4 relative">
        <div className="flex items-center gap-2.5 px-2 mb-8">
          <LogoIcon size={34} className="text-[var(--color-logo)] flex-shrink-0" />
          <span className="text-sm font-bold text-[var(--color-text-primary)] tracking-tight">Bagano Hub</span>
        </div>

        <p className="text-[10px] font-semibold text-[var(--color-text-faint)] uppercase tracking-widest px-3 mb-2">Geral</p>
        <nav className="flex flex-col gap-0.5 mb-6">
          {navItems.map(item => <NavItem key={item.href} {...item} />)}
        </nav>

        <p className="text-[10px] font-semibold text-[var(--color-text-faint)] uppercase tracking-widest px-3 mb-2">Produção</p>
        <nav className="flex flex-col gap-0.5 mb-6">
          {productionItems.map(item => <NavItem key={item.href} {...item} badge={item.href === '/dashboard/aprovacao' ? approvalsCount : undefined} />)}
        </nav>

        <p className="text-[10px] font-semibold text-[var(--color-text-faint)] uppercase tracking-widest px-3 mb-2">Conteúdo</p>
        <nav className="flex flex-col gap-0.5">
          {contentItems.map(item => <NavItem key={item.href} {...item} />)}
        </nav>

        <div className="mt-auto pt-4 border-t border-[var(--color-border)]" ref={memberRef}>
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

          <div ref={notifRef}>
          <div className="relative">
            <button onClick={() => { setShowNotifications(v => !v) }}
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
                  {unread > 0 && (
                    <button onClick={markAllRead} className="text-xs text-[var(--color-text-muted)] hover:text-[var(--color-brand)] transition-colors">
                      Marcar tudo como lido
                    </button>
                  )}
                </div>

                {/* List */}
                <div className="overflow-y-auto flex-1">
                  {notifications.length === 0 ? (
                    <div className="px-5 py-12 text-center flex flex-col items-center gap-2">
                      <Bell size={28} strokeWidth={1.5} className="text-[var(--color-text-faint)]" />
                      <p className="text-sm text-[var(--color-text-muted)]">Nenhuma notificação</p>
                      <p className="text-xs text-[var(--color-text-faint)]">Aprovações e comentários aparecerão aqui</p>
                    </div>
                  ) : notifications.map(n => {
                    const isRead = readIds.has(n.id)
                    const isApproval = n.type === 'approval'
                    const isRejection = n.type === 'rejection'
                    return (
                      <Link key={n.id} href={n.link}
                        onClick={() => { markRead(n.id); setShowNotifications(false) }}
                        className={`flex items-start gap-3 px-4 py-3.5 border-b border-[var(--color-border)] hover:bg-[var(--color-bg-subtle)] transition-colors cursor-pointer ${!isRead ? 'bg-[var(--color-bg-subtle)]' : ''}`}>
                        {/* Icon */}
                        <div className={`w-8 h-8 rounded-xl flex-shrink-0 flex items-center justify-center mt-0.5`} style={{
                          background: isApproval ? 'var(--ds-success-bg)' : isRejection ? 'var(--ds-error-bg)' : n.type === 'captacao' ? 'var(--ds-purple-bg)' : n.type === 'deadline' ? 'var(--ds-warn-bg)' : 'var(--ds-info-bg)',
                          color: isApproval ? 'var(--ds-success-accent)' : isRejection ? 'var(--ds-error-accent)' : n.type === 'captacao' ? 'var(--ds-purple-accent)' : n.type === 'deadline' ? 'var(--ds-warn-accent)' : 'var(--ds-info-accent)',
                        }}>
                          {isApproval    ? <CheckCircle2 size={15} strokeWidth={2} /> :
                           isRejection   ? <XCircle      size={15} strokeWidth={2} /> :
                           n.type === 'captacao' ? <Camera size={15} strokeWidth={2} /> :
                           n.type === 'deadline' ? <Clock  size={15} strokeWidth={2} /> :
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
