'use client'

import { useEffect, useState, useMemo, useRef, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import { useToast } from '@/lib/ToastContext'
import { CheckCircle2, AlertTriangle, Clock, ChevronDown, ChevronRight, ChevronsUpDown, Search, Link2, LayoutGrid, List, Play, Megaphone, MessageSquare, Send, X, ExternalLink, CalendarCheck } from 'lucide-react'
import ModalPortal from '@/components/ModalPortal'
import CronoApprovals from '@/components/CronoApprovals'
import { approvalKind, approvalLabel } from '@/lib/approvalKind'

// "Aprovado" nesta página significa APROVAÇÃO FINAL do conteúdo. O campo
// approval_status vale 'aprovado' pros dois tipos (crono e final), então usar
// ele cru misturava as duas coisas.
const isFinalApproved = (p: { status: string; approval_status: string }) =>
  approvalKind(p.status, p.approval_status) === 'final'

// Duas portas levam ao mesmo lugar: o cliente recusou (approval_status) ou o
// time moveu pra ajuste depois de um pedido por fora (status). As duas pedem
// a mesma ação, então contam igual em toda a página.
const needsAdjust = (p: { status: string; approval_status: string }) =>
  p.status === 'ajuste' || p.approval_status === 'não aprovado'

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
type ExtraPending = { id: string; client_id: string; title: string; type: string; drive_url: string | null; due_date: string | null }

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

function monthKeyOf(p: Post) { return `${p.year}-${String(p.month).padStart(2, '0')}` }

function daysAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime()
  return Math.floor(diff / 86400000)
}

