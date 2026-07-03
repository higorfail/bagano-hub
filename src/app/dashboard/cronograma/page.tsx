'use client'
// @ts-nocheck

import { useEffect, useState, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import PostCard from '@/components/PostCard'
import PostMiniCard from '@/components/PostMiniCard'
import Button from '@/components/ui/Button'
import { useToast } from '@/lib/ToastContext'
import { dbError } from '@/lib/dbError'
import { Check, Copy, Calendar, Link2, Search, X } from 'lucide-react'
import { useUser } from '@/lib/UserContext'

type Client = { id: string; name: string; color_hex: string }
type Post = {
  id: string; post_number: number; title: string; copy: string
  post_type: string; scheduled_date: string; status: string
  drive_url: string; drive_folder_url: string; reference_notes: string; funil: string
  campaign_type: string; approval_status: string; approval_comment: string
}

const MONTHS = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro']
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
const TYPE_LABEL: Record<string,string> = Object.fromEntries([
  ['reels','Reels'],['carrossel','Carrossel'],['post','Post'],['story','Story'],['carrossel_stories','Carrossel/Stories']
])
const EMPTY_FORM = { title: '', copy: '', post_type: 'carrossel', scheduled_date: '', status: 'estrategia', drive_url: '', reference_notes: '', funil: '' }
const FUNIL_OPTIONS = ['Topo de funil', 'Meio de funil', 'Fundo de funil', 'Institucional', 'Promocional', 'Engajamento', 'Venda']

function ReferenceLinks({ text }: { text: string }) {
  return (
    <div className="flex flex-col gap-1">
      {text.split('\n').map((line, i) =>
        line.startsWith('http') ? (
          <a key={i} href={line} target="_blank" rel="noopener noreferrer" className="text-sm underline break-all" style={{ color: 'var(--ds-info-text)' }}>{line}</a>
        ) : <p key={i} className="text-sm text-[var(--color-text-primary)]">{line}</p>
      )}
    </div>
  )
}

const typeColor: Record<string,string> = {
  'Reels':            'bg-[var(--ds-error-bg)] text-[var(--ds-error-text)]',
  'Carrossel':        'bg-[var(--ds-info-bg)] text-[var(--ds-info-text)]',
  'Story':            'bg-[var(--ds-purple-bg)] text-[var(--ds-purple-text)]',
  'Carrossel/Stories':'bg-[var(--ds-purple-bg)] text-[var(--ds-purple-text)]',
  'Post':             'bg-[var(--ds-caution-bg)] text-[var(--ds-caution-text)]',
}
const typeAccent: Record<string,string> = {
  reels: '#ef4444', carrossel: '#3b82f6', post: '#f59e0b',
  story: '#8b5cf6', carrossel_stories: '#6366f1',
}
const statusColor: Record<string,string> = {
  estrategia:                  'bg-[var(--color-bg-subtle)] text-[var(--color-text-secondary)]',
  aguardando_aprovacao_crono:  'bg-[var(--ds-purple-bg)] text-[var(--ds-purple-text)]',
  captacao:                    'bg-[var(--ds-info-bg)] text-[var(--ds-info-text)]',
  producao:                    'bg-[var(--ds-caution-bg)] text-[var(--ds-caution-text)]',
  revisao_interna:             'bg-[#8b5cf6]/10 text-[#8b5cf6]',
  aguardando_aprovacao:        'bg-[var(--ds-purple-bg)] text-[var(--ds-purple-text)]',
  ajuste:                      'bg-[var(--ds-error-bg)] text-[var(--ds-error-text)]',
  aprovado:                    'bg-[var(--ds-success-bg)] text-[var(--ds-success-text)]',
  agendado:                    'bg-[var(--ds-info-bg)] text-[var(--ds-info-text)]',
  publicado:                   'bg-[var(--ds-success-bg)] text-[var(--ds-success-text)]',
}

type CronoStatus = { status: string; finalized_at: string | null; finalized_by: string | null } | null

function CronogramaPageInner() {
  const { toast } = useToast()
  const { currentMember } = useUser()
  const [clients, setClients] = useState<Client[]>([])
  const [posts, setPosts] = useState<Post[]>([])
  const [campaigns, setCampaigns] = useState<{ id: string; name: string; type: string }[]>([])
  const [cronoStatus, setCronoStatus] = useState<CronoStatus>(null)
  const [togglingStatus, setTogglingStatus] = useState(false)
  const searchParams = useSearchParams()
  const clientParam = searchParams.get('client')
  const postParam   = searchParams.get('post')
  const syncKey     = `${clientParam}|${postParam}|${searchParams.get('m')}|${searchParams.get('y')}`
  const [selectedClient, setSelectedClient] = useState<string>('')
  const [selectedMonth, setSelectedMonth] = useState(() => {
    const m = parseInt(searchParams.get('m') || '')
    return !isNaN(m) && m >= 1 && m <= 12 ? m : new Date().getMonth() + 1
  })
  const [selectedYear, setSelectedYear] = useState(() => {
    const y = parseInt(searchParams.get('y') || '')
    return !isNaN(y) && y > 2000 ? y : new Date().getFullYear()
  })
  const [showMonthPicker, setShowMonthPicker] = useState(false)
  const [selected, setSelected] = useState<Post | null>(null)
  const [loading,   setLoading]   = useState(true)
  const [loadError, setLoadError] = useState(false)
  const [showPostCard,  setShowPostCard]  = useState(false)
  const [editingPostId, setEditingPostId] = useState<string | null>(null)
  const [dragId,     setDragId]     = useState<string | null>(null)
  const [dragOverId, setDragOverId] = useState<string | null>(null)
  const [showApprovalModal, setShowApprovalModal] = useState(false)
  const [approvalLink, setApprovalLink] = useState('')
  const [generatingLink, setGeneratingLink] = useState(false)
  const [aiMessage, setAiMessage] = useState('')
  const [loadingAi, setLoadingAi] = useState(false)
  const [copied, setCopied] = useState(false)
  const [saving, setSaving] = useState(false)
  const [filterStatus, setFilterStatus] = useState('')
  const [filterType,   setFilterType]   = useState('')
  const [filterText,   setFilterText]   = useState('')

  useEffect(() => {
    const cl = clients.find(c => c.id === selectedClient)
    document.title = cl ? `Cronograma · ${cl.name} · Bagano Hub` : 'Cronograma · Bagano Hub'
  }, [clients, selectedClient, selectedMonth, selectedYear])

  useEffect(() => {
    async function loadClients() {
      try {
        const supabase = createClient()
        const { data, error } = await supabase.from('clients').select('id, name, color_hex').eq('status', 'active').order('name')
        if (error) { setLoadError(true); setLoading(false); return }
        setClients(data || [])
        if (clientParam && data?.some(c => c.id === clientParam)) {
          setSelectedClient(clientParam)
          // If a specific post was requested, PostCard will be opened after loadPosts runs
          if (!postParam) setTimeout(() => setShowPostCard(true), 100)
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

  // Sync client/month/year whenever URL params change (notification click while already on this page)
  useEffect(() => {
    if (!clientParam || !clients.length) return
    const m = parseInt(searchParams.get('m') || '')
    const y = parseInt(searchParams.get('y') || '')
    if (!isNaN(m) && m >= 1 && m <= 12) setSelectedMonth(m)
    if (!isNaN(y) && y > 2000) setSelectedYear(y)
    if (clientParam !== selectedClient && clients.some(c => c.id === clientParam)) {
      setSelectedClient(clientParam)
      if (!postParam) setTimeout(() => setShowPostCard(true), 100)
    }
  }, [syncKey, clients])

  useEffect(() => {
    if (!selectedClient) return
    loadPosts()
  }, [selectedClient, selectedMonth, selectedYear])

  async function loadPosts() {
    const supabase = createClient()
    const [{ data: postsData }, { data: statusData }, { data: campaignsData }] = await Promise.all([
      supabase.from('schedules').select('*').eq('client_id', selectedClient).eq('month', selectedMonth).eq('year', selectedYear).order('post_number'),
      supabase.from('cronograma_status').select('status, finalized_at, finalized_by').eq('client_id', selectedClient).eq('month', selectedMonth).eq('year', selectedYear).maybeSingle(),
      supabase.from('campaigns').select('id, name, type').eq('client_id', selectedClient),
    ])
    setPosts(postsData || [])
    setCronoStatus(statusData || null)
    setCampaigns(campaignsData || [])
    // Auto-open specific post from ?post= param (e.g. from notification link)
    if (postParam && postsData?.some(p => p.id === postParam)) {
      setEditingPostId(postParam)
      setShowPostCard(true)
    }
  }

  async function toggleFinalized() {
    if (!selectedClient) return
    setTogglingStatus(true)
    const supabase = createClient()
    const isFinalized = cronoStatus?.status === 'finalizado'

    if (isFinalized) {
      // Optimistic update first
      setCronoStatus(s => s ? { ...s, status: 'rascunho', finalized_at: null, finalized_by: null } : null)
      toast('Cronograma reaberto')
      const { error } = await supabase
        .from('cronograma_status')
        .update({ status: 'rascunho', finalized_at: null, finalized_by: null })
        .eq('client_id', selectedClient).eq('month', selectedMonth).eq('year', selectedYear)
      if (error) toast('Erro ao salvar no banco — crie a tabela cronograma_status')
    } else {
      const by = currentMember?.name || null
      const newStatus: CronoStatus = { status: 'finalizado', finalized_at: new Date().toISOString(), finalized_by: by }
      // Optimistic update first
      setCronoStatus(newStatus)
      toast('Cronograma marcado como finalizado!')
      const { error } = await supabase
        .from('cronograma_status')
        .upsert(
          { client_id: selectedClient, month: selectedMonth, year: selectedYear, ...newStatus },
          { onConflict: 'client_id,month,year' }
        )
      if (error) toast('Erro ao salvar no banco — crie a tabela cronograma_status')
    }
    setTogglingStatus(false)
  }

  async function duplicatePost(post: Post) {
    const supabase = createClient()
    const { title, copy, post_type, drive_url, reference_notes } = post
    await supabase.from('schedules').insert({
      client_id: selectedClient, month: selectedMonth, year: selectedYear,
      post_number: posts.length + 1,
      title: `${title} (cópia)`, copy, post_type, drive_url, reference_notes,
      status: 'estrategia', scheduled_date: null,
    })
    await loadPosts()
    toast('Post duplicado!')
  }

  // Reordena arrastando + renumera os posts (#1, #2, …) e persiste
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
    const supabase = createClient()
    const changed = renumbered.filter(p => prev.find(o => o.id === p.id)?.post_number !== p.post_number)
    const results = await Promise.all(changed.map(p => supabase.from('schedules').update({ post_number: p.post_number }).eq('id', p.id)))
    const err = results.find(r => r.error)?.error
    if (err) { setPosts(prev); dbError(err, toast, 'reordenar') }
  }

  async function generateApprovalLink(type: 'cronograma' | 'final') {
    setGeneratingLink(true)
    const supabase = createClient()
    const cl = clients.find(c => c.id === selectedClient)
    const month = MONTHS[selectedMonth - 1]

    if (type === 'cronograma') {
      const estrategiaPosts = posts.filter(p => p.status === 'estrategia')
      if (estrategiaPosts.length > 0) {
        await Promise.all(estrategiaPosts.map(p =>
          supabase.from('schedules').update({ status: 'aguardando_aprovacao_crono', approval_status: null, approval_comment: null }).eq('id', p.id)
        ))
        setPosts(prev => prev.map(p => estrategiaPosts.find(ep => ep.id === p.id) ? { ...p, status: 'aguardando_aprovacao_crono', approval_status: null, approval_comment: null } : p))
      }
    } else {
      const revisaoPosts = posts.filter(p => p.status === 'revisao_interna')
      if (revisaoPosts.length > 0) {
        await Promise.all(revisaoPosts.map(p =>
          supabase.from('schedules').update({ status: 'aguardando_aprovacao', approval_status: null, approval_comment: null }).eq('id', p.id)
        ))
        setPosts(prev => prev.map(p => revisaoPosts.find(rp => rp.id === p.id) ? { ...p, status: 'aguardando_aprovacao', approval_status: null, approval_comment: null } : p))
      }
    }

    // Get or create token for this type
    const { data: existing } = await supabase
      .from('approval_tokens').select('token')
      .eq('client_id', selectedClient).eq('month', selectedMonth).eq('year', selectedYear).eq('type', type)
      .maybeSingle()
    const token = existing?.token || (
      await supabase.from('approval_tokens')
        .insert({ client_id: selectedClient, month: selectedMonth, year: selectedYear, type })
        .select('token').single()
    ).data?.token

    const link = `${window.location.origin}/aprovar/${token}`
    setApprovalLink(link)
    setGeneratingLink(false)

    const typeLabel = type === 'cronograma' ? 'cronograma' : 'conteúdo final'
    setAiMessage(`Olá! 👋 O ${typeLabel} de ${month} para ${cl?.name} está pronto para aprovação.\n\nAcesse o link abaixo para revisar e aprovar:\n${link}`)
  }

  async function openApprovalModal(type: 'cronograma' | 'final') {
    setShowApprovalModal(true); setApprovalLink(''); setAiMessage('')
    await generateApprovalLink(type)
  }
  function copyLink() { navigator.clipboard.writeText(approvalLink); setCopied(true); setTimeout(() => setCopied(false), 2000) }
  function openWhatsApp() { window.open(`https://wa.me/?text=${encodeURIComponent(aiMessage || approvalLink)}`, '_blank') }

  const client = clients.find(c => c.id === selectedClient)
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

  return (
    <div className="flex h-full">
      <div className="flex-1 flex flex-col overflow-hidden">
        <div className="p-6 border-b border-[var(--color-border)] flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3">
            <div>
              <h1 className="text-2xl font-bold text-[var(--color-text-primary)] tracking-tight">Cronograma</h1>
              <p className="text-[var(--color-text-muted)] text-sm mt-0.5">{posts.length} posts · {MONTHS[selectedMonth-1]} {selectedYear}</p>
            </div>
            {/* Finalizado badge */}
            {cronoStatus?.status === 'finalizado' && (
              <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border" style={{ background: 'var(--ds-success-bg)', borderColor: 'var(--ds-success-border)' }}>
                <Check size={13} style={{ color: 'var(--ds-success-accent)' }} strokeWidth={2.5} />
                <span className="text-xs font-semibold" style={{ color: 'var(--ds-success-text)' }}>
                  Finalizado{cronoStatus.finalized_by ? ` por ${cronoStatus.finalized_by.split(' ')[0]}` : ''}
                </span>
              </div>
            )}
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <select value={selectedClient} onChange={e => { setSelectedClient(e.target.value); setSelected(null) }} className="border border-[var(--color-border)] rounded-xl px-3 py-2 text-sm text-[var(--color-text-primary)] bg-[var(--color-bg-card)] outline-none">
              {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
            <div className="relative">
              <button onClick={() => setShowMonthPicker(v => !v)} className="flex items-center gap-2 px-3 py-2 rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-card)] hover:border-[var(--color-border-hover)] transition-all text-sm font-medium text-[var(--color-text-primary)]">
                {MONTHS[selectedMonth-1]} {selectedYear}
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="text-[var(--color-text-muted)]"><polyline points="6 9 12 15 18 9"/></svg>
              </button>
              {showMonthPicker && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setShowMonthPicker(false)} />
                  <div className="absolute right-0 top-11 z-50 bg-[var(--color-bg-card)] rounded-2xl border border-[var(--color-border)] p-4 w-64 animate-scale-in">
                    <div className="flex items-center justify-between mb-3">
                      <button onClick={() => setSelectedYear(y => y-1)} className="w-7 h-7 rounded-xl hover:bg-[var(--color-bg-subtle)] flex items-center justify-center text-[var(--color-text-secondary)]">‹</button>
                      <span className="text-sm font-semibold text-[var(--color-text-primary)]">{selectedYear}</span>
                      <button onClick={() => setSelectedYear(y => y+1)} className="w-7 h-7 rounded-xl hover:bg-[var(--color-bg-subtle)] flex items-center justify-center text-[var(--color-text-secondary)]">›</button>
                    </div>
                    <div className="grid grid-cols-3 gap-1.5">
                      {MONTHS.map((m, i) => (
                        <button
                          key={m}
                          onClick={() => { setSelectedMonth(i+1); setShowMonthPicker(false) }}
                          className={`py-2 rounded-xl text-xs font-medium transition-colors ${selectedMonth === i+1 ? 'bg-[var(--color-text-primary)] text-white' : 'text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-subtle)]'}`}
                        >
                          {m.slice(0,3)}
                        </button>
                      ))}
                    </div>
                  </div>
                </>
              )}
            </div>
            {/* Toggle finalizado */}
            {posts.length > 0 && (
              <button
                onClick={toggleFinalized}
                disabled={togglingStatus}
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl border text-sm font-medium transition-all disabled:opacity-50"
                style={cronoStatus?.status === 'finalizado' ? { borderColor: 'var(--ds-success-border)', color: 'var(--ds-success-text)', background: 'var(--ds-success-bg)' } : { borderColor: 'var(--color-border)', color: 'var(--color-text-secondary)' }}
              >
                <Check size={13} strokeWidth={2.5} />
                {cronoStatus?.status === 'finalizado' ? 'Reabrir' : 'Marcar finalizado'}
              </button>
            )}
            {(() => {
              const cronoPosts  = posts.filter(p => p.status === 'estrategia' || p.status === 'aguardando_aprovacao_crono')
              const finalPosts  = posts.filter(p => p.status === 'revisao_interna' || p.status === 'aguardando_aprovacao')
              return (<>
                <button
                  onClick={() => openApprovalModal('cronograma')}
                  className="border rounded-xl px-4 py-2 text-sm font-medium transition-all hover:opacity-90"
                  style={{ borderColor: 'var(--ds-purple-border,var(--color-border))', color: 'var(--ds-purple-text)', background: 'var(--ds-purple-bg)' }}
                  title={cronoPosts.length === 0 ? 'Nenhum post em estratégia para enviar' : `${cronoPosts.length} post${cronoPosts.length !== 1 ? 's' : ''} para aprovação de cronograma`}
                >
                  📋 Aprovar cronograma{cronoPosts.length > 0 && <span className="ml-1.5 bg-white/30 text-[10px] font-bold rounded-full px-1.5 py-0.5">{cronoPosts.length}</span>}
                </button>
                <button
                  onClick={() => openApprovalModal('final')}
                  className="border rounded-xl px-4 py-2 text-sm font-medium transition-all hover:opacity-90"
                  style={{ borderColor: 'var(--ds-success-border,var(--color-border))', color: 'var(--ds-success-text)', background: 'var(--ds-success-bg)' }}
                  title={finalPosts.length === 0 ? 'Nenhum post em revisão para enviar' : `${finalPosts.length} post${finalPosts.length !== 1 ? 's' : ''} para aprovação final`}
                >
                  ✅ Aprovação final{finalPosts.length > 0 && <span className="ml-1.5 bg-white/30 text-[10px] font-bold rounded-full px-1.5 py-0.5">{finalPosts.length}</span>}
                </button>
              </>)
            })()}
            <Button variant="dark" onClick={() => { setEditingPostId(null); setShowPostCard(true) }}>+ Novo post</Button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          {posts.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full min-h-[420px] text-center gap-6">
              <div className="relative">
                <div className="w-20 h-20 rounded-3xl bg-[var(--color-bg-card)] border border-[var(--color-border)] flex items-center justify-center text-4xl shadow-sm">📅</div>
                <div className="absolute -bottom-1 -right-1 w-7 h-7 rounded-full bg-[var(--color-brand)] flex items-center justify-center text-white text-sm font-bold shadow-md">+</div>
              </div>
              <div className="flex flex-col gap-1.5">
                <p className="text-[var(--color-text-primary)] font-semibold text-lg">Nenhum post em {MONTHS[selectedMonth-1]}</p>
                <p className="text-[var(--color-text-muted)] text-sm max-w-xs">Adicione o primeiro post do mês para montar o cronograma do cliente.</p>
              </div>
              <Button variant="dark" size="lg" onClick={() => setShowPostCard(true)}>Criar primeiro post</Button>
            </div>
          ) : (() => {
            const visiblePosts = posts.filter(p => {
              if (filterStatus && p.status !== filterStatus) return false
              if (filterType && p.post_type !== filterType) return false
              if (filterText && !p.title.toLowerCase().includes(filterText.toLowerCase()) && !(p.copy || '').toLowerCase().includes(filterText.toLowerCase())) return false
              return true
            })
            const hasFilter = filterStatus || filterType || filterText
            return (
              <>
                <div className="flex items-center gap-2 flex-wrap mb-5">
                  <div className="relative flex-1 min-w-[160px] max-w-xs">
                    <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--color-text-muted)] pointer-events-none" />
                    <input
                      value={filterText}
                      onChange={e => setFilterText(e.target.value)}
                      placeholder="Buscar título ou copy..."
                      className="w-full pl-8 pr-3 py-1.5 text-sm rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-card)] outline-none text-[var(--color-text-primary)] placeholder-[var(--color-text-muted)]"
                    />
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
                    <button onClick={() => { setFilterText(''); setFilterStatus(''); setFilterType('') }}
                      className="flex items-center gap-1 text-xs text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] transition-colors">
                      <X size={11} /> Limpar
                    </button>
                  )}
                  {hasFilter && (
                    <span className="text-xs text-[var(--color-text-muted)] ml-auto">
                      {visiblePosts.length} de {posts.length} posts
                    </span>
                  )}
                </div>
                {visiblePosts.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-20 gap-3 text-center">
                    <p className="text-[var(--color-text-primary)] font-semibold">Nenhum post encontrado</p>
                    <p className="text-[var(--color-text-muted)] text-sm">Tente ajustar os filtros.</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-3 gap-4">
                    {visiblePosts.map(post => (
                      <PostMiniCard
                        key={post.id}
                        post={post}
                        clientColor={client?.color_hex}
                        campaignName={campaigns.find(c => c.type === post.campaign_type)?.name || null}
                        selected={selected?.id === post.id}
                        onClick={() => { setEditingPostId(post.id); setShowPostCard(true); window.history.replaceState(null, '', `?client=${selectedClient}&post=${post.id}&m=${selectedMonth}&y=${selectedYear}`) }}
                        onDuplicate={() => duplicatePost(post)}
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
            )
          })()}
        </div>
      </div>

      {/* PostCard modal */}
      {showPostCard && (
        <PostCard
          postId={editingPostId || undefined}
          clientId={selectedClient}
          clientName={client?.name}
          clientColor={client?.color_hex}
          month={selectedMonth}
          year={selectedYear}
          postNumber={editingPostId ? undefined : posts.length + 1}
          onClose={() => { setShowPostCard(false); setEditingPostId(null); window.history.replaceState(null, '', `?client=${selectedClient}&m=${selectedMonth}&y=${selectedYear}`) }}
          onSaved={() => { loadPosts() }}
          onDeleted={() => { loadPosts() }}
        />
      )}

      {/* Modal aprovação */}
      {showApprovalModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-[var(--color-bg-card)] rounded-2xl shadow-xl w-full max-w-lg mx-4 flex flex-col max-h-[90vh]">
            <div className="p-5 border-b border-[var(--color-border)] flex items-center justify-between">
              <div><h2 className="text-sm font-semibold text-[var(--color-text-primary)]">Enviar para aprovação</h2><p className="text-xs text-[var(--color-text-muted)] mt-0.5">{client?.name} · {MONTHS[selectedMonth-1]} {selectedYear}</p></div>
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
                      <Copy size={14} />{copied?'Copiado!':'Copiar link'}
                    </button>
                  </div>
                  <div className="border border-[#25D366] rounded-xl p-4 flex flex-col gap-3">
                    <div className="flex items-center gap-2">
                      <span className="w-6 h-6 rounded-full bg-[#25D366] text-white text-xs flex items-center justify-center font-bold flex-shrink-0">2</span>
                      <div><p className="text-sm font-semibold text-[var(--color-text-primary)]">Enviar pelo WhatsApp</p><p className="text-xs text-[var(--color-text-muted)]">Mensagem gerada por IA — edite se quiser</p></div>
                    </div>
                    <div className="rounded-xl p-3 min-h-[80px]" style={{ background: 'var(--ds-success-bg)' }}>
                      {loadingAi ? <p className="text-xs text-[var(--color-text-muted)]">Gerando mensagem com IA...</p> : <textarea value={aiMessage} onChange={e => setAiMessage(e.target.value)} rows={5} className="w-full text-xs text-[var(--color-text-primary)] bg-transparent outline-none resize-none" />}
                    </div>
                    <button onClick={openWhatsApp} disabled={loadingAi} className="w-full py-2.5 rounded-xl bg-[#25D366] text-sm font-semibold text-white hover:bg-[#20BD5A] disabled:opacity-50 transition-colors">Abrir WhatsApp</button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default function CronogramaPage() {
  return <Suspense><CronogramaPageInner /></Suspense>
}
