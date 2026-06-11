'use client'

import { use, useEffect, useState, useRef } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import IPhoneFeed, { FeedPost } from '@/components/IPhoneFeed'
import PostFormModal from '@/components/PostFormModal'

type Client = {
  id: string; name: string; color_hex: string; logo_url: string
  drive_folder_url: string; sous_chef_url: string; status: string
}

type Post = {
  id: string; post_number: number; title: string; copy: string
  post_type: string; scheduled_date: string; status: string
  approval_status: string; approval_comment: string
  drive_url: string; reference_notes: string
}

const MONTHS = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro']
const typeColor: Record<string,string> = { 'reels':'bg-red-100 text-red-700','carrossel':'bg-blue-100 text-blue-700','story':'bg-purple-100 text-purple-700','carrossel_stories':'bg-indigo-100 text-indigo-700','post':'bg-amber-100 text-amber-700' }
const statusColor: Record<string,string> = { 'publicado':'bg-green-50 text-green-600','aprovado':'bg-blue-50 text-blue-600','agendado':'bg-teal-50 text-teal-600','aguardando_aprovacao':'bg-pink-50 text-pink-600','revisao_interna':'bg-purple-50 text-purple-600','producao':'bg-yellow-50 text-yellow-700','pendente':'bg-[var(--color-bg-subtle)] text-[var(--color-text-secondary)]' }
const STATUS_LABEL: Record<string,string> = { producao:'Produção', revisao_interna:'Revisão', aguardando_aprovacao:'Aguardando aprovação', aprovado:'Aprovado', agendado:'Agendado', publicado:'Publicado' }
const TYPE_LABEL: Record<string,string> = { reels:'Reels', carrossel:'Carrossel', post:'Post', story:'Story', carrossel_stories:'Carrossel/Stories' }
const approvalColor: Record<string,string> = { 'aprovado':'bg-green-50 text-green-600','não aprovado':'bg-red-50 text-red-500' }
const FUNCAO_LABEL: Record<string,string> = { videos:'Editor', posts:'Designer', estrategia:'Estratégia', social:'Social Media', acompanha:'Acompanha', outro:'Outro' }
function getInitials(name: string) { return name.split(' ').map(w=>w[0]).join('').slice(0,2).toUpperCase() }

