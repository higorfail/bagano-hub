'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useState, useRef } from 'react'
import { createClient } from '@/lib/supabase'
import { UserProvider, useUser } from '@/lib/UserContext'
import { ChevronDown, Check, Menu, X as XIcon } from 'lucide-react'
import { Home, Users, Calendar, Kanban, Smartphone, Megaphone, BookOpen, CalendarHeart, Bell, Package, Sun, Moon, Monitor, LayoutList, ClipboardCheck, CalendarDays, UserCircle2, Trash2, Zap, Share2, ListTodo } from 'lucide-react'
import CommandPalette from '@/components/CommandPalette'
import NotificationsPanel from '@/components/NotificationsPanel'
import { ThemeProvider, useTheme } from '@/lib/ThemeProvider'
import { ToastProvider, useToast } from '@/lib/ToastContext'
import LogoIcon from '@/components/logos/LogoIcon'
import { pushSupported, isSubscribedToPush, subscribeToPush, isIOS, isStandalonePWA } from '@/lib/push'
import { useEdgeSwipe, useDragToDismiss } from '@/lib/gestures'
import { fetchUnreadCount } from '@/lib/notifications'
import { BellRing } from 'lucide-react'

const navItems = [
  { href: '/dashboard',          icon: Home,          label: 'Início' },
  { href: '/dashboard/clientes', icon: Users,         label: 'Clientes' },
  { href: '/dashboard/equipe',   icon: UserCircle2,   label: 'Equipe' },
  { href: '/dashboard/tarefas',  icon: ListTodo,      label: 'Quadro pessoal' },
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
  { href: '/dashboard/social',     icon: Share2,         label: 'Publicações' },
]
const contentItems = [
  { href: '/dashboard/calendario',                 icon: Calendar,      label: 'Calendário' },
  { href: 'https://sous-chef-bagano.netlify.app/', icon: BookOpen,      label: 'Manuais', external: true },
  { href: '/dashboard/datas-especiais',            icon: CalendarHeart, label: 'Datas especiais' },
  { href: '/dashboard/lixeira',                    icon: Trash2,        label: 'Lixeira' },
]

