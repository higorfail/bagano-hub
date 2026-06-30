'use client'
// @ts-nocheck

import { useEffect, useState, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import PostCard from '@/components/PostCard'
import Button from '@/components/ui/Button'
import { useToast } from '@/lib/ToastContext'
import { Check, Copy, Calendar, Link2 } from 'lucide-react'
import { useUser } from '@/lib/UserContext'

type Client = { id: string; name: string; color_hex: string }
type Post = {
  id: string; post_number: number; title: string; copy: string
  post_type: string; scheduled_date: string; status: string
  drive_url: string; reference_notes: string; funil: string
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
  { value: 'producao', label: 'Produção' },
  { value: 'revisao_interna', label: 'Revisão interna' },
  { value: 'aguardando_aprovacao', label: 'Aguardando aprovação' },
  { value: 'aprovado', label: 'Aprovado' },
  { value: 'agendado', label: 'Agendado' },
  { value: 'publicado', label: 'Publicado' },
]
const STATUS_LABEL: Record<string,string> = Object.fromEntries(STATUSES.map(s => [s.value, s.label]))
const TYPE_LABEL: Record<string,string> = Object.fromEntries([
  ['reels','Reels'],['carrossel','Carrossel'],['post','Post'],['story','Story'],['carrossel_stories','Carrossel/Stories']
])
const EMPTY_FORM = { title: '', copy: '', post_type: 'carrossel', scheduled_date: '', status: 'producao', drive_url: '', reference_notes: '', funil: '' }
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
  producao:              'bg-[var(--ds-caution-bg)] text-[var(--ds-caution-text)]',
  revisao_interna:       'bg-[var(--ds-warn-bg)] text-[var(--ds-warn-text)]',
  aguardando_aprovacao:  'bg-[var(--ds-purple-bg)] text-[var(--ds-purple-text)]',
  aprovado:              'bg-[var(--ds-success-bg)] text-[var(--ds-success-text)]',
  agendado:              'bg-[var(--ds-info-bg)] text-[var(--ds-info-text)]',
  publicado:             'bg-[var(--ds-success-bg)] text-[var(--ds-success-text)]',
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
  const [selectedClient, setSelectedClient] = useState<string>('')
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth() + 1)
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear())
  const [showMonthPicker, setShowMonthPicker] = useState(false)
  const [selected, setSelected] = useState<Post | null>(null)
  const [loading, setLoading] = useState(true)
  const [showPostCard,  setShowPostCard]  = useState(false)
  const [editingPostId, setEditingPostId] = useState<string | null>(null)
  const [showApprovalModal, setShowApprovalModal] = useState(false)
  const [approvalLink, setApprovalLink] = useState('')
  const [generatingLink, setGeneratingLink] = useState(false)
  const [aiMessage, setAiMessage] = useState('')
  const [loadingAi, setLoadingAi] = useState(false)
  const [copied, setCopied] = useState(false)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    async function loadClients() {
      const supabase = createClient()
      const { data } = await supabase.from('clients').select('id, name, color_hex').eq('status', 'active').order('name')
      if (clientParam && data?.some(c => c.id === clientParam)) { setSelectedClient(clientParam); setTimeout(() => setShowPostCard(true), 100) }
      setClients(data || [])
      if (data && data.length > 0) setSelectedClient(data[0].id)
      setLoading(false)
    }
    loadClients()
  }, [])

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
      status: 'producao', scheduled_date: null,
    })
    await loadPosts()
    toast('Post duplicado!')
  }

  async function generateApprovalLink() {
    setGeneratingLink(true)
    const supabase = createClient()
    await supabase.from('approval_tokens').delete().eq('client_id', selectedClient).eq('month', selectedMonth).eq('year', selectedYear)
    const { data } = await supabase.from('approval_tokens').insert({ client_id: selectedClient, month: selectedMonth, year: selectedYear }).select().single()
    const link = `${window.location.origin}/aprovar/${data.token}`
    setApprovalLink(link)
    setGeneratingLink(false)
    generateAiMessage(link)
  }

  async function generateAiMessage(link: string) {
    setLoadingAi(true)
    const client = clients.find(c => c.id === selectedClient)
    const month = MONTHS[selectedMonth - 1]
    try {
      const res = await fetch('https://api.anthropic.com/v1/messages', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ model: 'claude-sonnet-4-20250514', max_tokens: 300, messages: [{ role: 'user', content: `Crie uma mensagem curta e profissional para enviar via WhatsApp para o cliente "${client?.name}" pedindo que ele acesse o link abaixo para aprovar o cronograma de ${month}. A mensagem deve ser amigável, direta e conter o link. Use no máximo 4 linhas. Link: ${link}` }] }) })
      const data = await res.json()
      setAiMessage(data.content?.[0]?.text || '')
    } catch {
      setAiMessage(`Olá! 👋 O cronograma de ${month} para ${client?.name} está pronto para aprovação.\n\nAcesse o link abaixo para revisar e aprovar os posts:\n${link}`)
    }
    setLoadingAi(false)
  }

  async function openApprovalModal() { setShowApprovalModal(true); setApprovalLink(''); setAiMessage(''); await generateApprovalLink() }
  function copyLink() { navigator.clipboard.writeText(approvalLink); setCopied(true); setTimeout(() => setCopied(false), 2000) }
  function openWhatsApp() { window.open(`https://wa.me/?text=${encodeURIComponent(aiMessage || approvalLink)}`, '_blank') }

  const client = clients.find(c => c.id === selectedClient)
  if (loading) return <div className="p-6 text-sm text-[var(--color-text-muted)]">Carregando...</div>

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
            {posts.length > 0 && <button onClick={openApprovalModal} className="border border-[var(--color-border)] text-[var(--color-text-secondary)] rounded-xl px-4 py-2 text-sm font-medium hover:bg-[var(--color-bg-subtle)] hover:border-[var(--color-text-primary)] hover:text-[var(--color-text-primary)] transition-all">Enviar para aprovação</button>}
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
          ) : (
            <div className="grid grid-cols-2 gap-4">
              {posts.map(post => {
                const typeLabel = TYPE_LABEL[post.post_type] || post.post_type
                const accent = typeAccent[post.post_type] || 'var(--color-border)'
                const isRejected = post.approval_status === 'não aprovado'
                const isApproved = post.approval_status === 'aprovado'
                const campaign = campaigns.find(c => c.type === post.campaign_type)
                return (
                  <div
                    key={post.id}
                    className={`group text-left bg-[var(--color-bg-card)] border rounded-2xl flex flex-col cursor-pointer transition-all overflow-hidden
                      ${selected?.id === post.id ? 'border-transparent' : isRejected ? 'border-[var(--ds-error-border)]' : 'border-[var(--color-border)] hover:border-[var(--color-border-hover)]'}`}
                    style={selected?.id === post.id ? { boxShadow: `0 0 0 2px ${client?.color_hex}` } : {}}
                    onClick={() => { setEditingPostId(post.id); setShowPostCard(true) }}
                  >
                    {/* Type color bar */}
                    <div className="h-[3px] w-full flex-shrink-0" style={{ background: accent }} />

                    <div className="p-5 flex flex-col gap-4 flex-1">
                      {/* Header */}
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-xs font-bold text-[var(--color-text-faint)]">#{post.post_number}</span>
                          <span className={`text-xs font-semibold px-2.5 py-0.5 rounded-full ${typeColor[typeLabel] || 'bg-[var(--color-bg-subtle)] text-[var(--color-text-secondary)]'}`}>
                            {typeLabel}
                          </span>
                          {post.funil && (
                            <span className="text-[10px] font-medium px-2 py-0.5 rounded-md bg-[var(--color-bg-subtle)] text-[var(--color-text-muted)]">
                              {post.funil}
                            </span>
                          )}
                          {campaign && (
                            <span className="text-[10px] font-semibold px-2 py-0.5 rounded-md flex items-center gap-1" style={{ background: 'var(--ds-info-bg)', color: 'var(--ds-info-text)' }}>
                              📣 {campaign.name}
                            </span>
                          )}
                        </div>
                        <button
                          onClick={e => { e.stopPropagation(); duplicatePost(post) }}
                          title="Duplicar"
                          className="opacity-0 group-hover:opacity-100 w-6 h-6 rounded-xl bg-[var(--color-bg-subtle)] hover:bg-[var(--color-bg-page)] flex items-center justify-center transition-all text-[var(--color-text-muted)] flex-shrink-0"
                        >
                          <Copy size={11} />
                        </button>
                      </div>

                      {/* Title + Copy */}
                      <div className="flex-1">
                        <p className="font-bold text-[var(--color-text-primary)] text-[15px] leading-snug line-clamp-2">
                          {post.title || 'Sem título'}
                        </p>
                        {post.copy && (
                          <p className="text-sm text-[var(--color-text-muted)] leading-relaxed mt-2 line-clamp-3">
                            {post.copy}
                          </p>
                        )}
                      </div>

                      {/* Rejection comment */}
                      {isRejected && post.approval_comment && (
                        <div className="rounded-xl px-3 py-2 text-xs italic leading-snug" style={{ background: 'var(--ds-error-bg)', color: 'var(--ds-error-text)' }}>
                          "{post.approval_comment}"
                        </div>
                      )}

                      {/* Footer */}
                      <div className="flex items-center justify-between pt-3 border-t border-[var(--color-border)] gap-2 mt-auto">
                        <div className="flex items-center gap-3">
                          <span className="flex items-center gap-1.5 text-xs text-[var(--color-text-muted)]">
                            <Calendar size={11} />
                            {post.scheduled_date
                              ? new Date(post.scheduled_date + 'T12:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })
                              : 'Sem data'}
                          </span>
                          {post.drive_url && (
                            <a
                              href={post.drive_url}
                              onClick={e => e.stopPropagation()}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="flex items-center gap-1 text-xs text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] transition-colors"
                            >
                              <Link2 size={11} /> Drive
                            </a>
                          )}
                        </div>
                        <div className="flex items-center gap-1.5 flex-shrink-0">
                          {isRejected && (
                            <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full" style={{ background: 'var(--ds-error-bg)', color: 'var(--ds-error-text)' }}>
                              Não aprovado
                            </span>
                          )}
                          {isApproved && (
                            <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full" style={{ background: 'var(--ds-success-bg)', color: 'var(--ds-success-text)' }}>
                              ✓ Aprovado
                            </span>
                          )}
                          <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${statusColor[post.status] || 'bg-[var(--color-bg-subtle)] text-[var(--color-text-secondary)]'}`}>
                            {STATUS_LABEL[post.status] || post.status}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
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
          onClose={() => { setShowPostCard(false); setEditingPostId(null) }}
          onSaved={() => { loadPosts(); setShowPostCard(false); setEditingPostId(null) }}
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
