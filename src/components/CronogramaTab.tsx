'use client'
/* eslint-disable */
// @ts-nocheck

import { useEffect, useState, useRef } from 'react'
import { createClient } from '@/lib/supabase'
import PostCard from '@/components/PostCard'
import PostMiniCard, { MiniPost } from '@/components/PostMiniCard'
import { useToast } from '@/lib/ToastContext'
import { dbError } from '@/lib/dbError'
import { Check, Copy, Search, X, Zap, ClipboardCheck } from 'lucide-react'
import { useUser } from '@/lib/UserContext'
import { logActivity } from '@/lib/activity'

// ─── Constants ────────────────────────────────────────────────────────────────

export const CRONO_MONTHS = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro']

const POST_TYPES = [
  { value: 'carrossel', label: 'Carrossel' },
  { value: 'reels', label: 'Reels' },
  { value: 'post', label: 'Post' },
  { value: 'story', label: 'Story' },
  { value: 'carrossel_stories', label: 'Carrossel/Stories' },
]
const STATUSES = [
  { value: 'estrategia',                 label: 'Estratégia' },
  { value: 'aguardando_aprovacao_crono', label: 'Ag. aprovação crono' },
  { value: 'captacao',                   label: 'Captação' },
  { value: 'producao',                   label: 'Produção' },
  { value: 'revisao_interna',            label: 'Revisão interna' },
  { value: 'aguardando_aprovacao',       label: 'Aguardando aprovação' },
  { value: 'ajuste',                     label: 'Ajuste solicitado' },
  { value: 'aprovado',                   label: 'Aprovado' },
  { value: 'agendado',                   label: 'Agendado' },
  { value: 'publicado',                  label: 'Publicado' },
]
const STATUS_LABEL: Record<string,string> = Object.fromEntries(STATUSES.map(s => [s.value, s.label]))
const TYPE_LABEL: Record<string,string> = { reels:'Reels', carrossel:'Carrossel', post:'Post', story:'Story', carrossel_stories:'Carrossel/Stories' }
const typeColor: Record<string,string> = {
  reels: 'bg-[var(--ds-error-bg)] text-[var(--ds-error-text)]',
  carrossel: 'bg-[var(--ds-info-bg)] text-[var(--ds-info-text)]',
  story: 'bg-[var(--ds-purple-bg)] text-[var(--ds-purple-text)]',
  carrossel_stories: 'bg-[var(--ds-purple-bg)] text-[var(--ds-purple-text)]',
  post: 'bg-[var(--ds-caution-bg)] text-[var(--ds-caution-text)]',
}
const statusColor: Record<string,string> = {
  estrategia: 'bg-[var(--color-bg-subtle)] text-[var(--color-text-secondary)]',
  aguardando_aprovacao_crono: 'bg-[var(--ds-purple-bg)] text-[var(--ds-purple-text)]',
  captacao: 'bg-[var(--ds-info-bg)] text-[var(--ds-info-text)]',
  producao: 'bg-[var(--ds-caution-bg)] text-[var(--ds-caution-text)]',
  revisao_interna: 'bg-[#8b5cf6]/10 text-[#8b5cf6]',
  aguardando_aprovacao: 'bg-[var(--ds-purple-bg)] text-[var(--ds-purple-text)]',
  ajuste: 'bg-[var(--ds-error-bg)] text-[var(--ds-error-text)]',
  aprovado: 'bg-[var(--ds-success-bg)] text-[var(--ds-success-text)]',
  agendado: 'bg-[var(--ds-info-bg)] text-[var(--ds-info-text)]',
  publicado: 'bg-[var(--ds-success-bg)] text-[var(--ds-success-text)]',
}

// ─── Types ────────────────────────────────────────────────────────────────────

type Post = MiniPost & {
  post_number: number
  scheduled_date: string | null
  status: string
  funil?: string | null
  campaign_type?: string | null
}

type CronoStatus = { status: string; finalized_at: string | null; finalized_by: string | null } | null

// ─── Props ────────────────────────────────────────────────────────────────────

