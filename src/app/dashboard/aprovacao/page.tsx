'use client'

import { useEffect, useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import { useToast } from '@/lib/ToastContext'
import { CheckCircle2, AlertTriangle, Clock, ChevronDown, ChevronRight, ChevronsUpDown, Search, Link2, LayoutGrid, List, Play, Megaphone } from 'lucide-react'

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
  drive_url: string | null
  drive_folder_url: string | null
  funil: string | null
  campaign_type: string | null
}
type Client = { id: string; name: string; color_hex: string; logo_url: string | null }

const TYPE_LABEL: Record<string, string> = {
  reels: 'Reels', carrossel: 'Carrossel', post: 'Post',
  story: 'Story', carrossel_stories: 'Carrossel/Stories',
}
const TYPE_EMOJI: Record<string, string> = {
  reels: '🎬', carrossel: '🎠', post: '🖼️', story: '📸', carrossel_stories: '🎞️',
}
const MONTHS = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez']

function getInitials(name: string) {
  return name.split(' ').slice(0, 2).map((w: string) => w[0]).join('').toUpperCase()
}

// Mesma lógica de miniatura do PostMiniCard (cronograma): resolve direto do drive_url
// (arquivo único) ou, se for uma pasta, busca "capa.*" → imagem → PDF → vídeo.
function useDriveThumb(driveUrl?: string | null, driveFolderUrl?: string | null, isVideoDefault?: boolean) {
  const [thumbUrl, setThumbUrl] = useState<string | null>(() => {
    const id = driveUrl?.match(/[-\w]{25,}/)?.[0]
    return id ? `https://drive.google.com/thumbnail?id=${id}&sz=w480` : null
  })
  const [isThumbVideo, setIsThumbVideo] = useState(!!isVideoDefault)

  useEffect(() => {
    if (!driveFolderUrl) return
    const folderId = driveFolderUrl.match(/\/folders\/([-\w]{25,})/)?.[1]
    if (!folderId) return
    const key = process.env.NEXT_PUBLIC_GOOGLE_API_KEY
    if (!key) return
    fetch(`https://www.googleapis.com/drive/v3/files?q=%27${folderId}%27+in+parents&fields=files(id,name,mimeType)&orderBy=name&key=${key}`)
      .then(r => r.json())
      .then(d => {
        const files: { id: string; name: string; mimeType: string }[] = d.files || []
        const images = files.filter(f => f.mimeType.startsWith('image/'))
        const cover = images.find(f => /^capa\./i.test(f.name)) ?? images[0]
        if (cover) { setThumbUrl(`https://drive.google.com/thumbnail?id=${cover.id}&sz=w480`); setIsThumbVideo(false); return }
        const pdf = files.find(f => f.mimeType === 'application/pdf')
        if (pdf) { setThumbUrl(`https://drive.google.com/thumbnail?id=${pdf.id}&sz=w480`); setIsThumbVideo(false); return }
        const video = files.find(f => f.mimeType.startsWith('video/'))
        if (video) { setThumbUrl(`https://drive.google.com/thumbnail?id=${video.id}&sz=w480`); setIsThumbVideo(true) }
      })
      .catch(() => {})
  }, [driveFolderUrl])

  return { thumbUrl, isThumbVideo }
}

