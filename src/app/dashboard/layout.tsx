'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useState, useRef } from 'react'
import { createClient } from '@/lib/supabase'
import { UserProvider, useUser } from '@/lib/UserContext'
import { ChevronDown, Check } from 'lucide-react'
import { Home, Users, Calendar, Kanban, Smartphone, Megaphone, BookOpen, CalendarHeart, Bell, CheckCircle, XCircle, Package, Sun, Moon, Monitor, LayoutList } from 'lucide-react'
import CommandPalette from '@/components/CommandPalette'
import { ThemeProvider, useTheme } from '@/lib/ThemeProvider'

const navItems = [
  { href: '/dashboard',          icon: Home,          label: 'Início' },
  { href: '/dashboard/clientes', icon: Users,         label: 'Clientes' },
]
const productionItems = [
  { href: '/dashboard/cronograma', icon: Calendar,    label: 'Cronograma' },
  { href: '/dashboard/kanban',     icon: Kanban,      label: 'Kanban' },
  { href: '/dashboard/feed',       icon: Smartphone,  label: 'Feed Visual' },
  { href: '/dashboard/materiais',  icon: Package,     label: 'Materiais' },
  { href: '/dashboard/campanhas',  icon: Megaphone,   label: 'Campanhas' },
  { href: '/dashboard/extras',     icon: LayoutList,  label: 'Extras' },
]
const contentItems = [
  { href: 'https://sous-chef-bagano.netlify.app/', icon: BookOpen,      label: 'Manuais', external: true },
  { href: '/dashboard/datas-especiais',            icon: CalendarHeart, label: 'Datas especiais' },
]

type Notification = { id: string; post_title: string; client_name: string; approval_status: string; approval_comment: string }

