'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase'
import { Plus, ChevronDown, ChevronUp, Check, Trash2 } from 'lucide-react'

const SEASONAL = [
  { type: 'natal',     name: 'Natal & Réveillon', emoji: '🎄', month: 12, day: 25, leadDays: 60, theme: { bg: '#FEF2F2', border: '#FECACA', accent: '#DC2626' } },
  { type: 'maes',      name: 'Dia das Mães',       emoji: '🌸', month: 5,  day: 11, leadDays: 45, theme: { bg: '#FDF2F8', border: '#FBCFE8', accent: '#DB2777' } },
  { type: 'namorados', name: 'Dia dos Namorados',  emoji: '💕', month: 6,  day: 12, leadDays: 45, theme: { bg: '#FFF1F2', border: '#FECDD3', accent: '#E11D48' } },
  { type: 'pascoa',    name: 'Páscoa',             emoji: '🐣', month: 4,  day: 20, leadDays: 30, theme: { bg: '#FFFBEB', border: '#FDE68A', accent: '#D97706' } },
  { type: 'carnaval',  name: 'Carnaval',           emoji: '🎭', month: 2,  day: 28, leadDays: 30, theme: { bg: '#F5F3FF', border: '#DDD6FE', accent: '#7C3AED' } },
  { type: 'pais',      name: 'Dia dos Pais',       emoji: '👔', month: 8,  day: 11, leadDays: 30, theme: { bg: '#EFF6FF', border: '#BFDBFE', accent: '#0369A1' } },
]