// Miniatura 4:5 — SEMPRE por aspect-ratio (nunca altura fixa em px), pra nunca sobrar
// vazio nem esticar/distorcer quando o card ao redor mudar de tamanho.
function PostThumb({ post, className = 'w-14' }: { post: Post; className?: string }) {
  const { thumbUrl, isThumbVideo } = useDriveThumb(post.drive_url, post.drive_folder_url, post.post_type === 'reels')
  return (
    <div className={`relative flex-shrink-0 overflow-hidden rounded-lg bg-[var(--color-bg-subtle)] flex items-center justify-center ${className}`} style={{ aspectRatio: '4 / 5' }}>
      {thumbUrl ? (
        <img src={thumbUrl} alt={post.title} className="absolute inset-0 w-full h-full object-cover"
          onError={e => { (e.target as HTMLImageElement).style.display = 'none' }} />
      ) : (
        <span className="text-lg opacity-60">{TYPE_EMOJI[post.post_type] || '📄'}</span>
      )}
      {thumbUrl && isThumbVideo && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/30 pointer-events-none">
          <div className="w-6 h-6 rounded-full bg-white/90 flex items-center justify-center shadow-lg">
            <Play size={10} className="text-[#111] ml-0.5" fill="currentColor" />
          </div>
        </div>
      )}
    </div>
  )
}

function daysAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime()
  return Math.floor(diff / 86400000)
}

