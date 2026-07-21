'use client'

import { SocialItem, isOverdue, moveSocialItem, scheduleSocialItem } from '@/lib/socialItems'
import { useToast } from '@/lib/ToastContext'
import { dbError } from '@/lib/dbError'
import SocialItemCard from './SocialItemCard'
import { CalendarPlus, AlertTriangle } from 'lucide-react'

type Client = { id: string; name: string; color_hex: string }

type Props = {
  items: SocialItem[]
  clients: Client[]
  onOpenItem: (item: SocialItem) => void
  onItemsChange: (updater: (items: SocialItem[]) => SocialItem[]) => void
}

// Visão dedicada às duas situações que exigem ação da social media: aprovados
// sem data ainda, e agendados cuja data já passou sem terem sido publicados.
// Junta o que os alertas do topo já contam, em formato de lista pra resolver.
export default function SocialPendingView({ items, clients, onOpenItem, onItemsChange }: Props) {
  const { toast } = useToast()

  function getClient(id: string | null) { return clients.find(c => c.id === id) }

  const missingDate = items.filter(i => i.column === 'aprovado' && !i.scheduledDate)
  const overdue = items.filter(i => isOverdue(i))

  async function publish(item: SocialItem) {
    const prev = items
    onItemsChange(list => list.map(i => i.id === item.id ? { ...i, column: 'publicado' } : i))
    const { error } = await moveSocialItem(item, 'publicado')
    if (error) { onItemsChange(() => prev); dbError(error, toast, 'marcar como publicado') }
  }

  async function schedule(item: SocialItem, date: string) {
    const prev = items
    onItemsChange(list => list.map(i => i.id === item.id ? { ...i, scheduledDate: date, column: 'agendado' } : i))
    const { error } = await scheduleSocialItem(item, date)
    if (error) { onItemsChange(() => prev); dbError(error, toast, 'agendar') }
  }

  const Section = ({ icon, title, color, list }: { icon: React.ReactNode; title: string; color: string; list: SocialItem[] }) => (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2 px-1">
        {icon}
        <h2 className="text-sm font-bold" style={{ color }}>{title}</h2>
        <span className="text-xs font-bold text-[var(--color-text-faint)] bg-[var(--color-bg-card)] rounded-full px-2 py-0.5 border border-[var(--color-border)]">{list.length}</span>
      </div>
      {list.length === 0 ? (
        <p className="text-xs text-[var(--color-text-faint)] px-1">Nada por aqui — tudo em dia 🎉</p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
          {list.map(item => (
            <SocialItemCard
              key={item.id}
              item={item}
              client={getClient(item.clientId)}
              onClick={() => onOpenItem(item)}
              onPublish={() => publish(item)}
              onSchedule={date => schedule(item, date)}
            />
          ))}
        </div>
      )}
    </div>
  )

  return (
    <div className="flex-1 overflow-auto p-4 flex flex-col gap-6">
      <Section
        icon={<AlertTriangle size={16} style={{ color: 'var(--ds-error-accent)' }} />}
        title="Atrasados — data passou e não foi publicado"
        color="var(--ds-error-text)"
        list={overdue}
      />
      <Section
        icon={<CalendarPlus size={16} style={{ color: 'var(--ds-warn-accent)' }} />}
        title="Aprovados sem data marcada"
        color="var(--ds-warn-text)"
        list={missingDate}
      />
    </div>
  )
}
