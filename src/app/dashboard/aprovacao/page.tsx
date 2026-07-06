'use client'

import { useEffect, useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import { CheckCircle2, AlertTriangle, Clock, ChevronDown, ChevronRight, ChevronsUpDown } from 'lucide-react'

type Post = {
  id: string
  title: string
  post_type: string
  status: string
  approval_status: string
  approval_comment: string | null
  scheduled_date: string | null
  month: number
  year: number
  client_id: string
}
type Client = { id: string; name: string; color_hex: string }

const TYPE_LABEL: Record<string, string> = {
  reels: 'Reels', carrossel: 'Carrossel', post: 'Post',
  story: 'Story', carrossel_stories: 'Carrossel/Stories',
}
const MONTHS = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez']

function getInitials(name: string) {
  return name.split(' ').slice(0, 2).map((w: string) => w[0]).join('').toUpperCase()
}

export default function AprovacaoPage() {
  useEffect(() => { document.title = 'Aprovação · Bagano Hub' }, [])
  const router  = useRouter()
  const [posts,   setPosts]   = useState<Post[]>([])
  const [clients, setClients] = useState<Client[]>([])
  const [loading,   setLoading]   = useState(true)
  const [loadError, setLoadError] = useState(false)
  const [filter,    setFilter]    = useState<'todos' | 'aguardando' | 'revisao' | 'aprovado'>('todos')
  const [expanded, setExpanded] = useState<Set<string>>(new Set())

  useEffect(() => {
    async function load() {
      try {
        const supabase = createClient()
        const [{ data: postData, error: e1 }, { data: clientData }] = await Promise.all([
          supabase
            .from('schedules')
            .select('id, title, post_type, status, approval_status, approval_comment, scheduled_date, month, year, client_id')
            .or('status.eq.aguardando_aprovacao,status.eq.ajuste,approval_status.eq.aprovado')
            .order('month', { ascending: false }),
          supabase.from('clients').select('id, name, color_hex').eq('status', 'active'),
        ])
        if (e1) { setLoadError(true); setLoading(false); return }
        const allPosts = postData || []
        setPosts(allPosts)
        setClients(clientData || [])
        // Auto-expand clients com revisão solicitada
        const urgentClients = new Set<string>()
        allPosts.forEach(p => { if (p.status === 'ajuste') urgentClients.add(p.client_id) })
        setExpanded(urgentClients)
      } catch {
        setLoadError(true)
      }
      setLoading(false)
    }
    load()
  }, [])

  const clientMap = useMemo(() => {
    const m: Record<string, Client> = {}
    clients.forEach(c => { m[c.id] = c })
    return m
  }, [clients])

  const filtered = useMemo(() => {
    if (filter === 'aguardando') return posts.filter(p => p.status === 'aguardando_aprovacao' && p.approval_status !== 'aprovado')
    if (filter === 'revisao')    return posts.filter(p => p.status === 'ajuste')
    if (filter === 'aprovado')   return posts.filter(p => p.approval_status === 'aprovado')
    return posts.filter(p => p.approval_status !== 'aprovado')
  }, [posts, filter])

  // Agrupar por cliente, mantendo ordem: clientes com revisão primeiro
  const byClient = useMemo(() => {
    const groups: Record<string, Post[]> = {}
    filtered.forEach(p => {
      if (!groups[p.client_id]) groups[p.client_id] = []
      groups[p.client_id].push(p)
    })
    // Revisões primeiro, depois aguardando
    return Object.entries(groups).sort(([, a], [, b]) => {
      const aRev = a.some(p => p.approval_status === 'não aprovado') ? 0 : 1
      const bRev = b.some(p => p.approval_status === 'não aprovado') ? 0 : 1
      return aRev - bRev
    })
  }, [filtered])

  const aguardandoCount = posts.filter(p => p.status === 'aguardando_aprovacao' && p.approval_status !== 'aprovado').length
  const revisaoCount    = posts.filter(p => p.status === 'ajuste').length
  const aprovadoCount   = posts.filter(p => p.approval_status === 'aprovado').length

  function toggle(id: string) {
    setExpanded(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  function expandAll()   { setExpanded(new Set(byClient.map(([id]) => id))) }
  function collapseAll() { setExpanded(new Set()) }
  const allExpanded = byClient.length > 0 && byClient.every(([id]) => expanded.has(id))

  function navigateToPost(p: Post) {
    router.push(`/dashboard/cronograma?client=${p.client_id}&post=${p.id}&m=${p.month}&y=${p.year}`)
  }

  if (loading) return (
    <div className="flex items-center justify-center h-full">
      <div className="w-5 h-5 border-2 border-[var(--color-border)] border-t-[var(--color-text-primary)] rounded-full animate-spin" />
    </div>
  )

  if (loadError) return (
    <div className="flex flex-col items-center justify-center h-full gap-3 text-center px-8">
      <p className="text-sm text-[var(--color-text-muted)]">Não foi possível carregar as aprovações.</p>
      <button onClick={() => window.location.reload()}
        className="text-xs px-4 py-2 rounded-xl border border-[var(--color-border)] text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-card)] transition-colors">
        Tentar novamente
      </button>
    </div>
  )

  return (
    <div className="min-h-screen bg-[var(--color-bg-page)]">
      <div className="max-w-3xl mx-auto px-8 py-10 space-y-4">

        {/* Header */}
        <div className="flex items-start justify-between gap-4 mb-2">
          <div>
            <h1 className="text-3xl font-bold text-[var(--color-text-primary)] tracking-tight">Aprovações</h1>
            <p className="text-sm text-[var(--color-text-muted)] mt-1">
              {aguardandoCount > 0 && <span>{aguardandoCount} aguardando resposta</span>}
              {aguardandoCount > 0 && revisaoCount > 0 && <span className="mx-1.5 text-[var(--color-text-faint)]">·</span>}
              {revisaoCount > 0 && <span style={{ color: 'var(--ds-warn-text)' }}>{revisaoCount} precisam revisão</span>}
              {aguardandoCount === 0 && revisaoCount === 0 && 'Tudo em dia'}
            </p>
          </div>
          {byClient.length > 1 && (
            <button
              onClick={allExpanded ? collapseAll : expandAll}
              className="flex items-center gap-1.5 text-xs font-medium text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] transition-colors mt-1 flex-shrink-0"
            >
              <ChevronsUpDown size={13} />
              {allExpanded ? 'Colapsar todos' : 'Expandir todos'}
            </button>
          )}
        </div>

        {/* Filtros */}
        <div className="flex items-center gap-2 flex-wrap">
          {[
            { key: 'todos',      label: 'Pendentes',       count: aguardandoCount + revisaoCount },
            { key: 'aguardando', label: 'Aguardando',       count: aguardandoCount },
            { key: 'revisao',    label: 'Precisa revisão',  count: revisaoCount },
            { key: 'aprovado',   label: 'Aprovados',        count: aprovadoCount },
          ].map(f => (
            <button
              key={f.key}
              onClick={() => setFilter(f.key as typeof filter)}
              className={`flex items-center gap-2 px-4 py-1.5 rounded-xl text-sm font-medium transition-all ${filter === f.key ? 'bg-[var(--color-brand)] text-[var(--color-brand-fg)]' : 'bg-[var(--color-bg-card)] border border-[var(--color-border)] text-[var(--color-text-secondary)] hover:border-[var(--color-border-strong)]'}`}
            >
              {f.label}
              {f.count > 0 && (
                <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${filter === f.key ? 'bg-white/20' : 'bg-[var(--color-bg-subtle)]'}`}>
                  {f.count}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Vazio */}
        {byClient.length === 0 && (
          <div className="bg-[var(--color-bg-card)] border border-[var(--color-border)] rounded-2xl p-12 text-center shadow-card">
            <CheckCircle2 size={32} className="mx-auto mb-3" style={{ color: 'var(--ds-success-accent)' }} />
            <p className="font-semibold text-[var(--color-text-primary)]">Tudo certo!</p>
            <p className="text-sm text-[var(--color-text-muted)] mt-1">Nenhum post pendente de aprovação ou revisão.</p>
          </div>
        )}

        {/* Cards por cliente */}
        {byClient.map(([clientId, clientPosts]) => {
          const client    = clientMap[clientId]
          if (!client) return null
          const isOpen    = expanded.has(clientId)
          const pendentes  = clientPosts.filter(p => p.status === 'aguardando_aprovacao' && p.approval_status !== 'aprovado').length
          const revisoes   = clientPosts.filter(p => p.approval_status === 'não aprovado').length
          const aprovados  = clientPosts.filter(p => p.approval_status === 'aprovado').length
          const hasUrgency = revisoes > 0

          // Agrupar por mês dentro do cliente
          const byMonth: Record<string, Post[]> = {}
          clientPosts.forEach(p => {
            const key = `${p.year}-${String(p.month).padStart(2,'0')}`
            if (!byMonth[key]) byMonth[key] = []
            byMonth[key].push(p)
          })
          const monthGroups = Object.entries(byMonth).sort(([a], [b]) => b.localeCompare(a))
          const multiMonth  = monthGroups.length > 1

          return (
            <div
              key={clientId}
              className="bg-[var(--color-bg-card)] border rounded-2xl overflow-hidden shadow-card transition-all"
              style={{ borderColor: hasUrgency ? 'var(--ds-warn-border)' : 'var(--color-border)' }}
            >
              {/* Header — clicável */}
              <button
                onClick={() => toggle(clientId)}
                className="w-full flex items-center justify-between px-5 py-4 hover:bg-[var(--color-bg-subtle)] transition-colors text-left"
              >
                <div className="flex items-center gap-3">
                  <div
                    className="w-8 h-8 rounded-xl flex items-center justify-center text-white text-xs font-bold flex-shrink-0"
                    style={{ background: client.color_hex }}
                  >
                    {getInitials(client.name)}
                  </div>
                  <div>
                    <span className="font-semibold text-[var(--color-text-primary)] text-sm">{client.name}</span>
                    {!isOpen && (
                      <p className="text-xs text-[var(--color-text-muted)] mt-0.5">
                        {clientPosts.length} post{clientPosts.length !== 1 ? 's' : ''} pendente{clientPosts.length !== 1 ? 's' : ''}
                      </p>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  {pendentes > 0 && (
                    <span className="flex items-center gap-1 text-[11px] font-semibold px-2.5 py-1 rounded-full" style={{ color: 'var(--ds-info-text)', background: 'var(--ds-info-bg)' }}>
                      <Clock size={10} /> {pendentes} aguardando
                    </span>
                  )}
                  {revisoes > 0 && (
                    <span className="flex items-center gap-1 text-[11px] font-semibold px-2.5 py-1 rounded-full" style={{ color: 'var(--ds-warn-text)', background: 'var(--ds-warn-bg)' }}>
                      <AlertTriangle size={10} /> {revisoes} revisão
                    </span>
                  )}
                  {aprovados > 0 && (
                    <span className="flex items-center gap-1 text-[11px] font-semibold px-2.5 py-1 rounded-full" style={{ color: 'var(--ds-success-text)', background: 'var(--ds-success-bg)' }}>
                      <CheckCircle2 size={10} /> {aprovados} aprovado{aprovados !== 1 ? 's' : ''}
                    </span>
                  )}
                  {isOpen
                    ? <ChevronDown size={15} className="text-[var(--color-text-muted)] ml-1 flex-shrink-0" />
                    : <ChevronRight size={15} className="text-[var(--color-text-muted)] ml-1 flex-shrink-0" />
                  }
                </div>
              </button>

              {/* Posts — expandido */}
              {isOpen && (
                <div className="border-t border-[var(--color-border)]">
                  {monthGroups.map(([monthKey, mPosts]) => {
                    const [y, m] = monthKey.split('-')
                    return (
                      <div key={monthKey}>
                        {multiMonth && (
                          <div className="px-5 py-2 bg-[var(--color-bg-subtle)] border-b border-[var(--color-border)]">
                            <span className="text-[10px] font-bold uppercase tracking-widest text-[var(--color-text-muted)]">
                              {MONTHS[parseInt(m) - 1]} {y}
                            </span>
                          </div>
                        )}
                        <div className="divide-y divide-[var(--color-bg-subtle)]">
                          {mPosts.map(p => {
                            const needsRevision = p.approval_status === 'não aprovado'
                            const isApproved    = p.approval_status === 'aprovado'
                            return (
                              <button
                                key={p.id}
                                onClick={() => navigateToPost(p)}
                                className="w-full flex items-center gap-4 px-5 py-3.5 hover:bg-[var(--color-bg-page)] transition-colors text-left group"
                              >
                                <div
                                  className="w-1.5 h-1.5 rounded-full flex-shrink-0 mt-0.5"
                                  style={{ background: isApproved ? 'var(--ds-success-accent)' : needsRevision ? 'var(--ds-warn-accent)' : 'var(--ds-info-accent)' }}
                                />
                                <div className="flex-1 min-w-0">
                                  <p className="text-sm font-medium text-[var(--color-text-primary)] truncate">{p.title || 'Sem título'}</p>
                                  <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                                    <span className="text-xs text-[var(--color-text-muted)]">{TYPE_LABEL[p.post_type] || p.post_type}</span>
                                    {p.scheduled_date && (
                                      <>
                                        <span className="text-[var(--color-text-faint)]">·</span>
                                        <span className="text-xs text-[var(--color-text-muted)]">
                                          {new Date(p.scheduled_date + 'T12:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })}
                                        </span>
                                      </>
                                    )}
                                    {needsRevision && p.approval_comment && (
                                      <>
                                        <span className="text-[var(--color-text-faint)]">·</span>
                                        <span className="text-xs italic truncate max-w-[280px]" style={{ color: 'var(--ds-warn-text)' }}>"{p.approval_comment}"</span>
                                      </>
                                    )}
                                  </div>
                                </div>
                                <div className="flex-shrink-0">
                                  {isApproved ? (
                                    <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full border" style={{ color: 'var(--ds-success-text)', background: 'var(--ds-success-bg)', borderColor: 'var(--ds-success-border)' }}>
                                      ✓ Aprovado
                                    </span>
                                  ) : needsRevision ? (
                                    <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full border" style={{ color: 'var(--ds-warn-text)', background: 'var(--ds-warn-bg)', borderColor: 'var(--ds-warn-border)' }}>
                                      Revisão
                                    </span>
                                  ) : (
                                    <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full border" style={{ color: 'var(--ds-info-text)', background: 'var(--ds-info-bg)', borderColor: 'var(--ds-info-border)' }}>
                                      Aguardando
                                    </span>
                                  )}
                                </div>
                              </button>
                            )
                          })}
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
