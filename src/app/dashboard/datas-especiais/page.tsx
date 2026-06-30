'use client'

import { useEffect, useState, useMemo } from 'react'
import { createClient } from '@/lib/supabase'
import { Plus, Trash2, CalendarHeart, Clock } from 'lucide-react'

type SpecialDate = { id: string; name: string; date: string }

const MONTHS = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro']
const MONTH_SHORT = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez']

function daysBetween(from: Date, to: Date) {
  const diff = to.getTime() - from.getTime()
  return Math.ceil(diff / 86400000)
}

function urgencyStyle(days: number): { pill: string; badge: string } {
  if (days < 0)   return { pill: 'bg-[var(--color-bg-subtle)] text-[var(--color-text-muted)]',                                    badge: 'text-[var(--color-text-muted)]' }
  if (days <= 7)  return { pill: 'bg-[var(--ds-error-bg)] border border-[var(--ds-error-border)]',                                badge: 'text-[var(--ds-error-text)] font-bold' }
  if (days <= 14) return { pill: 'bg-[var(--ds-warn-bg)] border border-[var(--ds-warn-border)]',                                  badge: 'text-[var(--ds-warn-text)] font-bold' }
  if (days <= 30) return { pill: 'bg-[var(--ds-caution-bg)] border border-[var(--ds-caution-border)]',                            badge: 'text-[var(--ds-caution-text)] font-semibold' }
  if (days <= 60) return { pill: 'bg-[var(--ds-info-bg)] border border-[var(--ds-info-border)]',                                  badge: 'text-[var(--ds-info-text)]' }
  return { pill: 'bg-[var(--color-bg-card)] border border-[var(--color-border)]', badge: 'text-[var(--color-text-muted)]' }
}

