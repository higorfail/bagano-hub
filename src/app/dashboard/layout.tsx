'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useState, useRef } from 'react'
import { createClient } from '@/lib/supabase'
import { Home, Users, Calendar, Kanban, Smartphone, Megaphone, BookOpen, CalendarHeart, Bell, CheckCircle, XCircle } from 'lucide-react'

const navItems = [
  { href: '/dashboard',          icon: Home,          label: 'Início' },
  { href: '/dashboard/clientes', icon: Users,         label: 'Clientes' },
]
const productionItems = [
  { href: '/dashboard/cronograma', icon: Calendar,     label: 'Cronograma' },
  { href: '/dashboard/kanban',     icon: Kanban,       label: 'Kanban' },
  { href: '/dashboard/feed',       icon: Smartphone,   label: 'Feed Visual' },
  { href: '/dashboard/campanhas',  icon: Megaphone,    label: 'Campanhas' },
]
const contentItems = [
  { href: '/dashboard/manuais',         icon: BookOpen,      label: 'Manuais' },
  { href: '/dashboard/datas-especiais', icon: CalendarHeart, label: 'Datas especiais' },
]

type Notification = { id: string; post_title: string; client_name: string; approval_status: string; approval_comment: string }

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [showNotifications, setShowNotifications] = useState(false)
  const notifRef = useRef<HTMLDivElement>(null)

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

  const unread = notifications.filter(n => n.approval_status === 'não aprovado').length

  function NavItem({ href, icon: Icon, label }: { href: string; icon: any; label: string }) {
    const active = pathname === href
    return (
      <Link href={href} className={`flex items-center gap-3 px-3 py-2 rounded-xl text-sm transition-all ${active ? 'text-[#1A1916] font-bold' : 'text-[#A8A59E] font-normal hover:text-[#1A1916]'}`}>
        <Icon size={16} strokeWidth={active ? 2.5 : 1.75} />
        <span>{label}</span>
      </Link>
    )
  }

  return (
    <div className="flex h-screen bg-[#F9F8F5] overflow-hidden">
      <aside className="w-56 flex-shrink-0 bg-[#F9F8F5] border-r border-[#EBEAE5] flex flex-col py-6 px-4">
        <div className="flex items-center gap-2.5 px-2 mb-8">
          <div className="w-8 h-8 bg-[#1A1916] rounded-xl flex items-center justify-center">
            <span className="text-white text-xs font-bold">B</span>
          </div>
          <span className="text-sm font-bold text-[#1A1916] tracking-tight">Bagano Hub</span>
        </div>

        <p className="text-[10px] font-semibold text-[#C8C5BE] uppercase tracking-widest px-3 mb-2">Geral</p>
        <nav className="flex flex-col gap-0.5 mb-6">
          {navItems.map(item => <NavItem key={item.href} {...item} />)}
        </nav>

        <p className="text-[10px] font-semibold text-[#C8C5BE] uppercase tracking-widest px-3 mb-2">Produção</p>
        <nav className="flex flex-col gap-0.5 mb-6">
          {productionItems.map(item => <NavItem key={item.href} {...item} />)}
        </nav>

        <p className="text-[10px] font-semibold text-[#C8C5BE] uppercase tracking-widest px-3 mb-2">Conteúdo</p>
        <nav className="flex flex-col gap-0.5">
          {contentItems.map(item => <NavItem key={item.href} {...item} />)}
        </nav>

        <div className="mt-auto pt-4 border-t border-[#EBEAE5]">
          <div className="flex items-center gap-3 px-2">
            <div className="w-8 h-8 rounded-full bg-[#1A1916] flex items-center justify-center text-white text-xs font-semibold flex-shrink-0">H</div>
            <div>
              <p className="text-sm font-semibold text-[#1A1916]">Higor</p>
              <p className="text-xs text-[#A8A59E]">Admin</p>
            </div>
          </div>
        </div>
      </aside>

      <div className="flex-1 flex flex-col overflow-hidden">
        <div className="h-14 border-b border-[#EBEAE5] bg-[#F9F8F5] flex items-center justify-end px-8" ref={notifRef}>
          <div className="relative">
            <button onClick={() => setShowNotifications(v => !v)} className="relative w-9 h-9 rounded-xl hover:bg-[#F2F0EB] flex items-center justify-center transition-all">
              <Bell size={18} strokeWidth={1.75} className="text-[#6B6963]" />
              {unread > 0 && <span className="absolute top-1 right-1 w-3.5 h-3.5 bg-red-500 rounded-full text-white text-[8px] font-bold flex items-center justify-center">{unread}</span>}
            </button>
            {showNotifications && (
              <div className="absolute right-0 top-11 w-80 bg-white rounded-2xl border border-[#EBEAE5] overflow-hidden z-50">
                <div className="px-5 py-4 border-b border-[#EBEAE5] flex items-center justify-between">
                  <p className="text-sm font-bold text-[#1A1916]">Aprovações</p>
                  <span className="text-xs text-[#A8A59E]">{notifications.length} posts</span>
                </div>
                <div className="max-h-80 overflow-y-auto">
                  {notifications.length === 0 ? (
                    <div className="px-5 py-8 text-center"><p className="text-sm text-[#A8A59E]">Nenhuma resposta ainda</p></div>
                  ) : notifications.map(n => (
                    <div key={n.id} className={`px-5 py-3.5 border-b border-[#F2F0EB] flex items-start gap-3 ${n.approval_status === 'não aprovado' ? 'bg-red-50' : ''}`}>
                      {n.approval_status === 'aprovado' ? <CheckCircle size={16} className="text-green-500 flex-shrink-0 mt-0.5" /> : <XCircle size={16} className="text-red-500 flex-shrink-0 mt-0.5" />}
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-[#1A1916] truncate">{n.post_title}</p>
                        <p className="text-xs text-[#A8A59E]">{n.client_name}</p>
                        {n.approval_comment && <p className="text-xs text-[#6B6963] mt-1 italic">"{n.approval_comment}"</p>}
                      </div>
                    </div>
                  ))}
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
