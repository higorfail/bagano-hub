'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import { useToast } from '@/lib/ToastContext'
import { copyTextAsync } from '@/lib/clipboard'
import { Link2, Check, ChevronDown, ChevronRight, Clock } from 'lucide-react'

// Acompanhamento das aprovações de CRONOGRAMA — separado da aprovação de arte
// final de propósito.
//
// São duas conversas diferentes com o cliente: no cronograma ele aprova a
// PAUTA (a ideia, a data), e na final ele aprova a ARTE. Misturar as duas na
// mesma lista foi o que fez o time achar que um post estava pronto quando só
// a pauta tinha passado (caso HAGO). Aqui não tem preview, porque no crono
// ainda não existe arte pra mostrar.
//
// Tudo do lado do cliente já existia: o link de crono, a tela de aprovar
// crono, e o registro separado. O que faltava era esta visão interna — quais
// cronogramas estão parados esperando resposta, e há quanto tempo.

type Client = { id: string; name: string; color_hex: string; logo_url: string | null }

type Row = {
  clientId: string
  month: number
  year: number
  pendentes: number
  aprovados: number
  total: number
  finalizedAt: string | null
  posts: { id: string; post_number: number | null; title: string; post_type: string; scheduled_date: string | null }[]
}

const MONTHS = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro']
const TYPE_LABEL: Record<string, string> = {
  reels: 'Reels', carrossel: 'Carrossel', post: 'Post',
  story: 'Story', carrossel_stories: 'Carrossel/Stories', post_story: 'Post/Story',
}

// Um post "passou pelo crono" quando saiu da fila de aprovação de pauta.
// Rascunho (estrategia) nem foi enviado, então não entra na conta.
const NOT_SENT = 'estrategia'
const WAITING = 'aguardando_aprovacao_crono'

function daysSince(iso: string | null) {
  if (!iso) return null
  return Math.floor((Date.now() - new Date(iso).getTime()) / 86400000)
}

// Quantos meses atrás um cronograma ainda conta como cobrança viva. Depois
// disso ele continua na tela, mas recolhido.
const OLD_AFTER_MONTHS = 3

function monthsAgo(month: number, year: number) {
  const now = new Date()
  return (now.getFullYear() - year) * 12 + (now.getMonth() + 1 - month)
}

