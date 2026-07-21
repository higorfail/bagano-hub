'use client'

import { useState } from 'react'
import { SocialItem, isOverdue, moveSocialItem } from '@/lib/socialItems'
import { useToast } from '@/lib/ToastContext'
import { dbError } from '@/lib/dbError'
import SocialItemPopover, { PopoverAnchor } from './SocialItemPopover'
import { ChevronLeft, ChevronRight, CheckCircle2, Clock, AlertTriangle } from 'lucide-react'

const MONTHS = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro']
const WEEKDAYS = ['Dom','Seg','Ter','Qua','Qui','Sex','Sáb']

type Client = { id: string; name: string; color_hex: string }

type Props = {
  items: SocialItem[]
  clients: Client[]
  onOpenItem: (item: SocialItem) => void
  onItemsChange: (updater: (items: SocialItem[]) => SocialItem[]) => void
}

function pad(n: number) { return String(n).padStart(2, '0') }

export default function SocialCalendarView({ items, clients, onOpenItem, onItemsChange }: Props) {
  const { toast } = useToast()
  const now = new Date()
  const [month, setMonth] = useState(now.getMonth() + 1)
  const [year, setYear] = useState(now.getFullYear())
  const [popover, setPopover] = useState<{ item: SocialItem; anchor: PopoverAnchor } | null>(null)

  function getClient(id: string | null) { return clients.find(c => c.id === id) }

  function prevMonth() { if (month === 1) { setMonth(12); setYear(y => y - 1) } else setMonth(m => m - 1) }
  function nextMonth() { if (month === 12) { setMonth(1); setYear(y => y + 1) } else setMonth(m => m + 1) }

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

  const firstDay = new Date(year, month - 1, 1).getDay()
  const daysInMonth = new Date(year, month, 0).getDate()
  const cells: (number | null)[] = [...Array(firstDay).fill(null), ...Array.from({ length: daysInMonth }, (_, i) => i + 1)]
  while (cells.length % 7 !== 0) cells.push(null)

  const todayISO = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`
  function dayISO(day: number) { return `${year}-${pad(month)}-${pad(day)}` }
  function itemsForDay(day: number) { return items.filter(i => i.scheduledDate === dayISO(day)) }

  return (
    <div className="flex-1 flex flex-col gap-3 p-4 overflow-auto">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-3 text-[11px] text-[var(--color-text-muted)]">
          <span className="flex items-center gap-1.5"><CheckCircle2 size={12} style={{ color: 'var(--ds-success-accent)' }} /> Publicado</span>
          <span className="flex items-center gap-1.5"><Clock size={12} className="text-[var(--color-text-faint)]" /> Agendado</span>
          <span className="flex items-center gap-1.5"><AlertTriangle size={12} style={{ color: 'var(--ds-error-accent)' }} /> Atrasado</span>
        </div>
        <div className="flex items-center gap-1 bg-[var(--color-bg-card)] border border-[var(--color-border)] rounded-xl p-1">
          <button onClick={prevMonth} className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-[var(--color-bg-subtle)] transition-colors">
            <ChevronLeft size={14} className="text-[var(--color-text-secondary)]" />
          </button>
          <span className="text-xs font-semibold text-[var(--color-text-primary)] min-w-[110px] text-center">{MONTHS[month - 1]} {year}</span>
          <button onClick={nextMonth} className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-[var(--color-bg-subtle)] transition-colors">
            <ChevronRight size={14} className="text-[var(--color-text-secondary)]" />
          </button>
        </div>
      </div>

      <div className="flex-1 flex flex-col bg-[var(--color-bg-card)] border border-[var(--color-border)] rounded-2xl overflow-hidden shadow-card">
        <div className="grid grid-cols-7 border-b border-[var(--color-border)]">
          {WEEKDAYS.map(d => (
            <div key={d} className="py-2 text-center text-[10px] font-semibold text-[var(--color-text-muted)] uppercase tracking-wide">{d}</div>
          ))}
        </div>
        <div className="grid grid-cols-7 flex-1">
          {cells.map((day, i) => {
            const dayItems = day ? itemsForDay(day) : []
            const todayCell = day ? dayISO(day) === todayISO : false
            const maxShow = 3
            return (
              <div key={i} className={`min-h-[128px] border-r border-b border-[var(--color-border)] p-1.5 flex flex-col gap-1 last:border-r-0 ${!day ? 'bg-[var(--color-bg-subtle)]' : ''}`}>
                {day && (
                  <span className={`text-xs font-semibold w-6 h-6 flex items-center justify-center rounded-full ${todayCell ? 'bg-[var(--color-accent)] text-white' : 'text-[var(--color-text-muted)]'}`}>
                    {day}
                  </span>
                )}
                {dayItems.slice(0, maxShow).map(item => {
                  const client = getClient(item.clientId)
                  const published = item.column === 'publicado'
                  const overdue = isOverdue(item, todayISO)
                  const accent = overdue ? 'var(--ds-error-accent)' : (client?.color_hex || '#94a3b8')
                  return (
                    <button
                      key={item.id}
                      onClick={e => openPopover(e, item)}
                      className="rounded-lg px-1.5 py-1 text-left w-full border transition-opacity hover:opacity-85 flex flex-col gap-0.5"
                      style={published
                        ? { background: accent, borderColor: accent }
                        : { background: accent + '16', borderColor: accent + (overdue ? '80' : '55') }}
                    >
                      <span className="flex items-center gap-1 text-[10px] font-bold truncate" style={{ color: published ? '#fff' : accent }}>
                        {overdue ? <AlertTriangle size={9} className="flex-shrink-0" /> : published ? <CheckCircle2 size={9} className="flex-shrink-0" /> : <Clock size={9} className="flex-shrink-0" />}
                        {client?.name || 'Sem cliente'}
                      </span>
                      <span className="text-[9px] truncate" style={{ color: published ? 'rgba(255,255,255,0.85)' : 'var(--color-text-muted)' }}>
                        {item.scheduledTime ? item.scheduledTime.slice(0, 5) + ' · ' : ''}{item.title}
                      </span>
                    </button>
                  )
                })}
                {dayItems.length > maxShow && (
                  <span className="text-[9px] text-[var(--color-text-faint)] px-1">+{dayItems.length - maxShow} mais</span>
                )}
              </div>
            )
          })}
        </div>
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