type Props = {
  clientId: string
  clientName?: string
  clientColor?: string
  month: number
  year: number
  postParam?: string | null
  showViewToggle?: boolean
  onPostsChange?: (count: number) => void
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function CronogramaTab({ clientId, clientName, clientColor, month, year, postParam, showViewToggle = false, onPostsChange }: Props) {
  const { toast } = useToast()
  const { currentMember, members } = useUser()
  const supabase = createClient()

  const [posts, setPosts] = useState<Post[]>([])
  const [campaigns, setCampaigns] = useState<{ id: string; name: string; type: string }[]>([])
  const [cronoStatus, setCronoStatus] = useState<CronoStatus>(null)
  const [loading, setLoading] = useState(true)
  const [togglingStatus, setTogglingStatus] = useState(false)
  const [saving, setSaving] = useState(false)

  const [showPostCard, setShowPostCard] = useState(false)
  const [editingPostId, setEditingPostId] = useState<string | null>(null)

  const [dragId, setDragId] = useState<string | null>(null)
  const [dragOverId, setDragOverId] = useState<string | null>(null)

  const [filterText, setFilterText] = useState('')
  const [filterStatus, setFilterStatus] = useState('')
  const [filterType, setFilterType] = useState('')

  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid')

  const [showApprovalModal, setShowApprovalModal] = useState(false)
  const [approvalLink, setApprovalLink] = useState('')
  const [generatingLink, setGeneratingLink] = useState(false)
  const [aiMessage, setAiMessage] = useState('')
  const [copied, setCopied] = useState(false)

  // deep-link: auto-open post when postParam changes
  const handledPostParam = useRef<string | null>(null)

  useEffect(() => {
    loadPosts()
  }, [clientId, month, year])

  async function loadPosts() {
    setLoading(true)
    const [{ data: postsData }, { data: statusData }, { data: campaignsData }] = await Promise.all([
      supabase.from('schedules')
        .select('id, post_number, title, post_type, status, approval_status, approval_comment, scheduled_date, funil, campaign_type, drive_url, drive_folder_url, reference_images, copy, assigned_members')
        .eq('client_id', clientId).eq('month', month).eq('year', year)
        .order('post_number'),
      supabase.from('cronograma_status')
        .select('status, finalized_at, finalized_by')
        .eq('client_id', clientId).eq('month', month).eq('year', year)
        .maybeSingle(),
      supabase.from('campaigns').select('id, name, type').eq('client_id', clientId),
    ])
    const loaded = postsData || []
    setPosts(loaded)
    setCronoStatus(statusData || null)
    setCampaigns(campaignsData || [])
    onPostsChange?.(loaded.length)

    if (postParam && postParam !== handledPostParam.current && loaded.some((p: any) => p.id === postParam)) {
      handledPostParam.current = postParam
      setEditingPostId(postParam)
      setShowPostCard(true)
    }
    setLoading(false)
  }

  async function toggleFinalized() {
    setTogglingStatus(true)
    const isFinalized = cronoStatus?.status === 'finalizado'
    const { data: existing } = await supabase.from('cronograma_status').select('id')
      .eq('client_id', clientId).eq('month', month).eq('year', year).maybeSingle()

    if (isFinalized) {
      const payload = { status: 'rascunho', finalized_at: null, finalized_by: null }
      setCronoStatus(s => s ? { ...s, ...payload } : null)
      const { error } = existing
        ? await supabase.from('cronograma_status').update(payload).eq('client_id', clientId).eq('month', month).eq('year', year)
        : await supabase.from('cronograma_status').insert({ client_id: clientId, month, year, ...payload })
      if (error) { toast(`Erro ao reabrir: ${error.message}`); setTogglingStatus(false); return }
      toast('Cronograma reaberto')
    } else {
      const by = currentMember?.name || null
      const payload = { status: 'finalizado', finalized_at: new Date().toISOString(), finalized_by: by }
      setCronoStatus(payload)
      const { error } = existing
        ? await supabase.from('cronograma_status').update(payload).eq('client_id', clientId).eq('month', month).eq('year', year)
        : await supabase.from('cronograma_status').insert({ client_id: clientId, month, year, ...payload })
      if (error) { toast(`Erro ao finalizar: ${error.message}`); setTogglingStatus(false); return }
      toast('Cronograma marcado como finalizado!')
    }
    setTogglingStatus(false)
  }

  async function sendToCriacao(postId: string) {
    const { error } = await supabase.from('schedules').update({ status: 'producao' }).eq('id', postId)
    if (error) { toast('Erro ao enviar pra Criação'); return }
    setPosts(prev => prev.map(p => p.id === postId ? { ...p, status: 'producao' } : p))
    toast('Post enviado pra Criação!')
  }

  async function duplicatePost(post: Post) {
    const { title, copy, post_type, drive_url, reference_notes, funil, campaign_type } = post as any
    const { data, error } = await supabase.from('schedules').insert({
      client_id: clientId, month, year,
      post_number: posts.length + 1,
      title: `${title} (cópia)`, copy, post_type, drive_url, reference_notes,
      funil, campaign_type,
      status: 'estrategia', scheduled_date: null,
    }).select('id').single()
    if (error) { toast('Erro ao duplicar post'); return }
    if (data) await logActivity({ tableName: 'schedules', recordId: data.id, clientId, action: 'created', actorName: currentMember?.name, description: `${currentMember?.name || 'Alguém'} criou "${title} (cópia)" (duplicado)` })
    await loadPosts()
    toast('Post duplicado!')
  }

  async function reorderPosts(targetId: string) {
    const from = posts.findIndex(p => p.id === dragId)
    const to   = posts.findIndex(p => p.id === targetId)
    setDragId(null); setDragOverId(null)
    if (from < 0 || to < 0 || from === to) return
    const arr = [...posts]
    const [moved] = arr.splice(from, 1)
    arr.splice(to, 0, moved)
    const renumbered = arr.map((p, i) => ({ ...p, post_number: i + 1 }))
    const prev = posts
    setPosts(renumbered)
    const changed = renumbered.filter(p => prev.find(o => o.id === p.id)?.post_number !== p.post_number)
    const results = await Promise.all(changed.map(p => supabase.from('schedules').update({ post_number: p.post_number }).eq('id', p.id)))
    const err = results.find(r => r.error)?.error
    if (err) { setPosts(prev); dbError(err, toast, 'reordenar') }
  }

  async function generateApprovalLink(type: 'cronograma' | 'final') {
    setGeneratingLink(true)
    const typeLabel = type === 'cronograma' ? 'cronograma' : 'conteúdo final'
    const monthLabel = CRONO_MONTHS[month - 1]

    if (type === 'cronograma') {
      const targets = posts.filter(p => p.status === 'estrategia')
      if (targets.length > 0) {
        await Promise.all(targets.map(p => supabase.from('schedules').update({ status: 'aguardando_aprovacao_crono', approval_status: null, approval_comment: null }).eq('id', p.id)))
        setPosts(prev => prev.map(p => targets.find(t => t.id === p.id) ? { ...p, status: 'aguardando_aprovacao_crono', approval_status: null, approval_comment: null } : p))
      }
    } else {
      const targets = posts.filter(p => p.status === 'revisao_interna')
      if (targets.length > 0) {
        await Promise.all(targets.map(p => supabase.from('schedules').update({ status: 'aguardando_aprovacao', approval_status: null, approval_comment: null }).eq('id', p.id)))
        setPosts(prev => prev.map(p => targets.find(t => t.id === p.id) ? { ...p, status: 'aguardando_aprovacao', approval_status: null, approval_comment: null } : p))
      }
    }

    const { data: existing } = await supabase.from('approval_tokens').select('token')
      .eq('client_id', clientId).eq('month', month).eq('year', year).eq('type', type).maybeSingle()
    const token = existing?.token || (
      await supabase.from('approval_tokens').insert({ client_id: clientId, month, year, type }).select('token').single()
    ).data?.token

    const link = `${window.location.origin}/aprovar/${token}`
    setApprovalLink(link)
    setAiMessage(`Olá! 👋 O ${typeLabel} de ${monthLabel} para ${clientName || 'vocês'} está pronto para aprovação.\n\nAcesse o link abaixo para revisar e aprovar:\n${link}`)
    setGeneratingLink(false)
  }

  async function openApprovalModal(type: 'cronograma' | 'final') {
    setShowApprovalModal(true); setApprovalLink(''); setAiMessage('')
    await generateApprovalLink(type)
  }

  function copyLink() { navigator.clipboard.writeText(approvalLink); setCopied(true); setTimeout(() => setCopied(false), 2000) }
  function openWhatsApp() { window.open(`https://wa.me/?text=${encodeURIComponent(aiMessage || approvalLink)}`, '_blank') }

  // ─── Render ─────────────────────────────────────────────────────────────────

  if (loading) return (
    <div className="flex items-center justify-center py-20">
      <div className="w-5 h-5 border-2 border-[var(--color-border)] border-t-[var(--color-text-primary)] rounded-full animate-spin" />
    </div>
  )

  const visiblePosts = posts.filter(p => {
    if (filterStatus && p.status !== filterStatus) return false
    if (filterType && p.post_type !== filterType) return false
    if (filterText && !p.title.toLowerCase().includes(filterText.toLowerCase()) && !(p.copy || '').toLowerCase().includes(filterText.toLowerCase())) return false
    return true
  })
  const hasFilter = !!(filterStatus || filterType || filterText)
  const isFinalized = cronoStatus?.status === 'finalizado'
  const estrategiaPosts = posts.filter(p => p.status === 'estrategia')
  const revisaoPosts = posts.filter(p => p.status === 'revisao_interna')

  return (
    <>
      {/* Barra contextual */}
      {posts.length > 0 && (
        <div className="flex items-center gap-3 flex-wrap py-3 border-b border-[var(--color-border)] bg-[var(--color-bg-subtle)] px-1 rounded-xl mb-2">
          {estrategiaPosts.length > 0 && (
            <div className="flex items-center gap-2">
              <span className="text-xs text-[var(--color-text-muted)] font-medium">{estrategiaPosts.length} em estratégia →</span>
              <button onClick={() => openApprovalModal('cronograma')}
                className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-xl border transition-all hover:opacity-90"
                style={{ borderColor: 'var(--ds-purple-border,var(--color-border))', color: 'var(--ds-purple-text)', background: 'var(--ds-purple-bg)' }}>
                <ClipboardCheck size={12} /> Aprovar crono
              </button>
              <button onClick={async () => {
                setSaving(true)
                await Promise.all(estrategiaPosts.map(p => supabase.from('schedules').update({ status: 'producao' }).eq('id', p.id)))
                setPosts(prev => prev.map(p => estrategiaPosts.find(ep => ep.id === p.id) ? { ...p, status: 'producao' } : p))
                setSaving(false)
                toast(`${estrategiaPosts.length} post${estrategiaPosts.length !== 1 ? 's' : ''} enviado${estrategiaPosts.length !== 1 ? 's' : ''} para Criação!`)
              }} disabled={saving}
                className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-xl border transition-all hover:opacity-90 disabled:opacity-50"
                style={{ borderColor: '#f59e0b66', color: '#b45309', background: '#f59e0b18' }}>
                <Zap size={12} /> Direto pra Criação
              </button>
            </div>
          )}
          {estrategiaPosts.length > 0 && revisaoPosts.length > 0 && <div className="w-px h-4 bg-[var(--color-border)]" />}
          {revisaoPosts.length > 0 && (
            <div className="flex items-center gap-2">
              <span className="text-xs text-[var(--color-text-muted)] font-medium">{revisaoPosts.length} em revisão →</span>
              <button onClick={() => openApprovalModal('final')}
                className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-xl border transition-all hover:opacity-90"
                style={{ borderColor: 'var(--ds-success-border,var(--color-border))', color: 'var(--ds-success-text)', background: 'var(--ds-success-bg)' }}>
                <ClipboardCheck size={12} /> Aprovação final
              </button>
            </div>
          )}
          <div className="ml-auto flex items-center gap-2">
            {showViewToggle && (
              <div className="flex items-center bg-[var(--color-bg-card)] border border-[var(--color-border)] rounded-lg p-0.5">
                <button onClick={() => setViewMode('list')} className={`px-2.5 py-1 rounded-md text-xs font-medium transition-all ${viewMode==='list'?'bg-[var(--color-text-primary)] text-[var(--color-bg-page)]':'text-[var(--color-text-muted)]'}`}>Lista</button>
                <button onClick={() => setViewMode('grid')} className={`px-2.5 py-1 rounded-md text-xs font-medium transition-all ${viewMode==='grid'?'bg-[var(--color-text-primary)] text-[var(--color-bg-page)]':'text-[var(--color-text-muted)]'}`}>Cards</button>
              </div>
            )}
            {isFinalized && (
              <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-xl border" style={{ background: 'var(--ds-success-bg)', borderColor: 'var(--ds-success-border)' }}>
                <Check size={11} style={{ color: 'var(--ds-success-accent)' }} strokeWidth={2.5} />
                <span className="text-xs font-semibold" style={{ color: 'var(--ds-success-text)' }}>
                  Finalizado{cronoStatus?.finalized_by ? ` · ${cronoStatus.finalized_by.split(' ')[0]}` : ''}
                </span>
              </div>
            )}
            <button onClick={toggleFinalized} disabled={togglingStatus}
              className="flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-xl border transition-all disabled:opacity-50"
              style={isFinalized
                ? { borderColor: 'var(--ds-success-border)', color: 'var(--ds-success-text)', background: 'var(--ds-success-bg)' }
                : { borderColor: 'var(--color-border)', color: 'var(--color-text-muted)' }}>
              <Check size={11} strokeWidth={2.5} />
              {isFinalized ? 'Reabrir' : 'Marcar finalizado'}
            </button>
          </div>
        </div>
      )}

      {posts.length === 0 ? (
        <div className="flex flex-col items-center justify-center min-h-[360px] text-center gap-6">
          <div className="relative">
            <div className="w-20 h-20 rounded-3xl bg-[var(--color-bg-card)] border border-[var(--color-border)] flex items-center justify-center text-4xl shadow-sm">📅</div>
            <div className="absolute -bottom-1 -right-1 w-7 h-7 rounded-full flex items-center justify-center text-white text-sm font-bold shadow-md" style={{ background: clientColor || 'var(--color-brand)' }}>+</div>
          </div>
          <div className="flex flex-col gap-1.5">
            <p className="text-[var(--color-text-primary)] font-semibold text-lg">Nenhum post em {CRONO_MONTHS[month - 1]}</p>
            <p className="text-[var(--color-text-muted)] text-sm max-w-xs">Adicione o primeiro post do mês para montar o cronograma.</p>
          </div>
          <button onClick={() => { setEditingPostId(null); setShowPostCard(true) }}
            className="flex items-center gap-2 font-semibold px-6 py-3 rounded-xl text-sm transition-opacity hover:opacity-90 shadow-sm text-white"
            style={{ background: clientColor || 'var(--color-brand)' }}>
            Criar primeiro post
          </button>
        </div>
      ) : (
        <>
          {/* Barra de filtros */}
          <div className="flex items-center gap-2 flex-wrap mb-5">
            <div className="relative flex-1 min-w-[160px] max-w-xs">
              <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--color-text-muted)] pointer-events-none" />
              <input value={filterText} onChange={e => setFilterText(e.target.value)} placeholder="Buscar título ou copy..."
                className="w-full pl-8 pr-3 py-1.5 text-sm rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-card)] outline-none text-[var(--color-text-primary)] placeholder-[var(--color-text-muted)]" />
            </div>
            <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)}
              className="text-xs rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-card)] px-2.5 py-1.5 text-[var(--color-text-secondary)] outline-none cursor-pointer">
              <option value="">Todos os status</option>
              {STATUSES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
            </select>
            <select value={filterType} onChange={e => setFilterType(e.target.value)}
              className="text-xs rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-card)] px-2.5 py-1.5 text-[var(--color-text-secondary)] outline-none cursor-pointer">
              <option value="">Todos os tipos</option>
              {POST_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
            {hasFilter && (
              <>
                <button onClick={() => { setFilterText(''); setFilterStatus(''); setFilterType('') }}
                  className="flex items-center gap-1 text-xs text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] transition-colors">
                  <X size={11} /> Limpar
                </button>
                <span className="text-xs text-[var(--color-text-muted)] ml-auto">{visiblePosts.length} de {posts.length} posts</span>
              </>
            )}
            <button onClick={() => { setEditingPostId(null); setShowPostCard(true) }}
              className="ml-auto flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-xl text-white transition-opacity hover:opacity-90"
              style={{ background: clientColor || 'var(--color-brand)' }}>
              + Novo post
            </button>
          </div>

          {visiblePosts.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 gap-3 text-center">
              <p className="text-[var(--color-text-primary)] font-semibold">Nenhum post encontrado</p>
              <p className="text-[var(--color-text-muted)] text-sm">Tente ajustar os filtros.</p>
            </div>
          ) : viewMode === 'list' ? (
            <div className="flex flex-col gap-2">
              {visiblePosts.map(post => {
                const campaign = campaigns.find(c => c.type === post.campaign_type)
                return (
                  <button key={post.id} onClick={() => { setEditingPostId(post.id); setShowPostCard(true) }}
                    className="w-full text-left bg-[var(--color-bg-card)] border border-[var(--color-border)] rounded-xl px-4 py-3 flex items-center gap-4 hover:border-[var(--color-border-hover)] transition-all"
                    style={{ borderLeftWidth: 3, borderLeftColor: clientColor || 'var(--color-brand)' }}>
                    <span className="text-xs font-bold text-[var(--color-text-muted)] w-8">#{post.post_number}</span>
                    <span className={`text-xs font-semibold px-2 py-1 rounded-full w-28 text-center flex-shrink-0 ${typeColor[post.post_type] || 'bg-[var(--color-bg-subtle)] text-[var(--color-text-secondary)]'}`}>
                      {TYPE_LABEL[post.post_type] || post.post_type || '—'}
                    </span>
                    <span className="text-sm font-medium text-[var(--color-text-primary)] flex-1 truncate">{post.title}</span>
                    {campaign && <span className="text-[10px] font-semibold px-2 py-0.5 rounded-md flex-shrink-0" style={{ background: 'var(--ds-info-bg)', color: 'var(--ds-info-text)' }}>📣 {campaign.name}</span>}
                    <span className="text-xs text-[var(--color-text-muted)] flex-shrink-0">
                      {post.scheduled_date ? new Date(post.scheduled_date + 'T12:00:00').toLocaleDateString('pt-BR', { day:'2-digit', month:'short' }) : '—'}
                    </span>
                    <div className="flex items-center gap-1 flex-shrink-0">
                      {post.approval_status === 'não aprovado' && <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full" style={{ background: 'var(--ds-error-bg)', color: 'var(--ds-error-text)' }}>✗</span>}
                      {post.approval_status === 'aprovado' && <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full" style={{ background: 'var(--ds-success-bg)', color: 'var(--ds-success-text)' }}>✓</span>}
                      <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${statusColor[post.status] || 'bg-[var(--color-bg-subtle)] text-[var(--color-text-secondary)]'}`}>
                        {STATUS_LABEL[post.status] || post.status}
                      </span>
                    </div>
                  </button>
                )
              })}
            </div>
          ) : (
            <div className="grid grid-cols-3 gap-4">
              {visiblePosts.map(post => (
                <PostMiniCard
                  key={post.id}
                  post={post}
                  clientColor={clientColor}
                  members={members}
                  campaignName={campaigns.find(c => c.type === post.campaign_type)?.name || null}
                  onClick={() => { setEditingPostId(post.id); setShowPostCard(true) }}
                  onDuplicate={() => duplicatePost(post)}
                  onSendToCriacao={() => sendToCriacao(post.id)}
                  draggable={!hasFilter}
                  dragging={dragId === post.id}
                  dragOver={dragOverId === post.id && dragId !== post.id}
                  onDragStart={() => setDragId(post.id)}
                  onDragEnd={() => { setDragId(null); setDragOverId(null) }}
                  onDragOver={e => { e.preventDefault(); if (dragOverId !== post.id) setDragOverId(post.id) }}
                  onDrop={() => reorderPosts(post.id)}
                />
              ))}
            </div>
          )}
        </>
      )}

      {/* PostCard modal */}
      {showPostCard && (
        <PostCard
          postId={editingPostId || undefined}
          clientId={clientId}
          clientName={clientName}
          clientColor={clientColor}
          month={month}
          year={year}
          postNumber={editingPostId ? undefined : posts.length + 1}
          onClose={() => { setShowPostCard(false); setEditingPostId(null) }}
          onSaved={loadPosts}
          onDeleted={loadPosts}
        />
      )}

      {/* Modal aprovação */}
      {showApprovalModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-[var(--color-bg-card)] rounded-2xl shadow-xl w-full max-w-lg mx-4 flex flex-col max-h-[90vh]">
            <div className="p-5 border-b border-[var(--color-border)] flex items-center justify-between">
              <div>
                <h2 className="text-sm font-semibold text-[var(--color-text-primary)]">Enviar para aprovação</h2>
                <p className="text-xs text-[var(--color-text-muted)] mt-0.5">{clientName} · {CRONO_MONTHS[month - 1]} {year}</p>
              </div>
              <button onClick={() => setShowApprovalModal(false)} className="text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] text-lg leading-none">×</button>
            </div>
            <div className="flex-1 overflow-y-auto p-5 flex flex-col gap-4">
              {generatingLink ? (
                <div className="flex items-center justify-center py-8"><p className="text-sm text-[var(--color-text-muted)]">Gerando link...</p></div>
              ) : (
                <>
                  <div className="bg-[var(--color-bg-input)] rounded-xl p-3"><span className="text-xs text-[var(--color-text-secondary)] break-all">{approvalLink}</span></div>
                  <div className="border border-[var(--color-border)] rounded-xl p-4 flex flex-col gap-3">
                    <div className="flex items-center gap-2">
                      <span className="w-6 h-6 rounded-full bg-[var(--color-text-primary)] text-white text-xs flex items-center justify-center font-bold flex-shrink-0">1</span>
                      <div><p className="text-sm font-semibold text-[var(--color-text-primary)]">Copiar link e enviar manualmente</p><p className="text-xs text-[var(--color-text-muted)]">Cole no WhatsApp, e-mail ou onde preferir</p></div>
                    </div>
                    <button onClick={copyLink} className="w-full py-2.5 rounded-xl border border-[var(--color-text-primary)] text-sm font-semibold text-[var(--color-text-primary)] hover:bg-[var(--color-bg-subtle)] flex items-center justify-center gap-2">
                      <Copy size={14} />{copied ? 'Copiado!' : 'Copiar link'}
                    </button>
                  </div>
                  <div className="border border-[#25D366] rounded-xl p-4 flex flex-col gap-3">
                    <div className="flex items-center gap-2">
                      <span className="w-6 h-6 rounded-full bg-[#25D366] text-white text-xs flex items-center justify-center font-bold flex-shrink-0">2</span>
                      <div><p className="text-sm font-semibold text-[var(--color-text-primary)]">Enviar pelo WhatsApp</p><p className="text-xs text-[var(--color-text-muted)]">Mensagem gerada — edite se quiser</p></div>
                    </div>
                    <div className="rounded-xl p-3 min-h-[80px]" style={{ background: 'var(--ds-success-bg)' }}>
                      <textarea value={aiMessage} onChange={e => setAiMessage(e.target.value)} rows={5} className="w-full text-xs text-[var(--color-text-primary)] bg-transparent outline-none resize-none" />
                    </div>
                    <button onClick={openWhatsApp} className="w-full py-2.5 rounded-xl bg-[#25D366] text-sm font-semibold text-white hover:bg-[#20BD5A] transition-colors">Abrir WhatsApp</button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  )
}
