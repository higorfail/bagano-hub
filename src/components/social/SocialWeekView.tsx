'use client'

import { useState } from 'react'
import { SocialItem, isOverdue, moveSocialItem, scheduleSocialItem, updateItemDate, POST_TYPE_LABEL } from '@/lib/socialItems'
import { useToast } from '@/lib/ToastContext'
import { useUser } from '@/lib/UserContext'
import { dbError } from '@/lib/dbError'
import { todayBrasiliaISO } from '@/lib/timezone'
import { useDriveThumbnail } from '@/lib/useDriveThumbnail'
import SocialItemPopover, { PopoverAnchor } from './SocialItemPopover'
import { ChevronLeft, ChevronRight, CheckCircle2, Clock3, BadgeCheck, AlertTriangle, Play } from 'lucide-react'

const STATUS_META = {
  aprovado:  { label: 'Aprovado',  icon: BadgeCheck,    color: '#3B82F6' },
  agendado:  { label: 'Agendado',  icon: Clock3,        color: '#14B8A6' },
  publicado: { label: 'Publicado', icon: CheckCircle2,  color: '#22C55E' },
  atrasado:  { label: 'Atrasado',  icon: AlertTriangle, color: 'var(--ds-error-accent)' },
} as const

const DAYS = ['Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado', 'Domingo']

type Client = { id: string; name: string; color_hex: string }

type Props = {
  items: SocialItem[]
  clients: Client[]
  onOpenItem: (item: SocialItem) => void
  onItemsChange: (updater: (items: SocialItem[]) => SocialItem[]) => void
}

