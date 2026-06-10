'use client'

import { use, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import IPhoneFeed, { FeedPost } from '@/components/IPhoneFeed'

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
const typeColor: Record<string,string> = { 'Reels':'bg-red-50 text-red-600','Carrossel':'bg-blue-50 text-blue-600','Stories':'bg-purple-50 text-purple-600','Carrossel/Stories':'bg-indigo-50 text-indigo-600','Post':'bg-amber-50 text-amber-600' }
const statusColor: Record<string,string> = { 'publicado':'bg-green-50 text-green-600','aprovado':'bg-blue-50 text-blue-600','em produção':'bg-yellow-50 text-yellow-700','pendente':'bg-[var(--color-bg-subtle)] text-[var(--color-text-secondary)]' }
const approvalColor: Record<string,string> = { 'aprovado':'bg-green-50 text-green-600','não aprovado':'bg-red-50 text-red-500' }
const FUNCAO_LABEL: Record<string,string> = { videos:'Editor', posts:'Designer', estrategia:'Estratégia', social:'Social Media', acompanha:'Acompanha', outro:'Outro' }
function getInitials(name: string) { return name.split(' ').map(w=>w[0]).join('').slice(0,2).toUpperCase() }

export default function ClientePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const router = useRouter()
  const [client, setClient] = useState<Client | null>(null)
  const [posts, setPosts] = useState<Post[]>([])
  const [tab, setTab] = useState('cronograma')
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth() + 1)
  const [selectedYear] = useState(new Date().getFullYear())
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState<Post | null>(null)
  const [team, setTeam] = useState<any[]>([])
  const [allMembers, setAllMembers] = useState<any[]>([])
  const [showAddMember, setShowAddMember] = useState(false)
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
              <button className="bg-[var(--color-text-primary)] text-white rounded-lg px-4 py-2 text-sm font-medium">+ Novo post</button>
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
                <div className="flex items-center gap-1">
                  <button onClick={() => setSelectedMonth(m => m===1?12:m-1)} className="w-8 h-8 rounded-lg border border-[#EBEAE5] flex items-center justify-center text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-subtle)]">‹</button>
                  <span className="text-sm font-medium text-[var(--color-text-primary)] w-24 text-center">{MONTHS[selectedMonth-1]} {selectedYear}</span>
                  <button onClick={() => setSelectedMonth(m => m===12?1:m+1)} className="w-8 h-8 rounded-lg border border-[#EBEAE5] flex items-center justify-center text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-subtle)]">›</button>
                </div>
              </div>
              {posts.length === 0 ? (
                <div className="flex items-center justify-center h-48"><p className="text-[var(--color-text-muted)] text-sm">Nenhum post em {MONTHS[selectedMonth-1]}.</p></div>
              ) : (
                <div className="flex flex-col gap-2">
                  {posts.map(post => (
                    <button key={post.id} onClick={() => setSelected(selected?.id===post.id?null:post)}
                      className={`w-full text-left bg-white border rounded-xl px-4 py-3 flex items-center gap-4 hover:shadow-sm transition-all ${selected?.id===post.id?'border-[var(--color-text-primary)]':'border-[#EBEAE5]'}`}
                      style={{borderLeftWidth:3,borderLeftColor:selected?.id===post.id?client.color_hex:'transparent'}}>
                      <span className="text-xs font-bold text-[var(--color-text-muted)] w-8">#{post.post_number}</span>
                      <span className={`text-xs font-semibold px-2 py-1 rounded-full w-28 text-center flex-shrink-0 ${typeColor[post.post_type]||'bg-[var(--color-bg-subtle)] text-[var(--color-text-secondary)]'}`}>{post.post_type||'—'}</span>
                      <span className="text-sm font-medium text-[var(--color-text-primary)] flex-1 truncate">{post.title}</span>
                      <span className="text-xs text-[var(--color-text-muted)] flex-shrink-0">{post.scheduled_date?new Date(post.scheduled_date+'T12:00:00').toLocaleDateString('pt-BR',{day:'2-digit',month:'short'}):'—'}</span>
                      <div className="flex items-center gap-1 flex-shrink-0">
                        {post.approval_status&&post.approval_status!=='pendente'&&<span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${approvalColor[post.approval_status]||''}`}>{post.approval_status==='aprovado'?'✓':'✗'}</span>}
                        <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${statusColor[post.status]||'bg-[var(--color-bg-subtle)] text-[var(--color-text-secondary)]'}`}>{post.status}</span>
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
            <div>
              <div className="flex items-center gap-2 mb-1">
                <span className="text-xs font-bold text-[var(--color-text-muted)]">#{selected.post_number}</span>
                <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${typeColor[selected.post_type]||'bg-[var(--color-bg-subtle)] text-[var(--color-text-secondary)]'}`}>{selected.post_type}</span>
              </div>
              <p className="text-base font-semibold text-[var(--color-text-primary)] leading-snug">{selected.title}</p>
            </div>
            <button onClick={() => setSelected(null)} className="text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] text-xl leading-none flex-shrink-0">×</button>
          </div>
          <div className="flex-1 overflow-y-auto p-5 flex flex-col gap-5">
            <div className="flex gap-4">
              <div className="flex-1"><p className="text-xs text-[var(--color-text-muted)] mb-1">Data estimada</p><p className="text-sm font-medium text-[var(--color-text-primary)]">{selected.scheduled_date?new Date(selected.scheduled_date+'T12:00:00').toLocaleDateString('pt-BR'):'—'}</p></div>
              <div className="flex-1"><p className="text-xs text-[var(--color-text-muted)] mb-1">Status</p><span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${statusColor[selected.status]||''}`}>{selected.status}</span></div>
            </div>
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
        </div>
      )}
    </div>
  )
}
