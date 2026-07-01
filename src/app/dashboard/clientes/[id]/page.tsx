'use client'

import { use, useEffect, useState, useRef, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import IPhoneFeed, { FeedPost } from '@/components/IPhoneFeed'
import MaterialCard from '@/components/MaterialCard'
import { logActivity } from '@/lib/activity'
import { useToast } from '@/lib/ToastContext'
import { dbError } from '@/lib/dbError'
import CampaignsTab from '@/components/CampaignsTab'
import MaterialCardMini from '@/components/MaterialCardMini'
import PostFormModal from '@/components/PostFormModal'
import PostCard from '@/components/PostCard'
import ExtrasKanban from '@/components/ExtrasKanban'
import ActivityLog from '@/components/ActivityLog'
import OnboardingTab from '@/components/OnboardingTab'

type Client = {
  id: string; name: string; color_hex: string; logo_url: string
  drive_folder_url: string; sous_chef_url: string; status: string
  instagram_url: string; instagram_followers: number | null; instagram_following: number | null
}

type Post = {
  id: string; post_number: number; title: string; copy: string
  post_type: string; scheduled_date: string; status: string
  approval_status: string; approval_comment: string
  drive_url: string; reference_notes: string; funil: string; campaign_type: string
}

const MONTHS = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro']
const typeColor: Record<string,string> = { 'reels':'bg-[var(--ds-error-bg)] text-[var(--ds-error-text)]','carrossel':'bg-[var(--ds-info-bg)] text-[var(--ds-info-text)]','story':'bg-[var(--ds-purple-bg)] text-[var(--ds-purple-text)]','carrossel_stories':'bg-[var(--ds-purple-bg)] text-[var(--ds-purple-text)]','post':'bg-[var(--ds-caution-bg)] text-[var(--ds-caution-text)]' }
const statusColor: Record<string,string> = { 'publicado':'bg-[var(--ds-success-bg)] text-[var(--ds-success-text)]','aprovado':'bg-[var(--ds-info-bg)] text-[var(--ds-info-text)]','agendado':'bg-[var(--ds-info-bg)] text-[var(--ds-info-text)]','aguardando_aprovacao':'bg-[var(--ds-warn-bg)] text-[var(--ds-warn-text)]','revisao_interna':'bg-[var(--ds-purple-bg)] text-[var(--ds-purple-text)]','producao':'bg-[var(--ds-caution-bg)] text-[var(--ds-caution-text)]','pendente':'bg-[var(--color-bg-subtle)] text-[var(--color-text-secondary)]' }
const STATUS_LABEL: Record<string,string> = { producao:'Produção', revisao_interna:'Revisão', aguardando_aprovacao:'Aguardando aprovação', aprovado:'Aprovado', agendado:'Agendado', publicado:'Publicado' }
const TYPE_LABEL: Record<string,string> = { reels:'Reels', carrossel:'Carrossel', post:'Post', story:'Story', carrossel_stories:'Carrossel/Stories' }
const approvalColor: Record<string,string> = { 'aprovado':'bg-[var(--ds-success-bg)] text-[var(--ds-success-text)]','não aprovado':'bg-[var(--ds-error-bg)] text-[var(--ds-error-text)]' }
const FUNCAO_LABEL: Record<string,string> = { videos:'Editor', posts:'Designer', estrategia:'Estratégia', social:'Social Media', acompanha:'Acompanha', outro:'Outro' }
function getInitials(name: string) { return name.split(' ').map(w=>w[0]).join('').slice(0,2).toUpperCase() }

function ClientePageInner({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const router = useRouter()
  const searchParams = useSearchParams()
  const { toast } = useToast()
  const [client, setClient] = useState<Client | null>(null)
  const [posts, setPosts] = useState<Post[]>([])
  const [tab, setTab] = useState('cronograma')
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth() + 1)
  const initialMonthSet = useRef(false)
  if (!initialMonthSet.current) {
    const mParam = searchParams.get('m')
    if (mParam) { setSelectedMonth(parseInt(mParam)) }
    initialMonthSet.current = true
  }
  const [selectedYear] = useState(new Date().getFullYear())
  const [loading, setLoading] = useState(true)
  const [viewMode, setViewMode] = useState<'list'|'grid'>('list')
  const [team, setTeam] = useState<any[]>([])
  const [allMembers, setAllMembers] = useState<any[]>([])
  const [showAddMember, setShowAddMember] = useState(false)
  const [showNewPost, setShowNewPost] = useState(false)
  const [showPostCard, setShowPostCard] = useState(false)
  const [editingPostId, setEditingPostId] = useState<string | null>(null)
  const [campaigns, setCampaigns] = useState<{ id: string; name: string; type: string }[]>([])
  const [materials,    setMaterials]    = useState<any[]>([])
  const [matCounts,    setMatCounts]    = useState<Record<string,any>>({})
  const [cardOpen,     setCardOpen]     = useState<string | 'new' | null>(null)
  const [matDragging,  setMatDragging]  = useState<string | null>(null)
  const [matDragOver,  setMatDragOver]  = useState<string | null>(null)
  const [newMemberId, setNewMemberId] = useState('')
  const [newFuncao, setNewFuncao] = useState('posts')
  const [showEditClient, setShowEditClient] = useState(false)
  const [editClientForm, setEditClientForm] = useState({ name: '', color_hex: '', drive_folder_url: '', sous_chef_url: '', instagram_url: '', instagram_followers: '', instagram_following: '' })
  const [savingClient, setSavingClient] = useState(false)

  useEffect(() => {
    async function load() {
      const supabase = createClient()
      const [{ data: clientData }, { data: postData }] = await Promise.all([
        supabase.from('clients').select('*').eq('id', id).single(),
        supabase.from('schedules').select('*').eq('client_id', id).eq('month', selectedMonth).eq('year', selectedYear).order('post_number'),
      ])
      setClient(clientData)
      setPosts(postData || [])
      const postParam = searchParams.get('post')
      if (postParam && postData) {
        const found = postData.find((p: any) => p.id === postParam)
        if (found) { setEditingPostId(found.id); setShowPostCard(true) }
      }
      const { data: membersData } = await supabase.from('team_members').select('id, name, role').order('name')
      const { data: teamData } = await supabase.from('client_team').select('id, funcao, member_id').eq('client_id', id)
      // Junta manualmente para não depender do join do PostgREST
      const enriched = (teamData || []).map(t => ({
        ...t,
        team_members: (membersData || []).find(m => m.id === t.member_id)
      }))
      setTeam(enriched)
      setAllMembers(membersData || [])
      const { data: campaignsData } = await supabase.from('campaigns').select('id, name, type').eq('client_id', id)
      setCampaigns(campaignsData || [])
      const { data: matData } = await supabase.from('materials').select('*').eq('client_id', id).order('created_at', { ascending: false })
      setMaterials(matData || [])
      const [{ data: chk }, { data: cms }, { data: atts }] = await Promise.all([
        supabase.from('material_checklist').select('material_id, done'),
        supabase.from('material_comments').select('material_id'),
        supabase.from('material_attachments').select('material_id'),
      ])
      const mc: Record<string,any> = {}
      ;(matData || []).forEach((m: any) => { mc[m.id] = { checklist: 0, checkDone: 0, comments: 0, attachments: 0 } })
      ;(chk || []).forEach((x: any) => { if (mc[x.material_id]) { mc[x.material_id].checklist++; if (x.done) mc[x.material_id].checkDone++ } })
      ;(cms || []).forEach((x: any) => { if (mc[x.material_id]) mc[x.material_id].comments++ })
      ;(atts || []).forEach((x: any) => { if (mc[x.material_id]) mc[x.material_id].attachments++ })
      setMatCounts(mc)
      setLoading(false)
    }
    load()
  }, [id, selectedMonth, selectedYear])

  async function quickDuplicate(post: any) {
    const supabase = createClient()
    const { id: _, ...rest } = post
    const { error } = await supabase.from('schedules').insert({ ...rest, post_number: posts.length + 1, title: post.title + ' (cópia)', approval_status: 'pendente' })
    if (dbError(error, toast, 'duplicar post')) return
    reloadPosts()
  }


  async function reloadMaterials() {
    const supabase = createClient()
    const { data } = await supabase.from('materials').select('*').eq('client_id', id).order('created_at', { ascending: false })
    setMaterials(data || [])
  }

  function openNewMaterial() {
    setCardOpen('new')
  }


  async function moveMatStatus(matId: string, newStatus: string) {
    const labels: Record<string,string> = { producao: 'A fazer', aguardando_aprovacao: 'Em aprovação', finalizado: 'Finalizado' }
    const mat = materials.find(m => m.id === matId)
    const oldLabel = labels[mat?.status || 'producao'] || mat?.status || ''
    const newLabel = labels[newStatus] || newStatus
    const prevMats = materials
    setMaterials(prev => prev.map(m => m.id === matId ? { ...m, status: newStatus } : m))
    const supabase = createClient()
    const { error } = await supabase.from('materials').update({ status: newStatus }).eq('id', matId)
    if (error) { setMaterials(prevMats); dbError(error, toast, 'mover material'); return }
    await logActivity({ tableName: 'materials', recordId: matId, clientId: id, action: 'status_changed', field: 'status', oldValue: oldLabel, newValue: newLabel, description: `Status mudou: ${oldLabel} → ${newLabel}` })
  }

  function handleMatDeleted(matId: string) {
    setMaterials(prev => prev.filter(m => m.id !== matId))
    setCardOpen(null)
  }

  async function reloadPosts() {
    const supabase = createClient()
    const { data } = await supabase.from('schedules').select('*').eq('client_id', id).eq('month', selectedMonth).eq('year', selectedYear).order('post_number')
    setPosts(data || [])
  }

  async function addMember() {
    if (!newMemberId) return
    const supabase = createClient()
    const { error } = await supabase.from('client_team').insert({ client_id: id, member_id: newMemberId, funcao: newFuncao })
    if (dbError(error, toast, 'atribuir pessoa')) return
    const { data } = await supabase.from('client_team').select('id, funcao, member_id').eq('client_id', id)
    const enriched = (data || []).map(t => ({ ...t, team_members: allMembers.find(m => m.id === t.member_id) }))
    setTeam(enriched)
    setShowAddMember(false)
    setNewMemberId('')
    setNewFuncao('posts')
  }

  async function removeMember(teamId: string) {
    const supabase = createClient()
    const { error } = await supabase.from('client_team').delete().eq('id', teamId)
    if (dbError(error, toast, 'remover pessoa')) return
    setTeam(t => t.filter(m => m.id !== teamId))
  }

  function openEditClient() {
    if (!client) return
    setEditClientForm({
      name: client.name,
      color_hex: client.color_hex,
      drive_folder_url: client.drive_folder_url || '',
      sous_chef_url: client.sous_chef_url || '',
      instagram_url: client.instagram_url || '',
      instagram_followers: client.instagram_followers?.toString() || '',
      instagram_following: client.instagram_following?.toString() || '',
    })
    setShowEditClient(true)
  }

  async function saveEditClient() {
    if (!client || !editClientForm.name.trim()) return
    setSavingClient(true)
    const supabase = createClient()
    const payload = {
      ...editClientForm,
      instagram_followers: editClientForm.instagram_followers ? parseInt(editClientForm.instagram_followers) : null,
      instagram_following: editClientForm.instagram_following ? parseInt(editClientForm.instagram_following) : null,
    }
    const { error } = await supabase.from('clients').update(payload).eq('id', client.id)
    if (dbError(error, toast, 'salvar cliente')) { setSavingClient(false); return }
    setClient((c: any) => ({ ...c, ...payload }))
    setShowEditClient(false)
    setSavingClient(false)
  }

  if (loading) return <div className="p-6 text-sm text-[var(--color-text-muted)]">Carregando...</div>
  if (!client) return <div className="p-6 text-sm text-[var(--color-text-muted)]">Cliente não encontrado</div>

  const approved = posts.filter(p => p.approval_status === 'aprovado').length
  const notApproved = posts.filter(p => p.approval_status === 'não aprovado').length
  const published = posts.filter(p => p.status === 'publicado').length

  return (
    <div className="flex h-full">
      <div className="flex-1 flex flex-col overflow-hidden">
        <div className="p-6 border-b border-[var(--color-border)]">

          {/* Breadcrumb */}
          <div className="flex items-center gap-2 mb-4">
            <button onClick={() => router.push('/dashboard/clientes')} className="text-xs text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] transition-all flex items-center gap-1">
              ← Clientes
            </button>
            <span className="text-xs text-[var(--color-border)]">/</span>
            <span className="text-xs font-medium text-[var(--color-text-primary)]">{client.name}</span>
          </div>

          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-2xl flex items-center justify-center text-white text-sm font-bold flex-shrink-0" style={{ background: client.color_hex }}>{getInitials(client.name)}</div>
              <div>
                <h1 className="text-2xl font-bold text-[var(--color-text-primary)] tracking-tight">{client.name}</h1>
                <div className="flex items-center gap-2 mt-1 flex-wrap">
                  <span className="text-xs text-[var(--color-text-muted)]">{posts.length} posts · {MONTHS[selectedMonth-1]} {selectedYear}</span>
                  {notApproved > 0 && <span className="text-xs font-semibold px-2 py-0.5 rounded-full" style={{ background: 'var(--ds-error-bg)', color: 'var(--ds-error-text)' }}>✗ {notApproved} não aprovado{notApproved>1?'s':''}</span>}
                  {approved > 0 && <span className="text-xs font-semibold px-2 py-0.5 rounded-full" style={{ background: 'var(--ds-success-bg)', color: 'var(--ds-success-text)' }}>✓ {approved} aprovado{approved>1?'s':''}</span>}
                  <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-[var(--color-bg-subtle)] text-[var(--color-text-secondary)]">{published}/{posts.length} publicados</span>
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {client.instagram_url && <a href={client.instagram_url} target="_blank" rel="noopener noreferrer" className="border border-[var(--color-border)] text-[var(--color-text-primary)] rounded-xl px-3 py-2 text-sm font-medium hover:bg-[var(--color-bg-subtle)]">Instagram</a>}
              {client.sous_chef_url && <a href={client.sous_chef_url} target="_blank" rel="noopener noreferrer" className="border border-[var(--color-border)] text-[var(--color-text-primary)] rounded-xl px-3 py-2 text-sm font-medium hover:bg-[var(--color-bg-subtle)]">Manual</a>}
              {client.drive_folder_url && <a href={client.drive_folder_url} target="_blank" rel="noopener noreferrer" className="border border-[var(--color-border)] text-[var(--color-text-primary)] rounded-xl px-3 py-2 text-sm font-medium hover:bg-[var(--color-bg-subtle)]">Drive</a>}
              <button onClick={openEditClient} className="border border-[var(--color-border)] text-[var(--color-text-secondary)] rounded-xl px-3 py-2 text-sm font-medium hover:bg-[var(--color-bg-subtle)]">Editar</button>
              <button onClick={() => setShowNewPost(true)} className="bg-[var(--color-text-primary)] text-[var(--color-bg-page)] rounded-xl px-4 py-2 text-sm font-medium">+ Novo post</button>
            </div>
          </div>

          <div className="flex items-center gap-1 mt-5">
            {[{key:'cronograma',label:'Cronograma'},{key:'feed',label:'Feed'},{key:'materiais',label:'Materiais'},{key:'campanhas',label:'Campanhas'},{key:'time',label:'Time'},{key:'extras',label:'Extras'},{key:'onboarding',label:'Onboarding'},{key:'drive',label:'Drive'},{key:'historico',label:'Histórico'}].map(t => (
              <button key={t.key} onClick={() => setTab(t.key)} className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${tab===t.key?'bg-[var(--color-text-primary)] text-[var(--color-bg-page)]':'text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-subtle)]'}`}>{t.label}</button>
            ))}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          {tab === 'cronograma' && (
            <div className="flex flex-col gap-4">
              <div className="flex items-center justify-between">
                <p className="text-sm text-[var(--color-text-secondary)]">{posts.length} posts em {MONTHS[selectedMonth-1]}</p>
                <div className="flex items-center gap-3">
                  <div className="flex items-center bg-[var(--color-bg-card)] border border-[var(--color-border)] rounded-lg p-0.5">
                    <button onClick={() => setViewMode('list')} className={`px-2.5 py-1 rounded-md text-xs font-medium transition-all ${viewMode==='list'?'bg-[var(--color-text-primary)] text-[var(--color-bg-page)]':'text-[var(--color-text-muted)]'}`}>Lista</button>
                    <button onClick={() => setViewMode('grid')} className={`px-2.5 py-1 rounded-md text-xs font-medium transition-all ${viewMode==='grid'?'bg-[var(--color-text-primary)] text-[var(--color-bg-page)]':'text-[var(--color-text-muted)]'}`}>Cards</button>
                  </div>
                  <div className="flex items-center gap-1">
                    <button onClick={() => setSelectedMonth(m => m===1?12:m-1)} className="w-8 h-8 rounded-lg border border-[var(--color-border)] flex items-center justify-center text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-subtle)]">‹</button>
                    <span className="text-sm font-medium text-[var(--color-text-primary)] w-24 text-center">{MONTHS[selectedMonth-1]} {selectedYear}</span>
                    <button onClick={() => setSelectedMonth(m => m===12?1:m+1)} className="w-8 h-8 rounded-lg border border-[var(--color-border)] flex items-center justify-center text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-subtle)]">›</button>
                  </div>
                </div>
              </div>
              {posts.length === 0 ? (
                <div className="flex flex-col items-center justify-center min-h-[360px] text-center gap-6">
                  <div className="relative">
                    <div className="w-20 h-20 rounded-3xl bg-[var(--color-bg-card)] border border-[var(--color-border)] flex items-center justify-center text-4xl shadow-sm">📅</div>
                    <div className="absolute -bottom-1 -right-1 w-7 h-7 rounded-full flex items-center justify-center text-white text-sm font-bold shadow-md" style={{ background: client?.color_hex || 'var(--color-brand)' }}>+</div>
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <p className="text-[var(--color-text-primary)] font-semibold text-lg">Nenhum post em {MONTHS[selectedMonth-1]}</p>
                    <p className="text-[var(--color-text-muted)] text-sm max-w-xs">Adicione o primeiro post do mês para montar o cronograma.</p>
                  </div>
                  <button onClick={() => setShowNewPost(true)}
                    className="flex items-center gap-2 font-semibold px-6 py-3 rounded-xl text-sm transition-opacity hover:opacity-90 shadow-sm text-white"
                    style={{ background: client?.color_hex || 'var(--color-brand)' }}>
                    Criar primeiro post
                  </button>
                </div>
              ) : viewMode === 'list' ? (
                <div className="flex flex-col gap-2">
                  {posts.map(post => {
                    const campaign = campaigns.find(c => c.type === post.campaign_type)
                    return (
                      <button key={post.id} onClick={() => { setEditingPostId(post.id); setShowPostCard(true) }}
                        className="w-full text-left bg-[var(--color-bg-card)] border border-[var(--color-border)] rounded-xl px-4 py-3 flex items-center gap-4 hover:border-[var(--color-border-hover)] transition-all"
                        style={{ borderLeftWidth: 3, borderLeftColor: client.color_hex }}>
                        <span className="text-xs font-bold text-[var(--color-text-muted)] w-8">#{post.post_number}</span>
                        <span className={`text-xs font-semibold px-2 py-1 rounded-full w-28 text-center flex-shrink-0 ${typeColor[post.post_type]||'bg-[var(--color-bg-subtle)] text-[var(--color-text-secondary)]'}`}>{TYPE_LABEL[post.post_type]||post.post_type||'—'}</span>
                        <span className="text-sm font-medium text-[var(--color-text-primary)] flex-1 truncate">{post.title}</span>
                        {campaign && <span className="text-[10px] font-semibold px-2 py-0.5 rounded-md flex-shrink-0" style={{ background: 'var(--ds-info-bg)', color: 'var(--ds-info-text)' }}>📣 {campaign.name}</span>}
                        <span className="text-xs text-[var(--color-text-muted)] flex-shrink-0">{post.scheduled_date?new Date(post.scheduled_date+'T12:00:00').toLocaleDateString('pt-BR',{day:'2-digit',month:'short'}):'—'}</span>
                        <div className="flex items-center gap-1 flex-shrink-0">
                          {post.approval_status==='não aprovado'&&<span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full" style={{ background: 'var(--ds-error-bg)', color: 'var(--ds-error-text)' }}>✗</span>}
                          {post.approval_status==='aprovado'&&<span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full" style={{ background: 'var(--ds-success-bg)', color: 'var(--ds-success-text)' }}>✓</span>}
                          <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${statusColor[post.status]||'bg-[var(--color-bg-subtle)] text-[var(--color-text-secondary)]'}`}>{STATUS_LABEL[post.status]||post.status}</span>
                        </div>
                      </button>
                    )
                  })}
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-4">
                  {posts.map(post => {
                    const typeLabel = TYPE_LABEL[post.post_type] || post.post_type
                    const accent = { reels:'#ef4444', carrossel:'#3b82f6', post:'#f59e0b', story:'#8b5cf6', carrossel_stories:'#6366f1' }[post.post_type] || 'var(--color-border)'
                    const isRejected = post.approval_status === 'não aprovado'
                    const isApproved = post.approval_status === 'aprovado'
                    const campaign = campaigns.find(c => c.type === post.campaign_type)
                    return (
                      <div key={post.id}
                        className={`group text-left bg-[var(--color-bg-card)] border rounded-2xl flex flex-col cursor-pointer transition-all overflow-hidden
                          ${isRejected ? 'border-[var(--ds-error-border)]' : 'border-[var(--color-border)] hover:border-[var(--color-border-hover)]'}`}
                        onClick={() => { setEditingPostId(post.id); setShowPostCard(true) }}>
                        <div className="h-[3px] w-full flex-shrink-0" style={{ background: accent }} />
                        <div className="p-5 flex flex-col gap-4 flex-1">
                          <div className="flex items-center justify-between gap-2">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="text-xs font-bold text-[var(--color-text-faint)]">#{post.post_number}</span>
                              <span className={`text-xs font-semibold px-2.5 py-0.5 rounded-full ${typeColor[typeLabel]||'bg-[var(--color-bg-subtle)] text-[var(--color-text-secondary)]'}`}>{typeLabel}</span>
                              {post.funil && <span className="text-[10px] font-medium px-2 py-0.5 rounded-md bg-[var(--color-bg-subtle)] text-[var(--color-text-muted)]">{post.funil}</span>}
                              {campaign && <span className="text-[10px] font-semibold px-2 py-0.5 rounded-md" style={{ background: 'var(--ds-info-bg)', color: 'var(--ds-info-text)' }}>📣 {campaign.name}</span>}
                            </div>
                            <button onClick={e => { e.stopPropagation(); quickDuplicate(post) }} title="Duplicar"
                              className="opacity-0 group-hover:opacity-100 w-6 h-6 rounded-xl bg-[var(--color-bg-subtle)] hover:bg-[var(--color-bg-page)] flex items-center justify-center transition-all text-[var(--color-text-muted)] flex-shrink-0 text-xs">
                              ⧉
                            </button>
                          </div>
                          <div className="flex-1">
                            <p className="font-bold text-[var(--color-text-primary)] text-[15px] leading-snug line-clamp-2">{post.title || 'Sem título'}</p>
                            {post.copy && <p className="text-sm text-[var(--color-text-muted)] leading-relaxed mt-2 line-clamp-3">{post.copy}</p>}
                          </div>
                          {isRejected && post.approval_comment && (
                            <div className="rounded-xl px-3 py-2 text-xs italic leading-snug" style={{ background: 'var(--ds-error-bg)', color: 'var(--ds-error-text)' }}>
                              "{post.approval_comment}"
                            </div>
                          )}
                          <div className="flex items-center justify-between pt-3 border-t border-[var(--color-border)] gap-2 mt-auto">
                            <div className="flex items-center gap-3">
                              <span className="text-xs text-[var(--color-text-muted)]">
                                {post.scheduled_date ? new Date(post.scheduled_date+'T12:00:00').toLocaleDateString('pt-BR',{day:'2-digit',month:'short'}) : 'Sem data'}
                              </span>
                              {post.drive_url && (
                                <a href={post.drive_url} onClick={e => e.stopPropagation()} target="_blank" rel="noopener noreferrer"
                                  className="text-xs flex items-center gap-1 transition-colors" style={{ color: 'var(--ds-info-text)' }}>
                                  Drive
                                </a>
                              )}
                            </div>
                            <div className="flex items-center gap-1.5 flex-shrink-0">
                              {isRejected && <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full" style={{ background: 'var(--ds-error-bg)', color: 'var(--ds-error-text)' }}>Não aprovado</span>}
                              {isApproved && <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full" style={{ background: 'var(--ds-success-bg)', color: 'var(--ds-success-text)' }}>✓ Aprovado</span>}
                              <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${statusColor[post.status]||'bg-[var(--color-bg-subtle)] text-[var(--color-text-secondary)]'}`}>{STATUS_LABEL[post.status]||post.status}</span>
                            </div>
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )}

          {tab === 'feed' && (
            <div className="flex flex-col gap-4">
              <div className="flex items-center justify-between">
                <p className="text-sm text-[var(--color-text-secondary)]">Feed · {MONTHS[selectedMonth-1]}</p>
                <div className="flex items-center gap-1">
                  <button onClick={() => setSelectedMonth(m => m===1?12:m-1)} className="w-8 h-8 rounded-lg border border-[var(--color-border)] flex items-center justify-center text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-subtle)]">‹</button>
                  <span className="text-sm font-medium text-[var(--color-text-primary)] w-24 text-center">{MONTHS[selectedMonth-1]} {selectedYear}</span>
                  <button onClick={() => setSelectedMonth(m => m===12?1:m+1)} className="w-8 h-8 rounded-lg border border-[var(--color-border)] flex items-center justify-center text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-subtle)]">›</button>
                </div>
              </div>
              <IPhoneFeed
                posts={posts.map(p => ({
                  id: p.id,
                  title: p.title || 'Post sem título',
                  type: p.post_type === 'reels' ? 'reel' : p.post_type === 'carrossel' || p.post_type === 'carrossel_stories' ? 'carousel' : p.post_type === 'story' ? 'story' : 'photo',
                  status: p.approval_status === 'aprovado' ? 'approved' : p.approval_status === 'não aprovado' ? 'changes_requested' : p.status === 'publicado' ? 'approved' : 'pending',
                  drive_url: p.drive_url,
                  copy: p.copy,
                  scheduled_date: p.scheduled_date,
                }))}
                clientName={client.name}
                clientColor={client.color_hex}
                clientInitials={getInitials(client.name)}
                followersCount={client.instagram_followers ?? undefined}
                followingCount={client.instagram_following ?? undefined}
                instagramUrl={client.instagram_url || undefined}
                onReorder={async (reordered) => {
                  await Promise.all(reordered.map(p => createClient().from('schedules').update({ feed_order: p.feed_order }).eq('id', p.id)))
                }}
              />
            </div>
          )}

          {tab === 'materiais' && (
            <div className="flex flex-col gap-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-[var(--color-text-primary)]">Materiais extras</p>
                  <p className="text-xs text-[var(--color-text-muted)] mt-0.5">Menus, cardápios, artes avulsas, logos.</p>
                </div>
                <button onClick={openNewMaterial} className="bg-[var(--color-text-primary)] text-[var(--color-bg-page)] rounded-xl px-3 py-1.5 text-sm font-medium">+ Novo material</button>
              </div>

              {/* Kanban 3 colunas */}
              {(() => {
                const MAT_COLS = [
                  { key: 'producao',             label: 'A fazer',      color: '#F59E0B' },
                  { key: 'aguardando_aprovacao',  label: 'Em aprovação', color: '#EC4899' },
                  { key: 'finalizado',            label: 'Finalizado',   color: '#22C55E' },
                ]
                function colItems(colKey: string) {
                  return materials.filter(m => {
                    const s = m.status || 'producao'
                    if (colKey === 'producao') return s === 'producao' || (!['aguardando_aprovacao','finalizado'].includes(s))
                    return s === colKey
                  })
                }
                return (
                  <div className="flex gap-4 overflow-x-auto">
                    {MAT_COLS.map((col, ci) => {
                      const items      = colItems(col.key)
                      const isDragOver = matDragOver === col.key
                      const prevCol    = MAT_COLS[ci - 1]
                      const nextCol    = MAT_COLS[ci + 1]
                      return (
                        <div key={col.key} className="flex-1 min-w-[220px] flex flex-col"
                          onDragOver={e => { e.preventDefault(); setMatDragOver(col.key) }}
                          onDragLeave={() => setMatDragOver(null)}
                          onDrop={e => { e.preventDefault(); if (matDragging) moveMatStatus(matDragging, col.key); setMatDragging(null); setMatDragOver(null) }}>
                          <div className="flex items-center gap-2 mb-2 px-1">
                            <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: col.color }} />
                            <span className="text-xs font-semibold text-[var(--color-text-primary)]">{col.label}</span>
                            <span className="text-xs text-[var(--color-text-muted)]">{items.length}</span>
                          </div>
                          <div className={`flex flex-col gap-2 flex-1 rounded-xl transition-colors p-1 ${isDragOver ? 'ring-2 ring-dashed ring-[var(--color-brand)] bg-[var(--color-bg-subtle)]' : ''}`}>
                            {items.map(m => {
                              const ct = matCounts[m.id] || {}
                              return (
                                <MaterialCardMini key={m.id}
                                  material={{ ...m, _checkTotal: ct.checklist||0, _checkDone: ct.checkDone||0, _comments: ct.comments||0, _attachments: ct.attachments||0 }}
                                  members={allMembers}
                                  onClick={() => setCardOpen(m.id)}
                                  draggable={true}
                                  onDragStart={e => { e.dataTransfer.effectAllowed = 'move'; setMatDragging(m.id) }}
                                  onMovePrev={prevCol ? () => moveMatStatus(m.id, prevCol.key) : undefined}
                                  onMoveNext={nextCol ? () => moveMatStatus(m.id, nextCol.key) : undefined}
                                />
                              )
                            })}
                            {items.length === 0 && (
                              isDragOver ? (
                                <div className="rounded-xl border-2 border-dashed border-[var(--color-brand)] py-8 text-center text-sm text-[var(--color-brand)] font-medium bg-[var(--color-bg-subtle)]">
                                  Soltar aqui
                                </div>
                              ) : (
                                <button onClick={() => setCardOpen('new')}
                                  className="group w-full rounded-xl border-2 border-dashed border-[var(--color-border)] hover:border-[var(--color-brand)] py-8 flex flex-col items-center gap-2 transition-all hover:bg-[var(--color-bg-subtle)]">
                                  <div className="w-8 h-8 rounded-full border-2 border-dashed border-[var(--color-border)] group-hover:border-[var(--color-brand)] group-hover:bg-[var(--color-brand)] flex items-center justify-center transition-all">
                                    <span className="text-base text-[var(--color-text-muted)] group-hover:text-white leading-none">+</span>
                                  </div>
                                  <span className="text-xs text-[var(--color-text-muted)] group-hover:text-[var(--color-brand)] transition-colors font-medium">Adicionar</span>
                                </button>
                              )
                            )}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )
              })()}

              {cardOpen && (
                <MaterialCard
                  materialId={cardOpen === 'new' ? undefined : cardOpen}
                  fixedClientId={id as string}
                  clients={[client].filter(Boolean)}
                  onClose={() => setCardOpen(null)}
                  onSaved={reloadMaterials}
                  onDeleted={handleMatDeleted}
                />
              )}
            </div>
          )}

          {tab === 'campanhas' && (
            <CampaignsTab
              clientId={id as string}
              clientColor={client.color_hex}
              members={allMembers}
            />
          )}

          {tab === 'time' && (
            <div className="flex flex-col gap-4 max-w-2xl">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium text-[var(--color-text-primary)]">Time deste cliente</p>
                <button onClick={() => setShowAddMember(true)} className="bg-[var(--color-text-primary)] text-[var(--color-bg-page)] rounded-xl px-3 py-1.5 text-sm font-medium">+ Atribuir pessoa</button>
              </div>

              {team.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-40 text-center border border-dashed border-[var(--color-border)] rounded-2xl">
                  <p className="text-2xl mb-2">👥</p>
                  <p className="text-sm text-[var(--color-text-muted)]">Nenhuma pessoa atribuída ainda.</p>
                </div>
              ) : (
                <div className="flex flex-col gap-2">
                  {team.map(m => (
                    <div key={m.id} className="flex items-center gap-3 bg-[var(--color-bg-card)] border border-[var(--color-border)] rounded-xl px-4 py-3">
                      <div className="w-9 h-9 rounded-full bg-[var(--color-text-primary)] flex items-center justify-center text-[var(--color-bg-page)] text-xs font-semibold flex-shrink-0">
                        {getInitials(m.team_members?.name || '?')}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-[var(--color-text-primary)]">{m.team_members?.name}</p>
                        <p className="text-xs text-[var(--color-text-muted)] capitalize">{m.team_members?.role?.replace('_',' ')}</p>
                      </div>
                      <span className="text-xs font-medium px-2.5 py-1 rounded-lg bg-[var(--color-bg-subtle)] text-[var(--color-text-secondary)]">{FUNCAO_LABEL[m.funcao] || m.funcao}</span>
                      <button onClick={() => removeMember(m.id)} className="text-[var(--color-text-muted)] transition-colors text-lg leading-none" onMouseEnter={e => (e.currentTarget.style.color = 'var(--ds-error-text)')} onMouseLeave={e => (e.currentTarget.style.color = '')}>×</button>
                    </div>
                  ))}
                </div>
              )}

              {showAddMember && (
                <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={e => { if (e.target === e.currentTarget) setShowAddMember(false) }}>
                  <div className="bg-[var(--color-bg-card)] rounded-2xl w-full max-w-sm p-6">
                    <p className="font-semibold text-[var(--color-text-primary)] mb-4">Atribuir pessoa</p>
                    <div className="flex flex-col gap-3">
                      <div>
                        <label className="text-xs text-[var(--color-text-muted)] mb-1 block">Pessoa</label>
                        <select value={newMemberId} onChange={e => setNewMemberId(e.target.value)} className="w-full border border-[var(--color-border)] rounded-xl px-3 py-2 text-sm bg-[var(--color-bg-card)] outline-none">
                          <option value="">Selecione...</option>
                          {allMembers.filter(am => !team.some(t => t.member_id === am.id)).map(am => (
                            <option key={am.id} value={am.id}>{am.name}</option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="text-xs text-[var(--color-text-muted)] mb-1 block">Função neste cliente</label>
                        <select value={newFuncao} onChange={e => setNewFuncao(e.target.value)} className="w-full border border-[var(--color-border)] rounded-xl px-3 py-2 text-sm bg-[var(--color-bg-card)] outline-none">
                          <option value="videos">Editor (vídeos)</option>
                          <option value="posts">Designer (posts)</option>
                          <option value="estrategia">Estratégia / Cronograma</option>
                          <option value="social">Social Media</option>
                          <option value="acompanha">Acompanha</option>
                        </select>
                      </div>
                      <div className="flex gap-2 mt-2">
                        <button onClick={() => setShowAddMember(false)} className="flex-1 py-2 text-sm border border-[var(--color-border)] rounded-xl text-[var(--color-text-secondary)]">Cancelar</button>
                        <button onClick={addMember} disabled={!newMemberId} className="flex-1 py-2 text-sm bg-[var(--color-text-primary)] text-[var(--color-bg-page)] rounded-xl disabled:opacity-50">Adicionar</button>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {tab === 'extras' && (
            <div className="flex flex-col gap-4">
              <div>
                <p className="text-sm font-medium text-[var(--color-text-primary)]">Extras de {client.name}</p>
                <p className="text-xs text-[var(--color-text-muted)] mt-0.5">Tarefas, notas e lembretes específicos deste cliente</p>
              </div>
              <ExtrasKanban clientId={client.id} members={allMembers} />
            </div>
          )}

          {tab === 'onboarding' && (
            <OnboardingTab clientId={client.id} />
          )}

          {tab === 'drive' && (
            <div className="flex flex-col h-full">
              {client.drive_folder_url ? (() => {
                const match = client.drive_folder_url.match(/folders\/([a-zA-Z0-9_-]+)/)
                const folderId = match?.[1]
                const embedUrl = folderId
                  ? `https://drive.google.com/embeddedfolderview?id=${folderId}#list`
                  : null
                return embedUrl ? (
                  <iframe
                    src={embedUrl}
                    className="w-full flex-1 rounded-xl border border-[var(--color-border)]"
                    style={{ minHeight: 'calc(100vh - 220px)' }}
                    title="Google Drive"
                    allow="autoplay"
                  />
                ) : (
                  <div className="flex flex-col items-center justify-center py-20 gap-3">
                    <p className="text-sm text-[var(--color-text-muted)]">Não foi possível interpretar o link do Drive.</p>
                    <a href={client.drive_folder_url} target="_blank" rel="noopener noreferrer"
                      className="text-sm underline" style={{ color: 'var(--ds-info-text)' }}>Abrir no Drive →</a>
                  </div>
                )
              })() : (
                <div className="flex flex-col items-center justify-center py-20 gap-3">
                  <p className="text-[var(--color-text-muted)] text-sm">Nenhuma pasta do Drive configurada.</p>
                  <button onClick={openEditClient}
                    className="text-sm border border-[var(--color-border)] rounded-xl px-4 py-2 text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-subtle)] transition-colors">
                    Editar cliente para adicionar
                  </button>
                </div>
              )}
            </div>
          )}

          {tab === 'historico' && (
            <div className="max-w-xl">
              <div className="mb-5">
                <p className="text-sm font-medium text-[var(--color-text-primary)]">Histórico de {client.name}</p>
                <p className="text-xs text-[var(--color-text-muted)] mt-0.5">Atividades recentes: posts, materiais e extras</p>
              </div>
              <ActivityLog clientId={client.id} />
            </div>
          )}
        </div>
      </div>

      {showPostCard && editingPostId && client && (
        <PostCard
          postId={editingPostId}
          clientId={id}
          clientName={client.name}
          clientColor={client.color_hex}
          month={selectedMonth}
          year={selectedYear}
          onClose={() => { setShowPostCard(false); setEditingPostId(null) }}
          onSaved={reloadPosts}
          onDeleted={reloadPosts}
        />
      )}

      {showNewPost && client && (
        <PostFormModal
          clientId={id}
          clientName={client.name}
          month={selectedMonth}
          year={selectedYear}
          nextPostNumber={posts.length + 1}
          onClose={() => setShowNewPost(false)}
          onSaved={reloadPosts}
        />
      )}

      {/* Modal editar cliente */}
      {showEditClient && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/30" onClick={() => setShowEditClient(false)} />
          <div className="relative bg-[var(--color-bg-card)] rounded-2xl shadow-xl w-full max-w-md p-6 flex flex-col gap-5">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-semibold text-[var(--color-text-primary)]">Editar cliente</h2>
              <button onClick={() => setShowEditClient(false)} className="w-8 h-8 rounded-lg hover:bg-[var(--color-bg-subtle)] flex items-center justify-center text-[var(--color-text-muted)] text-lg">×</button>
            </div>

            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-xl flex items-center justify-center text-white font-bold text-sm flex-shrink-0" style={{ background: editClientForm.color_hex }}>
                {editClientForm.name ? editClientForm.name.split(' ').map((w: string) => w[0]).join('').slice(0,2).toUpperCase() : '?'}
              </div>
              <p className="text-sm text-[var(--color-text-muted)]">Prévia do avatar</p>
            </div>

            <div className="flex flex-col gap-4">
              <div>
                <label className="text-xs font-medium text-[var(--color-text-secondary)] mb-1.5 block">Nome do cliente *</label>
                <input
                  autoFocus
                  type="text"
                  value={editClientForm.name}
                  onChange={e => setEditClientForm((f: any) => ({ ...f, name: e.target.value }))}
                  onKeyDown={e => e.key === 'Enter' && saveEditClient()}
                  className="w-full border border-[var(--color-border)] rounded-xl px-3 py-2.5 text-sm outline-none focus:border-[var(--color-brand)] text-[var(--color-text-primary)]"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-[var(--color-text-secondary)] mb-1.5 block">Cor</label>
                <div className="flex items-center gap-2 flex-wrap">
                  {['#1A1916','#dc2626','#ea580c','#d97706','#16a34a','#0891b2','#2563eb','#7c3aed','#db2777','#475569'].map(c => (
                    <button key={c} onClick={() => setEditClientForm((f: any) => ({ ...f, color_hex: c }))} className="w-7 h-7 rounded-lg transition-all" style={{ background: c, boxShadow: editClientForm.color_hex === c ? `0 0 0 2px white, 0 0 0 4px ${c}` : 'none' }} />
                  ))}
                  <input type="color" value={editClientForm.color_hex} onChange={e => setEditClientForm((f: any) => ({ ...f, color_hex: e.target.value }))} className="w-7 h-7 rounded-lg cursor-pointer border border-[var(--color-border)] p-0.5" />
                </div>
              </div>
              <div>
                <label className="text-xs font-medium text-[var(--color-text-secondary)] mb-1.5 block">Link do Drive</label>
                <input type="url" value={editClientForm.drive_folder_url} onChange={e => setEditClientForm((f: any) => ({ ...f, drive_folder_url: e.target.value }))} placeholder="https://drive.google.com/..." className="w-full border border-[var(--color-border)] rounded-xl px-3 py-2.5 text-sm outline-none focus:border-[var(--color-brand)] text-[var(--color-text-primary)]" />
              </div>
              <div>
                <label className="text-xs font-medium text-[var(--color-text-secondary)] mb-1.5 block">Link do Manual (Sous Chef)</label>
                <input type="url" value={editClientForm.sous_chef_url} onChange={e => setEditClientForm((f: any) => ({ ...f, sous_chef_url: e.target.value }))} placeholder="https://..." className="w-full border border-[var(--color-border)] rounded-xl px-3 py-2.5 text-sm outline-none focus:border-[var(--color-brand)] text-[var(--color-text-primary)]" />
              </div>
              <div>
                <label className="text-xs font-medium text-[var(--color-text-secondary)] mb-1.5 block">Instagram</label>
                <input type="url" value={editClientForm.instagram_url} onChange={e => setEditClientForm((f: any) => ({ ...f, instagram_url: e.target.value }))} placeholder="https://instagram.com/perfil" className="w-full border border-[var(--color-border)] rounded-xl px-3 py-2.5 text-sm outline-none focus:border-[var(--color-brand)] text-[var(--color-text-primary)]" />
              </div>
              <div className="flex gap-3">
                <div className="flex-1">
                  <label className="text-xs font-medium text-[var(--color-text-secondary)] mb-1.5 block">Seguidores</label>
                  <input type="number" value={editClientForm.instagram_followers} onChange={e => setEditClientForm((f: any) => ({ ...f, instagram_followers: e.target.value }))} placeholder="0" className="w-full border border-[var(--color-border)] rounded-xl px-3 py-2.5 text-sm outline-none focus:border-[var(--color-brand)] text-[var(--color-text-primary)]" />
                </div>
                <div className="flex-1">
                  <label className="text-xs font-medium text-[var(--color-text-secondary)] mb-1.5 block">Seguindo</label>
                  <input type="number" value={editClientForm.instagram_following} onChange={e => setEditClientForm((f: any) => ({ ...f, instagram_following: e.target.value }))} placeholder="0" className="w-full border border-[var(--color-border)] rounded-xl px-3 py-2.5 text-sm outline-none focus:border-[var(--color-brand)] text-[var(--color-text-primary)]" />
                </div>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-1">
              <button onClick={() => setShowEditClient(false)} className="px-4 py-2 rounded-xl text-sm font-medium text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-subtle)] transition-colors">Cancelar</button>
              <button onClick={saveEditClient} disabled={savingClient || !editClientForm.name.trim()} className="px-5 py-2 rounded-xl text-sm font-semibold bg-[var(--color-brand)] text-[var(--color-brand-fg)] hover:opacity-90 disabled:opacity-40 transition-opacity">
                {savingClient ? 'Salvando...' : 'Salvar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default function ClientePage({ params }: { params: Promise<{ id: string }> }) {
  return <Suspense><ClientePageInner params={params} /></Suspense>
}
