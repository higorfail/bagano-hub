'use client'

import { useEffect, useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import { CheckCircle2, AlertTriangle, ChevronRight, Clock } from 'lucide-react'

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

function getInitials(name: string) {
  return name.split(' ').slice(0, 2).map(w => w[0]).join('').toUpperCase()
}

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime()
  const days = Math.floor(diff / 86400000)
  if (days === 0) return 'hoje'
  if (days === 1) return 'ontem'
  return `${days}d atrás`
}

export default function AprovacaoPage() {
  const router  = useRouter()
  const [posts,   setPosts]   = useState<Post[]>([])
  const [clients, setClients] = useState<Client[]>([])
  const [loading, setLoading] = useState(true)
  const [filter,  setFilter]  = useState<'todos' | 'aguardando' | 'revisao'>('todos')

  useEffect(() => {
    async function load() {
      const supabase = createClient()
      const [{ data: postData }, { data: clientData }] = await Promise.all([
        supabase
          .from('schedules')
          .select('id, title, post_type, status, approval_status, approval_comment, scheduled_date, month, year, client_id')
          .or('status.eq.aguardando_aprovacao,approval_status.eq.não aprovado')
          .order('scheduled_date', { ascending: true }),
        supabase
          .from('clients')
          .select('id, name, color_hex')
          .eq('status', 'active'),
      ])
      setPosts(postData || [])
      setClients(clientData || [])
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
    if (filter === 'aguardando') return posts.filter(p => p.status === 'aguardando_aprovacao')
    if (filter === 'revisao')    return posts.filter(p => p.approval_status === 'não aprovado')
    return posts
  }, [posts, filter])

  // Agrupar por cliente
  const byClient = useMemo(() => {
    const groups: Record<string, Post[]> = {}
    filtered.forEach(p => {
      if (!groups[p.client_id]) groups[p.client_id] = []
      groups[p.client_id].push(p)
    })
    return groups
  }, [filtered])

  const aguardandoCount = posts.filter(p => p.status === 'aguardando_aprovacao').length
  const revisaoCount    = posts.filter(p => p.approval_status === 'não aprovado').length

  function navigateToPost(p: Post) {
    router.push(`/dashboard/clientes/${p.client_id}?post=${p.id}&m=${p.month}&y=${p.year}`)
  }

  if (loading) return (
    <div className="flex items-center justify-center h-full">
      <div className="w-5 h-5 border-2 border-[var(--color-border)] border-t-[var(--color-text-primary)] rounded-full animate-spin" />
    </div>
  )

  return (
    <div className="min-h-screen bg-[var(--color-bg-page)]">
      <div className="max-w-4xl mx-auto px-8 py-10 space-y-6">

        {/* Header */}
        <div>
          <h1 className="text-3xl font-bold text-[var(--color-text-primary)] tracking-tight">Aprovações</h1>
          <p className="text-sm text-[var(--color-text-muted)] mt-1">
            {aguardandoCount} aguardando resposta · {revisaoCount} precisam de revisão
          </p>
        </div>

        {/* Filtros */}
        <div className="flex items-center gap-2">
          {[
            { key: 'todos',     label: 'Todos',           count: aguardandoCount + revisaoCount },
            { key: 'aguardando',label: 'Aguardando',       count: aguardandoCount },
            { key: 'revisao',   label: 'Precisa revisão',  count: revisaoCount },
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
        {Object.keys(byClient).length === 0 && (
          <div className="bg-[var(--color-bg-card)] border border-[var(--color-border)] rounded-2xl p-12 text-center shadow-card">
            <CheckCircle2 size={32} className="mx-auto mb-3" style={{ color: 'var(--ds-success-accent)' }} />
            <p className="font-semibold text-[var(--color-text-primary)]">Tudo certo!</p>
            <p className="text-sm text-[var(--color-text-muted)] mt-1">Nenhum post pendente de aprovação ou revisão.</p>
          </div>
        )}

        {/* Por cliente */}
        {Object.entries(byClient).map(([clientId, clientPosts]) => {
          const client = clientMap[clientId]
          if (!client) return null
          const pendentes = clientPosts.filter(p => p.status === 'aguardando_aprovacao').length
          const revisoes  = clientPosts.filter(p => p.approval_status === 'não aprovado').length

          return (
            <div key={clientId} className="bg-[var(--color-bg-card)] border border-[var(--color-border)] rounded-2xl overflow-hidden shadow-card">
              {/* Header do cliente */}
              <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--color-border)]">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-xl flex items-center justify-center text-white text-xs font-bold flex-shrink-0"
                    style={{ background: client.color_hex }}>
                    {getInitials(client.name)}
                  </div>
                  <span className="font-semibold text-[var(--color-text-primary)]">{client.name}</span>
                </div>
                <div className="flex items-center gap-2">
                  {pendentes > 0 && (
                    <span className="flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-full" style={{ color: 'var(--ds-info-text)', background: 'var(--ds-info-bg)' }}>
                      <Clock size={10} /> {pendentes} aguardando
                    </span>
                  )}
                  {revisoes > 0 && (
                    <span className="flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-full" style={{ color: 'var(--ds-warn-text)', background: 'var(--ds-warn-bg)' }}>
                      <AlertTriangle size={10} /> {revisoes} revisão
                    </span>
                  )}
                </div>
              </div>

              {/* Posts */}
              <div className="divide-y divide-[var(--color-bg-subtle)]">
                {clientPosts.map(p => {
                  const needsRevision = p.approval_status === 'não aprovado'
                  const waiting       = p.status === 'aguardando_aprovacao' && !needsRevision
                  return (
                    <button
                      key={p.id}
                      onClick={() => navigateToPost(p)}
                      className="w-full flex items-center gap-4 px-6 py-4 hover:bg-[var(--color-bg-page)] transition-colors text-left group"
                    >
                      {/* Indicador */}
                      <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: needsRevision ? 'var(--ds-warn-accent)' : 'var(--ds-info-accent)' }} />

                      {/* Info */}
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-[var(--color-text-primary)] truncate">{p.title || 'Sem título'}</p>
                        <div className="flex items-center gap-2 mt-0.5">
                          <span className="text-xs text-[var(--color-text-muted)]">{TYPE_LABEL[p.post_type] || p.post_type}</span>
                          {p.scheduled_date && (
                            <>
                              <span className="text-[var(--color-text-faint)]">·</span>
                              <span className="text-xs text-[var(--color-text-muted)]">
                                {new Date(p.scheduled_date + 'T12:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })}
                              </span>
                            </>
                          )}
                        </div>
                        {needsRevision && p.approval_comment && (
                          <p className="text-xs mt-1 italic truncate" style={{ color: 'var(--ds-warn-text)' }}>"{p.approval_comment}"</p>
                        )}
                      </div>

                      {/* Status badge */}
                      <div className="flex-shrink-0">
                        {needsRevision ? (
                          <span className="text-xs font-semibold px-2.5 py-1 rounded-full border" style={{ color: 'var(--ds-warn-text)', background: 'var(--ds-warn-bg)', borderColor: 'var(--ds-warn-border)' }}>
                            Revisão solicitada
                          </span>
                        ) : waiting ? (
                          <span className="text-xs font-semibold px-2.5 py-1 rounded-full border" style={{ color: 'var(--ds-info-text)', background: 'var(--ds-info-bg)', borderColor: 'var(--ds-info-border)' }}>
                            Aguardando cliente
                          </span>
                        ) : null}
                      </div>

                      <ChevronRight size={14} className="text-[var(--color-text-faint)] group-hover:text-[var(--color-text-muted)] transition-colors flex-shrink-0" />
                    </button>
                  )
                })}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