export default function DatasEspeciaisPage() {
  const [dates, setDates]       = useState<SpecialDate[]>([])
  const [loading, setLoading]   = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm]         = useState({ name: '', date: '' })
  const [saving, setSaving]     = useState(false)
  const [deleting, setDeleting] = useState<string | null>(null)
  const [filterYear, setFilterYear] = useState(new Date().getFullYear())

  const today = useMemo(() => {
    const d = new Date()
    d.setHours(0, 0, 0, 0)
    return d
  }, [])

  useEffect(() => { load() }, [])

  async function load() {
    const supabase = createClient()
    const { data } = await supabase
      .from('special_dates')
      .select('id, name, date')
      .order('date')
    setDates(data || [])
    setLoading(false)
  }

  async function save() {
    if (!form.name.trim() || !form.date) return
    setSaving(true)
    const supabase = createClient()
    await supabase.from('special_dates').insert({ name: form.name.trim(), date: form.date })
    await load()
    setForm({ name: '', date: '' })
    setShowForm(false)
    setSaving(false)
  }

  async function remove(id: string) {
    setDeleting(id)
    const supabase = createClient()
    await supabase.from('special_dates').delete().eq('id', id)
    setDates(d => d.filter(x => x.id !== id))
    setDeleting(null)
  }

  const years = useMemo(() => {
    const ys = new Set(dates.map(d => new Date(d.date + 'T12:00:00').getFullYear()))
    return Array.from(ys).sort()
  }, [dates])

  // Agrupar por mês dentro do ano selecionado
  const byMonth = useMemo(() => {
    const filtered = dates.filter(d => new Date(d.date + 'T12:00:00').getFullYear() === filterYear)
    const groups: Record<number, SpecialDate[]> = {}
    filtered.forEach(d => {
      const m = new Date(d.date + 'T12:00:00').getMonth()
      if (!groups[m]) groups[m] = []
      groups[m].push(d)
    })
    return groups
  }, [dates, filterYear])

  // Próximas datas (independente do filtro de ano)
  const upcoming = useMemo(() =>
    dates
      .filter(d => {
        const dt = new Date(d.date + 'T12:00:00')
        return dt >= today
      })
      .slice(0, 5),
  [dates, today])

  if (loading) return (
    <div className="flex items-center justify-center h-full">
      <div className="w-5 h-5 border-2 border-[var(--color-border)] border-t-[#1A1916] rounded-full animate-spin" />
    </div>
  )

  return (
    <div className="min-h-screen bg-[var(--color-bg-page)]">
      <div className="max-w-5xl mx-auto px-8 py-10 space-y-8">

        {/* Header */}
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-3xl font-bold text-[var(--color-text-primary)] tracking-tight">Datas Especiais</h1>
            <p className="text-sm text-[var(--color-text-muted)] mt-1">{dates.length} datas cadastradas · calendário do nicho gastronômico</p>
          </div>
          <button
            onClick={() => setShowForm(v => !v)}
            className="flex items-center gap-2 bg-[var(--color-brand)] text-[var(--color-brand-fg)] rounded-xl px-4 py-2.5 text-sm font-semibold hover:opacity-90 transition-opacity"
          >
            <Plus size={14} />
            Nova data
          </button>
        </div>

        {/* Form nova data */}
        {showForm && (
          <div className="bg-[var(--color-bg-card)] rounded-2xl border border-[var(--color-border)] p-6 flex items-end gap-4">
            <div className="flex-1">
              <label className="text-xs font-medium text-[var(--color-text-secondary)] mb-1.5 block">Nome da data</label>
              <input
                autoFocus
                type="text"
                value={form.name}
                onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                onKeyDown={e => e.key === 'Enter' && save()}
                placeholder="Ex: Dia do Açaí"
                className="w-full border border-[var(--color-border)] rounded-xl px-3 py-2.5 text-sm outline-none focus:border-[var(--color-brand)] text-[var(--color-text-primary)]"
              />
            </div>
            <div className="w-44">
              <label className="text-xs font-medium text-[var(--color-text-secondary)] mb-1.5 block">Data</label>
              <input
                type="date"
                value={form.date}
                onChange={e => setForm(f => ({ ...f, date: e.target.value }))}
                className="w-full border border-[var(--color-border)] rounded-xl px-3 py-2.5 text-sm outline-none focus:border-[var(--color-brand)] text-[var(--color-text-primary)]"
              />
            </div>
            <button
              onClick={save}
              disabled={saving || !form.name.trim() || !form.date}
              className="px-5 py-2.5 rounded-xl bg-[var(--color-brand)] text-[var(--color-brand-fg)] text-sm font-semibold disabled:opacity-40 hover:opacity-90 transition-opacity"
            >
              {saving ? 'Salvando...' : 'Salvar'}
            </button>
            <button onClick={() => setShowForm(false)} className="px-4 py-2.5 rounded-xl text-sm text-[var(--color-text-muted)] hover:bg-[var(--color-bg-subtle)] transition-colors">
              Cancelar
            </button>
          </div>
        )}

        {/* Próximas datas — radar */}
        {upcoming.length > 0 && (
          <div className="bg-[var(--color-bg-card)] rounded-2xl border border-[var(--color-border)] p-6">
            <div className="flex items-center gap-2 mb-5">
              <Clock size={14} className="text-[var(--color-text-muted)]" />
              <p className="text-xs font-semibold text-[var(--color-text-muted)] uppercase tracking-wider">Radar — próximas datas</p>
            </div>
            <div className="flex flex-wrap gap-3">
              {upcoming.map(d => {
                const dt   = new Date(d.date + 'T12:00:00')
                const days = daysBetween(today, dt)
                const { pill, badge } = urgencyStyle(days)
                return (
                  <div key={d.id} className={`flex items-center gap-3 rounded-xl px-4 py-2.5 ${pill}`}>
                    <div className="text-center">
                      <p className="text-[10px] text-[var(--color-text-muted)] leading-none">{MONTH_SHORT[dt.getMonth()]}</p>
                      <p className="text-lg font-bold text-[var(--color-text-primary)] leading-tight">{dt.getDate()}</p>
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-[var(--color-text-primary)]">{d.name}</p>
                      <p className={`text-xs ${badge}`}>
                        {days === 0 ? 'hoje!' : days === 1 ? 'amanhã' : `em ${days} dias`}
                      </p>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* Filtro por ano */}
        <div className="flex items-center gap-2">
          {years.map(y => (
            <button
              key={y}
              onClick={() => setFilterYear(y)}
              className={`px-4 py-1.5 rounded-xl text-sm font-semibold transition-all ${filterYear === y ? 'bg-[var(--color-brand)] text-[var(--color-brand-fg)]' : 'bg-[var(--color-bg-card)] border border-[var(--color-border)] text-[var(--color-text-secondary)] hover:border-[var(--color-border-strong)]'}`}
            >
              {y}
            </button>
          ))}
        </div>

        {/* Calendário por mês */}
        <div className="space-y-6">
          {MONTHS.map((monthName, mi) => {
            const monthDates = byMonth[mi]
            if (!monthDates?.length) return null
            return (
              <div key={mi} className="bg-[var(--color-bg-card)] rounded-2xl border border-[var(--color-border)] overflow-hidden">
                {/* Header do mês */}
                <div className="px-6 py-4 border-b border-[var(--color-border)] flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-xl bg-[var(--color-bg-subtle)] flex flex-col items-center justify-center">
                      <CalendarHeart size={14} className="text-[var(--color-text-secondary)]" />
                    </div>
                    <p className="font-semibold text-[var(--color-text-primary)]">{monthName}</p>
                  </div>
                  <span className="text-xs text-[var(--color-text-muted)]">{monthDates.length} data{monthDates.length !== 1 ? 's' : ''}</span>
                </div>

                {/* Datas do mês */}
                <div className="divide-y divide-[var(--color-bg-subtle)]">
                  {monthDates.map(d => {
                    const dt   = new Date(d.date + 'T12:00:00')
                    const days = daysBetween(today, dt)
                    const past = days < 0
                    const { badge } = urgencyStyle(days)
                    const dayName = ['Dom','Seg','Ter','Qua','Qui','Sex','Sáb'][dt.getDay()]
                    return (
                      <div key={d.id} className={`flex items-center gap-4 px-6 py-3.5 group ${past ? 'opacity-40' : ''}`}>
                        {/* Dia */}
                        <div className="w-12 text-center flex-shrink-0">
                          <p className="text-xl font-bold text-[var(--color-text-primary)] leading-none">{dt.getDate()}</p>
                          <p className="text-[10px] text-[var(--color-text-muted)] mt-0.5">{dayName}</p>
                        </div>
                        {/* Nome */}
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-[var(--color-text-primary)]">{d.name}</p>
                        </div>
                        {/* Countdown */}
                        {!past && (
                          <span className={`text-xs tabular-nums flex-shrink-0 ${badge}`}>
                            {days === 0 ? 'hoje' : days === 1 ? 'amanhã' : `${days}d`}
                          </span>
                        )}
                        {past && (
                          <span className="text-[10px] text-[var(--color-text-faint)] flex-shrink-0">passou</span>
                        )}
                        {/* Deletar */}
                        <button
                          onClick={() => remove(d.id)}
                          disabled={deleting === d.id}
                          className="w-7 h-7 rounded-lg flex items-center justify-center text-[var(--color-text-faint)] opacity-0 group-hover:opacity-100 transition-all flex-shrink-0" style={{}} onMouseEnter={e => { e.currentTarget.style.background = 'var(--ds-error-bg)'; e.currentTarget.style.color = 'var(--ds-error-text)' }} onMouseLeave={e => { e.currentTarget.style.background = ''; e.currentTarget.style.color = '' }}
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    )
                  })}
                </div>
              </div>
            )
          })}
        </div>

      </div>
    </div>
  )
}