function DashboardInner({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const { members, currentMember, setCurrentMember, showOnlyMine, setShowOnlyMine } = useUser()
  const [showMemberPicker, setShowMemberPicker] = useState(false)
  const memberRef = useRef<HTMLDivElement>(null)
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [showNotifications, setShowNotifications] = useState(false)
  const notifRef = useRef<HTMLDivElement>(null)
  const { mode, setMode } = useTheme()

  useEffect(() => {
    loadNotifications()
    const interval = setInterval(loadNotifications, 30000)
    return () => clearInterval(interval)
  }, [])

  async function loadNotifications() {
    const supabase = createClient()
    const { data } = await supabase
      .from('schedules')
      .select('id, title, approval_status, approval_comment, clients(name)')
      .in('approval_status', ['aprovado', 'não aprovado'])
      .order('post_number')
    if (data) {
      setNotifications(data.map((d: any) => ({
        id: d.id, post_title: d.title, client_name: d.clients?.name || '',
        approval_status: d.approval_status, approval_comment: d.approval_comment || '',
      })))
    }
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

  const unread = notifications.filter(n => n.approval_status === 'não aprovado').length

  function NavItem({ href, icon: Icon, label, external }: { href: string; icon: any; label: string; external?: boolean }) {
    const active = pathname === href
    const cls = `flex items-center gap-3 px-3 py-2 rounded-xl text-sm transition-all ${active ? 'text-[var(--color-text-primary)] font-bold' : 'text-[var(--color-text-muted)] font-normal hover:text-[var(--color-text-primary)]'}`
    if (external) return (
      <a href={href} target="_blank" rel="noopener noreferrer" className={cls}>
        <Icon size={16} strokeWidth={1.75} />
        <span>{label}</span>
      </a>
    )
    return (
      <Link href={href} className={cls}>
        <Icon size={16} strokeWidth={active ? 2.5 : 1.75} />
        <span>{label}</span>
      </Link>
    )
  }

  return (
    <div className="flex h-screen bg-[var(--color-bg-page)] overflow-hidden">
      <aside className="w-56 flex-shrink-0 bg-[var(--color-bg-page)] border-r border-[var(--color-border)] flex flex-col py-6 px-4">
        <div className="flex items-center gap-2.5 px-2 mb-8">
          <div className="w-8 h-8 bg-[var(--color-brand)] rounded-xl flex items-center justify-center">
            <span className="text-white text-xs font-bold">B</span>
          </div>
          <span className="text-sm font-bold text-[var(--color-text-primary)] tracking-tight">Bagano Hub</span>
        </div>

        <p className="text-[10px] font-semibold text-[var(--color-text-faint)] uppercase tracking-widest px-3 mb-2">Geral</p>
        <nav className="flex flex-col gap-0.5 mb-6">
          {navItems.map(item => <NavItem key={item.href} {...item} />)}
        </nav>

        <p className="text-[10px] font-semibold text-[var(--color-text-faint)] uppercase tracking-widest px-3 mb-2">Produção</p>
        <nav className="flex flex-col gap-0.5 mb-6">
          {productionItems.map(item => <NavItem key={item.href} {...item} />)}
        </nav>

        <p className="text-[10px] font-semibold text-[var(--color-text-faint)] uppercase tracking-widest px-3 mb-2">Conteúdo</p>
        <nav className="flex flex-col gap-0.5">
          {contentItems.map(item => <NavItem key={item.href} {...item} />)}
        </nav>

        {currentMember && (
          <div className="mt-auto pt-4 border-t border-[var(--color-border)]">
            <div className="flex items-center gap-3 px-2">
              <div className="w-8 h-8 rounded-full bg-[var(--color-brand)] flex items-center justify-center text-[var(--color-brand-fg)] text-xs font-semibold flex-shrink-0">
                {currentMember.name.slice(0, 2).toUpperCase()}
              </div>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-[var(--color-text-primary)] truncate">{currentMember.name}</p>
                <p className="text-xs text-[var(--color-text-muted)] capitalize">{currentMember.role.replace('_', ' ')}</p>
              </div>
            </div>
          </div>
        )}
      </aside>

      <div className="flex-1 flex flex-col overflow-hidden">
        <div className="h-14 border-b border-[var(--color-border)] bg-[var(--color-bg-page)] flex items-center justify-between px-8">
          {/* Seletor de pessoa + filtro */}
          <div className="flex items-center gap-3">
            <div className="relative" ref={memberRef}>
              <button
                onClick={() => setShowMemberPicker(v => !v)}
                className="flex items-center gap-2 px-3 py-1.5 rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-card)] hover:border-[var(--color-border-hover)] transition-all text-sm"
              >
                {currentMember ? (
                  <>
                    <div className="w-5 h-5 rounded-full bg-[var(--color-brand)] flex items-center justify-center text-[var(--color-brand-fg)] text-[9px] font-semibold">
                      {currentMember.name.slice(0,2).toUpperCase()}
                    </div>
                    <span className="font-medium text-[var(--color-text-primary)]">{currentMember.name}</span>
                  </>
                ) : (
                  <span className="text-[var(--color-text-muted)]">Quem é você?</span>
                )}
                <ChevronDown size={14} className="text-[var(--color-text-muted)]" />
              </button>

              {showMemberPicker && (
                <div className="absolute left-0 top-11 w-56 bg-[var(--color-bg-card)] rounded-2xl border border-[var(--color-border)] overflow-hidden z-50 max-h-80 overflow-y-auto">
                  {members.map(m => (
                    <button
                      key={m.id}
                      onClick={() => { setCurrentMember(m); setShowMemberPicker(false) }}
                      className="w-full flex items-center gap-2.5 px-4 py-2.5 hover:bg-[var(--color-bg-subtle)] transition-colors text-left"
                    >
                      <div className="w-6 h-6 rounded-full bg-[var(--color-brand)] flex items-center justify-center text-[var(--color-brand-fg)] text-[10px] font-semibold flex-shrink-0">
                        {m.name.slice(0,2).toUpperCase()}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-[var(--color-text-primary)] truncate">{m.name}</p>
                        <p className="text-[10px] text-[var(--color-text-muted)] capitalize">{m.role.replace('_',' ')}</p>
                      </div>
                      {currentMember?.id === m.id && <Check size={14} className="text-[var(--color-text-primary)]" />}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Toggle meus / todos */}
            {currentMember && (
              <div className="flex items-center bg-[var(--color-bg-card)] border border-[var(--color-border)] rounded-xl p-0.5">
                <button
                  onClick={() => setShowOnlyMine(true)}
                  className={`px-3 py-1 rounded-lg text-xs font-medium transition-all ${showOnlyMine ? 'bg-[var(--color-brand)] text-[var(--color-brand-fg)]' : 'text-[var(--color-text-muted)]'}`}
                >
                  Meus
                </button>
                <button
                  onClick={() => setShowOnlyMine(false)}
                  className={`px-3 py-1 rounded-lg text-xs font-medium transition-all ${!showOnlyMine ? 'bg-[var(--color-brand)] text-[var(--color-brand-fg)]' : 'text-[var(--color-text-muted)]'}`}
                >
                  Todos
                </button>
              </div>
            )}
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
            <button onClick={() => setShowNotifications(v => !v)} className="relative w-9 h-9 rounded-xl hover:bg-[var(--color-bg-subtle)] flex items-center justify-center transition-all">
              <Bell size={18} strokeWidth={1.75} className="text-[var(--color-text-secondary)]" />
              {unread > 0 && <span className="absolute top-1 right-1 w-3.5 h-3.5 bg-red-500 rounded-full text-white text-[8px] font-bold flex items-center justify-center">{unread}</span>}
            </button>
            {showNotifications && (
              <div className="absolute right-0 top-11 w-80 bg-[var(--color-bg-card)] rounded-2xl border border-[var(--color-border)] overflow-hidden z-50">
                <div className="px-5 py-4 border-b border-[var(--color-border)] flex items-center justify-between">
                  <p className="text-sm font-bold text-[var(--color-text-primary)]">Aprovações</p>
                  <span className="text-xs text-[var(--color-text-muted)]">{notifications.length} posts</span>
                </div>
                <div className="max-h-80 overflow-y-auto">
                  {notifications.length === 0 ? (
                    <div className="px-5 py-8 text-center"><p className="text-sm text-[var(--color-text-muted)]">Nenhuma resposta ainda</p></div>
                  ) : notifications.map(n => (
                    <div key={n.id} className={`px-5 py-3.5 border-b border-[var(--color-border)] flex items-start gap-3 ${n.approval_status === 'não aprovado' ? 'bg-red-50' : ''}`}>
                      {n.approval_status === 'aprovado' ? <CheckCircle size={16} className="text-green-500 flex-shrink-0 mt-0.5" /> : <XCircle size={16} className="text-red-500 flex-shrink-0 mt-0.5" />}
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-[var(--color-text-primary)] truncate">{n.post_title}</p>
                        <p className="text-xs text-[var(--color-text-muted)]">{n.client_name}</p>
                        {n.approval_comment && <p className="text-xs text-[var(--color-text-secondary)] mt-1 italic">"{n.approval_comment}"</p>}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
          </div>
          </div>{/* flex items-center gap-1 */}
        </div>

        <main className="flex-1 overflow-auto">
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
        <DashboardInner>{children}</DashboardInner>
      </UserProvider>
    </ThemeProvider>
  )
}