// Mesma lógica de miniatura do PostMiniCard (cronograma): resolve direto do drive_url
// (arquivo único) ou, se for uma pasta, busca "capa.*" → imagem → PDF → vídeo.
function useDriveThumb(driveUrl?: string | null, driveFolderUrl?: string | null, isVideoDefault?: boolean) {
  const [thumbUrl, setThumbUrl] = useState<string | null>(() => {
    const id = driveUrl?.match(/[-\w]{25,}/)?.[0]
    return id ? `/api/drive-thumb?id=${id}&sz=w480` : null
  })
  const [isThumbVideo, setIsThumbVideo] = useState(!!isVideoDefault)

  useEffect(() => {
    if (!driveFolderUrl) return
    const folderId = driveFolderUrl.match(/\/folders\/([-\w]{25,})/)?.[1]
    if (!folderId) return
    fetch(`/api/drive-folder?folderId=${folderId}`)
      .then(r => r.json())
      .then(d => {
        const files: { id: string; name: string; mimeType: string }[] = d.files || []
        const images = files.filter(f => f.mimeType.startsWith('image/'))
        const cover = images.find(f => /^capa\./i.test(f.name)) ?? images[0]
        if (cover) { setThumbUrl(`/api/drive-thumb?id=${cover.id}&sz=w480`); setIsThumbVideo(false); return }
        const pdf = files.find(f => f.mimeType === 'application/pdf')
        if (pdf) { setThumbUrl(`/api/drive-thumb?id=${pdf.id}&sz=w480`); setIsThumbVideo(false); return }
        const video = files.find(f => f.mimeType.startsWith('video/'))
        if (video) { setThumbUrl(`/api/drive-thumb?id=${video.id}&sz=w480`); setIsThumbVideo(true) }
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

// Extras guardam pasta e arquivo único no mesmo campo drive_url (sem coluna
// separada como schedules) — detecta pelo padrão da URL antes de resolver a miniatura.
function splitExtraDrive(driveUrl?: string | null) {
  const isFolder = /\/folders\//.test(driveUrl || '')
  return { fileUrl: isFolder ? null : driveUrl, folderUrl: isFolder ? driveUrl : null }
}

// Miniatura de Extra — mesmo componente/estilo do PostThumb.
function ExtraThumb({ extra, className = 'w-14' }: { extra: ExtraPending; className?: string }) {
  const { fileUrl, folderUrl } = splitExtraDrive(extra.drive_url)
  const { thumbUrl, isThumbVideo } = useDriveThumb(fileUrl, folderUrl, extra.type === 'reels')
  return (
    <div className={`relative flex-shrink-0 overflow-hidden rounded-lg bg-[var(--color-bg-subtle)] flex items-center justify-center ${className}`} style={{ aspectRatio: '4 / 5' }}>
      {thumbUrl ? (
        <img src={thumbUrl} alt={extra.title} className="absolute inset-0 w-full h-full object-cover"
          onError={e => { (e.target as HTMLImageElement).style.display = 'none' }} />
      ) : (
        <span className="text-lg opacity-60">{TYPE_EMOJI[extra.type] || '📄'}</span>
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

// Preview grande de Extra — mesmo padrão do Lightbox de post, mas sem
// "aguardando há Xd" (não temos activity_log rastreado pra Extras aqui) e
// abrindo o Extra completo em /dashboard/extras?post=... em vez do cronograma.
function ExtraLightbox({ extra, client, onClose, onOpenFull }: {
  extra: ExtraPending; client?: Client; onClose: () => void; onOpenFull: () => void
}) {
  const { fileUrl, folderUrl } = splitExtraDrive(extra.drive_url)
  const { thumbUrl, isThumbVideo } = useDriveThumb(fileUrl, folderUrl, extra.type === 'reels')

  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <ModalPortal>
    <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4" onClick={onClose}>
      <div className="relative max-w-sm w-full bg-[var(--color-bg-card)] rounded-2xl overflow-hidden shadow-pop" onClick={e => e.stopPropagation()}>
        <button onClick={onClose} className="absolute top-2 right-2 z-10 w-8 h-8 rounded-full bg-black/50 hover:bg-black/70 text-white flex items-center justify-center transition-colors">
          <X size={16} />
        </button>
        <div className="relative w-full bg-[var(--color-bg-subtle)]" style={{ aspectRatio: '4 / 5' }}>
          {thumbUrl ? (
            <img src={thumbUrl} alt={extra.title} className="absolute inset-0 w-full h-full object-cover" />
          ) : (
            <div className="absolute inset-0 flex items-center justify-center text-5xl opacity-60">{TYPE_EMOJI[extra.type] || '📄'}</div>
          )}
          {thumbUrl && isThumbVideo && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/30 pointer-events-none">
              <div className="w-14 h-14 rounded-full bg-white/90 flex items-center justify-center shadow-lg">
                <Play size={22} className="text-[#111] ml-1" fill="currentColor" />
              </div>
            </div>
          )}
        </div>
        <div className="p-4 flex flex-col gap-2.5">
          <div className="flex items-start justify-between gap-2">
            <p className="font-semibold text-sm text-[var(--color-text-primary)]">{extra.title || 'Sem título'}</p>
            <span className="flex-shrink-0 text-[10px] font-semibold px-2 py-0.5 rounded-full" style={{ color: 'var(--ds-info-text)', background: 'var(--ds-info-bg)' }}>Aguardando</span>
          </div>
          <div className="flex items-center gap-1.5 flex-wrap text-xs text-[var(--color-text-muted)]">
            {client && <span>{client.name}</span>}
            <span className="text-[var(--color-text-faint)]">·</span>
            <span>{TYPE_LABEL[extra.type] || extra.type}</span>
            {extra.due_date && (
              <>
                <span className="text-[var(--color-text-faint)]">·</span>
                <span>{new Date(extra.due_date + 'T12:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })}</span>
              </>
            )}
          </div>
          <div className="flex items-center gap-2 mt-1">
            <button onClick={onOpenFull} className="flex-1 flex items-center justify-center gap-1.5 text-sm font-semibold px-3 py-2 rounded-xl bg-[var(--color-brand)] text-[var(--color-brand-fg)] hover:opacity-90 transition-opacity">
              Abrir extra completo
            </button>
            {extra.drive_url && (
              <a href={extra.drive_url} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()}
                title="Abrir no Drive"
                className="w-9 h-9 flex-shrink-0 flex items-center justify-center rounded-xl border border-[var(--color-border)] text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-subtle)] transition-colors">
                <ExternalLink size={14} />
              </a>
            )}
          </div>
        </div>
      </div>
    </div>
    </ModalPortal>
  )
}

// Preview grande — abre ao clicar na miniatura, sem sair da página. Clicar no
// título/linha ainda navega pro post completo no cronograma.
function Lightbox({ post, client, waitDays, onClose, onOpenFull }: {
  post: Post; client?: Client; waitDays: number | null
  onClose: () => void; onOpenFull: () => void
}) {
  const { thumbUrl, isThumbVideo } = useDriveThumb(post.drive_url, post.drive_folder_url, post.post_type === 'reels')
  const needsRevision = needsAdjust(post)
  // Selo mostra o estado ATUAL, não o passado. approval_status continua
  // 'aprovado' depois que o cliente aprovou o cronograma — então um post que
  // sofreu ajuste depois disso aparecia verde "✓ CRONO", dizendo aprovado
  // enquanto pedia trabalho. O crono aprovado vira informação secundária.
  const isApproved    = isFinalApproved(post)
  const cronoOk       = approvalKind(post.status, post.approval_status) === 'crono' && post.status !== 'ajuste'

  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <ModalPortal>
    <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4" onClick={onClose}>
      <div className="relative max-w-sm w-full bg-[var(--color-bg-card)] rounded-2xl overflow-hidden shadow-pop" onClick={e => e.stopPropagation()}>
        <button onClick={onClose} className="absolute top-2 right-2 z-10 w-8 h-8 rounded-full bg-black/50 hover:bg-black/70 text-white flex items-center justify-center transition-colors">
          <X size={16} />
        </button>
        <div className="relative w-full bg-[var(--color-bg-subtle)]" style={{ aspectRatio: '4 / 5' }}>
          {thumbUrl ? (
            <img src={thumbUrl} alt={post.title} className="absolute inset-0 w-full h-full object-cover" />
          ) : (
            <div className="absolute inset-0 flex items-center justify-center text-5xl opacity-60">{TYPE_EMOJI[post.post_type] || '📄'}</div>
          )}
          {thumbUrl && isThumbVideo && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/30 pointer-events-none">
              <div className="w-14 h-14 rounded-full bg-white/90 flex items-center justify-center shadow-lg">
                <Play size={22} className="text-[#111] ml-1" fill="currentColor" />
              </div>
            </div>
          )}
        </div>
        <div className="p-4 flex flex-col gap-2.5">
          <div className="flex items-start justify-between gap-2">
            <p className="font-semibold text-sm text-[var(--color-text-primary)]">{post.title || 'Sem título'}</p>
            {isApproved ? (
              <span className="flex-shrink-0 text-[10px] font-semibold px-2 py-0.5 rounded-full" style={{ color: 'var(--ds-success-text)', background: 'var(--ds-success-bg)' }}>✓ {approvalLabel(post.status, post.approval_status)}</span>
            ) : needsRevision ? (
              <span className="flex-shrink-0 text-[10px] font-semibold px-2 py-0.5 rounded-full" style={{ color: 'var(--ds-warn-text)', background: 'var(--ds-warn-bg)' }}>Ajuste</span>
            ) : (
              <span className="flex-shrink-0 text-[10px] font-semibold px-2 py-0.5 rounded-full" style={{ color: 'var(--ds-info-text)', background: 'var(--ds-info-bg)' }}>Aguardando</span>
            )}
            {/* Crono aprovado sem cor de sucesso: é contexto útil ("a pauta já
                passou pelo cliente"), não um estado de resolvido. */}
            {cronoOk && !isApproved && (
              <span className="flex-shrink-0 text-[10px] font-medium px-2 py-0.5 rounded-full" style={{ color: 'var(--color-text-muted)', background: 'var(--color-bg-subtle)' }}>crono ok</span>
            )}
          </div>
          <div className="flex items-center gap-1.5 flex-wrap text-xs text-[var(--color-text-muted)]">
            {client && <span>{client.name}</span>}
            <span className="text-[var(--color-text-faint)]">·</span>
            <span>{TYPE_LABEL[post.post_type] || post.post_type}</span>
            {waitDays !== null && waitDays > 0 && (
              <>
                <span className="text-[var(--color-text-faint)]">·</span>
                <span style={{ color: waitDays >= 3 ? 'var(--ds-warn-text)' : undefined }}>aguardando há {waitDays}d</span>
              </>
            )}
          </div>
          {needsRevision && post.approval_comment && (
            <p className="text-xs italic rounded-lg px-2.5 py-1.5" style={{ background: 'var(--ds-warn-bg)', color: 'var(--ds-warn-text)' }}>"{post.approval_comment}"</p>
          )}
          <div className="flex items-center gap-2 mt-1">
            <button onClick={onOpenFull} className="flex-1 flex items-center justify-center gap-1.5 text-sm font-semibold px-3 py-2 rounded-xl bg-[var(--color-brand)] text-[var(--color-brand-fg)] hover:opacity-90 transition-opacity">
              Abrir post completo
            </button>
            {post.drive_url && (
              <a href={post.drive_url} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()}
                title="Abrir no Drive"
                className="w-9 h-9 flex-shrink-0 flex items-center justify-center rounded-xl border border-[var(--color-border)] text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-subtle)] transition-colors">
                <ExternalLink size={14} />
              </a>
            )}
          </div>
        </div>
      </div>
    </div>
    </ModalPortal>
  )
}

function AprovacaoPageInner() {
  useEffect(() => { document.title = 'Aprovação · Bagano Hub' }, [])
  const router  = useRouter()
  const searchParams = useSearchParams()
  // Chegando de um link do Hub (ex: "N itens esperando o cliente") — foca
  // direto no cliente certo, e se for 1 item só, já abre o preview dele.
  const focusClientId = searchParams.get('client')
  const highlightId    = searchParams.get('highlight')
  const highlightKind  = searchParams.get('kind')
  const scrolledRef = useRef(false)
  const { toast } = useToast()
  const [posts,   setPosts]   = useState<Post[]>([])
  const [clients, setClients] = useState<Client[]>([])
  const [extrasPending, setExtrasPending] = useState<ExtraPending[]>([])
  const [extraLightboxId, setExtraLightboxId] = useState<string | null>(null)
  const [waitingSince, setWaitingSince] = useState<Record<string, string>>({})
  const [commentsCount, setCommentsCount] = useState<Record<string, number>>({})
  const [loading,   setLoading]   = useState(true)
  const [loadError, setLoadError] = useState(false)
  // Aceita ?filter= do link do alerta: mandar pra página e deixar no filtro
  // padrão faz a pessoa procurar de novo o que o alerta já tinha achado.
  const [filter,    setFilter]    = useState<'todos' | 'aguardando' | 'revisao' | 'aprovado'>(() => {
    const f = searchParams.get('filter')
    return f === 'aguardando' || f === 'revisao' || f === 'aprovado' ? f : 'todos'
  })
  // Aprovação de CRONO fica numa superfície separada, não misturada nos
  // filtros: são conversas diferentes com o cliente (pauta x arte), e
  // misturar as duas foi o que gerou a confusão da HAGO.
  const [surface,   setSurface]   = useState<'conteudo' | 'crono'>('conteudo')
  const [cronoPendentes, setCronoPendentes] = useState(0)
  useEffect(() => {
    createClient().from('schedules')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'aguardando_aprovacao_crono')
      .then(({ count }) => setCronoPendentes(count || 0))
  }, [])
  const [search,    setSearch]    = useState('')
  const [monthFilter, setMonthFilter] = useState('')
  const [view,      setView]      = useState<'list' | 'grid'>(() => {
    if (typeof window === 'undefined') return 'list'
    return (localStorage.getItem('aprovacao-view') as 'list' | 'grid') || 'list'
  })
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [lightboxId, setLightboxId] = useState<string | null>(null)

  function setViewMode(v: 'list' | 'grid') {
    setView(v)
    localStorage.setItem('aprovacao-view', v)
  }

  useEffect(() => {
    async function load() {
      try {
        const supabase = createClient()
        const [{ data: postData, error: e1 }, { data: clientData }, { data: extrasData }] = await Promise.all([
          supabase
            .from('schedules')
            .select('id, title, post_type, status, approval_status, approval_comment, scheduled_date, month, year, client_id, drive_url, drive_folder_url, funil, campaign_type')
            .or('status.eq.aguardando_aprovacao,status.eq.ajuste,approval_status.eq.aprovado')
            .order('month', { ascending: false }),
          supabase.from('clients').select('id, name, color_hex, logo_url').eq('status', 'active'),
          // Extras aguardando aprovação do cliente — invisíveis nesta página até
          // agora, já que ela só olhava schedules. Mesmo critério usado em
          // AprovarClient.tsx (client_approval_status='aguardando' sozinho —
          // needs_client_approval não é confiável, nunca é setado pelo fluxo
          // normal de Extras).
          supabase.from('extras').select('id, client_id, title, type, drive_url, due_date')
            .eq('client_approval_status', 'aguardando'),
        ])
        if (e1) { setLoadError(true); setLoading(false); return }
        // Esta página é sobre APROVAÇÃO DO CONTEÚDO. Um post com o cronograma
        // aprovado seguindo em produção não é assunto daqui: ele aparecia na
        // aba "Aprovados" e passava a impressão de que a arte estava aprovada
        // — foi a confusão da HAGO. Fica quem está esperando resposta, quem
        // pediu ajuste, e quem teve o FINAL aprovado.
        const allPosts = (postData || []).filter((p: any) =>
          p.status === 'aguardando_aprovacao' ||
          p.status === 'ajuste' ||
          approvalKind(p.status, p.approval_status) === 'final'
        )
        setPosts(allPosts)
        setClients(clientData || [])
        setExtrasPending(extrasData || [])
        // Auto-expand clients com revisão solicitada + o cliente que veio no link (se veio)
        const urgentClients = new Set<string>()
        allPosts.forEach(p => { if (p.status === 'ajuste') urgentClients.add(p.client_id) })
        if (focusClientId) urgentClients.add(focusClientId)
        setExpanded(urgentClients)

        if (highlightId) {
          if (highlightKind === 'extra') setExtraLightboxId(highlightId)
          else setLightboxId(highlightId)
        }

        const ids = allPosts.map(p => p.id)
        if (ids.length > 0) {
          // "Aguardando há X dias" — melhor esforço a partir do activity_log (não existe
          // coluna dedicada pra isso), pega o registro mais antigo que menciona a mudança
          // pra "Aguardando aprovação" por post. Se não achar, o post fica sem selo de tempo.
          const waitingIds = allPosts.filter(p => p.status === 'aguardando_aprovacao').map(p => p.id)
          const [logsRes, commentsRes] = await Promise.all([
            waitingIds.length > 0
              ? supabase.from('activity_log').select('record_id, description, created_at')
                  .eq('table_name', 'schedules').eq('action', 'status_changed')
                  .in('record_id', waitingIds).ilike('description', '%aguardando aprova%')
                  .order('created_at', { ascending: true })
              : Promise.resolve({ data: [] as any[] }),
            supabase.from('schedule_comments').select('schedule_id').in('schedule_id', ids),
          ])
          const since: Record<string, string> = {}
          ;(logsRes.data || []).forEach((l: any) => { if (!since[l.record_id]) since[l.record_id] = l.created_at })
          setWaitingSince(since)
          const cc: Record<string, number> = {}
          ;(commentsRes.data || []).forEach((c: any) => { cc[c.schedule_id] = (cc[c.schedule_id] || 0) + 1 })
          setCommentsCount(cc)
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

  const extrasPendingByClient = useMemo(() => {
    const m: Record<string, number> = {}
    extrasPending.forEach(e => { m[e.client_id] = (m[e.client_id] || 0) + 1 })
    return m
  }, [extrasPending])
  const extrasPendingTotal = extrasPending.length

  const monthOptions = useMemo(() => {
    const set = new Set(posts.map(monthKeyOf))
    return Array.from(set).sort().reverse()
  }, [posts])

  const searched = useMemo(() => {
    if (!search.trim()) return posts
    const q = search.trim().toLowerCase()
    return posts.filter(p => {
      const client = clientMap[p.client_id]
      return p.title?.toLowerCase().includes(q) || client?.name.toLowerCase().includes(q)
    })
  }, [posts, search, clientMap])

  const filtered = useMemo(() => {
    let list = searched
    // isFinal, não approval_status: um post de crono aprovado que voltou pra
    // aprovação final estava sumindo de "Aguardando" e sendo arquivado em
    // "Aprovados" — justamente um que ainda espera o cliente.
    if (filter === 'aguardando') list = list.filter(p => p.status === 'aguardando_aprovacao' && !isFinalApproved(p))
    else if (filter === 'revisao') list = list.filter(p => p.status === 'ajuste')
    else if (filter === 'aprovado') list = list.filter(p => isFinalApproved(p))
    else list = list.filter(p => !isFinalApproved(p))
    if (monthFilter) list = list.filter(p => monthKeyOf(p) === monthFilter)
    return list
  }, [searched, filter, monthFilter])

  // Dentro de cada mês: revisão primeiro, depois aguardando (mais antigo esperando
  // primeiro), aprovados por último.
  function sortPosts(list: Post[]) {
    return [...list].sort((a, b) => {
      // Ajuste sempre no topo: é o único estado que exige trabalho agora.
      // Antes o rank olhava approval_status cru, então um post em ajuste que
      // teve o CRONO aprovado caía no grupo dos aprovados e ia parar no fim
      // da lista — o oposto de onde precisava estar.
      const rank = (p: Post) => needsAdjust(p) ? 0 : isFinalApproved(p) ? 2 : 1
      const ra = rank(a), rb = rank(b)
      if (ra !== rb) return ra - rb
      const wa = waitingSince[a.id] ? daysAgo(waitingSince[a.id]) : -1
      const wb = waitingSince[b.id] ? daysAgo(waitingSince[b.id]) : -1
      if (wa !== wb) return wb - wa
      return (a.scheduled_date || '').localeCompare(b.scheduled_date || '')
    })
  }

  // Agrupar por cliente, mantendo ordem: clientes com revisão primeiro
  const byClient = useMemo(() => {
    const groups: Record<string, Post[]> = {}
    filtered.forEach(p => {
      if (!groups[p.client_id]) groups[p.client_id] = []
      groups[p.client_id].push(p)
    })
    // Cliente com só Extras pendentes (sem nenhum post do cronograma) também
    // precisa aparecer na lista — senão a pendência de Extra passa batido.
    if (filter === 'todos') {
      Object.keys(extrasPendingByClient).forEach(clientId => {
        if (!groups[clientId]) groups[clientId] = []
      })
    }
    // Revisões primeiro, depois aguardando
    return Object.entries(groups).sort(([, a], [, b]) => {
      const aRev = a.some(needsAdjust) ? 0 : 1
      const bRev = b.some(needsAdjust) ? 0 : 1
      return aRev - bRev
    })
  }, [filtered, extrasPendingByClient, filter])

  const aguardandoCount = posts.filter(p => p.status === 'aguardando_aprovacao' && !isFinalApproved(p)).length
  const revisaoCount    = posts.filter(p => p.status === 'ajuste').length
  const aprovadoCount   = posts.filter(p => isFinalApproved(p)).length

  // Resumo: quantos clientes têm pendência e há quanto tempo a mais antiga espera
  const pendingClientsCount = useMemo(() => {
    const s = new Set<string>()
    posts.forEach(p => { if (!isFinalApproved(p)) s.add(p.client_id) })
    return s.size
  }, [posts])
  const oldestWaitingDays = useMemo(() => {
    const days = Object.values(waitingSince).map(iso => daysAgo(iso))
    return days.length > 0 ? Math.max(...days) : null
  }, [waitingSince])

  // Rola até o cliente indicado pelo link, uma vez, depois que a lista carregou.
  useEffect(() => {
    if (!focusClientId || loading || scrolledRef.current) return
    const el = document.getElementById(`aprovacao-client-${focusClientId}`)
    if (el) { el.scrollIntoView({ behavior: 'smooth', block: 'start' }); scrolledRef.current = true }
  }, [focusClientId, byClient, loading])

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

  function navigateToExtra(e: ExtraPending) {
    router.push(`/dashboard/extras?post=${e.id}`)
  }

  function copyClientLink(clientId: string) {
    navigator.clipboard.writeText(`${window.location.origin}/aprovar/cliente/${clientId}`)
    toast('Link da Central de aprovação copiado!')
  }

  function remindClient(clientId: string, pending: number) {
    const client = clientMap[clientId]
    const link = `${window.location.origin}/aprovar/cliente/${clientId}`
    const msg = `Oi${client ? ', ' + client.name.split(' ')[0] : ''}! Tudo bem? Tem ${pending} it${pending !== 1 ? 'ens' : 'em'} esperando sua aprovação por aqui: ${link}`
    window.open(`https://wa.me/?text=${encodeURIComponent(msg)}`, '_blank')
  }

  const lightboxPost = lightboxId ? posts.find(p => p.id === lightboxId) || null : null
  const extraLightboxPending = extraLightboxId ? extrasPending.find(e => e.id === extraLightboxId) || null : null

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
            <h1 className="text-2xl md:text-3xl font-bold text-[var(--color-text-primary)] tracking-tight">Aprovações</h1>
            <p className="text-sm text-[var(--color-text-muted)] mt-1">
              {aguardandoCount > 0 && <span>{aguardandoCount} aguardando resposta</span>}
              {aguardandoCount > 0 && revisaoCount > 0 && <span className="mx-1.5 text-[var(--color-text-faint)]">·</span>}
              {revisaoCount > 0 && <span style={{ color: 'var(--ds-warn-text)' }}>{revisaoCount} precisam ajuste</span>}
              {aguardandoCount === 0 && revisaoCount === 0 && extrasPendingTotal === 0 && 'Tudo em dia'}
              {extrasPendingTotal > 0 && (
                <>
                  {(aguardandoCount > 0 || revisaoCount > 0) && <span className="mx-1.5 text-[var(--color-text-faint)]">·</span>}
                  <span style={{ color: '#6366f1' }}>{extrasPendingTotal} extra{extrasPendingTotal !== 1 ? 's' : ''} pendente{extrasPendingTotal !== 1 ? 's' : ''}</span>
                </>
              )}
              {pendingClientsCount > 0 && (
                <span className="text-[var(--color-text-faint)]"> · {pendingClientsCount} cliente{pendingClientsCount !== 1 ? 's' : ''}{oldestWaitingDays !== null && oldestWaitingDays > 0 ? ` · mais antigo há ${oldestWaitingDays}d` : ''}</span>
              )}
            </p>
          </div>
          {/* h-9 nos dois: o "mt-1" era um remendo pra compensar alturas
              diferentes, e no celular deixava os dois desencontrados. */}
          <div className="flex items-center gap-2 flex-shrink-0">
            {byClient.length > 1 && (
              <button
                onClick={allExpanded ? collapseAll : expandAll}
                className="h-9 px-2 flex items-center gap-1.5 text-xs font-medium text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] transition-colors"
              >
                <ChevronsUpDown size={13} />
                {allExpanded ? 'Colapsar todos' : 'Expandir todos'}
              </button>
            )}
            {/* Discreto de propósito: não disputa atenção com a aprovação de
                conteúdo, que é o trabalho do dia a dia. Só muda de tom quando
                tem cronograma parado esperando resposta. */}
            <button onClick={() => setSurface(s => s === 'crono' ? 'conteudo' : 'crono')}
              title="Cronogramas aguardando aprovação do cliente"
              className="h-9 flex items-center gap-1.5 text-xs font-medium px-3 rounded-xl border transition-colors"
              style={surface === 'crono'
                ? { borderColor: 'var(--color-accent)', color: 'var(--color-accent)', background: 'var(--color-accent-bg)' }
                : { borderColor: 'var(--color-border)', color: 'var(--color-text-secondary)' }}>
              <CalendarCheck size={13} />
              {surface === 'crono' ? 'Ver conteúdo' : 'Cronogramas'}
              {surface !== 'crono' && cronoPendentes > 0 && (
                <span className="text-[10px] font-bold px-1.5 rounded-full" style={{ background: 'var(--ds-warn-bg)', color: 'var(--ds-warn-text)' }}>
                  {cronoPendentes}
                </span>
              )}
            </button>
            <div className="h-9 flex items-center bg-[var(--color-bg-card)] border border-[var(--color-border)] rounded-xl p-0.5">
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

        {surface === 'crono' ? <CronoApprovals clients={clients} /> : <>
        {/* Busca + Filtros — no celular a busca ocupa a linha inteira e os
            quatro filtros viram 2×2. Em linha corrida eles quebravam em
            1-2-2 conforme o texto de cada um, que é o que fazia a barra
            parecer bagunçada. */}
        <div className="flex flex-col gap-2 md:flex-row md:items-center md:flex-wrap">
          <div className="flex gap-2 md:contents">
            <div className="relative flex-1 md:flex-none md:flex-shrink-0">
              <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--color-text-faint)]" />
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Buscar cliente ou post..."
                className="h-9 w-full pl-8 pr-3 rounded-xl text-sm border border-[var(--color-border)] bg-[var(--color-bg-card)] text-[var(--color-text-primary)] outline-none md:w-48 md:focus:w-64 transition-all"
              />
            </div>
            {monthOptions.length > 1 && (
              <select value={monthFilter} onChange={e => setMonthFilter(e.target.value)}
                className="h-9 text-sm rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-card)] px-3 text-[var(--color-text-secondary)] outline-none">
                <option value="">Todos os meses</option>
                {monthOptions.map(key => {
                  const [y, m] = key.split('-')
                  return <option key={key} value={key}>{MONTHS[parseInt(m) - 1]} {y}</option>
                })}
              </select>
            )}
          </div>
          <div className="grid grid-cols-2 gap-2 md:contents">
            {[
              { key: 'todos',      label: 'Pendentes',       count: aguardandoCount + revisaoCount },
              { key: 'aguardando', label: 'Aguardando',       count: aguardandoCount },
              { key: 'revisao',    label: 'Ajuste',  count: revisaoCount },
              { key: 'aprovado',   label: 'Aprovados',        count: aprovadoCount },
            ].map(f => (
              <button
                key={f.key}
                onClick={() => setFilter(f.key as typeof filter)}
                className={`h-9 flex items-center justify-center gap-2 px-4 rounded-xl text-sm font-medium transition-all ${filter === f.key ? 'bg-[var(--color-brand)] text-[var(--color-brand-fg)]' : 'bg-[var(--color-bg-card)] border border-[var(--color-border)] text-[var(--color-text-secondary)] hover:border-[var(--color-border-strong)]'}`}
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
          const pendentes  = clientPosts.filter(p => p.status === 'aguardando_aprovacao' && !isFinalApproved(p)).length
          const revisoes   = clientPosts.filter(needsAdjust).length
          // "aprovado" no cabeçalho do cliente = aprovação FINAL, igual à aba.
          // Contando o crono junto, um cliente com tudo em produção aparecia
          // com "N aprovados" como se estivesse resolvido.
          const aprovados  = clientPosts.filter(p => isFinalApproved(p)).length
          const extrasPendentes = extrasPendingByClient[clientId] || 0
          const clientExtras = extrasPending.filter(e => e.client_id === clientId)
          const hasUrgency = revisoes > 0

          // Agrupar por mês dentro do cliente
          const byMonth: Record<string, Post[]> = {}
          clientPosts.forEach(p => {
            const key = monthKeyOf(p)
            if (!byMonth[key]) byMonth[key] = []
            byMonth[key].push(p)
          })
          const monthGroups = Object.entries(byMonth).sort(([a], [b]) => b.localeCompare(a))
          const multiMonth  = monthGroups.length > 1

          return (
            <div
              key={clientId}
              id={`aprovacao-client-${clientId}`}
              className="bg-[var(--color-bg-card)] border rounded-2xl overflow-hidden shadow-card transition-all"
              style={{ borderColor: hasUrgency ? 'var(--ds-warn-border)' : 'var(--color-border)' }}
            >
              {/* Header — a linha inteira é clicável (um único botão); "Link" e
                  "Lembrar" param a propagação pra não abrir/fechar junto. */}
              <button
                type="button"
                onClick={() => toggle(clientId)}
                className="w-full flex items-center justify-between gap-3 px-5 py-4 hover:bg-[var(--color-bg-subtle)] transition-colors text-left"
              >
                <div className="flex items-center gap-3 min-w-0">
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
                        {clientPosts.length > 0
                          ? `${clientPosts.length} post${clientPosts.length !== 1 ? 's' : ''} pendente${clientPosts.length !== 1 ? 's' : ''}`
                          : `${extrasPendentes} extra${extrasPendentes !== 1 ? 's' : ''} pendente${extrasPendentes !== 1 ? 's' : ''}`}
                      </p>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-2 flex-shrink-0">
                  {(pendentes + extrasPendentes) > 0 && (
                    <span
                      role="button"
                      tabIndex={0}
                      onClick={e => { e.stopPropagation(); remindClient(clientId, pendentes + extrasPendentes) }}
                      onKeyDown={e => { if (e.key === 'Enter') { e.stopPropagation(); remindClient(clientId, pendentes + extrasPendentes) } }}
                      title="Lembrar cliente pelo WhatsApp"
                      className="hidden md:flex items-center gap-1 text-[11px] font-medium px-2.5 py-1 rounded-full border border-[var(--color-border)] text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-page)] hover:border-[var(--color-border-strong)] transition-colors cursor-pointer"
                    >
                      <Send size={11} /> Lembrar
                    </span>
                  )}
                  <span
                    role="button"
                    tabIndex={0}
                    onClick={e => { e.stopPropagation(); copyClientLink(clientId) }}
                    onKeyDown={e => { if (e.key === 'Enter') { e.stopPropagation(); copyClientLink(clientId) } }}
                    title="Copiar link de aprovação do cliente"
                    className="flex items-center gap-1 text-[11px] font-medium px-2.5 py-1 rounded-full border border-[var(--color-border)] text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-page)] hover:border-[var(--color-border-strong)] transition-colors cursor-pointer"
                  >
                    <Link2 size={11} /> <span className="hidden sm:inline">Link</span>
                  </span>
                  {pendentes > 0 && (
                    <span className="hidden lg:flex items-center gap-1 text-[11px] font-semibold px-2.5 py-1 rounded-full" style={{ color: 'var(--ds-info-text)', background: 'var(--ds-info-bg)' }}>
                      <Clock size={10} /> {pendentes} aguardando
                    </span>
                  )}
                  {revisoes > 0 && (
                    <span className="hidden lg:flex items-center gap-1 text-[11px] font-semibold px-2.5 py-1 rounded-full" style={{ color: 'var(--ds-warn-text)', background: 'var(--ds-warn-bg)' }}>
                      <AlertTriangle size={10} /> {revisoes} revisão
                    </span>
                  )}
                  {aprovados > 0 && (
                    <span className="hidden lg:flex items-center gap-1 text-[11px] font-semibold px-2.5 py-1 rounded-full" style={{ color: 'var(--ds-success-text)', background: 'var(--ds-success-bg)' }}>
                      <CheckCircle2 size={10} /> {aprovados} aprovado{aprovados !== 1 ? 's' : ''}
                    </span>
                  )}
                  {extrasPendentes > 0 && (
                    <span className="hidden lg:flex items-center gap-1 text-[11px] font-semibold px-2.5 py-1 rounded-full" style={{ color: '#6366f1', background: '#6366f122' }} title="Extras aguardando aprovação do cliente">
                      🧩 {extrasPendentes} extra{extrasPendentes !== 1 ? 's' : ''}
                    </span>
                  )}
                  {isOpen
                    ? <ChevronDown size={15} className="text-[var(--color-text-muted)] flex-shrink-0" />
                    : <ChevronRight size={15} className="text-[var(--color-text-muted)] flex-shrink-0" />
                  }
                </div>
              </button>

              {/* Posts — expandido */}
              {isOpen && (
                <div className="border-t border-[var(--color-border)]">
                  {clientExtras.length > 0 && (
                    <div>
                      <div className="px-5 py-2 bg-[var(--color-bg-subtle)] border-b border-[var(--color-border)]">
                        <span className="text-[10px] font-bold uppercase tracking-widest text-[var(--color-text-muted)]">🧩 Extras</span>
                      </div>
                      {view === 'grid' ? (
                        <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-2.5 p-4 items-start">
                          {clientExtras.map(ex => (
                            <div key={ex.id} className="flex flex-col gap-1">
                              <button onClick={() => setExtraLightboxId(ex.id)} title="Ver preview" className="relative rounded-lg overflow-hidden transition-all hover:opacity-90"
                                style={{ boxShadow: `0 0 0 2px var(--ds-info-accent)` }}>
                                <ExtraThumb extra={ex} className="w-full rounded-none" />
                                <div className="absolute bottom-0 left-0 right-0 flex items-center justify-center gap-1 py-1 text-white text-[10px] font-bold uppercase tracking-wide" style={{ background: 'var(--ds-info-accent)' }}>
                                  <Clock size={10} strokeWidth={2.5} /> Aguardando
                                </div>
                              </button>
                              <button onClick={() => navigateToExtra(ex)} className="text-left flex-1 min-w-0">
                                <p className="text-[11px] font-medium text-[var(--color-text-primary)] truncate leading-tight hover:underline">{ex.title || 'Sem título'}</p>
                              </button>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="divide-y divide-[var(--color-bg-subtle)]">
                          {clientExtras.map(ex => (
                            <div key={ex.id} className="w-full flex items-center gap-3 px-5 py-3 hover:bg-[var(--color-bg-page)] transition-colors group">
                              <button onClick={() => setExtraLightboxId(ex.id)} title="Ver preview">
                                <ExtraThumb extra={ex} />
                              </button>
                              <button onClick={() => navigateToExtra(ex)} className="flex-1 min-w-0 text-left">
                                <p className="text-sm font-medium text-[var(--color-text-primary)] truncate">{ex.title || 'Sem título'}</p>
                                <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                                  <span className="text-xs text-[var(--color-text-muted)]">{TYPE_LABEL[ex.type] || ex.type}</span>
                                  {ex.due_date && (
                                    <>
                                      <span className="text-[var(--color-text-faint)]">·</span>
                                      <span className="text-xs text-[var(--color-text-muted)]">
                                        {new Date(ex.due_date + 'T12:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })}
                                      </span>
                                    </>
                                  )}
                                </div>
                              </button>
                              <div className="flex-shrink-0">
                                <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full border" style={{ color: 'var(--ds-info-text)', background: 'var(--ds-info-bg)', borderColor: 'var(--ds-info-border)' }}>
                                  Aguardando
                                </span>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                  {monthGroups.map(([monthKey, mPostsRaw]) => {
                    const mPosts = sortPosts(mPostsRaw)
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
                          /* 6 por linha — o que precisa saltar aos olhos é o status (aguardando/
                             revisão/aprovado), não o texto. Anel colorido ao redor da foto +
                             selo com ícone sobre a própria miniatura, sem legenda comprida. */
                          <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-2.5 p-4 items-start">
                            {mPosts.map(p => {
                              const hasAdjustment = needsAdjust(p)
                              const needsRevision = hasAdjustment
                              // isFinalApproved, não o campo cru: approval_status
                              // continua 'aprovado' desde a aprovação do
                              // CRONOGRAMA. Testando o campo direto, um post que
                              // o cliente pediu ajuste por WhatsApp e o time moveu
                              // pra Ajuste continuava verde, parecendo pronto.
                              const isApproved    = isFinalApproved(p) && !hasAdjustment
                              const waitDays = waitingSince[p.id] ? daysAgo(waitingSince[p.id]) : null
                              const isUrgent = waitDays !== null && waitDays >= 3 && !isApproved
                              // Ajuste vem primeiro: é o estado que pede ação.
                              const statusColor = hasAdjustment || needsRevision ? '#ef4444' : isApproved ? 'var(--ds-success-accent)' : 'var(--ds-info-accent)'
                              const nComments = commentsCount[p.id] || 0
                              const statusLabel = hasAdjustment || needsRevision ? 'Ajuste' : isApproved ? 'Final' : 'Aguardando'
                              return (
                                <div key={p.id} className="flex flex-col gap-1">
                                  <button onClick={() => setLightboxId(p.id)} title="Ver preview" className="relative rounded-lg overflow-hidden transition-all hover:opacity-90"
                                    style={{ boxShadow: `0 0 0 2px ${statusColor}` }}>
                                    <PostThumb post={p} className="w-full rounded-none" />
                                    {waitDays !== null && waitDays > 0 && (
                                      <span className={`absolute top-1 right-1 text-[9px] font-bold px-1.5 py-0.5 rounded-full text-white ${isUrgent ? 'animate-pulse' : ''}`}
                                        style={{ background: isUrgent ? 'var(--ds-error-accent)' : 'rgba(0,0,0,0.6)' }}>
                                        {waitDays}d
                                      </span>
                                    )}
                                    {nComments > 0 && (
                                      <span className="absolute top-1 left-1 flex items-center gap-0.5 text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-black/60 text-white">
                                        <MessageSquare size={8} /> {nComments}
                                      </span>
                                    )}
                                    {/* Faixa de status — texto explícito, não só cor/ícone */}
                                    <div className="absolute bottom-0 left-0 right-0 flex items-center justify-center gap-1 py-1 text-white text-[10px] font-bold uppercase tracking-wide" style={{ background: statusColor }}>
                                      {isApproved ? <CheckCircle2 size={10} strokeWidth={2.5} /> : needsRevision ? <AlertTriangle size={10} strokeWidth={2.5} /> : <Clock size={10} strokeWidth={2.5} />}
                                      {statusLabel}
                                    </div>
                                  </button>
                                  <button onClick={() => navigateToPost(p)} className="text-left flex-1 min-w-0">
                                    <p className="text-[11px] font-medium text-[var(--color-text-primary)] truncate leading-tight hover:underline">{p.title || 'Sem título'}</p>
                                    {(hasAdjustment || needsRevision) && p.approval_comment && (
                                      <p className="text-[9px] font-semibold mt-0.5 truncate px-1.5 py-0.5 rounded text-white" style={{ background: '#ef4444' }}>
                                        🔴 {p.approval_comment}
                                      </p>
                                    )}
                                  </button>
                                </div>
                              )
                            })}
                          </div>
                        ) : (
                          <div className="divide-y divide-[var(--color-bg-subtle)]">
                            {mPosts.map(p => {
                              const hasAdjustment = needsAdjust(p)
                              const needsRevision = hasAdjustment
                              // isFinalApproved, não o campo cru: approval_status
                              // continua 'aprovado' desde a aprovação do
                              // CRONOGRAMA. Testando o campo direto, um post que
                              // o cliente pediu ajuste por WhatsApp e o time moveu
                              // pra Ajuste continuava verde, parecendo pronto.
                              const isApproved    = isFinalApproved(p) && !hasAdjustment
                              const waitDays = waitingSince[p.id] ? daysAgo(waitingSince[p.id]) : null
                              const isUrgent = waitDays !== null && waitDays >= 3 && !isApproved
                              const nComments = commentsCount[p.id] || 0
                              return (
                                <div key={p.id} className="w-full flex items-center gap-3 px-5 py-3 hover:bg-[var(--color-bg-page)] transition-colors group">
                                  <button onClick={() => setLightboxId(p.id)} title="Ver preview">
                                    <PostThumb post={p} />
                                  </button>
                                  <button onClick={() => navigateToPost(p)} className="flex-1 min-w-0 text-left">
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
                                      {nComments > 0 && (
                                        <>
                                          <span className="text-[var(--color-text-faint)]">·</span>
                                          <span className="text-xs flex items-center gap-0.5 text-[var(--color-text-muted)]">
                                            <MessageSquare size={9} /> {nComments}
                                          </span>
                                        </>
                                      )}
                                      {waitDays !== null && waitDays > 0 && (
                                        <>
                                          <span className="text-[var(--color-text-faint)]">·</span>
                                          {isUrgent ? (
                                            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full text-white animate-pulse" style={{ background: 'var(--ds-error-accent)' }}>
                                              aguardando há {waitDays}d
                                            </span>
                                          ) : (
                                            <span className="text-xs text-[var(--color-text-muted)]">aguardando há {waitDays}d</span>
                                          )}
                                        </>
                                      )}
                                      {(hasAdjustment || needsRevision) && p.approval_comment && (
                                        <>
                                          <span className="text-[var(--color-text-faint)]">·</span>
                                          <span className="text-xs font-semibold px-2 py-1 rounded-md truncate max-w-[280px]" style={{ color: '#fff', background: '#ef4444' }}>
                                            🔴 Ajuste: {p.approval_comment}
                                          </span>
                                        </>
                                      )}
                                    </div>
                                  </button>
                                  <div className="flex-shrink-0">
                                    {hasAdjustment || needsRevision ? (
                                      <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full border text-white" style={{ color: '#fff', background: '#ef4444', borderColor: '#ef4444' }}>
                                        Ajuste
                                      </span>
                                    ) : isApproved ? (
                                      <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full border" style={{ color: 'var(--ds-success-text)', background: 'var(--ds-success-bg)', borderColor: 'var(--ds-success-border)' }}>
                                        ✓ {approvalLabel(p.status, p.approval_status)}
                                      </span>
                                    ) : (
                                      <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full border" style={{ color: 'var(--ds-info-text)', background: 'var(--ds-info-bg)', borderColor: 'var(--ds-info-border)' }}>
                                        Aguardando
                                      </span>
                                    )}
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
              )}
            </div>
          )
        })}
        </>}
      </div>

      {lightboxPost && (
        <Lightbox
          post={lightboxPost}
          client={clientMap[lightboxPost.client_id]}
          waitDays={waitingSince[lightboxPost.id] ? daysAgo(waitingSince[lightboxPost.id]) : null}
          onClose={() => setLightboxId(null)}
          onOpenFull={() => { navigateToPost(lightboxPost); setLightboxId(null) }}
        />
      )}

      {extraLightboxPending && (
        <ExtraLightbox
          extra={extraLightboxPending}
          client={clientMap[extraLightboxPending.client_id]}
          onClose={() => setExtraLightboxId(null)}
          onOpenFull={() => { navigateToExtra(extraLightboxPending); setExtraLightboxId(null) }}
        />
      )}
    </div>
  )
}

export default function AprovacaoPage() {
  return <Suspense><AprovacaoPageInner /></Suspense>
}