function getDaysUntil(month: number, day: number) {
  const now = new Date()
  const year = (now.getMonth() + 1 > month || (now.getMonth() + 1 === month && now.getDate() > day))
    ? now.getFullYear() + 1 : now.getFullYear()
  const target = new Date(year, month - 1, day)
  return Math.ceil((target.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
}

function getStatus(days: number, leadDays: number) {
  if (days < 0)          return { label: 'Concluída',      color: '#059669', bg: '#D1FAE5' }
  if (days <= 14)        return { label: `${days}d · urgente`, color: '#DC2626', bg: '#FEE2E2' }
  if (days <= leadDays)  return { label: `${days} dias`,   color: '#D97706', bg: '#FEF3C7' }
  return                        { label: `${days} dias`,   color: '#6B7280', bg: '#F3F4F6' }
}

const TYPE_LABEL: Record<string,string> = { reels:'Reel', carrossel:'Carrossel', post:'Post', story:'Story', carrossel_stories:'C+S' }
const TYPE_BG:    Record<string,string> = { reels:'#FEE2E2', carrossel:'#DBEAFE', post:'#FEF3C7', story:'#EDE9FE', carrossel_stories:'#E0E7FF' }
const TYPE_TEXT:  Record<string,string> = { reels:'#B91C1C', carrossel:'#1E40AF', post:'#92400E', story:'#5B21B6', carrossel_stories:'#3730A3' }
const STATUS_BG:  Record<string,string> = { producao:'#FEF3C7', aprovado:'#D1FAE5', publicado:'#D1FAE5', aguardando_aprovacao:'#FCE7F3', revisao_interna:'#EDE9FE', agendado:'#DBEAFE' }
const STATUS_TX:  Record<string,string> = { producao:'#92400E', aprovado:'#065F46', publicado:'#065F46', aguardando_aprovacao:'#9D174D', revisao_interna:'#5B21B6', agendado:'#1E40AF' }
const STATUS_LB:  Record<string,string> = { producao:'Produção', revisao_interna:'Revisão', aguardando_aprovacao:'Aguardando', aprovado:'Aprovado', agendado:'Agendado', publicado:'Publicado' }

interface CampaignsTabProps {
  clientId: string
  clientColor: string
  members: any[]
}

export default function CampaignsTab({ clientId, clientColor, members }: CampaignsTabProps) {
  const supabase = createClient()
  const [campaigns, setCampaigns]     = useState<any[]>([])
  const [posts, setPosts]             = useState<any[]>([])
  const [expanded, setExpanded]       = useState<string | null>(null)
  const [loading, setLoading]         = useState(true)
  const [newExtra, setNewExtra]       = useState<Record<string,string>>({})
  const [addingExtra, setAddingExtra] = useState<string | null>(null)
  const [showCustom, setShowCustom]   = useState(false)
  const [customName, setCustomName]   = useState('')
  const [saving, setSaving]           = useState<string | null>(null)

  useEffect(() => { load() }, [clientId])

  async function load() {
    const [{ data: camps }, { data: ps }] = await Promise.all([
      supabase.from('campaigns').select('*, campaign_extras(*)').eq('client_id', clientId),
      supabase.from('schedules').select('id, post_number, title, post_type, status, approval_status, drive_url, campaign_type').eq('client_id', clientId).order('post_number'),
    ])
    setCampaigns(camps || [])
    setPosts(ps || [])
    setLoading(false)
  }

  async function activate(type: string, name: string) {
    setSaving(type)
    const { data, error } = await supabase.from('campaigns')
      .insert({ client_id: clientId, type, name, active: true })
      .select('*, campaign_extras(*)')
      .single()
    if (data) {
      setCampaigns(c => [...c, data])
      setExpanded(data.id)
    }
    if (error) console.error('activate error', error)
    setSaving(null)
  }

  async function deactivate(campId: string) {
    await supabase.from('campaigns').update({ active: false }).eq('id', campId)
    setCampaigns(c => c.map(x => x.id === campId ? { ...x, active: false } : x))
  }

  async function reactivate(campId: string) {
    await supabase.from('campaigns').update({ active: true }).eq('id', campId)
    setCampaigns(c => c.map(x => x.id === campId ? { ...x, active: true } : x))
  }

  async function addExtra(campId: string) {
    const text = newExtra[campId]?.trim()
    if (!text) return
    const { data } = await supabase.from('campaign_extras').insert({ campaign_id: campId, title: text }).select().single()
    if (data) {
      setCampaigns(c => c.map(x => x.id === campId ? { ...x, campaign_extras: [...(x.campaign_extras || []), data] } : x))
      setNewExtra(t => ({ ...t, [campId]: '' }))
      setAddingExtra(null)
    }
  }

  async function toggleExtra(campId: string, extraId: string, done: boolean) {
    await supabase.from('campaign_extras').update({ done: !done }).eq('id', extraId)
    setCampaigns(c => c.map(x => x.id === campId ? {
      ...x, campaign_extras: x.campaign_extras.map((e: any) => e.id === extraId ? { ...e, done: !done } : e)
    } : x))
  }

  async function deleteExtra(campId: string, extraId: string) {
    await supabase.from('campaign_extras').delete().eq('id', extraId)
    setCampaigns(c => c.map(x => x.id === campId ? {
      ...x, campaign_extras: x.campaign_extras.filter((e: any) => e.id !== extraId)
    } : x))
  }

  async function saveBriefing(campId: string, briefing: string) {
    await supabase.from('campaigns').update({ briefing }).eq('id', campId)
  }

  async function linkPost(postId: string, campType: string) {
    await supabase.from('schedules').update({ campaign_type: campType }).eq('id', postId)
    setPosts(p => p.map(x => x.id === postId ? { ...x, campaign_type: campType } : x))
  }

  async function unlinkPost(postId: string) {
    await supabase.from('schedules').update({ campaign_type: null }).eq('id', postId)
    setPosts(p => p.map(x => x.id === postId ? { ...x, campaign_type: null } : x))
  }

  async function createCustom() {
    if (!customName.trim()) return
    const { data } = await supabase.from('campaigns')
      .insert({ client_id: clientId, type: 'custom', name: customName, active: true })
      .select('*, campaign_extras(*)')
      .single()
    if (data) { setCampaigns(c => [...c, data]); setExpanded(data.id); setShowCustom(false); setCustomName('') }
  }

  if (loading) return <div className="p-4 text-sm text-[#A8A59E]">Carregando campanhas...</div>

  const customCampaigns = campaigns.filter(c => c.type === 'custom')

  return (
    <div className="flex flex-col gap-3">
      {/* Header */}
      <div className="flex items-center justify-between mb-1">
        <div>
          <p className="text-sm font-semibold text-[#1A1916]">Campanhas</p>
          <p className="text-xs text-[#6B6963] mt-0.5">Sazonais + personalizadas · integradas ao cronograma</p>
        </div>
        <button onClick={() => setShowCustom(true)} className="flex items-center gap-1.5 bg-[#1A1916] text-white rounded-lg px-3 py-1.5 text-xs font-medium">
          <Plus size={13} /> Nova campanha
        </button>
      </div>

      {/* Custom form */}
      {showCustom && (
        <div className="bg-white border border-[#EBEAE5] rounded-xl p-3 flex gap-2">
          <input autoFocus value={customName} onChange={e => setCustomName(e.target.value)} onKeyDown={e => e.key === 'Enter' && createCustom()} placeholder="Nome da campanha personalizada..." className="flex-1 text-sm border border-[#EBEAE5] rounded-lg px-3 py-2 outline-none focus:border-[#1A1916]" />
          <button onClick={createCustom} className="bg-[#1A1916] text-white text-xs font-medium px-3 py-2 rounded-lg">Criar</button>
          <button onClick={() => setShowCustom(false)} className="text-[#A8A59E] text-xs px-2">×</button>
        </div>
      )}

      {/* Sazonais */}
      {SEASONAL.map(s => {
        const camp = campaigns.find(c => c.type === s.type)
        const isActive = camp?.active === true
        const isExpanded = expanded === (camp?.id || s.type)
        const days = getDaysUntil(s.month, s.day)
        const status = getStatus(days, s.leadDays)
        const campPosts = posts.filter(p => p.campaign_type === s.type)
        const availablePosts = posts.filter(p => !p.campaign_type)
        const extras = camp?.campaign_extras || []
        const doneExtras = extras.filter((e: any) => e.done).length

        return (
          <div key={s.type} className="bg-white border border-[#EBEAE5] rounded-xl overflow-hidden" style={isExpanded ? { borderColor: s.theme.border } : {}}>
            {/* Header — dois elementos separados: área clicável + botão ativar */}
            <div className="flex items-center" style={isExpanded ? { background: s.theme.bg } : {}}>
              {/* Área clicável para expand */}
              <div className="flex items-center gap-3 px-4 py-3 flex-1 cursor-pointer hover:bg-black/5 transition-colors" onClick={() => setExpanded(isExpanded ? null : (camp?.id || s.type))}>
                <span className="text-xl flex-shrink-0">{s.emoji}</span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-semibold text-[#1A1916]">{s.name}</p>
                    {camp && !isActive && <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-[#F2F0EB] text-[#A8A59E]">inativa</span>}
                  </div>
                  <p className="text-xs text-[#6B6963] mt-0.5">{s.day}/{s.month} · {campPosts.length} posts · {extras.length} extras</p>
                </div>
                <span className="text-[11px] font-medium px-2 py-0.5 rounded-full flex-shrink-0" style={{ background: status.bg, color: status.color }}>{status.label}</span>
                {isExpanded ? <ChevronUp size={14} className="text-[#A8A59E] flex-shrink-0" /> : <ChevronDown size={14} className="text-[#A8A59E] flex-shrink-0" />}
              </div>

              {/* Botão ativar/desativar — FORA da área clicável */}
              <div className="px-3 flex-shrink-0" onClick={e => e.stopPropagation()}>
                {!camp ? (
                  <button
                    disabled={saving === s.type}
                    onClick={() => activate(s.type, s.name)}
                    className="text-xs font-medium px-3 py-1.5 rounded-lg border border-[#EBEAE5] text-[#1A1916] hover:bg-[#F2F0EB] transition-colors disabled:opacity-50"
                  >
                    {saving === s.type ? '...' : 'Ativar'}
                  </button>
                ) : isActive ? (
                  <button
                    onClick={() => deactivate(camp.id)}
                    className="text-xs font-medium px-3 py-1.5 rounded-lg text-white transition-colors"
                    style={{ background: s.theme.accent }}
                  >
                    Ativa
                  </button>
                ) : (
                  <button
                    onClick={() => reactivate(camp.id)}
                    className="text-xs font-medium px-3 py-1.5 rounded-lg border border-[#EBEAE5] text-[#6B6963] hover:bg-[#F2F0EB] transition-colors"
                  >
                    Reativar
                  </button>
                )}
              </div>
            </div>

            {/* Body expandido */}
            {isExpanded && isActive && camp && (
              <div className="border-t p-4 flex flex-col gap-4" style={{ borderColor: s.theme.border }}>

                {/* Posts do cronograma */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-[#A8A59E]">Posts do cronograma</p>
                    <span className="text-[11px] text-[#A8A59E]">{campPosts.length} vinculados</span>
                  </div>
                  {campPosts.length > 0 && (
                    <div className="flex flex-col gap-1.5 mb-2">
                      {campPosts.map(p => (
                        <div key={p.id} className="group flex items-center gap-2 bg-[#FAFAF8] border border-[#EBEAE5] rounded-lg px-3 py-2">
                          <span className="text-xs font-bold text-[#A8A59E] w-6 flex-shrink-0">#{p.post_number}</span>
                          <span className="text-[10px] font-medium px-1.5 py-0.5 rounded flex-shrink-0" style={{ background: TYPE_BG[p.post_type]||'#F3F4F6', color: TYPE_TEXT[p.post_type]||'#374151' }}>{TYPE_LABEL[p.post_type]||p.post_type}</span>
                          <span className="text-xs text-[#1A1916] flex-1 truncate">{p.title}</span>
                          <span className="text-[10px] font-medium px-1.5 py-0.5 rounded flex-shrink-0" style={{ background: STATUS_BG[p.status]||'#F3F4F6', color: STATUS_TX[p.status]||'#374151' }}>{STATUS_LB[p.status]||p.status}</span>
                          <button onClick={() => unlinkPost(p.id)} className="opacity-0 group-hover:opacity-100 text-[#A8A59E] hover:text-red-500 transition-all flex-shrink-0"><Trash2 size={11} /></button>
                        </div>
                      ))}
                    </div>
                  )}
                  {availablePosts.length > 0 && (
                    <select onChange={e => { if (e.target.value) { linkPost(e.target.value, s.type); e.target.value = '' } }} className="w-full text-xs border border-dashed border-[#D4D1CB] rounded-lg px-3 py-1.5 bg-white outline-none text-[#6B6963] cursor-pointer">
                      <option value="">+ Vincular post do cronograma...</option>
                      {availablePosts.map(p => <option key={p.id} value={p.id}>#{p.post_number} · {p.title || 'Post sem título'}</option>)}
                    </select>
                  )}
                  {campPosts.length === 0 && availablePosts.length === 0 && <p className="text-xs text-[#C8C5BE]">Nenhum post disponível no cronograma.</p>}
                </div>

                {/* Extras */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-[#A8A59E]">Extras da campanha</p>
                    {extras.length > 0 && <span className="text-[11px] text-[#A8A59E]">{doneExtras}/{extras.length}</span>}
                  </div>
                  {extras.length > 0 && (
                    <div className="w-full h-1 bg-[#F2F0EB] rounded-full mb-3 overflow-hidden">
                      <div className="h-full rounded-full transition-all" style={{ width: `${(doneExtras/extras.length)*100}%`, background: s.theme.accent }} />
                    </div>
                  )}
                  <div className="flex flex-col gap-1.5 mb-2">
                    {extras.map((e: any) => (
                      <div key={e.id} className="group flex items-center gap-2.5 bg-[#FAFAF8] border border-[#EBEAE5] rounded-lg px-3 py-2">
                        <button onClick={() => toggleExtra(camp.id, e.id, e.done)} className="w-4 h-4 rounded border flex items-center justify-center flex-shrink-0 transition-colors" style={e.done ? { background: s.theme.accent, borderColor: s.theme.accent } : { borderColor: '#C8C5BE' }}>
                          {e.done && <Check size={10} color="white" />}
                        </button>
                        <span className={`text-xs flex-1 ${e.done ? 'line-through text-[#A8A59E]' : 'text-[#1A1916]'}`}>{e.title}</span>
                        <button onClick={() => deleteExtra(camp.id, e.id)} className="opacity-0 group-hover:opacity-100 text-[#A8A59E] hover:text-red-500 transition-all"><Trash2 size={11} /></button>
                      </div>
                    ))}
                  </div>
                  {addingExtra === camp.id ? (
                    <div className="flex gap-2">
                      <input autoFocus value={newExtra[camp.id]||''} onChange={e => setNewExtra(t => ({ ...t, [camp.id]: e.target.value }))} onKeyDown={e => e.key === 'Enter' && addExtra(camp.id)} placeholder="Ex: Arte cardápio temático, brinde clientes..." className="flex-1 text-xs border border-[#EBEAE5] rounded-lg px-3 py-1.5 outline-none focus:border-[#1A1916]" />
                      <button onClick={() => addExtra(camp.id)} className="text-xs font-medium px-3 py-1.5 rounded-lg text-white" style={{ background: s.theme.accent }}>Adicionar</button>
                      <button onClick={() => setAddingExtra(null)} className="text-xs text-[#A8A59E] px-2">×</button>
                    </div>
                  ) : (
                    <button onClick={() => setAddingExtra(camp.id)} className="flex items-center gap-1.5 text-xs text-[#6B6963] hover:text-[#1A1916] transition-colors">
                      <Plus size={13} /> Adicionar extra
                    </button>
                  )}
                </div>

                {/* Briefing */}
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-[#A8A59E] mb-2">Briefing</p>
                  <textarea defaultValue={camp.briefing||''} onBlur={e => saveBriefing(camp.id, e.target.value)} placeholder="Estratégia, tom de voz, referências para esta campanha..." rows={3} className="w-full text-xs border border-[#EBEAE5] rounded-lg px-3 py-2 outline-none focus:border-[#1A1916] resize-none text-[#1A1916] leading-relaxed bg-[#FAFAF8]" />
                </div>
              </div>
            )}

            {/* Body expandido mas inativo */}
            {isExpanded && camp && !isActive && (
              <div className="border-t border-[#EBEAE5] p-4">
                <p className="text-xs text-[#A8A59E]">Campanha desativada. Clique em "Reativar" para usar novamente.</p>
              </div>
            )}
          </div>
        )
      })}

      {/* Campanhas customizadas */}
      {customCampaigns.map(camp => {
        const isExpanded = expanded === camp.id
        const campPosts = posts.filter(p => p.campaign_type === camp.id)
        const extras = camp.campaign_extras || []
        const doneExtras = extras.filter((e: any) => e.done).length

        return (
          <div key={camp.id} className="bg-white border border-[#EBEAE5] rounded-xl overflow-hidden">
            <div className="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-[#FAFAF8]" onClick={() => setExpanded(isExpanded ? null : camp.id)}>
              <span className="text-xl">📌</span>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-[#1A1916]">{camp.name}</p>
                <p className="text-xs text-[#6B6963] mt-0.5">{campPosts.length} posts · {extras.length} extras</p>
              </div>
              <span className="text-[11px] font-medium px-2 py-0.5 rounded-full bg-[#F0FDF4] text-[#166534]">personalizada</span>
              {isExpanded ? <ChevronUp size={14} className="text-[#A8A59E]" /> : <ChevronDown size={14} className="text-[#A8A59E]" />}
            </div>
            {isExpanded && (
              <div className="border-t border-[#EBEAE5] p-4 flex flex-col gap-4">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-[#A8A59E] mb-2">Extras</p>
                  <div className="flex flex-col gap-1.5 mb-2">
                    {extras.map((e: any) => (
                      <div key={e.id} className="group flex items-center gap-2.5 bg-[#FAFAF8] border border-[#EBEAE5] rounded-lg px-3 py-2">
                        <button onClick={() => toggleExtra(camp.id, e.id, e.done)} className={`w-4 h-4 rounded border flex items-center justify-center ${e.done ? 'bg-[#1A1916] border-[#1A1916]' : 'border-[#C8C5BE]'}`}>
                          {e.done && <Check size={10} color="white" />}
                        </button>
                        <span className={`text-xs flex-1 ${e.done ? 'line-through text-[#A8A59E]' : 'text-[#1A1916]'}`}>{e.title}</span>
                        <button onClick={() => deleteExtra(camp.id, e.id)} className="opacity-0 group-hover:opacity-100 text-[#A8A59E] hover:text-red-500"><Trash2 size={11} /></button>
                      </div>
                    ))}
                  </div>
                  {addingExtra === camp.id ? (
                    <div className="flex gap-2">
                      <input autoFocus value={newExtra[camp.id]||''} onChange={e => setNewExtra(t => ({ ...t, [camp.id]: e.target.value }))} onKeyDown={e => e.key === 'Enter' && addExtra(camp.id)} placeholder="Novo extra..." className="flex-1 text-xs border border-[#EBEAE5] rounded-lg px-3 py-1.5 outline-none focus:border-[#1A1916]" />
                      <button onClick={() => addExtra(camp.id)} className="text-xs font-medium px-3 py-1.5 rounded-lg bg-[#1A1916] text-white">+</button>
                      <button onClick={() => setAddingExtra(null)} className="text-xs text-[#A8A59E] px-2">×</button>
                    </div>
                  ) : (
                    <button onClick={() => setAddingExtra(camp.id)} className="flex items-center gap-1.5 text-xs text-[#6B6963] hover:text-[#1A1916]"><Plus size={13} /> Adicionar extra</button>
                  )}
                </div>
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-[#A8A59E] mb-2">Briefing</p>
                  <textarea defaultValue={camp.briefing||''} onBlur={e => saveBriefing(camp.id, e.target.value)} placeholder="Detalhes da campanha..." rows={3} className="w-full text-xs border border-[#EBEAE5] rounded-lg px-3 py-2 outline-none focus:border-[#1A1916] resize-none bg-[#FAFAF8]" />
                </div>
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