function WeekDayItem({ item, client, overdue, dragging, onClick, onDragStart, onDragEnd }: {
  item: SocialItem; client?: Client; overdue: boolean; dragging: boolean
  onClick: (e: React.MouseEvent<HTMLButtonElement>) => void
  onDragStart: () => void; onDragEnd: () => void
}) {
  const published = item.column === 'publicado'
  const statusKey = overdue ? 'atrasado' : item.column
  const status = STATUS_META[statusKey]
  const accent = overdue ? 'var(--ds-error-accent)' : status.color
  const { thumbUrl, isVideo } = useDriveThumbnail(item.driveUrl, item.driveFolderUrl, item.postType === 'reels')

  return (
    <button
      draggable
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onClick={onClick}
      title="Arraste pra outro dia pra mudar a data"
      className={`rounded-lg overflow-hidden text-left border transition-opacity hover:opacity-85 flex items-start gap-1.5 px-2 py-1.5 cursor-grab active:cursor-grabbing ${dragging ? 'opacity-40' : ''}`}
      style={published
        ? { background: accent, borderColor: accent }
        : { background: accent + '18', borderColor: accent + (overdue ? '80' : '55') }}
    >
      {thumbUrl && (
        <div className="relative w-8 h-8 rounded-md overflow-hidden bg-[var(--color-bg-subtle)] flex-shrink-0">
          <img src={thumbUrl} alt="" className="absolute inset-0 w-full h-full object-cover"
            onError={e => { const el = e.target as HTMLImageElement; if (el.parentElement) el.parentElement.style.display = 'none' }} />
          {isVideo && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/25 pointer-events-none">
              <Play size={9} className="text-white" fill="currentColor" />
            </div>
          )}
        </div>
      )}
      <div className="flex flex-col gap-0.5 min-w-0 flex-1">
        <div className="flex items-center gap-1">
          <status.icon size={9} className="flex-shrink-0" style={{ color: published ? '#fff' : accent }} />
          <span className="text-[11px] font-bold truncate" style={{ color: published ? '#fff' : accent }}>
            {client?.name || 'Sem cliente'}
          </span>
          <span className="text-[9px] font-semibold uppercase tracking-wide flex-shrink-0" style={{ color: published ? 'rgba(255,255,255,0.85)' : accent }}>
            {status.label}
          </span>
        </div>
        <span className="text-[9px] truncate" style={{ color: published ? 'rgba(255,255,255,0.8)' : 'var(--color-text-muted)' }}>
          {item.scheduledTime ? item.scheduledTime.slice(0, 5) + ' · ' : ''}{item.postNumber ? `#${item.postNumber} ` : ''}{item.title} · {POST_TYPE_LABEL[item.postType || ''] || item.postType}
        </span>
      </div>
    </button>
  )
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
  const { currentMember } = useUser()
  const [weekStart, setWeekStart] = useState<Date>(() => getMonday(new Date()))
  const [popover, setPopover] = useState<{ item: SocialItem; anchor: PopoverAnchor } | null>(null)
  const [dragging, setDragging] = useState<SocialItem | null>(null)
  const [dragOverDay, setDragOverDay] = useState<string | null>(null)

  function getClient(id: string | null) { return clients.find(c => c.id === id) }

  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i))
  const todayISO = todayBrasiliaISO()

  function itemsForDay(iso: string) {
    return items
      .filter(i => i.scheduledDate === iso)
      .sort((a, b) => (a.scheduledTime || '99:99').localeCompare(b.scheduledTime || '99:99'))
  }

  async function publish(item: SocialItem) {
    const prev = items
    onItemsChange(list => list.map(i => i.id === item.id ? { ...i, column: 'publicado' } : i))
    const { error } = await moveSocialItem(item, 'publicado', currentMember)
    if (error) { onItemsChange(() => prev); dbError(error, toast, 'marcar como publicado') }
    setPopover(null)
  }

  async function schedule(item: SocialItem) {
    if (!item.scheduledDate) return
    const prev = items
    onItemsChange(list => list.map(i => i.id === item.id ? { ...i, column: 'agendado' } : i))
    const { error } = await scheduleSocialItem(item, item.scheduledDate, undefined, currentMember)
    if (error) { onItemsChange(() => prev); dbError(error, toast, 'agendar') }
    setPopover(null)
  }

  function openPopover(e: React.MouseEvent<HTMLButtonElement>, item: SocialItem) {
    const r = e.currentTarget.getBoundingClientRect()
    setPopover({ item, anchor: { top: r.top, bottom: r.bottom, left: r.left, right: r.right } })
  }

  async function dropOnDay(iso: string) {
    const item = dragging
    setDragging(null); setDragOverDay(null)
    if (!item || item.scheduledDate === iso) return
    const prev = items
    onItemsChange(list => list.map(i => i.id === item.id ? { ...i, scheduledDate: iso } : i))
    const { error } = await updateItemDate(item, iso, undefined, currentMember)
    if (error) { onItemsChange(() => prev); dbError(error, toast, 'mudar a data') }
  }

  return (
    <div className="flex-1 flex flex-col gap-3 p-4 overflow-auto">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-3 text-[11px] text-[var(--color-text-muted)]">
          <span className="flex items-center gap-1.5"><BadgeCheck size={12} style={{ color: STATUS_META.aprovado.color }} /> Aprovado</span>
          <span className="flex items-center gap-1.5"><Clock3 size={12} style={{ color: STATUS_META.agendado.color }} /> Agendado</span>
          <span className="flex items-center gap-1.5"><CheckCircle2 size={12} style={{ color: STATUS_META.publicado.color }} /> Publicado</span>
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

      <div className="flex-1 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-7 gap-2">
        {days.map((d, idx) => {
          const iso = toISO(d)
          const dayItems = itemsForDay(iso)
          const isToday = iso === todayISO
          const isDragOver = dragOverDay === iso
          return (
            <div
              key={iso}
              className={`flex flex-col bg-[var(--color-bg-card)] border rounded-2xl overflow-hidden transition-colors ${isDragOver ? 'border-[var(--color-accent)]' : 'border-[var(--color-border)]'}`}
              onDragOver={e => { if (dragging) { e.preventDefault(); setDragOverDay(iso) } }}
              onDragLeave={() => setDragOverDay(prev => (prev === iso ? null : prev))}
              onDrop={e => { e.preventDefault(); dropOnDay(iso) }}
            >
              <div className={`px-2.5 py-2 flex items-center justify-between border-b border-[var(--color-border)] ${isToday ? 'bg-[var(--color-accent)]/10' : ''}`}>
                <span className="text-[11px] font-semibold text-[var(--color-text-primary)]">{DAYS[idx]}</span>
                <span className={`text-[10px] font-bold w-5 h-5 flex items-center justify-center rounded-full ${isToday ? 'bg-[var(--color-accent)] text-white' : 'text-[var(--color-text-muted)]'}`}>
                  {d.getDate()}
                </span>
              </div>
              <div className={`flex-1 p-1.5 flex flex-col gap-1 min-h-[80px] ${isDragOver ? 'bg-[var(--color-accent)]/5' : ''}`}>
                {dayItems.length === 0 && <span className="text-[10px] text-[var(--color-text-faint)] text-center py-3">—</span>}
                {dayItems.map(item => (
                  <WeekDayItem
                    key={item.id}
                    item={item}
                    client={getClient(item.clientId)}
                    overdue={isOverdue(item, todayISO)}
                    dragging={dragging?.id === item.id}
                    onClick={e => openPopover(e, item)}
                    onDragStart={() => setDragging(item)}
                    onDragEnd={() => { setDragging(null); setDragOverDay(null) }}
                  />
                ))}
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
          onSchedule={() => schedule(popover.item)}
        />
      )}
    </div>
  )
}
