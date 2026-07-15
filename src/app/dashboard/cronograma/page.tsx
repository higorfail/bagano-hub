'use client'
// @ts-nocheck

import { useEffect, useState, useRef, Suspense } from 'react'
import { useSearchParams, useRouter, usePathname } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import CronogramaTab, { CRONO_MONTHS } from '@/components/CronogramaTab'
import Button from '@/components/ui/Button'
import { Check } from 'lucide-react'
import { useUser } from '@/lib/UserContext'

type Client = { id: string; name: string; color_hex: string; logo_url?: string | null }

function CronogramaPageInner() {
  const { currentMember } = useUser()
  const [clients, setClients] = useState<Client[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(false)
  const searchParams = useSearchParams()
  const router = useRouter()
  const pathname = usePathname()
  const clientParam = searchParams.get('client')
  const postParam = searchParams.get('post')
  const syncKey = `${clientParam}|${postParam}|${searchParams.get('m')}|${searchParams.get('y')}`

  const [selectedClient, setSelectedClient] = useState<string>(() => clientParam || '')
  const [selectedMonth, setSelectedMonth] = useState(() => {
    const m = parseInt(searchParams.get('m') || '')
    return !isNaN(m) && m >= 1 && m <= 12 ? m : new Date().getMonth() + 1
  })
  const [selectedYear, setSelectedYear] = useState(() => {
    const y = parseInt(searchParams.get('y') || '')
    return !isNaN(y) && y > 2000 ? y : new Date().getFullYear()
  })
  const [showMonthPicker, setShowMonthPicker] = useState(false)
  const [postCount, setPostCount] = useState(0)

  useEffect(() => {
    const cl = clients.find(c => c.id === selectedClient)
    document.title = cl ? `Cronograma · ${cl.name} · Bagano Hub` : 'Cronograma · Bagano Hub'
  }, [clients, selectedClient])

  useEffect(() => {
    async function loadClients() {
      try {
        const supabase = createClient()
        const { data, error } = await supabase.from('clients').select('id, name, color_hex, logo_url').eq('status', 'active').order('name')
        if (error) { setLoadError(true); setLoading(false); return }
        setClients(data || [])
        if (clientParam && data?.some(c => c.id === clientParam)) {
          setSelectedClient(clientParam)
        } else if (data && data.length > 0) {
          setSelectedClient(data[0].id)
        }
      } catch {
        setLoadError(true)
      }
      setLoading(false)
    }
    loadClients()
  }, [])

  // Sync from notification links while already on page
  useEffect(() => {
    if (!clientParam || !clients.length) return
    const m = parseInt(searchParams.get('m') || '')
    const y = parseInt(searchParams.get('y') || '')
    if (!isNaN(m) && m >= 1 && m <= 12) setSelectedMonth(m)
    if (!isNaN(y) && y > 2000) setSelectedYear(y)
    if (clientParam !== selectedClient && clients.some(c => c.id === clientParam)) {
      setSelectedClient(clientParam)
    }
  }, [syncKey, clients])

  // Mantém a URL sincronizada com a seleção atual, pra um refresh voltar pro mesmo cliente/mês/ano
  useEffect(() => {
    if (!selectedClient) return
    const params = new URLSearchParams(searchParams.toString())
    params.set('client', selectedClient)
    params.set('m', String(selectedMonth))
    params.set('y', String(selectedYear))
    if (params.toString() !== searchParams.toString()) {
      router.replace(`${pathname}?${params.toString()}`, { scroll: false })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedClient, selectedMonth, selectedYear])

  if (loading) return (
    <div className="flex items-center justify-center h-full">
      <div className="w-5 h-5 border-2 border-[var(--color-border)] border-t-[var(--color-text-primary)] rounded-full animate-spin" />
    </div>
  )

  if (loadError) return (
    <div className="flex flex-col items-center justify-center h-full gap-3 text-center px-8">
      <p className="text-sm text-[var(--color-text-muted)]">Não foi possível carregar o cronograma.</p>
      <button onClick={() => window.location.reload()}
        className="text-xs px-4 py-2 rounded-xl border border-[var(--color-border)] text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-card)] transition-colors">
        Tentar novamente
      </button>
    </div>
  )

  const client = clients.find(c => c.id === selectedClient)

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="px-6 py-3.5 border-b border-[var(--color-border)] flex items-center justify-between gap-4 flex-wrap flex-shrink-0">
        <div className="min-w-0 flex items-baseline gap-2.5">
          <h1 className="text-xl font-bold text-[var(--color-text-primary)] tracking-tight">Cronograma</h1>
          <p className="text-[var(--color-text-muted)] text-sm truncate">{postCount} post{postCount !== 1 ? 's' : ''} · {CRONO_MONTHS[selectedMonth - 1]} {selectedYear}</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {/* Client selector */}
          <select value={selectedClient} onChange={e => { setSelectedClient(e.target.value) }}
            className="border border-[var(--color-border)] rounded-xl px-3 py-2 text-sm text-[var(--color-text-primary)] bg-[var(--color-bg-card)] outline-none">
            {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          {/* Month/year picker */}
          <div className="relative">
            <button onClick={() => setShowMonthPicker(v => !v)}
              className="flex items-center gap-2 px-3 py-2 rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-card)] hover:border-[var(--color-border-hover)] transition-all text-sm font-medium text-[var(--color-text-primary)]">
              {CRONO_MONTHS[selectedMonth - 1]} {selectedYear}
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="text-[var(--color-text-muted)]"><polyline points="6 9 12 15 18 9"/></svg>
            </button>
            {showMonthPicker && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setShowMonthPicker(false)} />
                <div className="absolute right-0 top-11 z-50 bg-[var(--color-bg-card)] rounded-2xl border border-[var(--color-border)] p-4 w-64 animate-scale-in">
                  <div className="flex items-center justify-between mb-3">
                    <button onClick={() => setSelectedYear(y => y - 1)} className="w-7 h-7 rounded-xl hover:bg-[var(--color-bg-subtle)] flex items-center justify-center text-[var(--color-text-secondary)]">‹</button>
                    <span className="text-sm font-semibold text-[var(--color-text-primary)]">{selectedYear}</span>
                    <button onClick={() => setSelectedYear(y => y + 1)} className="w-7 h-7 rounded-xl hover:bg-[var(--color-bg-subtle)] flex items-center justify-center text-[var(--color-text-secondary)]">›</button>
                  </div>
                  <div className="grid grid-cols-3 gap-1.5">
                    {CRONO_MONTHS.map((m, i) => (
                      <button key={m} onClick={() => { setSelectedMonth(i + 1); setShowMonthPicker(false) }}
                        className={`py-2 rounded-xl text-xs font-medium transition-colors ${selectedMonth === i + 1 ? 'bg-[var(--color-text-primary)] text-white' : 'text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-subtle)]'}`}>
                        {m.slice(0, 3)}
                      </button>
                    ))}
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-6 py-4">
        {selectedClient && (
          <CronogramaTab
            key={`${selectedClient}-${selectedMonth}-${selectedYear}`}
            clientId={selectedClient}
            clientName={client?.name}
            clientColor={client?.color_hex}
            month={selectedMonth}
            year={selectedYear}
            postParam={postParam}
            onPostsChange={setPostCount}
          />
        )}
      </div>
    </div>
  )
}

export default function CronogramaPage() {
  return <Suspense><CronogramaPageInner /></Suspense>
}
