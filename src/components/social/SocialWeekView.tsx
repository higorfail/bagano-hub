'use client'

import { useState } from 'react'
import { SocialItem, isOverdue, moveSocialItem, POST_TYPE_LABEL } from '@/lib/socialItems'
import { useToast } from '@/lib/ToastContext'
import { dbError } from '@/lib/dbError'
import SocialItemPopover, { PopoverAnchor } from './SocialItemPopover'
import { ChevronLeft, ChevronRight, CheckCircle2, Clock, AlertTriangle } from 'lucide-react'

const DAYS = ['Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado', 'Domingo']

type Client = { id: string; name: string; color_hex: string }

type Props = {
  items: SocialItem[]
  clients: Client[]
  onOpenItem: (item: SocialItem) => void
  onItemsChange: (updater: (items: SocialItem[]) => SocialItem[]) => void
}

function getMonday(d: Date) {
  const date = new Date(d)
  const day = date.getDay()
  const diff = date.getDate() - day + (day === 0 ? -6 : 1)
  date.setDate(diff)
  date.setHours(0, 0, 0, 0)
  return date
}
function addDays(d: Date, n: number) { const r = new Date(d); r.setDate(r.getDate() + n); return r }
function toISO(d: Date) { return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` }

export default function SocialWeekView({ items, clients, onOpenItem, onItemsChange }: Props) {
  const { toast } = useToast()
  const [weekStart, setWeekStart] = useState<Date>(() => getMonday(new Date()))
  const [popover, setPopover] = useState<{ item: SocialItem; anchor: PopoverAnchor } | null>(null)

  function getClient(id: string | null) { return clients.find(c => c.id === id) }

  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i))
  const todayISO = toISO(new Date())

  function itemsForDay(iso: string) {
    return items
      .filter(i => i.scheduledDate === iso)
      .sort((a, b) => (a.scheduledTime || '99:99').localeCompare(b.scheduledTime || '99:99'))
  }

  async function publish(item: SocialItem) {
    const prev = items
    onItemsChange(list => list.map(i => i.id === item.id ? { ...i, column: 'publicado' } : i))
    const { error } = await moveSocialItem(item, 'publicado')
    if (error) { onItemsChange(() => prev); dbError(error, toast, 'marcar como publicado') }
    setPopover(null)
  }

  function openPopover(e: React.MouseEvent<HTMLButtonElement>, item: SocialItem) {
    const r = e.currentTarget.getBoundingClientRect()
    setPopover({ item, anchor: { top: r.top, bottom: r.bottom, left: r.left, right: r.right } })
  }

  return (
    <div className="flex-1 flex flex-col gap-3 p-4 overflow-auto">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-3 text-[11px] text-[var(--color-text-muted)]">
          <span className="flex items-center gap-1.5"><CheckCircle2 size={12} style={{ color: 'var(--ds-success-accent)' }} /> Publicado</span>
          <span className="flex items-center gap-1.5"><Clock size={12} className="text-[var(--color-text-faint)]" /> Agendado</span>
          <span className="flex items-center gap-1.5"><AlertTriangle size={12} style={{ color: 'var(--ds-error-accent)' }} /> Atrasado</span>
        </div>
        <div className="flex items-center gap-1 bg-[var(--color-bg-card)] border border-[var(--color-border)] rounded-xl p-1">
          <button onClick={() => setWeekStart(w => addDays(w, -7))} className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-[var(--color-bg-subtle)] transition-colors">
            <ChevronLeft size={14} className="text-[var(--color-text-secondary)]" />
          </button>
          <span className="text-xs font-semibold text-[var(--color-text-primary)] min-w-[160px] text-center">
            {days[0].toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })} – {days[6].toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })}
          </span>
          <button onClick={() => setWeekStart(w => addDays(w, 7))} className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-[var(--color-bg-subtle)] transition-colors">
            <ChevronRight size={14} className="text-[var(--color-text-secondary)]" />
          </button>
        </div>
      </div>

      <div className="flex-1 grid grid-cols-1 md:grid-cols-7 gap-2">
        {days.map((d, idx) => {
          const iso = toISO(d)
          const dayItems = itemsForDay(iso)
          const isToday = iso === todayISO
          return (
            <div key={iso} className="flex flex-col bg-[var(--color-bg-card)] border border-[var(--color-border)] rounded-2xl overflow-hidden">
              <div className={`px-2.5 py-2 flex items-center justify-between border-b border-[var(--color-border)] ${isToday ? 'bg-[var(--color-accent)]/10' : ''}`}>
                <span className="text-[11px] font-semibold text-[var(--color-text-primary)]">{DAYS[idx]}</span>
                <span className={`text-[10px] font-bold w-5 h-5 flex items-center justify-center rounded-full ${isToday ? 'bg-[var(--color-accent)] text-white' : 'text-[var(--color-text-muted)]'}`}>
                  {d.getDate()}
                </span>
              </div>
              <div className="flex-1 p-1.5 flex flex-col gap-1 min-h-[80px]">
                {dayItems.length === 0 && <span className="text-[10px] text-[var(--color-text-faint)] text-center py-3">—</span>}
                {dayItems.map(item => {
                  const client = getClient(item.clientId)
                  const published = item.column === 'publicado'
                  const overdue = isOverdue(item, todayISO)
                  const accent = overdue ? 'var(--ds-error-accent)' : (client?.color_hex || '#94a3b8')
                  return (
                    <button
                      key={item.id}
                      onClick={e => openPopover(e, item)}
                      className="rounded-lg px-2 py-1.5 text-left border transition-opacity hover:opacity-85 flex flex-col gap-0.5"
                      style={published
                        ? { background: accent, borderColor: accent }
                        : { background: accent + '18', borderColor: accent + (overdue ? '80' : '55') }}
                    >
                      <div className="flex items-center gap-1">
                        {overdue ? <AlertTriangle size={9} className="flex-shrink-0" style={{ color: published ? '#fff' : accent }} />
                          : published ? <CheckCircle2 size={9} className="flex-shrink-0" style={{ color: '#fff' }} />
                          : <Clock size={9} className="flex-shrink-0" style={{ color: accent }} />}
                        <span className="text-[11px] font-bold truncate" style={{ color: published ? '#fff' : accent }}>
                          {client?.name || 'Sem cliente'}
                        </span>
                        <span className="text-[9px] font-semibold uppercase tracking-wide flex-shrink-0" style={{ color: published ? 'rgba(255,255,255,0.85)' : accent }}>
                          {overdue ? 'Atrasado' : published ? 'Publicado' : 'Agendado'}
                        </span>
                      </div>
                      <span className="text-[9px] truncate" style={{ color: published ? 'rgba(255,255,255,0.8)' : 'var(--color-text-muted)' }}>
                        {item.scheduledTime ? item.scheduledTime.slice(0, 5) + ' · ' : ''}{item.title} · {POST_TYPE_LABEL[item.postType || ''] || item.postType}
                      </span>
                    </button>
                  )
                })}
              </div>
            </div>
          )
        })}
      </div>

      {popover && (
        <SocialItemPopover
          item={popover.item}
          clientName={getClient(popover.item.clientId)?.name}
          anchor={popover.anchor}
          onClose={() => setPopover(null)}
          onOpen={() => { onOpenItem(popover.item); setPopover(null) }}
          onPublish={() => publish(popover.item)}
        />
      )}
    </div>
  )
}
