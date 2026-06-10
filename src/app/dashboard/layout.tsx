'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useState, useRef } from 'react'
import { createClient } from '@/lib/supabase'

const navItems = [
  { href: '/dashboard', icon: '🏠', label: 'Início' },
  { href: '/dashboard/clientes', icon: '👥', label: 'Clientes' },
]

const productionItems = [
  { href: '/dashboard/cronograma', icon: '📅', label: 'Cronograma' },
  { href: '/dashboard/kanban', icon: '📋', label: 'Kanban' },
  { href: '/dashboard/feed', icon: '📱', label: 'Feed Visual' },
  { href: '/dashboard/campanhas', icon: '📣', label: 'Campanhas' },
]

const contentItems = [
  { href: '/dashboard/manuais', icon: '📚', label: 'Manuais' },
  { href: '/dashboard/datas-especiais', icon: '📌', label: 'Datas especiais' },
]

type Notification = {
  id: string
  post_title: string
  client_name: string
  approval_status: string
  approval_comment: string
  read: boolean
  created_at: string
}

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [showNotifications, setShowNotifications] = useState(false)
  const notifRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    loadNotifications()
    // Poll a cada 30s
    const interval = setInterval(loadNotifications, 30000)
    return () => clearInterval(interval)
  }, [])

  async function loadNotifications() {
    const supabase = createClient()
    const { data } = await supabase
      .from('schedules')
      .select('id, title, approval_status, approval_comment, client_id, clients(name)')
      .in('approval_status', ['aprovado', 'não aprovado'])
      .order('post_number')
    
    if (data) {
      setNotifications(data.map((d: any) => ({
        id: d.id,
        post_title: d.title,
        client_name: d.clients?.name || '',
        approval_status: d.approval_status,
        approval_comment: d.approval_comment || '',
        read: false,
        created_at: '',
      })))
    }
  }

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (notifRef.current && !notifRef.current.contains(e.target as Node)) {
        setShowNotifications(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  const unread = notifications.filter(n => n.approval_status === 'não aprovado').length

  function NavItem({ href, icon, label }: { href: string; icon: string; label: string }) {
    const active = pathname === href
    return (
      <Link href={href} className={`flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-all ${active ? 'bg-[var(--color-text-primary)] text-white' : 'text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-subtle)] hover:text-[var(--color-text-primary)]'}`}>
        <span className="text-base">{icon}</span>
        <span className="font-medium">{label}</span>
      </Link>
    )
  }

  return (
    <div className="flex h-screen bg-[var(--color-bg-input)] overflow-hidden">
      {/* Sidebar */}
      <aside className="w-44 flex-shrink-0 bg-[var(--color-bg-input)] border-r border-[var(--color-border)] flex flex-col py-4 px-3">
        {/* Logo */}
        <div className="flex items-center gap-2 px-3 mb-6">
          <div className="w-7 h-7 bg-[var(--color-text-primary)] rounded-lg flex items-center justify-center text-white text-xs font-bold">B</div>
          <span className="text-sm font-semibold text-[var(--color-text-primary)]">Bagano Hub</span>
        </div>

        <nav className="flex flex-col gap-0.5">
          {navItems.map(item => <NavItem key={item.href} {...item} />)}
        </nav>

        <p className="text-[10px] font-semibold text-[var(--color-text-muted)] uppercase tracking-wider px-3 mt-5 mb-1">Produção</p>
        <nav className="flex flex-col gap-0.5">
          {productionItems.map(item => <NavItem key={item.href} {...item} />)}
        </nav>

        <p className="text-[10px] font-semibold text-[var(--color-text-muted)] uppercase tracking-wider px-3 mt-5 mb-1">Conteúdo</p>
        <nav className="flex flex-col gap-0.5">
          {contentItems.map(item => <NavItem key={item.href} {...item} />)}
        </nav>

        {/* User */}
        <div className="mt-auto flex items-center gap-2 px-3 pt-4 border-t border-[var(--color-border)]">
          <div className="w-7 h-7 rounded-full bg-[var(--color-text-primary)] flex items-center justify-center text-white text-xs font-bold flex-shrink-0">N</div>
          <div className="min-w-0">
            <p className="text-xs font-medium text-[var(--color-text-primary)] truncate">Higor</p>
            <p className="text-[10px] text-[var(--color-text-muted)]">Admin</p>
          </div>
        </div>
      </aside>

      {/* Main */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Top bar */}
        <div className="h-12 border-b border-[var(--color-border)] bg-white flex items-center justify-end px-6">
          <div className="relative" ref={notifRef}>
            <button
              onClick={() => setShowNotifications(v => !v)}
              className="relative w-8 h-8 rounded-lg hover:bg-[var(--color-bg-subtle)] flex items-center justify-center transition-all"
            >
              <span className="text-lg">🔔</span>
              {unread > 0 && (
                <span className="absolute top-0.5 right-0.5 w-4 h-4 bg-red-500 rounded-full text-white text-[9px] font-bold flex items-center justify-center">
                  {unread}
                </span>
              )}
            </button>

            {/* Dropdown */}
            {showNotifications && (
              <div className="absolute right-0 top-10 w-80 bg-white rounded-2xl shadow-xl border border-[var(--color-border)] overflow-hidden z-50">
                <div className="px-4 py-3 border-b border-[var(--color-border)] flex items-center justify-between">
                  <p className="text-sm font-semibold text-[var(--color-text-primary)]">Aprovações dos clientes</p>
                  <span className="text-xs text-[var(--color-text-muted)]">{notifications.length} posts</span>
                </div>
                <div className="max-h-80 overflow-y-auto">
                  {notifications.length === 0 ? (
                    <div className="px-4 py-6 text-center">
                      <p className="text-sm text-[var(--color-text-muted)]">Nenhuma resposta ainda</p>
                    </div>
                  ) : (
                    notifications.map(n => (
                      <div key={n.id} className={`px-4 py-3 border-b border-[var(--color-bg-subtle)] flex items-start gap-3 ${n.approval_status === 'não aprovado' ? 'bg-red-50' : 'bg-white'}`}>
                        <span className={`text-base flex-shrink-0 mt-0.5 ${n.approval_status === 'aprovado' ? '✅' : '❌'}`}>
                          {n.approval_status === 'aprovado' ? '✅' : '❌'}
                        </span>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-semibold text-[var(--color-text-primary)] truncate">{n.post_title}</p>
                          <p className="text-[10px] text-[var(--color-text-muted)]">{n.client_name}</p>
                          <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${n.approval_status === 'aprovado' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                            {n.approval_status === 'aprovado' ? '✓ Aprovado' : '✗ Não aprovado'}
                          </span>
                          {n.approval_comment && (
                            <p className="text-[10px] text-[var(--color-text-secondary)] mt-1 italic">"{n.approval_comment}"</p>
                          )}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}
          </div>
        </div>

        <main className="flex-1 overflow-auto">
          {children}
        </main>
      </div>
    </div>
  )
}
