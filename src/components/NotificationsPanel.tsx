'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Bell, BellRing, Check, X, AtSign, Loader2 } from 'lucide-react'
import {
  fetchNotifications, groupByCard, markRead, markAllRead,
  bucketOf, bucketLabel, KIND_GROUPS,
  type NotificationRow, type NotificationGroup, type NotifBucket,
} from '@/lib/notifications'
import { fetchAgencyAlerts, type AgencyAlert } from '@/lib/agencyAlerts'

type Client = { id: string; name: string; color_hex: string }

type Props = {
  memberId: string
  memberName?: string
  clients: Record<string, Client>
  pushState: 'unsupported' | 'off' | 'on' | 'busy'
  needsIOSInstall: boolean
  onEnablePush: () => void
  onClose: () => void
  onUnreadChange: (n: number) => void
}

function relTime(iso: string) {
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'agora'
  if (mins < 60) return `${mins} min`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs} h`
  const days = Math.floor(hrs / 24)
  if (days < 7) return `${days} d`
  return new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })
}

const BUCKET_ORDER: NotifBucket[] = ['hoje', 'ontem', 'semana', 'antes']

export default function NotificationsPanel({
  memberId, memberName, clients, pushState, needsIOSInstall, onEnablePush, onClose, onUnreadChange,
}: Props) {
  const router = useRouter()
  const [rows, setRows] = useState<NotificationRow[]>([])
  const [loading, setLoading] = useState(true)
  const [kind, setKind] = useState('todos')
  const [onlyUnread, setOnlyUnread] = useState(false)
  const [alerts, setAlerts] = useState<AgencyAlert[]>([])

  useEffect(() => {
    let alive = true
    fetchNotifications(memberId).then(r => { if (alive) { setRows(r); setLoading(false) } })
    fetchAgencyAlerts().then(a => { if (alive) setAlerts(a) })
    return () => { alive = false }
  }, [memberId])

  const unreadTotal = rows.filter(r => !r.read_at).length
  useEffect(() => { onUnreadChange(unreadTotal) }, [unreadTotal, onUnreadChange])

  const groups = useMemo(() => {
    const matcher = KIND_GROUPS.find(k => k.key === kind) || KIND_GROUPS[0]
    let filtered = rows.filter(r => matcher.match(r.kind))
    if (onlyUnread) filtered = filtered.filter(r => !r.read_at)
    return groupByCard(filtered)
  }, [rows, kind, onlyUnread])

  // Cabeçalhos de tempo (Hoje / Ontem / Esta semana) sobre os grupos já
  // ordenados — sem eles a lista vira um bloco só e não dá pra saber se
  // aquilo é de agora ou da semana passada.
  const sections = useMemo(() => {
    const byBucket = new Map<NotifBucket, NotificationGroup[]>()
    for (const g of groups) {
      const b = bucketOf(g.latestAt)
      const arr = byBucket.get(b) || []
      arr.push(g)
      byBucket.set(b, arr)
    }
    return BUCKET_ORDER.filter(b => byBucket.get(b)?.length).map(b => ({ bucket: b, groups: byBucket.get(b)! }))
  }, [groups])

  function applyRead(ids: string[]) {
    const now = new Date().toISOString()
    setRows(prev => prev.map(r => ids.includes(r.id) ? { ...r, read_at: r.read_at || now } : r))
    markRead(ids)
  }

  async function readAll() {
    const now = new Date().toISOString()
    setRows(prev => prev.map(r => r.read_at ? r : { ...r, read_at: now }))
    await markAllRead(memberId)
  }

  function openGroup(g: NotificationGroup) {
    const unreadIds = g.items.filter(i => !i.read_at).map(i => i.id)
    if (unreadIds.length) applyRead(unreadIds)
    onClose()
    if (g.url) router.push(g.url)
  }

  return (
    <>
      {/* Fundo escuro só no celular, onde o painel é tela cheia. No desktop ele
          é um popover e um véu preto sobre a página inteira seria exagero. */}
      <div className="fixed inset-0 bg-black/40 z-[60] md:hidden" onClick={onClose} />

      <div
        className="fixed inset-0 z-[61] flex flex-col bg-[var(--color-bg-card)]
                   md:absolute md:inset-auto md:right-0 md:top-11 md:z-50 md:w-[440px]
                   md:max-h-[78vh] md:rounded-2xl md:border md:border-[var(--color-border)] md:shadow-xl md:overflow-hidden"
        style={{ paddingTop: 'env(safe-area-inset-top)', paddingBottom: 'env(safe-area-inset-bottom)' }}
      >
        {/* Cabeçalho */}
        <div className="px-4 py-3 border-b border-[var(--color-border)] flex items-center gap-2 flex-shrink-0">
          <p className="text-base md:text-sm font-bold text-[var(--color-text-primary)]">Notificações</p>
          {unreadTotal > 0 && (
            <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full text-white" style={{ background: 'var(--ds-error-accent)' }}>
              {unreadTotal}
            </span>
          )}
          <div className="ml-auto flex items-center gap-1">
            {unreadTotal > 0 && (
              <button onClick={readAll} title="Marcar tudo como lido"
                className="h-8 px-2.5 rounded-lg text-xs font-medium text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-bg-subtle)] transition-colors">
                Marcar tudo
              </button>
            )}
            <button onClick={onClose} className="w-8 h-8 rounded-lg flex items-center justify-center text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-subtle)]">
              <X size={17} />
            </button>
          </div>
        </div>

        {/* Filtros: tipo + só não lidas */}
        <div className="px-4 py-2 border-b border-[var(--color-border)] flex items-center gap-1.5 overflow-x-auto flex-shrink-0">
          {KIND_GROUPS.map(k => (
            <button key={k.key} onClick={() => setKind(k.key)}
              className="h-7 flex-shrink-0 px-2.5 rounded-full text-[11px] font-semibold transition-colors"
              style={kind === k.key
                ? { background: 'var(--color-accent)', color: '#fff' }
                : { color: 'var(--color-text-muted)', background: 'var(--color-bg-subtle)' }}>
              {k.label}
            </button>
          ))}
          <button onClick={() => setOnlyUnread(v => !v)}
            className="h-7 flex-shrink-0 ml-auto flex items-center gap-1 px-2.5 rounded-full text-[11px] font-semibold border transition-colors"
            style={onlyUnread
              ? { borderColor: 'var(--color-accent)', color: 'var(--color-accent)', background: 'var(--color-accent-bg)' }
              : { borderColor: 'var(--color-border)', color: 'var(--color-text-muted)' }}>
            <Check size={11} /> Não lidas
          </button>
        </div>

        {/* Ativação de push — fica aqui porque é onde a pessoa procura quando
            percebe que não está recebendo nada. */}
        {needsIOSInstall && (
          <div className="px-4 py-2.5 text-xs border-b border-[var(--color-border)] flex-shrink-0" style={{ color: 'var(--color-accent)' }}>
            <p className="font-medium flex items-center gap-2 mb-1"><BellRing size={14} /> Pra notificações no iPhone:</p>
            <p className="text-[11px] text-[var(--color-text-secondary)] leading-relaxed">
              1. Toque em Compartilhar (⬆️) → &quot;Adicionar à Tela de Início&quot;<br />
              2. Abra o Hub por esse ícone (não pelo Safari)<br />
              3. Volte aqui e ative as notificações
            </p>
          </div>
        )}
        {pushState === 'off' && !needsIOSInstall && (
          <button onClick={onEnablePush}
            className="flex items-center gap-2 px-4 py-2.5 text-xs font-medium border-b border-[var(--color-border)] flex-shrink-0 hover:bg-[var(--color-bg-subtle)] text-left w-full"
            style={{ color: 'var(--color-accent)' }}>
            <BellRing size={14} /> Ativar notificações no navegador/celular
          </button>
        )}
        {pushState === 'busy' && (
          <div className="px-4 py-2.5 text-xs text-[var(--color-text-muted)] border-b border-[var(--color-border)] flex-shrink-0">Ativando…</div>
        )}

        {/* Lista */}
        <div className="flex-1 overflow-y-auto overscroll-contain">

          {/* Atenção da agência — condições, não eventos: não têm "lido", não
              entram no contador vermelho e somem sozinhas quando resolvem.
              Ficam acima porque são o que pode dar problema hoje. */}
          {kind === 'todos' && !onlyUnread && alerts.length > 0 && (
            <div className="border-b border-[var(--color-border)]">
              <p className="px-4 pt-3 pb-1.5 text-[11px] font-bold uppercase tracking-wider text-[var(--color-text-faint)]">
                Atenção da agência
              </p>
              {alerts.map(a => (
                <button key={a.id} onClick={() => { onClose(); router.push(a.href) }}
                  className="w-full text-left flex items-center gap-2.5 px-4 py-2 hover:bg-[var(--color-bg-subtle)] transition-colors">
                  <span className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                    style={{ background: a.severity === 'alta' ? 'var(--ds-error-accent)' : 'var(--ds-warn-accent)' }} />
                  <span className="text-[12px] text-[var(--color-text-secondary)] min-w-0 flex-1">
                    {a.label}
                    {a.detail && <span className="text-[var(--color-text-faint)]"> · {a.detail}</span>}
                  </span>
                </button>
              ))}
            </div>
          )}

          {loading ? (
            <div className="flex items-center justify-center py-16 text-[var(--color-text-faint)]">
              <Loader2 size={20} className="animate-spin" />
            </div>
          ) : sections.length === 0 ? (
            <div className="px-6 py-16 text-center flex flex-col items-center gap-2">
              {kind === 'mention'
                ? <><AtSign size={28} strokeWidth={1.5} className="text-[var(--color-text-faint)]" />
                    <p className="text-sm text-[var(--color-text-muted)]">Nenhuma menção</p>
                    <p className="text-xs text-[var(--color-text-faint)]">Quando alguém usar @{memberName?.split(' ')[0]} num comentário, aparece aqui</p></>
                : <><Bell size={28} strokeWidth={1.5} className="text-[var(--color-text-faint)]" />
                    <p className="text-sm text-[var(--color-text-muted)]">{onlyUnread ? 'Nada não lido' : 'Nenhuma notificação'}</p>
                    <p className="text-xs text-[var(--color-text-faint)]">Menções, comentários e mudanças nos seus cards aparecem aqui</p></>
              }
            </div>
          ) : sections.map(sec => (
            <div key={sec.bucket}>
              <p className="px-4 pt-3 pb-1.5 text-[11px] font-bold uppercase tracking-wider text-[var(--color-text-faint)] sticky top-0 bg-[var(--color-bg-card)] z-[1]">
                {bucketLabel(sec.bucket)}
              </p>
              {sec.groups.map(g => {
                const client = g.clientId ? clients[g.clientId] : null
                return (
                  <button key={g.key} onClick={() => openGroup(g)}
                    className={`w-full text-left flex gap-3 px-4 py-3 border-b border-[var(--color-border)] hover:bg-[var(--color-bg-subtle)] transition-colors ${g.unread > 0 ? 'bg-[var(--color-bg-subtle)]' : ''}`}>
                    {/* Barra na cor do cliente: diz de quem é o card antes de
                        ler qualquer texto. */}
                    <span className="w-1 rounded-full flex-shrink-0" style={{ background: client?.color_hex || 'var(--color-border-strong)' }} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="text-[13px] font-semibold text-[var(--color-text-primary)] truncate">
                          {g.title || 'Card'}
                        </p>
                        {g.unread > 0 && (
                          <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: 'var(--ds-info-accent)' }} />
                        )}
                      </div>
                      {client && (
                        <p className="text-[10px] font-bold uppercase tracking-wide mt-0.5" style={{ color: client.color_hex }}>{client.name}</p>
                      )}
                      {/* Eventos do card, agrupados. Três mudanças de data no
                          mesmo post viram três linhas aqui dentro, não três
                          notificações soltas na lista. */}
                      <div className="mt-1.5 flex flex-col gap-1">
                        {g.items.slice(0, 4).map(item => (
                          <p key={item.id} className="text-[11px] text-[var(--color-text-secondary)] leading-snug">
                            {item.body}
                            <span className="text-[var(--color-text-faint)]" title={new Date(item.created_at).toLocaleString('pt-BR')}> · {relTime(item.created_at)}</span>
                          </p>
                        ))}
                        {g.items.length > 4 && (
                          <p className="text-[10px] text-[var(--color-text-faint)]">+{g.items.length - 4} antes neste card</p>
                        )}
                      </div>
                    </div>
                  </button>
                )
              })}
            </div>
          ))}
        </div>
      </div>
    </>
  )
}
