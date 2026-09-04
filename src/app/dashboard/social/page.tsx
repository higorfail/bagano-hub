'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import { useUser } from '@/lib/UserContext'
import { fetchSocialItems, filterSocialItems, isOverdue, SocialItem, SocialFilters, ScheduleRow } from '@/lib/socialItems'
import SocialFilterBar from '@/components/social/SocialFilterBar'
import SocialBoard from '@/components/social/SocialBoard'
import SocialCalendarView from '@/components/social/SocialCalendarView'
import SocialWeekView from '@/components/social/SocialWeekView'
import SocialPendingView from '@/components/social/SocialPendingView'
import PostCard from '@/components/PostCard'
import ExtraCard from '@/components/ExtraCard'
import { LayoutGrid, Calendar, CalendarDays, AlertCircle, AlertTriangle, ListChecks } from 'lucide-react'
import { usePublicavelEmLote } from '@/lib/usePublicavel'

type Client = { id: string; name: string; color_hex: string; logo_url?: string | null }
type View = 'board' | 'calendario' | 'semana' | 'pendencias'

const EMPTY_FILTERS: SocialFilters = { clientIds: new Set(), types: new Set(), sources: new Set(), dateFilter: 'todos', missingDateOnly: false, overdueOnly: false, monthFilter: null, search: '' }

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

  // Checa o arquivo de tudo que ainda vai sair — publicado não entra: já foi,
  // e avisar viraria cobrança de algo que não dá mais pra mudar.
  const aVerificar = items.filter(i => i.column !== 'publicado')
  const selos = usePublicavelEmLote(aVerificar)
  const comProblema = Object.entries(selos).filter(([, s]) => s?.impede).map(([id]) => id)
  const [soProblema, setSoProblema] = useState(false)

  const itensNaTela = soProblema
    ? visibleItems.filter(i => comProblema.includes(i.id))
    : visibleItems
  const publishedToday = items.filter(i => i.column === 'publicado' && i.scheduledDate === new Date().toISOString().slice(0, 10)).length
  const scheduledCount = items.filter(i => i.column === 'agendado').length
  const missingDateCount = items.filter(i => i.column === 'aprovado' && !i.scheduledDate).length
  const overdueCount = items.filter(i => isOverdue(i)).length
  const pendingCount = missingDateCount + overdueCount

  const VIEW_OPTIONS: { key: View; label: string; icon: any; badge?: number }[] = [
    { key: 'board',      label: 'Board',      icon: LayoutGrid },
    { key: 'calendario', label: 'Calendário', icon: Calendar },
    { key: 'semana',     label: 'Semana',     icon: CalendarDays },
    { key: 'pendencias', label: 'Pendências', icon: ListChecks, badge: pendingCount },
  ]

  if (loading) return <div className="p-6 text-sm text-[var(--color-text-muted)]">Carregando...</div>

  return (
    <div className="flex flex-col h-full">
      {overdueCount > 0 && (
        <button
          onClick={() => setView('pendencias')}
          className="flex items-center justify-center gap-2.5 text-sm font-bold px-4 py-3 text-left w-full text-white animate-pulse-slow"
          style={{ background: 'var(--ds-error-accent)' }}
        >
          <AlertTriangle size={17} className="flex-shrink-0" />
          {overdueCount} {overdueCount === 1 ? 'publicação passou da data' : 'publicações passaram da data'} e ainda não {overdueCount === 1 ? 'foi marcada' : 'foram marcadas'} como publicada{overdueCount === 1 ? '' : 's'}
          <span className="underline ml-1">— resolver agora</span>
        </button>
      )}
      {/* O total é a informação acionável — dá pra ver um post com problema
          card a card, mas não "dezoito posts", que é o que faz alguém parar e
          arrumar. Clicar filtra a tela pra eles. */}
      {comProblema.length > 0 && (
        <button onClick={() => setSoProblema(v => !v)}
          className="flex items-center gap-2 px-3 py-2 rounded-xl border text-left transition-colors"
          style={soProblema
            ? { background: 'var(--ds-error-bg)', borderColor: 'var(--ds-error-text)', color: 'var(--ds-error-text)' }
            : { borderColor: 'var(--color-border)', color: 'var(--color-text-secondary)' }}>
          <AlertTriangle size={14} className="flex-shrink-0" />
          <span className="text-xs font-semibold">
            {comProblema.length} {comProblema.length === 1 ? 'post não sobe' : 'posts não sobem'} no Instagram
          </span>
          <span className="text-[11px] opacity-70">{soProblema ? '· mostrando só eles' : '· ver quais'}</span>
        </button>
      )}

      <SocialFilterBar
        clients={clients}
        filters={filters}
        onChange={setFilters}
        leading={
          // A divisória vertical só faz sentido quando o título está em linha
          // com o resto; empilhado no celular ela vira um risco solto.
          <div className="md:pr-2 md:mr-1 md:border-r border-[var(--color-border)] flex flex-col justify-center" title="Diferente do Kanban: aqui conta todos os meses + Extras juntos. Use o filtro de Mês pra comparar 1:1 com o Kanban.">
            <h1 className="text-base md:text-sm font-bold text-[var(--color-text-primary)] tracking-tight leading-none">Publicações</h1>
            <p className="text-[var(--color-text-muted)] text-[10px] mt-1">{scheduledCount} agendado{scheduledCount === 1 ? '' : 's'} · {publishedToday} hoje · todos os meses</p>
          </div>
        }
        trailing={
          <div className="flex items-center gap-1 bg-[var(--color-bg-card)] border border-[var(--color-border)] rounded-xl p-1 w-full xl:w-auto xl:ml-auto">
            {/* Largura cheia com 4 fatias iguais no celular: com a largura do
                próprio texto, "Pendências" ficava pra fora da borda da tela.
                Os ícones somem no telefone — os rótulos identificam melhor e
                é o espaço deles que falta. */}
            {VIEW_OPTIONS.map(opt => (
              <button
                key={opt.key}
                onClick={() => setView(opt.key)}
                className={`relative flex-1 xl:flex-none flex items-center justify-center gap-1.5 text-[11px] md:text-xs font-semibold px-1.5 md:px-3 py-2 md:py-1.5 rounded-lg transition-colors ${
                  view === opt.key ? 'bg-[var(--color-accent)] text-white' : 'text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-subtle)]'
                }`}
              >
                <opt.icon size={13} className="hidden sm:block" />{opt.label}
                {!!opt.badge && (
                  <span className="text-[9px] font-bold w-4 h-4 flex items-center justify-center rounded-full" style={{ background: view === opt.key ? 'rgba(255,255,255,0.3)' : 'var(--ds-error-accent)', color: view === opt.key ? '#fff' : '#fff' }}>
                    {opt.badge}
                  </span>
                )}
              </button>
            ))}
          </div>
        }
      />

      {view !== 'pendencias' && missingDateCount > 0 && (
        <button
          onClick={() => setView('pendencias')}
          className="mx-4 md:mx-6 mt-3 flex items-center gap-2 text-xs font-medium px-3 py-2 rounded-xl border transition-colors text-left w-fit"
          style={{ background: 'var(--ds-warn-bg)', borderColor: 'var(--ds-warn-border)', color: 'var(--ds-warn-text)' }}
        >
          <AlertCircle size={14} />
          {missingDateCount} aprovado{missingDateCount === 1 ? '' : 's'} sem data marcada
          <span className="underline ml-1">— resolver agora</span>
        </button>
      )}

      {view === 'board' && (
        <SocialBoard
          items={itensNaTela}
          clients={clients}
          onOpenItem={setOpenItem}
          onItemsChange={updater => setItems(updater)}
        />
      )}
      {view === 'calendario' && (
        <SocialCalendarView
          items={itensNaTela}
          clients={clients}
          onOpenItem={setOpenItem}
          onItemsChange={updater => setItems(updater)}
        />
      )}
      {view === 'semana' && (
        <SocialWeekView
          items={itensNaTela}
          clients={clients}
          onOpenItem={setOpenItem}
          onItemsChange={updater => setItems(updater)}
        />
      )}
      {view === 'pendencias' && (
        <SocialPendingView
          items={itensNaTela}
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
          postNumber={openItem.postNumber ?? undefined}
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
