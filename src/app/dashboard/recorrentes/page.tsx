'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase'
import { useUser } from '@/lib/UserContext'
import { useToast } from '@/lib/ToastContext'
import { dbError } from '@/lib/dbError'
import { logActivity } from '@/lib/activity'
import RecurringFormModal from '@/components/recorrentes/RecurringFormModal'
import RecurringCard from '@/components/recorrentes/RecurringCard'
import TodayRow from '@/components/recorrentes/TodayRow'
import {
  Recurring, RecurringLog, RecurringVariant,
  slotsFor, isLate, todayISO, shiftISO, humanDate, logKey, occursOn,
} from '@/lib/recurrings'
import {
  Plus, ChevronLeft, ChevronRight, Check, Search, ChevronDown,
  CalendarCheck, Repeat, AlertTriangle, CalendarOff,
} from 'lucide-react'

type Client = { id: string; name: string; color_hex: string; logo_url?: string | null }
type View = 'hoje' | 'todos'

function initials(name: string) {
  return (name || '?').split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()
}

function Avatar({ client, px = 20 }: { client: Client; px?: number }) {
  return (
    <div className="rounded-full flex items-center justify-center text-white font-semibold flex-shrink-0 overflow-hidden"
      style={{ width: px, height: px, background: client.color_hex, fontSize: px * 0.4 }}>
      {client.logo_url ? <img src={client.logo_url} alt={client.name} className="w-full h-full object-cover" /> : initials(client.name)}
    </div>
  )
}