export default function ClientePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const router = useRouter()
  const searchParams = useSearchParams()
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
  const [selected, setSelected] = useState<Post | null>(null)
  const [viewMode, setViewMode] = useState<'list'|'grid'>('list')
  const [editing, setEditing] = useState(false)
  const [editForm, setEditForm] = useState<any>({})
  const [saving, setSaving] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [menuOpen, setMenuOpen] = useState<string | null>(null)
  const [statusOpen, setStatusOpen] = useState<string | null>(null)
  const [team, setTeam] = useState<any[]>([])
  const [allMembers, setAllMembers] = useState<any[]>([])
  const [showAddMember, setShowAddMember] = useState(false)
  const [showNewPost, setShowNewPost] = useState(false)
  const [newMemberId, setNewMemberId] = useState('')
  const [newFuncao, setNewFuncao] = useState('posts')

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
        if (found) setSelected(found)
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
      setLoading(false)
    }
    load()
  }, [id, selectedMonth, selectedYear])

  async function quickStatus(postId: string, newStatus: string) {
    const supabase = createClient()
    await supabase.from('schedules').update({ status: newStatus }).eq('id', postId)
    setPosts(ps => ps.map(p => p.id === postId ? { ...p, status: newStatus } : p))
    setStatusOpen(null)
  }

  async function quickDelete(postId: string) {
    const supabase = createClient()
    await supabase.from('schedules').delete().eq('id', postId)
    setPosts(ps => ps.filter(p => p.id !== postId))
    if (selected?.id === postId) setSelected(null)
    setMenuOpen(null)
  }

  async function quickDuplicate(post: any) {
    const supabase = createClient()
    const { id: _, ...rest } = post
    await supabase.from('schedules').insert({ ...rest, post_number: posts.length + 1, title: post.title + ' (cópia)', approval_status: 'pendente' })
    reloadPosts()
    setMenuOpen(null)
  }

  function quickEdit(post: any) {
    setSelected(post)
    setMenuOpen(null)
    setTimeout(() => startEdit(post), 50)
  }

  function startEdit(post?: any) {
    const p = post || selected
    if (!p) return
    setEditForm({
      title: p.title || '', copy: p.copy || '', post_type: p.post_type || 'reels',
      status: p.status || 'producao', scheduled_date: p.scheduled_date || '',
      drive_url: p.drive_url || '', reference_notes: p.reference_notes || '',
      funil: p.funil || '',
    })
    setEditing(true)
  }

  async function saveEdit() {
    if (!selected || !editForm.title?.trim()) return
    setSaving(true)
    const supabase = createClient()
    await supabase.from('schedules').update({ ...editForm, scheduled_date: editForm.scheduled_date || null }).eq('id', selected.id)
    setSaving(false)
    setEditing(false)
    setSelected((prev: any) => prev ? { ...prev, ...editForm } : null)
    reloadPosts()
  }

  async function deletePost() {
    if (!selected) return
    setDeleting(true)
    const supabase = createClient()
    await supabase.from('schedules').delete().eq('id', selected.id)
    setDeleting(false)
    setConfirmDelete(false)
    setSelected(null)
    reloadPosts()
  }

  async function reloadPosts() {
    const supabase = createClient()
    const { data } = await supabase.from('schedules').select('*').eq('client_id', id).eq('month', selectedMonth).eq('year', selectedYear).order('post_number')
    setPosts(data || [])
  }

  async function addMember() {
    if (!newMemberId) return
    const supabase = createClient()
    await supabase.from('client_team').insert({ client_id: id, member_id: newMemberId, funcao: newFuncao })
    const { data } = await supabase.from('client_team').select('id, funcao, member_id').eq('client_id', id)
    const enriched = (data || []).map(t => ({ ...t, team_members: allMembers.find(m => m.id === t.member_id) }))
    setTeam(enriched)
    setShowAddMember(false)
    setNewMemberId('')
    setNewFuncao('posts')
  }

  async function removeMember(teamId: string) {
    const supabase = createClient()
    await supabase.from('client_team').delete().eq('id', teamId)
    setTeam(t => t.filter(m => m.id !== teamId))
  }

  if (loading) return <div className="p-6 text-sm text-[var(--color-text-muted)]">Carregando...</div>
  if (!client) return <div className="p-6 text-sm text-[var(--color-text-muted)]">Cliente não encontrado</div>

  const approved = posts.filter(p => p.approval_status === 'aprovado').length
  const notApproved = posts.filter(p => p.approval_status === 'não aprovado').length
  const published = posts.filter(p => p.status === 'publicado').length

  return (
    <div className="flex h-full">
      <div className="flex-1 flex flex-col overflow-hidden">
        <div className="p-6 border-b border-[#EBEAE5]">

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
                <h1 className="text-[var(--color-text-primary)] font-semibold text-xl">{client.name}</h1>
                <div className="flex items-center gap-2 mt-1 flex-wrap">
                  <span className="text-xs text-[var(--color-text-muted)]">{posts.length} posts · {MONTHS[selectedMonth-1]} {selectedYear}</span>
                  {notApproved > 0 && <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-red-50 text-red-600">✗ {notApproved} não aprovado{notApproved>1?'s':''}</span>}
                  {approved > 0 && <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-green-50 text-green-600">✓ {approved} aprovado{approved>1?'s':''}</span>}
                  <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-[var(--color-bg-subtle)] text-[var(--color-text-secondary)]">{published}/{posts.length} publicados</span>
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {client.sous_chef_url && <a href={client.sous_chef_url} target="_blank" rel="noopener noreferrer" className="border border-[#EBEAE5] text-[var(--color-text-primary)] rounded-lg px-3 py-2 text-sm font-medium hover:bg-[var(--color-bg-subtle)]">📚 Manual</a>}
              {client.drive_folder_url && <a href={client.drive_folder_url} target="_blank" rel="noopener noreferrer" className="border border-[#EBEAE5] text-[var(--color-text-primary)] rounded-lg px-3 py-2 text-sm font-medium hover:bg-[var(--color-bg-subtle)]">📁 Drive</a>}
              <button onClick={() => setShowNewPost(true)} className="bg-[var(--color-text-primary)] text-white rounded-lg px-4 py-2 text-sm font-medium">+ Novo post</button>
            </div>
          </div>

          <div className="flex items-center gap-1 mt-5">
            {[{key:'cronograma',label:'📅 Cronograma'},{key:'feed',label:'🖼 Feed'},{key:'materiais',label:'📦 Materiais'},{key:'campanhas',label:'📣 Campanhas'},{key:'time',label:'👥 Time'}].map(t => (
              <button key={t.key} onClick={() => setTab(t.key)} className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${tab===t.key?'bg-[var(--color-text-primary)] text-white':'text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-subtle)]'}`}>{t.label}</button>
            ))}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          {tab === 'cronograma' && (
            <div className="flex flex-col gap-4">
              <div className="flex items-center justify-between">
                <p className="text-sm text-[var(--color-text-secondary)]">{posts.length} posts em {MONTHS[selectedMonth-1]}</p>
                <div className="flex items-center gap-3">
                  <div className="flex items-center bg-white border border-[#EBEAE5] rounded-lg p-0.5">
                    <button onClick={() => setViewMode('list')} className={`px-2.5 py-1 rounded-md text-xs font-medium transition-all ${viewMode==='list'?'bg-[var(--color-text-primary)] text-white':'text-[var(--color-text-muted)]'}`}>Lista</button>
                    <button onClick={() => setViewMode('grid')} className={`px-2.5 py-1 rounded-md text-xs font-medium transition-all ${viewMode==='grid'?'bg-[var(--color-text-primary)] text-white':'text-[var(--color-text-muted)]'}`}>Cards</button>
                  </div>
                  <div className="flex items-center gap-1">
                    <button onClick={() => setSelectedMonth(m => m===1?12:m-1)} className="w-8 h-8 rounded-lg border border-[#EBEAE5] flex items-center justify-center text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-subtle)]">‹</button>
                    <span className="text-sm font-medium text-[var(--color-text-primary)] w-24 text-center">{MONTHS[selectedMonth-1]} {selectedYear}</span>
                    <button onClick={() => setSelectedMonth(m => m===12?1:m+1)} className="w-8 h-8 rounded-lg border border-[#EBEAE5] flex items-center justify-center text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-subtle)]">›</button>
                  </div>
                </div>
              </div>
              {posts.length === 0 ? (
                <div className="flex items-center justify-center h-48"><p className="text-[var(--color-text-muted)] text-sm">Nenhum post em {MONTHS[selectedMonth-1]}.</p></div>
              ) : viewMode === 'list' ? (
                <div className="flex flex-col gap-2">
                  {posts.map(post => (
                    <button key={post.id} onClick={() => setSelected(selected?.id===post.id?null:post)}
                      className={`w-full text-left bg-white border rounded-xl px-4 py-3 flex items-center gap-4 hover:shadow-sm transition-all ${selected?.id===post.id?'border-[var(--color-text-primary)]':'border-[#EBEAE5]'}`}
                      style={{borderLeftWidth:3,borderLeftColor:selected?.id===post.id?client.color_hex:'transparent'}}>
                      <span className="text-xs font-bold text-[var(--color-text-muted)] w-8">#{post.post_number}</span>
                      <span className={`text-xs font-semibold px-2 py-1 rounded-full w-28 text-center flex-shrink-0 ${typeColor[post.post_type]||'bg-[var(--color-bg-subtle)] text-[var(--color-text-secondary)]'}`}>{TYPE_LABEL[post.post_type]||post.post_type||'—'}</span>
                      <span className="text-sm font-medium text-[var(--color-text-primary)] flex-1 truncate">{post.title}</span>
                      <span className="text-xs text-[var(--color-text-muted)] flex-shrink-0">{post.scheduled_date?new Date(post.scheduled_date+'T12:00:00').toLocaleDateString('pt-BR',{day:'2-digit',month:'short'}):'—'}</span>
                      <div className="flex items-center gap-1 flex-shrink-0">
                        {post.approval_status&&post.approval_status!=='pendente'&&<span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${approvalColor[post.approval_status]||''}`}>{post.approval_status==='aprovado'?'✓':'✗'}</span>}
                        <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${statusColor[post.status]||'bg-[var(--color-bg-subtle)] text-[var(--color-text-secondary)]'}`}>{STATUS_LABEL[post.status]||post.status}</span>
                      </div>
                    </button>
                  ))}
                </div>
              ) : (
                <div className="grid grid-cols-3 gap-4">
                  {posts.map(post => (
                    <button key={post.id} onClick={() => setSelected(selected?.id===post.id?null:post)}
                      className={`group text-left bg-white border rounded-2xl p-5 flex flex-col gap-3 hover:shadow-md transition-all ${selected?.id===post.id?'border-transparent':'border-[#EBEAE5]'}`}
                      style={selected?.id===post.id?{boxShadow:`0 0 0 2px ${client.color_hex}`}:{}}>
                      <div className="flex items-center justify-between relative">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-bold text-[var(--color-text-faint)]">#{post.post_number}</span>
                          <span className={`text-sm font-bold px-3 py-1 rounded-lg ${typeColor[post.post_type]||'bg-[var(--color-bg-subtle)] text-[var(--color-text-secondary)]'}`}>{TYPE_LABEL[post.post_type]||post.post_type||'—'}</span>
                        </div>
                        <span onClick={(e) => { e.stopPropagation(); setMenuOpen(menuOpen===post.id?null:post.id) }} className="w-6 h-6 rounded-md hover:bg-[var(--color-bg-subtle)] flex items-center justify-center text-[var(--color-text-muted)] cursor-pointer opacity-0 group-hover:opacity-100 transition-opacity" title="Ações">⋯</span>
                        {menuOpen===post.id && (
                          <>
                            <div className="fixed inset-0 z-40" onClick={(e) => { e.stopPropagation(); setMenuOpen(null) }} />
                            <div className="absolute right-0 top-8 z-50 bg-white rounded-xl border border-[#EBEAE5] py-1 w-36" onClick={e => e.stopPropagation()}>
                              <button onClick={() => quickEdit(post)} className="w-full text-left px-3 py-2 text-xs text-[var(--color-text-primary)] hover:bg-[var(--color-bg-subtle)] flex items-center gap-2">✏️ Editar</button>
                              <button onClick={() => quickDuplicate(post)} className="w-full text-left px-3 py-2 text-xs text-[var(--color-text-primary)] hover:bg-[var(--color-bg-subtle)] flex items-center gap-2">📋 Duplicar</button>
                              <button onClick={() => quickDelete(post.id)} className="w-full text-left px-3 py-2 text-xs text-red-500 hover:bg-red-50 flex items-center gap-2">🗑️ Excluir</button>
                            </div>
                          </>
                        )}
                      </div>
                      <p className="text-[var(--color-text-primary)] font-semibold text-base leading-snug line-clamp-2">{post.title}</p>
                      {post.copy && <p className="text-[var(--color-text-muted)] text-xs leading-relaxed line-clamp-3">{post.copy}</p>}
                      {(post as any).funil && <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-[var(--color-bg-subtle)] text-[var(--color-text-secondary)] w-fit">{(post as any).funil}</span>}
                      {post.drive_url && <a href={post.drive_url} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()} className="flex items-center gap-1.5 text-[11px] text-blue-600 hover:underline truncate"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="flex-shrink-0"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg><span className="truncate">Link do Drive</span></a>}
                      {post.reference_notes && <p className="text-[10px] text-[var(--color-text-faint)] leading-relaxed line-clamp-2 italic">Ref: {post.reference_notes}</p>}
                      <div className="flex items-center justify-between mt-auto pt-2 border-t border-[var(--color-bg-subtle)]">
                        <span className="text-xs text-[var(--color-text-muted)]">{post.scheduled_date?new Date(post.scheduled_date+'T12:00:00').toLocaleDateString('pt-BR',{day:'2-digit',month:'short'}):'Sem data'}</span>
                        <div className="flex items-center gap-1.5 relative">
                          {post.approval_status&&post.approval_status!=='pendente'&&<span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${approvalColor[post.approval_status]||''}`}>{post.approval_status==='aprovado'?'✓':'✗'}</span>}
                          <span onClick={(e) => { e.stopPropagation(); setStatusOpen(statusOpen===post.id?null:post.id) }} className={`text-[10px] font-semibold px-2 py-0.5 rounded-full cursor-pointer hover:ring-1 hover:ring-[var(--color-border-strong)] ${statusColor[post.status]||'bg-[var(--color-bg-subtle)] text-[var(--color-text-secondary)]'}`}>{STATUS_LABEL[post.status]||post.status}</span>
                          {statusOpen===post.id && (
                            <>
                              <div className="fixed inset-0 z-40" onClick={(e) => { e.stopPropagation(); setStatusOpen(null) }} />
                              <div className="absolute right-0 bottom-7 z-50 bg-white rounded-xl border border-[#EBEAE5] py-1 w-44" onClick={e => e.stopPropagation()}>
                                {Object.entries(STATUS_LABEL).map(([v,l]) => (
                                  <button key={v} onClick={() => quickStatus(post.id, v)} className={`w-full text-left px-3 py-1.5 text-xs hover:bg-[var(--color-bg-subtle)] ${post.status===v?'font-semibold text-[var(--color-text-primary)]':'text-[var(--color-text-secondary)]'}`}>{l}</button>
                                ))}
                              </div>
                            </>
                          )}
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {tab === 'feed' && (
            <div className="flex flex-col gap-4">
              <div className="flex items-center justify-between">
                <p className="text-sm text-[var(--color-text-secondary)]">Feed · {MONTHS[selectedMonth-1]}</p>
                <div className="flex items-center gap-1">
                  <button onClick={() => setSelectedMonth(m => m===1?12:m-1)} className="w-8 h-8 rounded-lg border border-[#EBEAE5] flex items-center justify-center text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-subtle)]">‹</button>
                  <span className="text-sm font-medium text-[var(--color-text-primary)] w-24 text-center">{MONTHS[selectedMonth-1]} {selectedYear}</span>
                  <button onClick={() => setSelectedMonth(m => m===12?1:m+1)} className="w-8 h-8 rounded-lg border border-[#EBEAE5] flex items-center justify-center text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-subtle)]">›</button>
                </div>
              </div>
              <IPhoneFeed
                posts={posts.map(p => ({
                  id: p.id,
                  title: p.title || 'Post sem título',
                  type: p.post_type === 'Reels' ? 'reel' : p.post_type === 'Carrossel' || p.post_type === 'Carrossel/Stories' ? 'carousel' : 'photo',
                  status: p.approval_status === 'aprovado' ? 'approved' : p.approval_status === 'não aprovado' ? 'changes_requested' : p.status === 'publicado' ? 'approved' : 'pending',
                  drive_url: p.drive_url,
                  copy: p.copy,
                  scheduled_date: p.scheduled_date,
                }))}
                clientName={client.name}
                clientColor={client.color_hex}
                clientInitials={getInitials(client.name)}
                onReorder={async (reordered) => {
                  await Promise.all(reordered.map(p => createClient().from('schedules').update({ feed_order: p.feed_order }).eq('id', p.id)))
                }}
              />
            </div>
          )}

          {tab === 'materiais' && (
            <div className="flex flex-col items-center justify-center h-48 text-center">
              <p className="text-2xl mb-2">📦</p>
              <p className="text-sm font-medium text-[var(--color-text-primary)]">Materiais extras</p>
              <p className="text-xs text-[var(--color-text-muted)] mt-1">Menus, brindes, materiais de evento e artes avulsas.</p>
              <button className="mt-4 bg-[var(--color-text-primary)] text-white rounded-lg px-4 py-2 text-sm font-medium">+ Novo material</button>
            </div>
          )}

          {tab === 'campanhas' && (
            <div className="flex flex-col items-center justify-center h-48 text-center">
              <p className="text-2xl mb-2">📣</p>
              <p className="text-sm font-medium text-[var(--color-text-primary)]">Campanhas</p>
              <p className="text-xs text-[var(--color-text-muted)] mt-1">Posts deste cliente vinculados a campanhas ativas.</p>
            </div>
          )}

          {tab === 'time' && (
            <div className="flex flex-col gap-4 max-w-2xl">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium text-[var(--color-text-primary)]">Time deste cliente</p>
                <button onClick={() => setShowAddMember(true)} className="bg-[var(--color-text-primary)] text-white rounded-lg px-3 py-1.5 text-sm font-medium">+ Atribuir pessoa</button>
              </div>

              {team.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-40 text-center border border-dashed border-[#EBEAE5] rounded-2xl">
                  <p className="text-2xl mb-2">👥</p>
                  <p className="text-sm text-[var(--color-text-muted)]">Nenhuma pessoa atribuída ainda.</p>
                </div>
              ) : (
                <div className="flex flex-col gap-2">
                  {team.map(m => (
                    <div key={m.id} className="flex items-center gap-3 bg-white border border-[#EBEAE5] rounded-xl px-4 py-3">
                      <div className="w-9 h-9 rounded-full bg-[var(--color-text-primary)] flex items-center justify-center text-white text-xs font-semibold flex-shrink-0">
                        {getInitials(m.team_members?.name || '?')}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-[var(--color-text-primary)]">{m.team_members?.name}</p>
                        <p className="text-xs text-[var(--color-text-muted)] capitalize">{m.team_members?.role?.replace('_',' ')}</p>
                      </div>
                      <span className="text-xs font-medium px-2.5 py-1 rounded-lg bg-[var(--color-bg-subtle)] text-[var(--color-text-secondary)]">{FUNCAO_LABEL[m.funcao] || m.funcao}</span>
                      <button onClick={() => removeMember(m.id)} className="text-[var(--color-text-muted)] hover:text-red-500 transition-colors text-lg leading-none">×</button>
                    </div>
                  ))}
                </div>
              )}

              {showAddMember && (
                <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={e => { if (e.target === e.currentTarget) setShowAddMember(false) }}>
                  <div className="bg-white rounded-2xl w-full max-w-sm p-6">
                    <p className="font-semibold text-[var(--color-text-primary)] mb-4">Atribuir pessoa</p>
                    <div className="flex flex-col gap-3">
                      <div>
                        <label className="text-xs text-[var(--color-text-muted)] mb-1 block">Pessoa</label>
                        <select value={newMemberId} onChange={e => setNewMemberId(e.target.value)} className="w-full border border-[#EBEAE5] rounded-lg px-3 py-2 text-sm bg-white outline-none">
                          <option value="">Selecione...</option>
                          {allMembers.filter(am => !team.some(t => t.member_id === am.id)).map(am => (
                            <option key={am.id} value={am.id}>{am.name}</option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="text-xs text-[var(--color-text-muted)] mb-1 block">Função neste cliente</label>
                        <select value={newFuncao} onChange={e => setNewFuncao(e.target.value)} className="w-full border border-[#EBEAE5] rounded-lg px-3 py-2 text-sm bg-white outline-none">
                          <option value="videos">Editor (vídeos)</option>
                          <option value="posts">Designer (posts)</option>
                          <option value="estrategia">Estratégia / Cronograma</option>
                          <option value="social">Social Media</option>
                          <option value="acompanha">Acompanha</option>
                        </select>
                      </div>
                      <div className="flex gap-2 mt-2">
                        <button onClick={() => setShowAddMember(false)} className="flex-1 py-2 text-sm border border-[#EBEAE5] rounded-lg text-[var(--color-text-secondary)]">Cancelar</button>
                        <button onClick={addMember} disabled={!newMemberId} className="flex-1 py-2 text-sm bg-[var(--color-text-primary)] text-white rounded-lg disabled:opacity-50">Adicionar</button>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {selected && (
        <div className="w-96 border-l border-[#EBEAE5] flex flex-col overflow-hidden bg-white">
          <div className="p-5 border-b border-[#EBEAE5] flex items-start justify-between gap-3">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-xs font-bold text-[var(--color-text-muted)]">#{selected.post_number}</span>
                <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${typeColor[selected.post_type]||'bg-[var(--color-bg-subtle)] text-[var(--color-text-secondary)]'}`}>{TYPE_LABEL[selected.post_type]||selected.post_type}</span>
              </div>
              <p className="text-base font-semibold text-[var(--color-text-primary)] leading-snug">{selected.title}</p>
            </div>
            <div className="flex items-center gap-1 flex-shrink-0">
              {!editing && (
                <>
                  <button onClick={startEdit} className="w-8 h-8 rounded-lg hover:bg-[var(--color-bg-subtle)] flex items-center justify-center text-[var(--color-text-secondary)]" title="Editar">
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                  </button>
                  <button onClick={() => setConfirmDelete(true)} className="w-8 h-8 rounded-lg hover:bg-red-50 flex items-center justify-center text-[var(--color-text-secondary)] hover:text-red-500" title="Excluir">
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                  </button>
                </>
              )}
              <button onClick={() => { setSelected(null); setEditing(false); setConfirmDelete(false) }} className="w-8 h-8 rounded-lg hover:bg-[var(--color-bg-subtle)] flex items-center justify-center text-[var(--color-text-muted)] text-lg leading-none">×</button>
            </div>
          </div>

          {confirmDelete && (
            <div className="p-4 bg-red-50 border-b border-red-100 flex items-center justify-between gap-3">
              <p className="text-sm text-red-700 font-medium">Excluir este post?</p>
              <div className="flex gap-2">
                <button onClick={() => setConfirmDelete(false)} className="px-3 py-1.5 text-xs border border-[#EBEAE5] rounded-lg bg-white text-[var(--color-text-secondary)]">Cancelar</button>
                <button onClick={deletePost} disabled={deleting} className="px-3 py-1.5 text-xs bg-red-500 text-white rounded-lg disabled:opacity-50">{deleting?'Excluindo...':'Excluir'}</button>
              </div>
            </div>
          )}
          {editing ? (
            <div className="flex-1 overflow-y-auto p-5 flex flex-col gap-4">
              <div><label className="text-xs text-[var(--color-text-muted)] mb-1 block">Título *</label><input value={editForm.title} onChange={e => setEditForm((f:any)=>({...f,title:e.target.value}))} className="w-full border border-[#EBEAE5] rounded-lg px-3 py-2 text-sm text-[var(--color-text-primary)] outline-none focus:border-[#1A1916]" /></div>
              <div className="grid grid-cols-2 gap-3">
                <div><label className="text-xs text-[var(--color-text-muted)] mb-1 block">Tipo</label><select value={editForm.post_type} onChange={e => setEditForm((f:any)=>({...f,post_type:e.target.value}))} className="w-full border border-[#EBEAE5] rounded-lg px-3 py-2 text-sm bg-white outline-none">{Object.entries(TYPE_LABEL).map(([v,l])=><option key={v} value={v}>{l}</option>)}</select></div>
                <div><label className="text-xs text-[var(--color-text-muted)] mb-1 block">Status</label><select value={editForm.status} onChange={e => setEditForm((f:any)=>({...f,status:e.target.value}))} className="w-full border border-[#EBEAE5] rounded-lg px-3 py-2 text-sm bg-white outline-none">{Object.entries(STATUS_LABEL).map(([v,l])=><option key={v} value={v}>{l}</option>)}</select></div>
              </div>
              <div><label className="text-xs text-[var(--color-text-muted)] mb-1 block">Funil</label><input list="funil-edit-cliente" value={editForm.funil} onChange={e => setEditForm((f:any)=>({...f,funil:e.target.value}))} placeholder="Escolha ou escreva..." className="w-full border border-[#EBEAE5] rounded-lg px-3 py-2 text-sm bg-white outline-none focus:border-[#1A1916]" /><datalist id="funil-edit-cliente">{['Topo de funil','Meio de funil','Fundo de funil','Institucional','Promocional','Engajamento','Venda'].map(o=><option key={o} value={o} />)}</datalist></div>
              <div><label className="text-xs text-[var(--color-text-muted)] mb-1 block">Data estimada</label><input type="date" value={editForm.scheduled_date} onChange={e => setEditForm((f:any)=>({...f,scheduled_date:e.target.value}))} className="w-full border border-[#EBEAE5] rounded-lg px-3 py-2 text-sm outline-none focus:border-[#1A1916]" /></div>
              <div><label className="text-xs text-[var(--color-text-muted)] mb-1 block">Copy / Briefing</label><textarea value={editForm.copy} onChange={e => setEditForm((f:any)=>({...f,copy:e.target.value}))} rows={4} className="w-full border border-[#EBEAE5] rounded-lg px-3 py-2 text-sm outline-none focus:border-[#1A1916] resize-none" /></div>
              <div><label className="text-xs text-[var(--color-text-muted)] mb-1 block">Link Drive</label><input value={editForm.drive_url} onChange={e => setEditForm((f:any)=>({...f,drive_url:e.target.value}))} className="w-full border border-[#EBEAE5] rounded-lg px-3 py-2 text-sm outline-none focus:border-[#1A1916]" /></div>
              <div><label className="text-xs text-[var(--color-text-muted)] mb-1 block">Referências</label><textarea value={editForm.reference_notes} onChange={e => setEditForm((f:any)=>({...f,reference_notes:e.target.value}))} rows={2} className="w-full border border-[#EBEAE5] rounded-lg px-3 py-2 text-sm outline-none focus:border-[#1A1916] resize-none" /></div>
              <div className="flex gap-2 mt-2">
                <button onClick={() => setEditing(false)} className="flex-1 py-2 text-sm border border-[#EBEAE5] rounded-lg text-[var(--color-text-secondary)]">Cancelar</button>
                <button onClick={saveEdit} disabled={saving||!editForm.title?.trim()} className="flex-1 py-2 text-sm bg-[var(--color-text-primary)] text-white rounded-lg disabled:opacity-50">{saving?'Salvando...':'Salvar'}</button>
              </div>
            </div>
          ) : (
          <div className="flex-1 overflow-y-auto p-5 flex flex-col gap-5">
            <div className="flex gap-4">
              <div className="flex-1"><p className="text-xs text-[var(--color-text-muted)] mb-1">Data estimada</p><p className="text-sm font-medium text-[var(--color-text-primary)]">{selected.scheduled_date?new Date(selected.scheduled_date+'T12:00:00').toLocaleDateString('pt-BR'):'—'}</p></div>
              <div className="flex-1"><p className="text-xs text-[var(--color-text-muted)] mb-1">Status</p><span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${statusColor[selected.status]||''}`}>{STATUS_LABEL[selected.status]||selected.status}</span></div>
            </div>
            {(selected as any).funil&&<div><p className="text-xs text-[var(--color-text-muted)] mb-1">Funil</p><span className="text-xs font-medium px-2.5 py-1 rounded-full bg-[var(--color-bg-subtle)] text-[var(--color-text-secondary)]">{(selected as any).funil}</span></div>}
            {selected.approval_status&&selected.approval_status!=='pendente'&&(
              <div>
                <p className="text-xs text-[var(--color-text-muted)] mb-2">Aprovação do cliente</p>
                <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${approvalColor[selected.approval_status]||''}`}>{selected.approval_status}</span>
                {selected.approval_comment&&<p className="text-sm text-[var(--color-text-secondary)] mt-2 italic">"{selected.approval_comment}"</p>}
              </div>
            )}
            {selected.copy&&<div><p className="text-xs text-[var(--color-text-muted)] mb-2">Copy / Briefing</p><p className="text-sm text-[var(--color-text-primary)] whitespace-pre-wrap leading-relaxed">{selected.copy}</p></div>}
            {selected.drive_url&&<div><p className="text-xs text-[var(--color-text-muted)] mb-1">Link Drive</p><a href={selected.drive_url} target="_blank" rel="noopener noreferrer" className="text-sm text-blue-600 underline break-all">{selected.drive_url}</a></div>}
            {selected.reference_notes&&<div><p className="text-xs text-[var(--color-text-muted)] mb-1">Referências</p><p className="text-sm text-[var(--color-text-primary)] whitespace-pre-wrap">{selected.reference_notes}</p></div>}
          </div>
          )}
        </div>
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
    </div>
  )
}
