'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import { useUser } from '@/lib/UserContext'
import { fetchSocialItems, filterSocialItems, isOverdue, SocialItem, SocialFilters, ScheduleRow } from '@/lib/socialItems'
import SocialFilterBar from '@/components/social/SocialFilterBar'
import SocialBoard from '@/components/social/SocialBoard'
import SocialCalendarView from '@/components/social/SocialCalendarView'
import SocialWeekView from '@/components/social/SocialWeekView'
import PostCard from '@/components/PostCard'
import ExtraCard from '@/components/ExtraCard'
import { LayoutGrid, Calendar, CalendarDays, AlertCircle, AlertTriangle } from 'lucide-react'

type Client = { id: string; name: string; color_hex: string; logo_url?: string | null }
type View = 'board' | 'calendario' | 'semana'

const EMPTY_FILTERS: SocialFilters = { clientIds: new Set(), types: new Set(), sources: new Set(), dateFilter: 'todos', missingDateOnly: false, overdueOnly: false, search: '' }
const VIEW_OPTIONS: { key: View; label: string; icon: any }[] = [
  { key: 'board',      label: 'Board',      icon: LayoutGrid },
  { key: 'calendario', label: 'Calendário', icon: Calendar },
  { key: 'semana',     label: 'Semana',     icon: CalendarDays },
]

export default function SocialPage() {
  useEffect(() => { document.title = 'Publicações · Bagano Hub' }, [])
  const { members } = useUser()
  const [clients, setClients] = useState<Client[]>([])
  const [items, setItems] = useState<SocialItem[]>([])
  const [loading, setLoading] = useState(true)
  const [filters, setFilters] = useState<SocialFilters>(EMPTY_FILTERS)
  const [openItem, setOpenItem] = useState<SocialItem | null>(null)
  const [view, setView] = useState<View>('board')

  async function load() {
    const supabase = createClient()
    const [{ data: clientData }, socialItems] = await Promise.all([
      supabase.from('clients').select('id, name, color_hex, logo_url').eq('status', 'active').order('name'),
      fetchSocialItems(),
    ])
    setClients(clientData || [])
    setItems(socialItems)
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  function getClient(id: string | null) { return clients.find(c => c.id === id) }

  const visibleItems = filterSocialItems(items, filters)
  const publishedToday = items.filter(i => i.column === 'publicado' && i.scheduledDate === new Date().toISOString().slice(0, 10)).length
  const scheduledCount = items.filter(i => i.column === 'agendado').length
  const missingDateCount = items.filter(i => i.column === 'aprovado' && !i.scheduledDate).length
  const overdueCount = items.filter(i => isOverdue(i)).length

  if (loading) return <div className="p-6 text-sm text-[var(--color-text-muted)]">Carregando...</div>

  return (
    <div className="flex flex-col h-full">
      <div className="px-4 md:px-6 py-4 border-b border-[var(--color-border)] flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-[var(--color-text-primary)] tracking-tight">Publicações</h1>
          <p className="text-[var(--color-text-muted)] text-xs mt-0.5">{scheduledCount} agendado{scheduledCount === 1 ? '' : 's'} · {publishedToday} publicado{publishedToday === 1 ? '' : 's'} hoje</p>
        </div>
        <div className="flex items-center gap-1 bg-[var(--color-bg-card)] border border-[var(--color-border)] rounded-xl p-1">
          {VIEW_OPTIONS.map(opt => (
            <button
              key={opt.key}
              onClick={() => setView(opt.key)}
              className={`flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors ${
                view === opt.key ? 'bg-[var(--color-accent)] text-white' : 'text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-subtle)]'
              }`}
            >
              <opt.icon size={13} />{opt.label}
            </button>
          ))}
        </div>
      </div>

      <SocialFilterBar clients={clients} filters={filters} onChange={setFilters} />

      {overdueCount > 0 && (
        <button
          onClick={() => setFilters(f => ({ ...f, overdueOnly: !f.overdueOnly }))}
          className="mx-4 md:mx-6 mt-3 flex items-center gap-2 text-xs font-bold px-3 py-2.5 rounded-xl border-2 transition-colors text-left w-fit"
          style={{ background: 'var(--ds-error-bg)', borderColor: 'var(--ds-error-border)', color: 'var(--ds-error-text)' }}
        >
          <AlertTriangle size={15} />
          {overdueCount} {overdueCount === 1 ? 'publicação passou da data' : 'publicações passaram da data'} e ainda não {overdueCount === 1 ? 'foi marcada' : 'foram marcadas'} como publicada{overdueCount === 1 ? '' : 's'}
          <span className="underline ml-1">{filters.overdueOnly ? '— mostrando só essas' : '— ver só essas'}</span>
        </button>
      )}

      {missingDateCount > 0 && (
        <button
          onClick={() => setFilters(f => ({ ...f, missingDateOnly: !f.missingDateOnly }))}
          className="mx-4 md:mx-6 mt-3 flex items-center gap-2 text-xs font-medium px-3 py-2 rounded-xl border transition-colors text-left w-fit"
          style={{ background: 'var(--ds-warn-bg)', borderColor: 'var(--ds-warn-border)', color: 'var(--ds-warn-text)' }}
        >
          <AlertCircle size={14} />
          {missingDateCount} aprovado{missingDateCount === 1 ? '' : 's'} sem data marcada
          <span className="underline ml-1">{filters.missingDateOnly ? '— mostrando só esses' : '— ver só esses'}</span>
        </button>
      )}

      {view === 'board' && (
        <SocialBoard
          items={visibleItems}
          clients={clients}
          onOpenItem={setOpenItem}
          onItemsChange={updater => setItems(updater)}
        />
      )}
      {view === 'calendario' && (
        <SocialCalendarView
          items={visibleItems}
          clients={clients}
          onOpenItem={setOpenItem}
          onItemsChange={updater => setItems(updater)}
        />
      )}
      {view === 'semana' && (
        <SocialWeekView
          items={visibleItems}
          clients={clients}
          onOpenItem={setOpenItem}
          onItemsChange={updater => setItems(updater)}
        />
      )}

      {openItem?.source === 'schedule' && (
        <PostCard
          postId={openItem.id}
          clientId={openItem.clientId || ''}
          clientName={getClient(openItem.clientId)?.name}
          clientColor={getClient(openItem.clientId)?.color_hex}
          month={(openItem.raw as ScheduleRow).month}
          year={(openItem.raw as ScheduleRow).year}
          onClose={() => setOpenItem(null)}
          onSaved={load}
          onDeleted={load}
        />
      )}

      {openItem?.source === 'extra' && (
        <ExtraCard
          extraId={openItem.id}
          fixedClientId={openItem.clientId}
          clients={clients}
          members={members}
          onClose={() => setOpenItem(null)}
          onSaved={load}
          onDeleted={load}
        />
      )}
    </div>
  )
}
