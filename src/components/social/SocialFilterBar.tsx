'use client'

import { useEffect, useRef, useState } from 'react'
import { POST_TYPE_LABEL, type SocialFilters, type DateQuickFilter, type SocialSource } from '@/lib/socialItems'
import { Search, ChevronDown, Check } from 'lucide-react'

type Client = { id: string; name: string; color_hex: string; logo_url?: string | null }

type Props = {
  clients: Client[]
  filters: SocialFilters
  onChange: (next: SocialFilters) => void
  leading?: React.ReactNode
  trailing?: React.ReactNode
}

const DATE_OPTIONS: { key: DateQuickFilter; label: string }[] = [
  { key: 'todos',  label: 'Todos' },
  { key: 'hoje',   label: 'Hoje' },
  { key: 'semana', label: 'Semana' },
  { key: 'mes',    label: 'Mês' },
]

const SOURCE_OPTIONS: { key: SocialSource | 'todos'; label: string }[] = [
  { key: 'todos',    label: 'Todos' },
  { key: 'schedule', label: 'Crono' },
  { key: 'extra',    label: 'Extra' },
]

function initials(name: string) {
  return (name || '?').split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()
}

function Avatar({ client, size = 8 }: { client: Client; size?: number }) {
  const px = size * 4
  return (
    <div
      className="rounded-full flex items-center justify-center text-white font-semibold flex-shrink-0 overflow-hidden"
      style={{ width: px, height: px, background: client.color_hex, fontSize: px * 0.4 }}
    >
      {client.logo_url ? <img src={client.logo_url} alt={client.name} className="w-full h-full object-cover" /> : initials(client.name)}
    </div>
  )
}

// Dropdown genérico usado pros filtros de Cliente e Tipo — fecha ao clicar fora.
function FilterDropdown({ label, count, children }: { label: string; count: number; children: React.ReactNode }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function h(e: MouseEvent) { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false) }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [])

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(o => !o)}
        className={`flex items-center gap-1.5 text-xs font-medium px-2.5 py-1.5 rounded-lg border transition-colors ${
          count > 0 ? 'border-[var(--color-accent)] text-[var(--color-accent)] bg-[var(--color-accent)]/8' : 'border-[var(--color-border)] text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-subtle)]'
        }`}
      >
        {label}{count > 0 && <span className="text-[10px] font-bold">({count})</span>}
        <ChevronDown size={12} />
      </button>
      {open && (
        <div className="absolute top-full left-0 mt-1.5 z-50 w-56 max-h-72 overflow-y-auto bg-[var(--color-bg-card)] border border-[var(--color-border)] rounded-xl shadow-xl p-1.5">
          {children}
        </div>
      )}
    </div>
  )
}

export default function SocialFilterBar({ clients, filters, onChange, leading, trailing }: Props) {
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
  function setSource(key: SocialSource | 'todos') {
    onChange({ ...filters, sources: key === 'todos' ? new Set() : new Set([key]) })
  }

  const allTypes = Object.keys(POST_TYPE_LABEL)
  const currentSource: SocialSource | 'todos' = filters.sources.size === 1 ? [...filters.sources][0] : 'todos'

  return (
    <div className="flex items-center gap-2 px-4 md:px-6 py-2.5 border-b border-[var(--color-border)] flex-wrap">
      {leading}
      <div className="relative">
        <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--color-text-faint)]" />
        <input
          value={filters.search}
          onChange={e => onChange({ ...filters, search: e.target.value })}
          placeholder="Buscar por título…"
          className="pl-7 pr-3 py-1.5 text-xs rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-card)] text-[var(--color-text-primary)] w-40 focus:outline-none focus:ring-1 focus:ring-[var(--color-brand)]"
        />
      </div>

      <div className="flex items-center gap-1 bg-[var(--color-bg-subtle)] rounded-lg p-0.5">
        {DATE_OPTIONS.map(opt => (
          <button
            key={opt.key}
            onClick={() => onChange({ ...filters, dateFilter: opt.key })}
            className={`text-[11px] font-medium px-2 py-1 rounded-md transition-colors ${
              filters.dateFilter === opt.key ? 'bg-[var(--color-bg-card)] text-[var(--color-text-primary)] shadow-sm' : 'text-[var(--color-text-muted)]'
            }`}
          >
            {opt.label}
          </button>
        ))}
      </div>

      <FilterDropdown label="Cliente" count={filters.clientIds.size}>
        {clients.map(c => {
          const active = filters.clientIds.has(c.id)
          return (
            <button key={c.id} onClick={() => toggleClient(c.id)} className="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-[var(--color-bg-subtle)] transition-colors text-left">
              <Avatar client={c} size={7} />
              <span className="text-xs text-[var(--color-text-primary)] truncate flex-1">{c.name}</span>
              {active && <Check size={13} className="text-[var(--color-accent)] flex-shrink-0" />}
            </button>
          )
        })}
      </FilterDropdown>

      <FilterDropdown label="Tipo" count={filters.types.size}>
        {allTypes.map(type => {
          const active = filters.types.has(type)
          return (
            <button key={type} onClick={() => toggleType(type)} className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg hover:bg-[var(--color-bg-subtle)] transition-colors text-left">
              <span className="text-xs text-[var(--color-text-primary)] flex-1">{POST_TYPE_LABEL[type]}</span>
              {active && <Check size={13} className="text-[var(--color-accent)] flex-shrink-0" />}
            </button>
          )
        })}
      </FilterDropdown>

      <div className="flex items-center gap-1 bg-[var(--color-bg-subtle)] rounded-lg p-0.5">
        {SOURCE_OPTIONS.map(opt => (
          <button
            key={opt.key}
            onClick={() => setSource(opt.key)}
            className={`text-[11px] font-medium px-2 py-1 rounded-md transition-colors ${
              currentSource === opt.key ? 'bg-[var(--color-bg-card)] text-[var(--color-text-primary)] shadow-sm' : 'text-[var(--color-text-muted)]'
            }`}
          >
            {opt.label}
          </button>
        ))}
      </div>

      {(filters.clientIds.size > 0 || filters.types.size > 0 || filters.sources.size > 0 || filters.search || filters.dateFilter !== 'todos' || filters.missingDateOnly || filters.overdueOnly) && (
        <button
          onClick={() => onChange({ clientIds: new Set(), types: new Set(), sources: new Set(), dateFilter: 'todos', missingDateOnly: false, overdueOnly: false, search: '' })}
          className="text-[11px] text-[var(--color-text-faint)] hover:text-[var(--color-text-secondary)] px-1"
        >
          ✕ limpar filtros
        </button>
      )}

      <div className="flex-1" />
      {trailing}
    </div>
  )
}