function DashboardInner({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const { members, currentMember, setCurrentMember, showOnlyMine, setShowOnlyMine } = useUser()
  const { toast } = useToast()
  const [showMemberPicker, setShowMemberPicker] = useState(false)
  const memberRef = useRef<HTMLDivElement>(null)
  const [approvalsCount, setApprovalsCount] = useState(0)
  const [seenApprovals, setSeenApprovals] = useState<number>(() => {
    if (typeof window === 'undefined') return 0
    return Number(localStorage.getItem('approvals-seen') || 0)
  })
  const [showNotifications, setShowNotifications] = useState(false)
  // Contagem de não lidas vem do painel (que é quem consulta a tabela), pra
  // não ter duas consultas dizendo coisas diferentes sobre o mesmo número.
  const [unreadCount, setUnreadCount] = useState(0)
  // Cor e nome do cliente pra faixa lateral de cada notificação.
  const [clientMap, setClientMap] = useState<Record<string, { id: string; name: string; color_hex: string }>>({})
  useEffect(() => {
    createClient().from('clients').select('id, name, color_hex')
      .then(({ data }) => setClientMap(Object.fromEntries((data || []).map((c: any) => [c.id, c]))))
  }, [])
  // O contador é buscado aqui, não só quando o painel abre: um sininho que só
  // mostra o número depois de clicado não serve pra nada.
  useEffect(() => {
    if (!currentMember?.id) { setUnreadCount(0); return }
    const load = () => fetchUnreadCount(currentMember.id).then(setUnreadCount)
    load()
    const t = setInterval(load, 30000)
    return () => clearInterval(t)
  }, [currentMember?.id])
  const notifRef = useRef<HTMLDivElement>(null)
  const { mode, setMode } = useTheme()

  // Sidebar vira gaveta (drawer) em telas pequenas — fecha sozinha ao navegar
  const [mobileNavOpen, setMobileNavOpen] = useState(false)

  // Arrastar da borda esquerda abre a gaveta; arrastar ela pra esquerda fecha.
  // O botão de menu e o X seguem à mostra — gesto não substitui controle.
  useEdgeSwipe({ onOpen: () => setMobileNavOpen(true), enabled: !mobileNavOpen })
  const navDrag = useDragToDismiss({
    axis: 'x', direction: -1, threshold: 70,
    onDismiss: () => setMobileNavOpen(false),
    enabled: mobileNavOpen,
  })

  // Data curta da barra do topo (só no celular, onde ela saiu do corpo da
  // página pra não gastar uma linha inteira). Calculada no efeito, não no
  // render: servidor e navegador podem estar em fusos diferentes e o texto
  // sairia diferente nos dois, quebrando a hidratação.
  const [topDate, setTopDate] = useState('')
  useEffect(() => {
    const d = new Date()
    const dias = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb']
    setTopDate(`${dias[d.getDay()]}, ${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`)
  }, [])
  useEffect(() => { setMobileNavOpen(false) }, [pathname])

  // Push notification (PWA) — verifica se já está inscrito assim que sabe quem é o usuário
  const [pushState, setPushState] = useState<'unsupported' | 'off' | 'on' | 'busy'>('off')
  const [needsIOSInstall, setNeedsIOSInstall] = useState(false)
  useEffect(() => {
    if (!pushSupported()) {
      setPushState('unsupported')
      setNeedsIOSInstall(isIOS() && !isStandalonePWA())
      return
    }
    isSubscribedToPush().then(sub => setPushState(sub ? 'on' : 'off'))
  }, [])
  // Banner de ativação — some do sino discretinho de antes: agora aparece
  // logo no topo até a pessoa ativar ou dispensar (some por 7 dias se dispensado).
  const [pushBannerDismissed, setPushBannerDismissed] = useState(true)
  useEffect(() => {
    const dismissedAt = Number(localStorage.getItem('push-banner-dismissed-at') || 0)
    setPushBannerDismissed(Date.now() - dismissedAt < 7 * 86400000)
  }, [])
  function dismissPushBanner() {
    localStorage.setItem('push-banner-dismissed-at', String(Date.now()))
    setPushBannerDismissed(true)
  }
  async function enablePush() {
    // Sem escolher "quem você é" ainda não dá pra vincular a inscrição a
    // ninguém — sem esse aviso, o clique não fazia NADA silenciosamente,
    // parecendo um botão quebrado (relatado: "não tava sendo clicável").
    if (!currentMember) { toast('Escolha quem você é primeiro (canto superior direito) pra ativar notificações.'); return }
    setPushState('busy')
    try {
      const res = await subscribeToPush(currentMember.id)
      setPushState(res.ok ? 'on' : 'off')
      if (!res.ok) toast(res.error || 'Não consegui ativar as notificações.')
    } catch (err: any) {
      // Rede de segurança: mesmo se subscribeToPush lançar algo inesperado,
      // o botão não pode ficar preso em "busy" pra sempre sem explicação.
      console.error('enablePush falhou:', err)
      setPushState('off')
      toast('Não consegui ativar as notificações — tenta de novo ou usa outro navegador.')
    }
  }






  useEffect(() => {
    loadNotifications()
    const interval = setInterval(loadNotifications, 30000)
    return () => clearInterval(interval)
  }, [currentMember?.id])

  // Antes esta função rodava 19 consultas a cada 30 segundos pra REMONTAR a
  // lista do sininho na hora ("captações dos próximos 3 dias", "posts parados
  // há 3 dias", "menções dos últimos 7 dias"…). Isso era o que fazia evento
  // sem pergunta correspondente nunca aparecer, notificação sumir por janela
  // de tempo e o "lido" morar no localStorage sem atravessar aparelho.
  //
  // A caixa de entrada agora é uma tabela de verdade (notifications_setup.sql),
  // lida pelo NotificationsPanel. Aqui sobrou só o contador de Aprovações da
  // barra lateral, que não é notificação — é um número de fila.
  async function loadNotifications() {
    const supabase = createClient()
    const [pendingRes, rejectedRes] = await Promise.all([
      supabase.from('schedules').select('id', { count: 'exact', head: true }).eq('status', 'aguardando_aprovacao'),
      supabase.from('schedules').select('id', { count: 'exact', head: true })
        .eq('approval_status', 'não aprovado')
        .not('status', 'in', '(aprovado,agendado,publicado,aguardando_aprovacao)'),
    ])
    setApprovalsCount((pendingRes.count || 0) + (rejectedRes.count || 0))
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

  const approvalsBadge = approvalsCount > seenApprovals ? approvalsCount : 0

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
      {/* Backdrop da gaveta — só existe (e só fecha) no mobile, com a sidebar aberta */}
      {mobileNavOpen && (
        <div className="fixed inset-0 bg-black/40 z-40 md:hidden" onClick={() => setMobileNavOpen(false)} />
      )}
      {/* Arrastar a gaveta pra esquerda fecha. O X continua ali: gesto é
          invisível, então quem não souber que existe precisa ter o botão. */}
      <aside {...(mobileNavOpen ? navDrag.handlers : {})}
        className={`w-64 md:w-56 flex-shrink-0 bg-[var(--color-bg-page)] border-r border-[var(--color-border)] flex flex-col overflow-hidden py-6 px-4 fixed md:relative inset-y-0 left-0 z-50 md:translate-x-0 ${navDrag.dragging ? '' : 'transition-transform duration-200'} ${mobileNavOpen ? 'translate-x-0' : '-translate-x-full'}`}
        style={{
          paddingTop: 'calc(1.5rem + env(safe-area-inset-top))',
          paddingBottom: 'calc(1.5rem + env(safe-area-inset-bottom))',
          // Acompanha o dedo enquanto arrasta — gesto sem resposta visual
          // parece travado.
          ...(mobileNavOpen && navDrag.offset ? { transform: `translateX(${navDrag.offset}px)` } : {}),
        }}>
        <div className="flex items-center justify-between mb-8">
          <Link href="/dashboard" className="flex items-center gap-2.5 px-2 rounded-xl hover:opacity-80 transition-opacity" title="Ir para o início">
            <LogoIcon size={34} className="text-[var(--color-logo)] flex-shrink-0" />
            <span className="text-sm font-bold text-[var(--color-text-primary)] tracking-tight">Bagano Hub</span>
          </Link>
          <button onClick={() => setMobileNavOpen(false)} className="md:hidden w-8 h-8 rounded-lg hover:bg-[var(--color-bg-subtle)] flex items-center justify-center text-[var(--color-text-secondary)] flex-shrink-0">
            <XIcon size={16} />
          </button>
        </div>

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

      <div className="flex-1 flex flex-col overflow-hidden min-w-0">
        <div className="h-14 border-b border-[var(--color-border)] bg-[var(--color-bg-page)] flex items-center justify-between px-3 md:px-8 gap-2 flex-shrink-0" style={{ paddingTop: 'env(safe-area-inset-top)', height: 'calc(3.5rem + env(safe-area-inset-top))' }}>
          <div className="flex items-center gap-2 md:gap-3 min-w-0">
            <button onClick={() => setMobileNavOpen(true)}
              className="md:hidden w-9 h-9 rounded-xl hover:bg-[var(--color-bg-subtle)] flex items-center justify-center flex-shrink-0 text-[var(--color-text-secondary)]">
              <Menu size={18} strokeWidth={1.75} />
            </button>
            {topDate && (
              <span className="md:hidden text-xs font-medium text-[var(--color-text-muted)] whitespace-nowrap capitalize">
                {topDate}
              </span>
            )}
            <div className="hidden sm:block min-w-0">
              <CommandPalette />
            </div>
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
            {/* Abrir NÃO marca tudo como lido — antes marcava, e bastava
                espiar o sininho pra perder o registro do que ainda não tinha
                sido visto. Marca ao abrir o card, ou no "Marcar tudo". */}
            <button onClick={() => setShowNotifications(v => !v)}
              className="relative w-9 h-9 rounded-xl hover:bg-[var(--color-bg-subtle)] flex items-center justify-center transition-all">
              <Bell size={18} strokeWidth={1.75} className="text-[var(--color-text-secondary)]" />
              {unreadCount > 0 && (
                <span className="absolute top-1 right-1 min-w-[14px] h-3.5 rounded-full text-white text-[8px] font-bold flex items-center justify-center px-0.5" style={{ background: 'var(--ds-error-accent)' }}>
                  {unreadCount > 9 ? '9+' : unreadCount}
                </span>
              )}
            </button>
            {showNotifications && currentMember && (
              <NotificationsPanel
                memberId={currentMember.id}
                memberName={currentMember.name}
                clients={clientMap}
                pushState={pushState}
                needsIOSInstall={needsIOSInstall}
                onEnablePush={enablePush}
                onClose={() => setShowNotifications(false)}
                onUnreadChange={setUnreadCount}
              />
            )}
          </div>
          </div>{/* flex items-center gap-1 */}
        </div>

        {needsIOSInstall && !pushBannerDismissed && (
          <div className="flex items-center gap-3 px-4 md:px-6 py-2.5 border-b border-[var(--color-border)]" style={{ background: 'var(--color-accent-bg)' }}>
            <BellRing size={15} className="flex-shrink-0" style={{ color: 'var(--color-accent)' }} />
            <p className="text-xs font-medium flex-1 min-w-0" style={{ color: 'var(--color-accent)' }}>
              Pra receber notificações no iPhone: toque em Compartilhar → "Adicionar à Tela de Início", e abra o Hub por esse ícone (não pelo Safari).
            </p>
            <button onClick={dismissPushBanner} className="text-xs font-semibold px-3 py-1.5 rounded-lg text-white flex-shrink-0" style={{ background: 'var(--color-accent)' }}>
              Entendi
            </button>
          </div>
        )}
        {currentMember && !needsIOSInstall && pushState === 'off' && !pushBannerDismissed && (
          <div className="flex items-center gap-3 px-4 md:px-6 py-2.5 border-b border-[var(--color-border)]" style={{ background: 'var(--color-accent-bg)' }}>
            <BellRing size={15} className="flex-shrink-0" style={{ color: 'var(--color-accent)' }} />
            <p className="text-xs font-medium flex-1 min-w-0" style={{ color: 'var(--color-accent)' }}>
              Ative as notificações pra saber na hora quando te marcarem ou adicionarem num card — inclusive no celular.
            </p>
            <button onClick={enablePush} className="text-xs font-semibold px-3 py-1.5 rounded-lg text-white flex-shrink-0" style={{ background: 'var(--color-accent)' }}>
              Ativar
            </button>
            <button onClick={dismissPushBanner} className="text-xs text-[var(--color-text-faint)] hover:text-[var(--color-text-secondary)] flex-shrink-0 transition-colors">
              Agora não
            </button>
          </div>
        )}

        <main className="flex-1 overflow-auto page-content" style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>
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
