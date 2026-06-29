'use client'
// @ts-nocheck

import { useEffect, useState, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import PostCard from '@/components/PostCard'
import { useToast } from '@/lib/ToastContext'

type Client = { id: string; name: string; color_hex: string }
type Post = {
  id: string; post_number: number; title: string; copy: string
  post_type: string; scheduled_date: string; status: string
  drive_url: string; reference_notes: string
  approval_status: string; approval_comment: string
}

const MONTHS = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro']
const POST_TYPES = [
  { value: 'reels', label: 'Reels' },
  { value: 'carrossel', label: 'Carrossel' },
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
const EMPTY_FORM = { title: '', copy: '', post_type: 'reels', scheduled_date: '', status: 'producao', drive_url: '', reference_notes: '', funil: '' }
const FUNIL_OPTIONS = ['Topo de funil', 'Meio de funil', 'Fundo de funil', 'Institucional', 'Promocional', 'Engajamento', 'Venda']

function ReferenceLinks({ text }: { text: string }) {
  return (
    <div className="flex flex-col gap-1">
      {text.split('\n').map((line, i) =>
        line.startsWith('http') ? (
          <a key={i} href={line} target="_blank" rel="noopener noreferrer" className="text-sm text-blue-600 underline break-all">{line}</a>
        ) : <p key={i} className="text-sm text-[var(--color-text-primary)]">{line}</p>
      )}
    </div>
  )
}

const typeColor: Record<string,string> = { 'Reels':'bg-red-50 text-red-600','Carrossel':'bg-blue-50 text-blue-600','Stories':'bg-purple-50 text-purple-600','Carrossel/Stories':'bg-indigo-50 text-indigo-600','Post':'bg-amber-50 text-amber-600' }
const statusColor: Record<string,string> = { 'publicado':'bg-green-50 text-green-600','aprovado':'bg-blue-50 text-blue-600','em produção':'bg-yellow-50 text-yellow-700','pendente':'bg-[var(--color-bg-subtle)] text-[var(--color-text-secondary)]' }
const approvalColor: Record<string,string> = { 'aprovado':'bg-green-50 text-green-600','não aprovado':'bg-red-50 text-red-500' }

function CronogramaPageInner() {
  const { toast } = useToast()
  const [clients, setClients] = useState<Client[]>([])
  const [posts, setPosts] = useState<Post[]>([])
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
    const { data } = await supabase.from('schedules').select('*').eq('client_id', selectedClient).eq('month', selectedMonth).eq('year', selectedYear).order('post_number')
    setPosts(data || [])
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
          <div>
            <h1 className="text-[var(--color-text-primary)] font-semibold text-lg">Cronograma</h1>
            <p className="text-[var(--color-text-secondary)] text-sm mt-0.5">{posts.length} posts · {MONTHS[selectedMonth-1]} {selectedYear}</p>
          </div>
          <div className="flex items-center gap-3 flex-wrap">
            <select value={selectedClient} onChange={e => { setSelectedClient(e.target.value); setSelected(null) }} className="border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm text-[var(--color-text-primary)] bg-[var(--color-bg-card)] outline-none">
              {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
            <div className="flex items-center gap-1">
              <div className="relative">
                <button onClick={() => setShowMonthPicker(v => !v)} className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-card)] hover:border-[var(--color-border-hover)] transition-all text-sm font-medium text-[var(--color-text-primary)]">
                  {MONTHS[selectedMonth-1]} {selectedYear}
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-[var(--color-text-muted)]"><polyline points="6 9 12 15 18 9"/></svg>
                </button>
                {showMonthPicker && (
                  <>
                    <div className="fixed inset-0 z-40" onClick={() => setShowMonthPicker(false)} />
                    <div className="absolute right-0 top-11 z-50 bg-[var(--color-bg-card)] rounded-2xl border border-[var(--color-border)] p-4 w-64">
                      <div className="flex items-center justify-between mb-3">
                        <button onClick={() => setSelectedYear(y => y-1)} className="w-7 h-7 rounded-lg hover:bg-[var(--color-bg-subtle)] flex items-center justify-center text-[var(--color-text-secondary)]">‹</button>
                        <span className="text-sm font-semibold text-[var(--color-text-primary)]">{selectedYear}</span>
                        <button onClick={() => setSelectedYear(y => y+1)} className="w-7 h-7 rounded-lg hover:bg-[var(--color-bg-subtle)] flex items-center justify-center text-[var(--color-text-secondary)]">›</button>
                      </div>
                      <div className="grid grid-cols-3 gap-1.5">
                        {MONTHS.map((m, i) => (
                          <button
                            key={m}
                            onClick={() => { setSelectedMonth(i+1); setShowMonthPicker(false) }}
                            className={`py-2 rounded-lg text-xs font-medium transition-colors ${selectedMonth === i+1 ? 'bg-[var(--color-text-primary)] text-white' : 'text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-subtle)]'}`}
                          >
                            {m.slice(0,3)}
                          </button>
                        ))}
                      </div>
                    </div>
                  </>
                )}
              </div>
            </div>
            {posts.length > 0 && <button onClick={openApprovalModal} className="border border-[var(--color-text-primary)] text-[var(--color-text-primary)] rounded-lg px-4 py-2 text-sm font-medium hover:bg-[var(--color-bg-subtle)]">Enviar para aprovação</button>}
            <button onClick={() => { setEditingPostId(null); setShowPostCard(true) }} className="bg-[var(--color-text-primary)] text-white rounded-lg px-4 py-2 text-sm font-medium">+ Novo post</button>
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
              <button onClick={() => setShowPostCard(true)}
                className="flex items-center gap-2 bg-[var(--color-brand)] hover:opacity-90 text-[var(--color-brand-fg)] font-semibold px-6 py-3 rounded-xl text-sm transition-opacity shadow-sm">
                ✏️ Criar primeiro post
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-3 gap-4">
              {posts.map(post => (
                <div key={post.id} className={`group relative text-left bg-[var(--color-bg-card)] border rounded-2xl p-5 flex flex-col gap-3 hover:shadow-md transition-all cursor-pointer ${selected?.id===post.id?'ring-2 border-transparent':'border-[var(--color-border)]'}`}
                  style={selected?.id===post.id?{boxShadow:`0 0 0 2px ${client?.color_hex}`}:{}}
                  onClick={() => { setEditingPostId(post.id); setShowPostCard(true) }}>
                  <div className="flex items-center justify-between">
                    <span className="text-3xl font-black text-[var(--color-border)]">#{post.post_number}</span>
                    <div className="flex items-center gap-1.5">
                      <button
                        onClick={e => { e.stopPropagation(); duplicatePost(post) }}
                        title="Duplicar post"
                        className="opacity-0 group-hover:opacity-100 w-6 h-6 rounded-lg bg-[var(--color-bg-subtle)] hover:bg-[var(--color-border)] flex items-center justify-center transition-all text-[var(--color-text-muted)] text-xs">
                        ⧉
                      </button>
                      <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${typeColor[post.post_type]||'bg-[var(--color-bg-subtle)] text-[var(--color-text-secondary)]'}`}>{post.post_type||'—'}</span>
                    </div>
                  </div>
                  <p className="text-[var(--color-text-primary)] font-semibold text-base leading-snug line-clamp-2">{post.title}</p>
                  {post.copy && <p className="text-[var(--color-text-muted)] text-xs leading-relaxed line-clamp-2">{post.copy}</p>}
                  <div className="flex items-center justify-between mt-auto pt-2 border-t border-[var(--color-bg-subtle)]">
                    <span className="text-xs text-[var(--color-text-muted)]">{post.scheduled_date?new Date(post.scheduled_date+'T12:00:00').toLocaleDateString('pt-BR',{day:'2-digit',month:'short'}):'Sem data'}</span>
                    <div className="flex items-center gap-1.5">
                      {post.approval_status&&post.approval_status!=='pendente'&&<span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${approvalColor[post.approval_status]||''}`}>{post.approval_status==='aprovado'?'✓':'✗'}</span>}
                      <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${statusColor[post.status]||'bg-[var(--color-bg-subtle)] text-[var(--color-text-secondary)]'}`}>{STATUS_LABEL[post.status]||post.status}</span>
                    </div>
                  </div>
                </div>
              ))}
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
                  <div className="border-2 border-[var(--color-border)] rounded-xl p-4 flex flex-col gap-3">
                    <div className="flex items-center gap-2">
                      <span className="w-6 h-6 rounded-full bg-[var(--color-text-primary)] text-white text-xs flex items-center justify-center font-bold flex-shrink-0">1</span>
                      <div><p className="text-sm font-semibold text-[var(--color-text-primary)]">Copiar link e enviar manualmente</p><p className="text-xs text-[var(--color-text-muted)]">Cole no WhatsApp, e-mail ou onde preferir</p></div>
                    </div>
                    <button onClick={copyLink} className="w-full py-2.5 rounded-lg border-2 border-[var(--color-text-primary)] text-sm font-semibold text-[var(--color-text-primary)] hover:bg-[var(--color-bg-subtle)]">{copied?'✓ Link copiado!':'Copiar link'}</button>
                  </div>
                  <div className="border-2 border-[#25D366] rounded-xl p-4 flex flex-col gap-3">
                    <div className="flex items-center gap-2">
                      <span className="w-6 h-6 rounded-full bg-[#25D366] text-white text-xs flex items-center justify-center font-bold flex-shrink-0">2</span>
                      <div><p className="text-sm font-semibold text-[var(--color-text-primary)]">Enviar pelo WhatsApp</p><p className="text-xs text-[var(--color-text-muted)]">Mensagem gerada por IA — edite se quiser</p></div>
                    </div>
                    <div className="bg-[#F0FDF4] rounded-lg p-3 min-h-[80px]">
                      {loadingAi ? <p className="text-xs text-[var(--color-text-muted)]">Gerando mensagem com IA...</p> : <textarea value={aiMessage} onChange={e => setAiMessage(e.target.value)} rows={5} className="w-full text-xs text-[var(--color-text-primary)] bg-transparent outline-none resize-none" />}
                    </div>
                    <button onClick={openWhatsApp} disabled={loadingAi} className="w-full py-2.5 rounded-lg bg-[#25D366] text-sm font-semibold text-white hover:bg-[#20BD5A] disabled:opacity-50">Abrir WhatsApp</button>
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