export default function CronoApprovals({ clients }: { clients: Client[] }) {
  const { toast } = useToast()
  const [rows, setRows] = useState<Row[]>([])
  const [loading, setLoading] = useState(true)
  const [open, setOpen] = useState<Set<string>>(new Set())
  const [copied, setCopied] = useState<string | null>(null)
  const [showOld, setShowOld] = useState(false)

  useEffect(() => {
    async function load() {
      const supabase = createClient()
      const [{ data: posts }, { data: cronos }] = await Promise.all([
        supabase.from('schedules')
          .select('id, client_id, month, year, status, post_number, title, post_type, scheduled_date')
          .neq('status', NOT_SENT),
        supabase.from('cronograma_status').select('client_id, month, year, finalized_at'),
      ])

      const finalizedBy = new Map<string, string | null>()
      for (const c of (cronos || []) as any[]) finalizedBy.set(`${c.client_id}:${c.month}:${c.year}`, c.finalized_at)

      const map = new Map<string, Row>()
      for (const p of (posts || []) as any[]) {
        const key = `${p.client_id}:${p.month}:${p.year}`
        let r = map.get(key)
        if (!r) {
          r = {
            clientId: p.client_id, month: p.month, year: p.year,
            pendentes: 0, aprovados: 0, total: 0,
            finalizedAt: finalizedBy.get(key) ?? null,
            posts: [],
          }
          map.set(key, r)
        }
        r.total++
        if (p.status === WAITING) {
          r.pendentes++
          r.posts.push({ id: p.id, post_number: p.post_number, title: p.title, post_type: p.post_type, scheduled_date: p.scheduled_date })
        } else {
          r.aprovados++
        }
      }

      // Só cronograma com post esperando resposta. Sem isso a tela viraria uma
      // lista de todo mês de todo cliente, e o que importa aqui é o que trava.
      const list = [...map.values()].filter(r => r.pendentes > 0)
      // Mais parado primeiro: é a ordem da cobrança.
      list.sort((a, b) => (daysSince(b.finalizedAt) ?? -1) - (daysSince(a.finalizedAt) ?? -1))
      setRows(list)
      setLoading(false)
      // Cronograma de meses muito atrás quase sempre é mês que a equipe
      // abandonou, não cobrança viva. Ele não some da tela — some da PRIMEIRA
      // tela, atrás de um "mostrar antigos", pra não afogar o que é de agora.
      // Sumir de vez seria o erro oposto ao que estamos consertando.
    }
    load()
  }, [])

  // Mesmo token que o botão "Link do crono" do Cronograma usa: por cliente,
  // mês e tipo. Reaproveitar em vez de gerar outro evita dois links vivos pro
  // mesmo cronograma, que confundiria o cliente.
  async function copyLink(r: Row) {
    const supabase = createClient()
    const ok = await copyTextAsync(async () => {
      const { data: existing } = await supabase.from('approval_tokens').select('token')
        .eq('client_id', r.clientId).eq('month', r.month).eq('year', r.year).eq('type', 'cronograma').maybeSingle()
      const token = existing?.token || (
        await supabase.from('approval_tokens')
          .insert({ client_id: r.clientId, month: r.month, year: r.year, type: 'cronograma' })
          .select('token').single()
      ).data?.token
      if (!token) throw new Error('sem token')
      return `${window.location.origin}/aprovar/${token}`
    })
    if (!ok) { toast('Não consegui copiar o link.'); return }
    setCopied(r.clientId)
    setTimeout(() => setCopied(null), 2000)
  }

  if (loading) return <div className="px-1 py-10 text-sm text-[var(--color-text-muted)]">Carregando cronogramas…</div>

  if (rows.length === 0) return (
    <div className="px-5 py-16 text-center flex flex-col items-center gap-2">
      <Check size={28} strokeWidth={1.5} className="text-[var(--color-text-faint)]" />
      <p className="text-sm text-[var(--color-text-muted)]">Nenhum cronograma esperando resposta</p>
      <p className="text-xs text-[var(--color-text-faint)]">Aqui aparece o que o cliente ainda não aprovou na etapa de pauta</p>
    </div>
  )

  const recentes = rows.filter(r => monthsAgo(r.month, r.year) <= OLD_AFTER_MONTHS)
  const antigos  = rows.filter(r => monthsAgo(r.month, r.year) >  OLD_AFTER_MONTHS)
  const visible  = showOld ? [...recentes, ...antigos] : recentes

  return (
    <div className="flex flex-col gap-2">
      {visible.map(r => {
        const client = clients.find(c => c.id === r.clientId)
        const key = `${r.clientId}:${r.month}:${r.year}`
        const isOpen = open.has(key)
        const dias = daysSince(r.finalizedAt)
        // Aprovação parcial é o caso que mais precisa de cobrança e o que
        // hoje ninguém enxerga: o cliente aprovou parte e parou.
        const parcial = r.aprovados > 0 && r.pendentes > 0
        const pct = r.total > 0 ? Math.round((r.aprovados / r.total) * 100) : 0

        return (
          <div key={key} className="bg-[var(--color-bg-card)] border rounded-2xl overflow-hidden"
            style={{ borderColor: parcial ? 'var(--ds-warn-border)' : 'var(--color-border)' }}>
            <div className="flex items-center gap-3 px-4 py-3">
              <button onClick={() => setOpen(s => { const n = new Set(s); n.has(key) ? n.delete(key) : n.add(key); return n })}
                className="flex items-center gap-3 flex-1 min-w-0 text-left">
                {isOpen ? <ChevronDown size={15} className="text-[var(--color-text-faint)] flex-shrink-0" /> : <ChevronRight size={15} className="text-[var(--color-text-faint)] flex-shrink-0" />}
                <span className="w-7 h-7 rounded-lg flex items-center justify-center text-white text-[10px] font-bold flex-shrink-0 overflow-hidden"
                  style={{ background: client?.color_hex || 'var(--color-border-strong)' }}>
                  {client?.logo_url
                    ? <img src={client.logo_url} alt="" className="w-full h-full object-cover" />
                    : (client?.name || '?').slice(0, 2).toUpperCase()}
                </span>
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-[var(--color-text-primary)] truncate">
                    {client?.name || 'Cliente'} <span className="font-normal text-[var(--color-text-muted)]">· {MONTHS[r.month - 1]}</span>
                  </p>
                  <p className="text-[11px] text-[var(--color-text-muted)] flex items-center gap-1.5">
                    {r.pendentes} de {r.total} sem resposta
                    {dias !== null && (
                      <>
                        <span className="text-[var(--color-text-faint)]">·</span>
                        <Clock size={10} />
                        {dias === 0 ? 'enviado hoje' : `parado há ${dias} dia${dias !== 1 ? 's' : ''}`}
                      </>
                    )}
                  </p>
                </div>
              </button>

              {parcial && (
                <span className="hidden sm:inline text-[10px] font-bold px-2 py-1 rounded-full flex-shrink-0"
                  style={{ color: 'var(--ds-warn-text)', background: 'var(--ds-warn-bg)' }}>
                  {r.aprovados} de {r.total} aprovados
                </span>
              )}

              <button onClick={() => copyLink(r)}
                className="h-8 flex-shrink-0 flex items-center gap-1.5 text-xs font-semibold px-3 rounded-lg border transition-colors"
                style={copied === r.clientId
                  ? { borderColor: 'var(--ds-success-border)', color: 'var(--ds-success-text)', background: 'var(--ds-success-bg)' }
                  : { borderColor: 'var(--color-border)', color: 'var(--color-text-secondary)' }}>
                {copied === r.clientId ? <><Check size={12} /> Copiado</> : <><Link2 size={12} /> Link do crono</>}
              </button>
            </div>

            {/* Barra de progresso: a leitura de relance é "quanto o cliente já
                respondeu", que é o que decide se vale cobrar. */}
            <div className="h-1 bg-[var(--color-bg-subtle)]">
              <div className="h-full transition-all" style={{ width: `${pct}%`, background: parcial ? 'var(--ds-warn-accent)' : 'var(--ds-success-accent)' }} />
            </div>

            {isOpen && (
              <div className="divide-y divide-[var(--color-bg-subtle)] border-t border-[var(--color-border)]">
                {/* Lista básica de propósito: no cronograma o cliente aprova a
                    pauta, e ainda não existe arte pra mostrar em miniatura. */}
                {r.posts.map(p => (
                  <div key={p.id} className="flex items-center gap-2.5 px-4 py-2">
                    {p.post_number != null && (
                      <span className="text-[11px] font-bold text-[var(--color-text-faint)] flex-shrink-0">#{p.post_number}</span>
                    )}
                    <span className="text-[10px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded flex-shrink-0"
                      style={{ background: 'var(--color-bg-subtle)', color: 'var(--color-text-muted)' }}>
                      {TYPE_LABEL[p.post_type] || p.post_type}
                    </span>
                    <span className="text-[13px] text-[var(--color-text-primary)] truncate flex-1">{p.title || 'Sem título'}</span>
                    {p.scheduled_date && (
                      <span className="text-[11px] text-[var(--color-text-faint)] flex-shrink-0 tabular-nums">
                        {new Date(p.scheduled_date + 'T12:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )
      })}

      {antigos.length > 0 && (
        <button onClick={() => setShowOld(v => !v)}
          className="self-center text-xs font-semibold text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] py-2 transition-colors">
          {showOld
            ? 'Ocultar cronogramas antigos'
            : `Ver ${antigos.length} cronograma${antigos.length !== 1 ? 's' : ''} de mais de ${OLD_AFTER_MONTHS} meses atrás`}
        </button>
      )}
    </div>
  )
}
