'use client'

import { POST_TYPE_LABEL, type SocialFilters, type DateQuickFilter } from '@/lib/socialItems'
import { Search } from 'lucide-react'

type Client = { id: string; name: string; color_hex: string }

type Props = {
  clients: Client[]
  filters: SocialFilters
  onChange: (next: SocialFilters) => void
}

const DATE_OPTIONS: { key: DateQuickFilter; label: string }[] = [
  { key: 'todos',  label: 'Todos' },
  { key: 'hoje',   label: 'Hoje' },
  { key: 'semana', label: 'Esta semana' },
  { key: 'mes',    label: 'Este mês' },
]

export default function SocialFilterBar({ clients, filters, onChange }: Props) {
  function toggleClient(id: string) {
    const next = new Set(filters.clientIds)
    if (next.has(id)) next.delete(id); else next.add(id)
    onChange({ ...filters, clientIds: next })
  }
  function toggleType(type: string) {
    const next = new Set(filters.types)
    if (next.has(type)) next.delete(type); else next.add(type)
    onChange({ ...filters, types: next })
  }

  const allTypes = Object.keys(POST_TYPE_LABEL)

  return (
    <div className="flex flex-col gap-2.5 px-4 md:px-6 py-3 border-b border-[var(--color-border)]">
      <div className="flex items-center gap-2 flex-wrap">
        {/* busca */}
        <div className="relative">
          <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--color-text-faint)]" />
          <input
            value={filters.search}
            onChange={e => onChange({ ...filters, search: e.target.value })}
            placeholder="Buscar por título…"
            className="pl-7 pr-3 py-1.5 text-xs rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-card)] text-[var(--color-text-primary)] w-44 focus:outline-none focus:ring-1 focus:ring-[var(--color-brand)]"
          />
        </div>

        <div className="w-px h-5 bg-[var(--color-border)]" />

        {/* filtro rápido de data */}
        <div className="flex items-center gap-1">
          {DATE_OPTIONS.map(opt => (
            <button
              key={opt.key}
              onClick={() => onChange({ ...filters, dateFilter: opt.key })}
              className={`text-[11px] font-medium px-2.5 py-1 rounded-lg border transition-colors ${
                filters.dateFilter === opt.key
                  ? 'bg-[var(--color-brand)] text-white border-[var(--color-brand)]'
                  : 'border-[var(--color-border)] text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-subtle)]'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        {/* filtro por cliente */}
        <div className="flex items-center gap-1 flex-wrap">
          {clients.map(c => {
            const active = filters.clientIds.size === 0 || filters.clientIds.has(c.id)
            return (
              <button
                key={c.id}
                onClick={() => toggleClient(c.id)}
                className="flex items-center gap-1.5 text-[11px] font-medium px-2 py-1 rounded-full border transition-all"
                style={{
                  borderColor: active ? c.color_hex : 'var(--color-border)',
                  background: active ? c.color_hex + '18' : 'transparent',
                  color: active ? c.color_hex : 'var(--color-text-faint)',
                  opacity: active ? 1 : 0.55,
                }}
              >
                <span className="w-1.5 h-1.5 rounded-full" style={{ background: c.color_hex }} />
                {c.name}
              </button>
            )
          })}
        </div>

        <div className="w-px h-5 bg-[var(--color-border)]" />

        {/* filtro por tipo */}
        <div className="flex items-center gap-1 flex-wrap">
          {allTypes.map(type => {
            const active = filters.types.size === 0 || filters.types.has(type)
            return (
              <button
                key={type}
                onClick={() => toggleType(type)}
                className="text-[11px] font-medium px-2 py-1 rounded-full border transition-all"
                style={{
                  borderColor: 'var(--color-border)',
                  background: active ? 'var(--color-bg-card)' : 'transparent',
                  color: active ? 'var(--color-text-secondary)' : 'var(--color-text-faint)',
                  opacity: active ? 1 : 0.55,
                }}
              >
                {POST_TYPE_LABEL[type]}
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}