export default function RecorrentesPage() {
  useEffect(() => { document.title = 'Recorrentes · Bagano Hub' }, [])
  const { currentMember } = useUser()
  const { toast } = useToast()

  const [clients, setClients]     = useState<Client[]>([])
  const [recurrings, setRecurrings] = useState<Recurring[]>([])
  const [logs, setLogs]           = useState<RecurringLog[]>([])
  const [captions, setCaptions]   = useState<Record<string, Record<string, string>>>({})
  const [loading, setLoading]     = useState(true)
  const [failed, setFailed]       = useState(false)

  const [view, setView]           = useState<View>('hoje')
  const [iso, setIso]             = useState(todayISO())
  const [clientIds, setClientIds] = useState<Set<string>>(new Set())
  const [search, setSearch]       = useState('')
  const [clientOpen, setClientOpen] = useState(false)
  const clientRef = useRef<HTMLDivElement>(null)

  const [modal, setModal]   = useState<{ editing: Recurring | null } | null>(null)
  const [busy, setBusy]     = useState<string | null>(null)

  useEffect(() => {
    function h(e: MouseEvent) { if (clientRef.current && !clientRef.current.contains(e.target as Node)) setClientOpen(false) }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [])

  async function load() {
    // try/finally pelo mesmo motivo das outras telas: sem ele, uma falha no
    // meio deixa a página girando pra sempre, sem erro e sem saída.
    try {
      setFailed(false)
      const supabase = createClient()
      const [{ data: cls }, { data: recs }, { data: lgs }, { data: vars }] = await Promise.all([
        supabase.from('clients').select('id, name, color_hex, logo_url').eq('status', 'active').order('name'),
        supabase.from('recurrings').select('*').order('position').order('created_at'),
        // Últimos 60 dias: alimenta a rotação das artes e a fileira de bolinhas
        // sem arrastar o histórico inteiro pro navegador.
        supabase.from('recurring_logs').select('*').gte('done_date', shiftISO(todayISO(), -60)),
        supabase.from('recurring_variants').select('recurring_id, drive_file_id, caption'),
      ])
      setClients(cls || [])
      setRecurrings((recs as Recurring[]) || [])
      setLogs((lgs as RecurringLog[]) || [])
      const map: Record<string, Record<string, string>> = {}
      ;(vars as RecurringVariant[] | null)?.forEach(v => {
        ;(map[v.recurring_id] ||= {})[v.drive_file_id] = v.caption || ''
      })
      setCaptions(map)
    } catch (e) {
      console.error('[recorrentes] não carregou:', e)
      setFailed(true)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  const logIndex = useMemo(() => {
    const m: Record<string, RecurringLog> = {}
    logs.forEach(l => { m[logKey(l.recurring_id, l.done_date, l.slot)] = l })
    return m
  }, [logs])

  const logsByRec = useMemo(() => {
    const m: Record<string, RecurringLog[]> = {}
    logs.forEach(l => { (m[l.recurring_id] ||= []).push(l) })
    return m
  }, [logs])

  function matchesFilters(rec: Recurring) {
    if (clientIds.size && !clientIds.has(rec.client_id)) return false
    if (search && !rec.title.toLowerCase().includes(search.toLowerCase())) return false
    return true
  }

  // Compromissos do dia escolhido, um por (recorrente, horário).
  const occurrences = useMemo(() => {
    return recurrings
      .filter(r => r.active && matchesFilters(r))
      .flatMap(rec => slotsFor(rec, iso).map(slot => ({
        rec, slot, log: logIndex[logKey(rec.id, iso, slot)] || null,
      })))
      // Sem hora marcada vai pro fim: o que tem prazo é o que corre.
      .sort((a, b) => (a.slot || '99:99').localeCompare(b.slot || '99:99') || a.rec.title.localeCompare(b.rec.title))
  }, [recurrings, iso, logIndex, clientIds, search])

  // Atraso de dias ANTERIORES que ninguém marcou — o buraco que a tela existe
  // pra não deixar passar. Só conta enquanto o recorrente está ativo.
  const backlog = useMemo(() => {
    const today = todayISO()
    const out: { rec: Recurring; slot: string; iso: string }[] = []
    for (let i = 1; i <= 7; i++) {
      const day = shiftISO(today, -i)
      recurrings.filter(r => r.active && matchesFilters(r)).forEach(rec => {
        slotsFor(rec, day).forEach(slot => {
          if (!logIndex[logKey(rec.id, day, slot)]) out.push({ rec, slot, iso: day })
        })
      })
    }
    return out
  }, [recurrings, logIndex, clientIds, search])

  const pending = occurrences.filter(o => !o.log).length
  const lateNow = occurrences.filter(o => !o.log && isLate(iso, o.slot)).length

  async function toggleDone(rec: Recurring, slot: string, fileId: string | null, done: boolean, forIso = iso) {
    const key = logKey(rec.id, forIso, slot)
    setBusy(key)
    const supabase = createClient()

    if (done) {
      const existing = logIndex[key]
      if (existing) {
        const { error } = await supabase.from('recurring_logs').delete().eq('id', existing.id)
        if (!dbError(error, toast, 'desmarcar')) setLogs(ls => ls.filter(l => l.id !== existing.id))
      }
    } else {
      const row = {
        recurring_id: rec.id, done_date: forIso, slot,
        drive_file_id: fileId, done_by: currentMember?.name || null,
      }
      // upsert, não insert: dois cliques rápidos (ou a mesma pessoa em duas
      // abas) dariam erro de chave duplicada em vez de simplesmente marcar.
      const { data, error } = await supabase.from('recurring_logs')
        .upsert(row, { onConflict: 'recurring_id,done_date,slot' }).select('*').single()
      if (!dbError(error, toast, 'marcar como postado') && data) {
        setLogs(ls => [...ls.filter(l => l.id !== data.id), data as RecurringLog])
        logActivity({
          tableName: 'recurrings', recordId: rec.id, clientId: rec.client_id,
          action: 'published', actorName: currentMember?.name, actorId: currentMember?.id,
          description: `Postou o recorrente "${rec.title}"${slot ? ` (${slot})` : ''}`,
        })
      }
    }
    setBusy(null)
  }

  // Agrupa por cliente mantendo a ordem alfabética que veio do banco.
  function groupByClient<T extends { rec: Recurring }>(items: T[]) {
    const groups: { client: Client; items: T[] }[] = []
    clients.forEach(c => {
      const own = items.filter(i => i.rec.client_id === c.id)
      if (own.length) groups.push({ client: c, items: own })
    })
    return groups
  }

  const allFiltered = recurrings.filter(matchesFilters)
  const todayGroups = groupByClient(occurrences)
  const allGroups   = groupByClient(allFiltered.map(rec => ({ rec })))

  if (loading) return <div className="p-6 text-sm text-[var(--color-text-muted)]">Carregando…</div>
  if (failed) return (
    <div className="p-6 flex flex-col items-start gap-3">
      <p className="text-sm text-[var(--color-text-muted)]">Não foi possível carregar os recorrentes.</p>
      <button onClick={() => { setLoading(true); load() }} className="text-sm font-semibold px-3 py-1.5 rounded-lg bg-[var(--color-brand)] text-[var(--color-brand-fg)]">Tentar de novo</button>
    </div>
  )

  return (
    <div className="flex flex-col h-full">

      {/* ── Barra ─────────────────────────────────────────────────────── */}
      <div className="flex flex-col gap-2 px-4 md:px-6 py-2.5 border-b border-[var(--color-border)] xl:flex-row xl:items-center">
        <div className="md:pr-3 md:mr-1 md:border-r border-[var(--color-border)] flex flex-col justify-center">
          <h1 className="text-base md:text-sm font-bold text-[var(--color-text-primary)] tracking-tight leading-none">Recorrentes</h1>
          <p className="text-[var(--color-text-muted)] text-[10px] mt-1">
            {view === 'hoje'
              ? `${humanDate(iso)} · ${pending} pendente${pending === 1 ? '' : 's'} de ${occurrences.length}`
              : `${allFiltered.length} rotina${allFiltered.length === 1 ? '' : 's'} · ${allFiltered.filter(r => !r.active).length} pausada${allFiltered.filter(r => !r.active).length === 1 ? '' : 's'}`}
          </p>
        </div>

        <div className="flex items-center gap-2 flex-1">
          <div className="relative flex-1 xl:flex-none">
            <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--color-text-faint)]" />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar…"
              className="w-full xl:w-40 h-8 pl-7 pr-3 text-xs rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-card)] text-[var(--color-text-primary)] focus:outline-none focus:ring-1 focus:ring-[var(--color-brand)]" />
          </div>

          <div ref={clientRef} className="relative flex-shrink-0">
            <button onClick={() => setClientOpen(o => !o)}
              className={`h-8 flex items-center gap-1.5 text-xs font-medium px-2.5 rounded-lg border transition-colors ${
                clientIds.size ? 'border-[var(--color-accent)] text-[var(--color-accent)] bg-[var(--color-accent)]/8' : 'border-[var(--color-border)] text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-subtle)]'
              }`}>
              Cliente{clientIds.size > 0 && <span className="text-[10px] font-bold">({clientIds.size})</span>}
              <ChevronDown size={12} />
            </button>
            {clientOpen && (
              <div className="absolute top-full left-0 mt-1.5 z-50 w-56 max-h-72 overflow-y-auto bg-[var(--color-bg-card)] border border-[var(--color-border)] rounded-xl shadow-xl p-1.5">
                {clientIds.size > 0 && (
                  <button onClick={() => setClientIds(new Set())} className="w-full text-left text-[11px] text-[var(--color-text-faint)] px-2 py-1.5 hover:text-[var(--color-text-secondary)]">✕ limpar</button>
                )}
                {clients.map(c => {
                  const active = clientIds.has(c.id)
                  return (
                    <button key={c.id} onClick={() => setClientIds(s => { const n = new Set(s); n.has(c.id) ? n.delete(c.id) : n.add(c.id); return n })}
                      className="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-[var(--color-bg-subtle)] text-left">
                      <Avatar client={c} px={18} />
                      <span className="text-xs text-[var(--color-text-primary)] truncate flex-1">{c.name}</span>
                      {active && <Check size={13} className="text-[var(--color-accent)] flex-shrink-0" />}
                    </button>
                  )
                })}
              </div>
            )}
          </div>

          <div className="flex items-center gap-1 bg-[var(--color-bg-card)] border border-[var(--color-border)] rounded-xl p-1 ml-auto">
            {([['hoje', 'Hoje', CalendarCheck], ['todos', 'Todos', Repeat]] as const).map(([key, label, Icon]) => (
              <button key={key} onClick={() => setView(key)}
                className={`flex items-center justify-center gap-1.5 text-[11px] md:text-xs font-semibold px-2.5 md:px-3 py-1.5 rounded-lg transition-colors ${
                  view === key ? 'bg-[var(--color-accent)] text-white' : 'text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-subtle)]'
                }`}>
                <Icon size={13} />{label}
              </button>
            ))}
          </div>

          <button onClick={() => setModal({ editing: null })}
            className="h-8 flex items-center gap-1.5 text-xs font-semibold px-2.5 rounded-lg bg-[var(--color-brand)] text-[var(--color-brand-fg)] flex-shrink-0">
            <Plus size={14} /><span className="hidden sm:inline">Novo</span>
          </button>
        </div>
      </div>

      {/* ── Hoje ──────────────────────────────────────────────────────── */}
      {view === 'hoje' && (
        <div className="flex-1 overflow-y-auto">

          {/* Navegar entre dias: preparar amanhã de tarde e fechar o buraco de
              ontem são as duas coisas que mais tiram a social media do "hoje". */}
          <div className="flex items-center justify-center gap-1 px-4 py-2 border-b border-[var(--color-border)]">
            <button onClick={() => setIso(shiftISO(iso, -1))} className="p-1.5 rounded-lg text-[var(--color-text-muted)] hover:bg-[var(--color-bg-subtle)]"><ChevronLeft size={15} /></button>
            <button onClick={() => setIso(todayISO())}
              className={`text-xs font-semibold px-3 py-1 rounded-lg ${iso === todayISO() ? 'text-[var(--color-text-primary)]' : 'text-[var(--color-accent)] hover:bg-[var(--color-bg-subtle)]'}`}>
              {humanDate(iso)}
            </button>
            <button onClick={() => setIso(shiftISO(iso, 1))} className="p-1.5 rounded-lg text-[var(--color-text-muted)] hover:bg-[var(--color-bg-subtle)]"><ChevronRight size={15} /></button>
          </div>

          {lateNow > 0 && (
            <div className="flex items-center gap-2 px-4 md:px-6 py-2.5 text-xs font-bold text-white" style={{ background: 'var(--ds-error-accent)' }}>
              <AlertTriangle size={14} className="flex-shrink-0" />
              {lateNow} {lateNow === 1 ? 'postagem passou' : 'postagens passaram'} do horário
            </div>
          )}

          {backlog.length > 0 && iso === todayISO() && (
            <div className="mx-4 md:mx-6 mt-3 flex items-start gap-2 text-xs px-3 py-2 rounded-xl border"
              style={{ background: 'var(--ds-warn-bg)', borderColor: 'var(--ds-warn-border)', color: 'var(--ds-warn-text)' }}>
              <AlertTriangle size={14} className="flex-shrink-0 mt-0.5" />
              <span>
                <b>{backlog.length}</b> postagem{backlog.length === 1 ? '' : 's'} dos últimos 7 dias ficou sem marcação.
                <button onClick={() => setIso(backlog[0].iso)} className="underline font-semibold ml-1">ver {humanDate(backlog[0].iso)}</button>
              </span>
            </div>
          )}

          {todayGroups.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 gap-2 text-center px-6">
              <CalendarOff size={28} className="text-[var(--color-text-faint)]" />
              <p className="text-sm font-semibold text-[var(--color-text-primary)]">Nada recorrente {humanDate(iso).toLowerCase()}</p>
              <p className="text-xs text-[var(--color-text-muted)] max-w-xs">
                {recurrings.length === 0
                  ? 'Crie o primeiro: uma rotina que se repete, como o story de “aberto hoje”.'
                  : 'Nenhuma rotina cai neste dia com os filtros atuais.'}
              </p>
            </div>
          ) : (
            <div className="p-4 md:p-6 flex flex-col gap-4">
              {todayGroups.map(({ client, items }) => (
                <div key={client.id} className="bg-[var(--color-bg-card)] border border-[var(--color-border)] rounded-xl">
                  {/* Grudado no topo enquanto o grupo está na tela: com 8+
                      clientes, rolar a lista fazia perder de vista de quem é a
                      postagem que está na frente. */}
                  <div className="sticky top-0 z-10 flex items-center gap-2 px-3 md:px-4 py-2 border-b border-[var(--color-border)] bg-[var(--color-bg-card)] rounded-t-xl"
                    style={{ boxShadow: `inset 3px 0 0 ${client.color_hex}` }}>
                    <Avatar client={client} px={20} />
                    <span className="text-xs font-bold text-[var(--color-text-primary)]">{client.name}</span>
                    {(() => {
                      const feitos = items.filter(i => i.log).length
                      const tudo = feitos === items.length
                      return (
                        <span className="text-[10px] font-bold ml-auto px-1.5 py-0.5 rounded"
                          style={tudo
                            ? { background: 'var(--ds-success-bg)', color: 'var(--ds-success-text)' }
                            : { color: 'var(--color-text-faint)' }}>
                          {feitos}/{items.length}
                        </span>
                      )
                    })()}
                  </div>
                  <div className="overflow-hidden rounded-b-xl">
                  {items.map(({ rec, slot, log }) => (
                    <TodayRow
                      key={`${rec.id}|${slot}`}
                      rec={rec} slot={slot} iso={iso} log={log}
                      logs={logsByRec[rec.id] || []}
                      captions={captions[rec.id] || {}}
                      busy={busy === logKey(rec.id, iso, slot)}
                      onToggle={(r, s, f, d) => toggleDone(r, s, f, d)}
                      onEdit={r => setModal({ editing: r })}
                    />
                  ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Todos ─────────────────────────────────────────────────────── */}
      {view === 'todos' && (
        <div className="flex-1 overflow-y-auto p-4 md:p-6 flex flex-col gap-5">
          {allGroups.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 gap-2 text-center">
              <Repeat size={28} className="text-[var(--color-text-faint)]" />
              <p className="text-sm font-semibold text-[var(--color-text-primary)]">Nenhum recorrente ainda</p>
              <button onClick={() => setModal({ editing: null })} className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-[var(--color-brand)] text-[var(--color-brand-fg)] mt-1">Criar o primeiro</button>
            </div>
          ) : allGroups.map(({ client, items }) => (
            <div key={client.id}>
              <div className="flex items-center gap-2 mb-2">
                <Avatar client={client} px={20} />
                <span className="text-xs font-bold text-[var(--color-text-primary)]">{client.name}</span>
                <span className="text-[10px] text-[var(--color-text-faint)]">{items.length}</span>
              </div>
              <div className="grid gap-2.5 sm:grid-cols-2 xl:grid-cols-3">
                {items.map(({ rec }) => (
                  <RecurringCard key={rec.id} rec={rec} logs={logsByRec[rec.id] || []} onEdit={r => setModal({ editing: r })} />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {modal && (
        <RecurringFormModal
          editing={modal.editing}
          clients={clients}
          onClose={() => setModal(null)}
          onSaved={load}
          onDeleted={id => setRecurrings(rs => rs.filter(r => r.id !== id))}
        />
      )}
    </div>
  )
}