export default function AprovacaoPage() {
  useEffect(() => { document.title = 'Aprovação · Bagano Hub' }, [])
  const router  = useRouter()
  const { toast } = useToast()
  const [posts,   setPosts]   = useState<Post[]>([])
  const [clients, setClients] = useState<Client[]>([])
  const [waitingSince, setWaitingSince] = useState<Record<string, string>>({})
  const [loading,   setLoading]   = useState(true)
  const [loadError, setLoadError] = useState(false)
  const [filter,    setFilter]    = useState<'todos' | 'aguardando' | 'revisao' | 'aprovado'>('todos')
  const [search,    setSearch]    = useState('')
  const [view,      setView]      = useState<'list' | 'grid'>(() => {
    if (typeof window === 'undefined') return 'list'
    return (localStorage.getItem('aprovacao-view') as 'list' | 'grid') || 'list'
  })
  const [expanded, setExpanded] = useState<Set<string>>(new Set())

  function setViewMode(v: 'list' | 'grid') {
    setView(v)
    localStorage.setItem('aprovacao-view', v)
  }

  useEffect(() => {
    async function load() {
      try {
        const supabase = createClient()
        const [{ data: postData, error: e1 }, { data: clientData }] = await Promise.all([
          supabase
            .from('schedules')
            .select('id, title, post_type, status, approval_status, approval_comment, scheduled_date, month, year, client_id, drive_url, drive_folder_url, funil, campaign_type')
            .or('status.eq.aguardando_aprovacao,status.eq.ajuste,approval_status.eq.aprovado')
            .order('month', { ascending: false }),
          supabase.from('clients').select('id, name, color_hex, logo_url').eq('status', 'active'),
        ])
        if (e1) { setLoadError(true); setLoading(false); return }
        const allPosts = postData || []
        setPosts(allPosts)
        setClients(clientData || [])
        // Auto-expand clients com revisão solicitada
        const urgentClients = new Set<string>()
        allPosts.forEach(p => { if (p.status === 'ajuste') urgentClients.add(p.client_id) })
        setExpanded(urgentClients)

        // "Aguardando há X dias" — melhor esforço a partir do activity_log (não existe
        // coluna dedicada pra isso), pega o registro mais antigo que menciona a mudança
        // pra "Aguardando aprovação" por post. Se não achar, o post fica sem selo de tempo.
        const ids = allPosts.filter(p => p.status === 'aguardando_aprovacao').map(p => p.id)
        if (ids.length > 0) {
          const { data: logs } = await supabase
            .from('activity_log')
            .select('record_id, description, created_at')
            .eq('table_name', 'schedules')
            .eq('action', 'status_changed')
            .in('record_id', ids)
            .ilike('description', '%aguardando aprova%')
            .order('created_at', { ascending: true })
          const since: Record<string, string> = {}
          ;(logs || []).forEach((l: any) => { if (!since[l.record_id]) since[l.record_id] = l.created_at })
          setWaitingSince(since)
        }
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

  const searched = useMemo(() => {
    if (!search.trim()) return posts
    const q = search.trim().toLowerCase()
    return posts.filter(p => {
      const client = clientMap[p.client_id]
      return p.title?.toLowerCase().includes(q) || client?.name.toLowerCase().includes(q)
    })
  }, [posts, search, clientMap])

  const filtered = useMemo(() => {
    if (filter === 'aguardando') return searched.filter(p => p.status === 'aguardando_aprovacao' && p.approval_status !== 'aprovado')
    if (filter === 'revisao')    return searched.filter(p => p.status === 'ajuste')
    if (filter === 'aprovado')   return searched.filter(p => p.approval_status === 'aprovado')
    return searched.filter(p => p.approval_status !== 'aprovado')
  }, [searched, filter])

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

  // Resumo: quantos clientes têm pendência e há quanto tempo a mais antiga espera
  const pendingClientsCount = useMemo(() => {
    const s = new Set<string>()
    posts.forEach(p => { if (p.approval_status !== 'aprovado') s.add(p.client_id) })
    return s.size
  }, [posts])
  const oldestWaitingDays = useMemo(() => {
    const days = Object.values(waitingSince).map(iso => daysAgo(iso))
    return days.length > 0 ? Math.max(...days) : null
  }, [waitingSince])

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

  function copyClientLink(clientId: string) {
    navigator.clipboard.writeText(`${window.location.origin}/aprovar/cliente/${clientId}`)
    toast('Link de aprovação copiado!')
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
      <div className="max-w-5xl mx-auto px-4 md:px-8 py-6 md:py-10 space-y-4">

        {/* Header */}
        <div className="flex items-start justify-between gap-4 flex-wrap mb-2">
          <div>
            <h1 className="text-3xl font-bold text-[var(--color-text-primary)] tracking-tight">Aprovações</h1>
            <p className="text-sm text-[var(--color-text-muted)] mt-1">
              {aguardandoCount > 0 && <span>{aguardandoCount} aguardando resposta</span>}
              {aguardandoCount > 0 && revisaoCount > 0 && <span className="mx-1.5 text-[var(--color-text-faint)]">·</span>}
              {revisaoCount > 0 && <span style={{ color: 'var(--ds-warn-text)' }}>{revisaoCount} precisam revisão</span>}
              {aguardandoCount === 0 && revisaoCount === 0 && 'Tudo em dia'}
              {pendingClientsCount > 0 && (
                <span className="text-[var(--color-text-faint)]"> · {pendingClientsCount} cliente{pendingClientsCount !== 1 ? 's' : ''}{oldestWaitingDays !== null && oldestWaitingDays > 0 ? ` · mais antigo há ${oldestWaitingDays}d` : ''}</span>
              )}
            </p>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            {byClient.length > 1 && (
              <button
                onClick={allExpanded ? collapseAll : expandAll}
                className="flex items-center gap-1.5 text-xs font-medium text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] transition-colors mt-1"
              >
                <ChevronsUpDown size={13} />
                {allExpanded ? 'Colapsar todos' : 'Expandir todos'}
              </button>
            )}
            <div className="flex items-center bg-[var(--color-bg-card)] border border-[var(--color-border)] rounded-xl p-0.5">
              <button onClick={() => setViewMode('list')} title="Lista"
                className={`w-7 h-7 rounded-lg flex items-center justify-center transition-all ${view === 'list' ? 'bg-[var(--color-bg-subtle)] text-[var(--color-text-primary)]' : 'text-[var(--color-text-muted)]'}`}>
                <List size={14} />
              </button>
              <button onClick={() => setViewMode('grid')} title="Grade (com preview)"
                className={`w-7 h-7 rounded-lg flex items-center justify-center transition-all ${view === 'grid' ? 'bg-[var(--color-bg-subtle)] text-[var(--color-text-primary)]' : 'text-[var(--color-text-muted)]'}`}>
                <LayoutGrid size={14} />
              </button>
            </div>
          </div>
        </div>

        {/* Busca + Filtros */}
        <div className="flex items-center gap-2 flex-wrap">
          <div className="relative flex-shrink-0">
            <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--color-text-faint)]" />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Buscar cliente ou post..."
              className="pl-8 pr-3 py-1.5 rounded-xl text-sm border border-[var(--color-border)] bg-[var(--color-bg-card)] text-[var(--color-text-primary)] outline-none w-48 focus:w-64 transition-all"
            />
          </div>
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
            <p className="font-semibold text-[var(--color-text-primary)]">{search ? 'Nenhum resultado' : 'Tudo certo!'}</p>
            <p className="text-sm text-[var(--color-text-muted)] mt-1">{search ? 'Ajuste sua busca.' : 'Nenhum post pendente de aprovação ou revisão.'}</p>
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
              <div className="w-full flex items-center justify-between px-5 py-4 hover:bg-[var(--color-bg-subtle)] transition-colors">
                <button onClick={() => toggle(clientId)} className="flex items-center gap-3 flex-1 min-w-0 text-left">
                  <div
                    className="w-8 h-8 rounded-xl flex items-center justify-center text-white text-xs font-bold flex-shrink-0 overflow-hidden"
                    style={{ background: client.color_hex }}
                  >
                    {client.logo_url ? <img src={client.logo_url} alt={client.name} className="w-full h-full object-cover" /> : getInitials(client.name)}
                  </div>
                  <div className="min-w-0">
                    <span className="font-semibold text-[var(--color-text-primary)] text-sm truncate">{client.name}</span>
                    {!isOpen && (
                      <p className="text-xs text-[var(--color-text-muted)] mt-0.5">
                        {clientPosts.length} post{clientPosts.length !== 1 ? 's' : ''} pendente{clientPosts.length !== 1 ? 's' : ''}
                      </p>
                    )}
                  </div>
                </button>

                <div className="flex items-center gap-2 flex-shrink-0">
                  <button onClick={() => copyClientLink(clientId)} title="Copiar link de aprovação do cliente"
                    className="flex items-center gap-1 text-[11px] font-medium px-2.5 py-1 rounded-full border border-[var(--color-border)] text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-page)] hover:border-[var(--color-border-strong)] transition-colors">
                    <Link2 size={11} /> <span className="hidden sm:inline">Link</span>
                  </button>
                  {pendentes > 0 && (
                    <span className="hidden sm:flex items-center gap-1 text-[11px] font-semibold px-2.5 py-1 rounded-full" style={{ color: 'var(--ds-info-text)', background: 'var(--ds-info-bg)' }}>
                      <Clock size={10} /> {pendentes} aguardando
                    </span>
                  )}
                  {revisoes > 0 && (
                    <span className="hidden sm:flex items-center gap-1 text-[11px] font-semibold px-2.5 py-1 rounded-full" style={{ color: 'var(--ds-warn-text)', background: 'var(--ds-warn-bg)' }}>
                      <AlertTriangle size={10} /> {revisoes} revisão
                    </span>
                  )}
                  {aprovados > 0 && (
                    <span className="hidden sm:flex items-center gap-1 text-[11px] font-semibold px-2.5 py-1 rounded-full" style={{ color: 'var(--ds-success-text)', background: 'var(--ds-success-bg)' }}>
                      <CheckCircle2 size={10} /> {aprovados} aprovado{aprovados !== 1 ? 's' : ''}
                    </span>
                  )}
                  <button onClick={() => toggle(clientId)}>
                    {isOpen
                      ? <ChevronDown size={15} className="text-[var(--color-text-muted)] flex-shrink-0" />
                      : <ChevronRight size={15} className="text-[var(--color-text-muted)] flex-shrink-0" />
                    }
                  </button>
                </div>
              </div>

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

                        {view === 'grid' ? (
                          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3 p-4 items-start">
                            {mPosts.map(p => {
                              const needsRevision = p.approval_status === 'não aprovado'
                              const isApproved    = p.approval_status === 'aprovado'
                              const waitDays = waitingSince[p.id] ? daysAgo(waitingSince[p.id]) : null
                              return (
                                <button key={p.id} onClick={() => navigateToPost(p)}
                                  className="flex flex-col gap-2 rounded-xl border border-[var(--color-border)] hover:border-[var(--color-border-hover)] bg-[var(--color-bg-page)] overflow-hidden text-left transition-all hover:shadow-pop">
                                  <PostThumb post={p} className="w-full rounded-none" />
                                  <div className="px-2.5 pb-2.5 flex flex-col gap-1.5">
                                    <p className="text-xs font-semibold text-[var(--color-text-primary)] line-clamp-2 leading-snug">{p.title || 'Sem título'}</p>
                                    <div className="flex items-center gap-1 flex-wrap">
                                      <span className="text-[9px] font-medium px-1.5 py-0.5 rounded-md bg-[var(--color-bg-subtle)] text-[var(--color-text-muted)]">{TYPE_LABEL[p.post_type] || p.post_type}</span>
                                      {p.campaign_type && (
                                        <span className="text-[9px] font-medium px-1.5 py-0.5 rounded-md flex items-center gap-0.5" style={{ background: 'var(--ds-info-bg)', color: 'var(--ds-info-text)' }}>
                                          <Megaphone size={8} /> {p.campaign_type}
                                        </span>
                                      )}
                                    </div>
                                    {needsRevision && p.approval_comment && (
                                      <p className="text-[10px] italic line-clamp-1" style={{ color: 'var(--ds-warn-text)' }}>"{p.approval_comment}"</p>
                                    )}
                                    <div className="flex items-center justify-between gap-1">
                                      {isApproved ? (
                                        <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded-full" style={{ color: 'var(--ds-success-text)', background: 'var(--ds-success-bg)' }}>✓ Aprovado</span>
                                      ) : needsRevision ? (
                                        <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded-full" style={{ color: 'var(--ds-warn-text)', background: 'var(--ds-warn-bg)' }}>Revisão</span>
                                      ) : (
                                        <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded-full" style={{ color: 'var(--ds-info-text)', background: 'var(--ds-info-bg)' }}>Aguardando</span>
                                      )}
                                      {waitDays !== null && waitDays > 0 && (
                                        <span className="text-[9px] text-[var(--color-text-faint)] flex-shrink-0">{waitDays}d</span>
                                      )}
                                    </div>
                                  </div>
                                </button>
                              )
                            })}
                          </div>
                        ) : (
                          <div className="divide-y divide-[var(--color-bg-subtle)]">
                            {mPosts.map(p => {
                              const needsRevision = p.approval_status === 'não aprovado'
                              const isApproved    = p.approval_status === 'aprovado'
                              const waitDays = waitingSince[p.id] ? daysAgo(waitingSince[p.id]) : null
                              return (
                                <button
                                  key={p.id}
                                  onClick={() => navigateToPost(p)}
                                  className="w-full flex items-center gap-3 px-5 py-3 hover:bg-[var(--color-bg-page)] transition-colors text-left group"
                                >
                                  <PostThumb post={p} />
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
                                      {p.campaign_type && (
                                        <>
                                          <span className="text-[var(--color-text-faint)]">·</span>
                                          <span className="text-xs flex items-center gap-0.5" style={{ color: 'var(--ds-info-text)' }}>
                                            <Megaphone size={9} /> {p.campaign_type}
                                          </span>
                                        </>
                                      )}
                                      {waitDays !== null && waitDays > 0 && (
                                        <>
                                          <span className="text-[var(--color-text-faint)]">·</span>
                                          <span className="text-xs" style={{ color: waitDays >= 3 ? 'var(--ds-warn-text)' : 'var(--color-text-muted)' }}>
                                            aguardando há {waitDays}d
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
                        )}
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
