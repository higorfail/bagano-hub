'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase'
import { Check, Trash2, Plus, ChevronDown, ChevronUp } from 'lucide-react'
import { useDarkMode } from '@/lib/useDarkMode'
import PostCard from '@/components/PostCard'
import ExtraCard from '@/components/ExtraCard'
import MaterialCard from '@/components/MaterialCard'
import { campaignDaysUntil, campaignPeriod } from '@/lib/campaignPeriod'

const SEASONAL = [
  { type: 'natal',     name: 'Natal & Réveillon', emoji: '🎄', color: '#DC2626', month: 12, day: 25, leadDays: 60,
    theme: { bg: '#FEF2F2', border: '#FECACA', accent: '#DC2626', darkBg: '#450a0a', darkBorder: '#7f1d1d' } },
  { type: 'maes',      name: 'Dia das Mães',       emoji: '🌸', color: '#DB2777', month: 5,  day: 11, leadDays: 45,
    theme: { bg: '#FDF2F8', border: '#FBCFE8', accent: '#DB2777', darkBg: '#4a044e', darkBorder: '#701a75' } },
  { type: 'namorados', name: 'Dia dos Namorados',  emoji: '💕', color: '#E11D48', month: 6,  day: 12, leadDays: 45,
    theme: { bg: '#FFF1F2', border: '#FECDD3', accent: '#E11D48', darkBg: '#4c0519', darkBorder: '#881337' } },
  { type: 'pascoa',    name: 'Páscoa',             emoji: '🐣', color: '#D97706', month: 4,  day: 20, leadDays: 30,
    theme: { bg: '#FFFBEB', border: '#FDE68A', accent: '#D97706', darkBg: '#431407', darkBorder: '#78350f' } },
  { type: 'carnaval',  name: 'Carnaval',           emoji: '🎭', color: '#7C3AED', month: 2,  day: 28, leadDays: 30,
    theme: { bg: '#F5F3FF', border: '#DDD6FE', accent: '#7C3AED', darkBg: '#2e1065', darkBorder: '#4c1d95' } },
  { type: 'pais',      name: 'Dia dos Pais',       emoji: '👔', color: '#0369A1', month: 8,  day: 11, leadDays: 30,
    theme: { bg: '#EFF6FF', border: '#BFDBFE', accent: '#0369A1', darkBg: '#172554', darkBorder: '#1e3a5f' } },
]

// Ver src/lib/campaignPeriod.ts: a campanha só vira de ano depois da janela de
// encerramento, então `days` pode vir negativo enquanto ainda há trabalho.

const TYPE_LABEL: Record<string, string> = { reels: 'Reel', carrossel: 'Carrossel', post: 'Post', story: 'Story', carrossel_stories: 'C+S' }
const TYPE_BG_L: Record<string, string>  = { reels: '#FEE2E2', carrossel: '#DBEAFE', post: '#FEF3C7', story: '#EDE9FE', carrossel_stories: '#E0E7FF' }
const TYPE_BG_D: Record<string, string>  = { reels: '#450a0a', carrossel: '#172554', post: '#431407', story: '#2e1065', carrossel_stories: '#1e1b4b' }
const TYPE_TX_L: Record<string, string>  = { reels: '#B91C1C', carrossel: '#1E40AF', post: '#92400E', story: '#5B21B6', carrossel_stories: '#3730A3' }
const TYPE_TX_D: Record<string, string>  = { reels: '#fca5a5', carrossel: '#93c5fd', post: '#fde68a', story: '#d8b4fe', carrossel_stories: '#818cf8' }
const STATUS_BG_L: Record<string, string> = { producao: '#FEF3C7', aprovado: '#D1FAE5', publicado: '#D1FAE5', aguardando_aprovacao: '#FCE7F3', revisao_interna: '#EDE9FE', agendado: '#DBEAFE' }
const STATUS_BG_D: Record<string, string> = { producao: '#431407', aprovado: '#052e16', publicado: '#052e16', aguardando_aprovacao: '#4a044e', revisao_interna: '#2e1065', agendado: '#172554' }
const STATUS_TX_L: Record<string, string> = { producao: '#92400E', aprovado: '#065F46', publicado: '#065F46', aguardando_aprovacao: '#9D174D', revisao_interna: '#5B21B6', agendado: '#1E40AF' }
const STATUS_TX_D: Record<string, string> = { producao: '#fde68a', aprovado: '#4ade80', publicado: '#4ade80', aguardando_aprovacao: '#f9a8d4', revisao_interna: '#d8b4fe', agendado: '#93c5fd' }
const STATUS_LABEL: Record<string, string> = { producao: 'Produção', revisao_interna: 'Revisão', aguardando_aprovacao: 'Aguardando', aprovado: 'Aprovado', agendado: 'Agendado', publicado: 'Publicado' }

function getInitials(name: string) { return (name || '?').split(' ').map((w: string) => w[0]).join('').slice(0, 2).toUpperCase() }

// % da janela de preparo (leadDays) já decorrida até hoje — 0% quando a
// data ainda está longe, 100% quando já chegou ou passou.
function getTimeProgress(days: number, leadDays: number) {
  if (days <= 0) return 100
  if (days >= leadDays) return 0
  return ((leadDays - days) / leadDays) * 100
}

export default function CampanhasPage() {
  useEffect(() => { document.title = 'Campanhas · Bagano Hub' }, [])
  const supabase = createClient()
  const isDark = useDarkMode()
  const [selected, setSelected] = useState(() => (typeof window !== 'undefined' && localStorage.getItem('campanhas:lastType')) || 'natal')
  const [campaigns, setCampaigns] = useState<any[]>([])
  const [clients, setClients] = useState<any[]>([])
  const [posts, setPosts] = useState<any[]>([])
  const [kanbanExtras, setKanbanExtras] = useState<any[]>([])
  const [materials, setMaterials] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [addingExtra, setAddingExtra] = useState<string | null>(null)
  const [newExtraText, setNewExtraText] = useState<Record<string, string>>({})
  const [editingBriefing, setEditingBriefing] = useState<Record<string, boolean>>({})
  const [creatingPost, setCreatingPost] = useState<{ clientId: string; campType: string } | null>(null)
  const [creatingExtra, setCreatingExtra] = useState<{ clientId: string; campType: string } | null>(null)
  const [creatingMaterial, setCreatingMaterial] = useState<{ clientId: string; campType: string } | null>(null)
  const [createPostNumber, setCreatePostNumber] = useState(1)
  const [createPeriod, setCreatePeriod] = useState({ month: new Date().getMonth() + 1, year: new Date().getFullYear() })
  const [availablePostsByClient, setAvailablePostsByClient] = useState<Record<string, any[]>>({})
  const [availableKanbanExtrasByClient, setAvailableKanbanExtrasByClient] = useState<Record<string, any[]>>({})
  const [availableMaterialsByClient, setAvailableMaterialsByClient] = useState<Record<string, any[]>>({})

  useEffect(() => { load() }, [])

  useEffect(() => { localStorage.setItem('campanhas:lastType', selected) }, [selected])

  // Vários cards podem ficar abertos ao mesmo tempo — abrir um não fecha os outros.
  function selectClient(campId: string, clientId: string) {
    setExpanded(prev => {
      const next = new Set(prev)
      if (next.has(campId)) next.delete(campId)
      else { next.add(campId); loadAvailablePosts(clientId); loadAvailableKanbanExtras(clientId); loadAvailableMaterials(clientId) }
      localStorage.setItem(`campanhas:lastExpanded:${selected}`, JSON.stringify([...next]))
      return next
    })
  }

  // Posts do cronograma desse cliente que ainda não estão em nenhuma campanha —
  // pra poder vincular um post já existente direto daqui, igual na aba do cliente.
  async function loadAvailablePosts(clientId: string) {
    const { data } = await supabase.from('schedules')
      .select('id, post_number, title').eq('client_id', clientId).is('campaign_type', null).order('post_number')
    setAvailablePostsByClient(s => ({ ...s, [clientId]: data || [] }))
  }

  async function linkExistingPost(clientId: string, postId: string, campType: string) {
    await supabase.from('schedules').update({ campaign_type: campType }).eq('id', postId)
    setAvailablePostsByClient(s => ({ ...s, [clientId]: (s[clientId] || []).filter(p => p.id !== postId) }))
    await load()
  }

  // Extras (Kanban) desse cliente que ainda não estão em nenhuma campanha.
  async function loadAvailableKanbanExtras(clientId: string) {
    const { data } = await supabase.from('extras')
      .select('id, title').eq('client_id', clientId).is('campaign_type', null).is('archived_at', null)
    setAvailableKanbanExtrasByClient(s => ({ ...s, [clientId]: data || [] }))
  }

  async function linkExistingKanbanExtra(clientId: string, extraId: string, campType: string) {
    await supabase.from('extras').update({ campaign_type: campType }).eq('id', extraId)
    setAvailableKanbanExtrasByClient(s => ({ ...s, [clientId]: (s[clientId] || []).filter(e => e.id !== extraId) }))
    await load()
  }

  // Materiais desse cliente que ainda não estão em nenhuma campanha.
  async function loadAvailableMaterials(clientId: string) {
    const { data } = await supabase.from('materials')
      .select('id, title').eq('client_id', clientId).is('campaign_type', null).is('archived_at', null)
    setAvailableMaterialsByClient(s => ({ ...s, [clientId]: data || [] }))
  }

  async function linkExistingMaterial(clientId: string, materialId: string, campType: string) {
    await supabase.from('materials').update({ campaign_type: campType }).eq('id', materialId)
    setAvailableMaterialsByClient(s => ({ ...s, [clientId]: (s[clientId] || []).filter(m => m.id !== materialId) }))
    await load()
  }

  // O post nasce no mês da CAMPANHA, não no mês do relógio — e o post_number é
  // contado sobre esse mesmo mês. Criar um post de Natal em novembro jogava
  // ele no cronograma de novembro com um número tirado da contagem de
  // novembro, que depois repetia em dezembro.
  async function openCreatePost(clientId: string, campType: string) {
    const s = SEASONAL.find(x => x.type === campType)
    const period = s ? campaignPeriod(s.month, s.day) : { month: new Date().getMonth() + 1, year: new Date().getFullYear() }
    const { count } = await supabase.from('schedules').select('id', { count: 'exact', head: true })
      .eq('client_id', clientId).eq('month', period.month).eq('year', period.year)
    setCreatePeriod(period)
    setCreatePostNumber((count || 0) + 1)
    setCreatingPost({ clientId, campType })
  }

  async function load() {
    const [{ data: camps }, { data: cls }, { data: ps }, { data: ke }, { data: mats }] = await Promise.all([
      supabase.from('campaigns').select('*, campaign_extras(*)').eq('active', true),
      supabase.from('clients').select('id, name, color_hex, logo_url').eq('status', 'active').order('name'),
      supabase.from('schedules').select('id, client_id, post_number, title, post_type, status, campaign_type, month, year').not('campaign_type', 'is', null),
      supabase.from('extras').select('id, client_id, title, status, campaign_type').not('campaign_type', 'is', null).is('archived_at', null),
      supabase.from('materials').select('id, client_id, title, status, campaign_type').not('campaign_type', 'is', null).is('archived_at', null),
    ])
    setCampaigns(camps || [])
    setClients(cls || [])
    setPosts(ps || [])
    setKanbanExtras(ke || [])
    setMaterials(mats || [])
    setLoading(false)
  }

  async function toggleExtra(campId: string, extraId: string, done: boolean) {
    await supabase.from('campaign_extras').update({ done: !done }).eq('id', extraId)
    setCampaigns(c => c.map(x => x.id === campId ? {
      ...x, campaign_extras: x.campaign_extras.map((e: any) => e.id === extraId ? { ...e, done: !done } : e)
    } : x))
  }

  async function addExtra(campId: string) {
    const text = newExtraText[campId]?.trim()
    if (!text) return
    const { data } = await supabase.from('campaign_extras').insert({ campaign_id: campId, title: text }).select().single()
    if (data) {
      setCampaigns(c => c.map(x => x.id === campId ? { ...x, campaign_extras: [...(x.campaign_extras || []), data] } : x))
      setNewExtraText(t => ({ ...t, [campId]: '' }))
      setAddingExtra(null)
    }
  }

  async function saveBriefing(campId: string, briefing: string) {
    await supabase.from('campaigns').update({ briefing }).eq('id', campId)
    setCampaigns(c => c.map(x => x.id === campId ? { ...x, briefing } : x))
  }

  const orderedSeasonal = [...SEASONAL].sort((a, b) => campaignDaysUntil(a.month, a.day) - campaignDaysUntil(b.month, b.day))
  const seasonal = SEASONAL.find(s => s.type === selected)!
  const days = campaignDaysUntil(seasonal.month, seasonal.day)

  // Clientes com esta campanha ativa
  const activeCamps = campaigns.filter(c => c.type === selected)
  const activeClientIds = activeCamps.map(c => c.client_id)
  const activeClients = clients.filter(c => activeClientIds.includes(c.id))

  // Reabre os clientes que estavam expandidos nesta campanha (se ainda existirem)
  useEffect(() => {
    if (loading) return
    const raw = localStorage.getItem(`campanhas:lastExpanded:${selected}`)
    let ids: string[] = []
    try { ids = raw ? JSON.parse(raw) : [] } catch { ids = raw ? [raw] : [] }
    setExpanded(new Set(ids.filter(cid => activeCamps.some(c => c.id === cid))))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected, loading])

  // Clientes sem esta campanha ainda
  const inactiveClients = clients.filter(c => !activeClientIds.includes(c.id))

  if (loading) return <div className="p-6 text-sm text-[var(--color-text-muted)]">Carregando campanhas...</div>

  return (
    <div className="px-4 md:px-6 py-4 flex flex-col gap-4 h-full overflow-y-auto">
      {/* Header */}
      <div className="flex items-baseline gap-2.5">
        <h1 className="text-xl font-bold text-[var(--color-text-primary)] tracking-tight">Campanhas</h1>
        <p className="text-[var(--color-text-muted)] text-sm">todos os clientes por campanha</p>
      </div>

      {/* Seletor de campanha — ordenado pela data mais próxima primeiro */}
      {/* Grade de 2 colunas no celular: em linha corrida cada chip tinha a
          largura do próprio nome ("Páscoa" vs "Dia dos Namorados") e a
          quebra saía irregular, 2 numa linha, 1 na outra. */}
      <div className="grid grid-cols-2 gap-2 items-stretch md:flex md:flex-wrap">
        {orderedSeasonal.map(s => {
          const d = campaignDaysUntil(s.month, s.day)
          // Dia negativo é a janela de encerramento: a data passou e ainda há
          // o que fechar. É o momento mais urgente da campanha, não o menos.
          const isUrgent = d <= s.leadDays
          const campsOfType = campaigns.filter(c => c.type === s.type)
          const activeCnt = campsOfType.length
          const campIds = campsOfType.map(c => c.id)
          const clientIds = campsOfType.map(c => c.client_id)

          // Progresso real: posts aprovados/publicados + extras do checklist +
          // extras do Kanban + materiais finalizados, tudo que já foi
          // vinculado a essa campanha, entre todos os clientes ativos nela.
          const camPosts = posts.filter(p => clientIds.includes(p.client_id) && p.campaign_type === s.type)
          const camChecklist = campsOfType.flatMap(c => c.campaign_extras || [])
          const camKanban = kanbanExtras.filter(e => clientIds.includes(e.client_id) && e.campaign_type === s.type)
          const camMaterials = materials.filter(m => clientIds.includes(m.client_id) && m.campaign_type === s.type)
          const totalItems = camPosts.length + camChecklist.length + camKanban.length + camMaterials.length
          const doneItems = camPosts.filter(p => ['aprovado', 'publicado'].includes(p.status)).length
            + camChecklist.filter((e: any) => e.done).length
            + camKanban.filter(e => e.status === 'done').length
            + camMaterials.filter(m => m.status === 'finalizado').length
          const workPct = totalItems > 0 ? (doneItems / totalItems) * 100 : 0
          const timePct = getTimeProgress(d, s.leadDays)
          const behind = totalItems > 0 && workPct < timePct - 10
          const barColor = totalItems === 0 ? 'var(--color-text-faint)' : behind ? 'var(--ds-error-accent)' : s.theme.accent

          return (
            <button
              key={s.type}
              onClick={() => setSelected(s.type)}
              className="flex flex-col gap-1.5 px-2.5 py-1.5 rounded-xl border transition-all text-xs md:min-w-[132px]"
              style={selected === s.type
                ? { background: isDark ? s.theme.darkBg : s.theme.bg, borderColor: isDark ? s.theme.darkBorder : s.theme.border, color: s.theme.accent, fontWeight: 500 }
                : { background: 'var(--color-bg-card)', borderColor: 'var(--color-border)', color: 'var(--color-text-secondary)' }
              }
            >
              <div className="flex items-center gap-1.5 min-w-0 w-full">
                <span className="flex-shrink-0">{s.emoji}</span>
                <span className="truncate text-left">{s.name}</span>
                {activeCnt > 0 && <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full" style={{ background: selected === s.type ? s.theme.accent : 'var(--color-bg-subtle)', color: selected === s.type ? 'white' : 'var(--color-text-secondary)' }}>{activeCnt}</span>}
                {isUrgent && <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: 'var(--ds-error-accent)' }} />}
              </div>
              {activeCnt > 0 && (
                <div className="relative w-full h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--color-bg-subtle)' }} title={`${Math.round(workPct)}% pronto · ${Math.round(timePct)}% do prazo decorrido`}>
                  <div className="h-full rounded-full transition-all" style={{ width: `${Math.min(workPct, 100)}%`, background: barColor }} />
                  <div className="absolute top-0 bottom-0 w-[2px]" style={{ left: `${Math.min(timePct, 100)}%`, background: 'var(--color-text-primary)', opacity: 0.35 }} />
                </div>
              )}
            </button>
          )
        })}
      </div>
      <p className="text-[11px] text-[var(--color-text-faint)] -mt-2">A barra mostra o quanto já está pronto; o traço marca quanto do prazo já passou — se a barra estiver atrás do traço, a campanha tá atrasada.</p>

      {/* Banner da campanha selecionada — slim */}
      {/* No celular empilha em vez de espremer: em linha, o prazo e a contagem
          de clientes eram flex-shrink-0 e comiam a largura toda, sobrando pro
          nome da campanha um "Di…" truncado — justamente o dado mais
          importante da faixa. */}
      <div className="rounded-2xl px-4 py-3 border flex flex-col gap-1 md:flex-row md:items-center md:justify-between md:gap-3" style={{ background: isDark ? seasonal.theme.darkBg : seasonal.theme.bg, borderColor: isDark ? seasonal.theme.darkBorder : seasonal.theme.border }}>
        <div className="flex items-center gap-2.5 min-w-0">
          <span className="text-2xl flex-shrink-0">{seasonal.emoji}</span>
          <h2 className="text-sm font-semibold truncate" style={{ color: seasonal.theme.accent }}>{seasonal.name}</h2>
        </div>
        <div className="flex items-center justify-between gap-3 pl-[2.4rem] md:pl-0 md:flex-shrink-0">
          <span className="text-sm" style={{ color: seasonal.theme.accent, opacity: 0.7 }}>
            {days < 0 ? `passou há ${-days} ${-days === 1 ? 'dia' : 'dias'} · ${seasonal.day}/${seasonal.month}` : days === 0 ? 'hoje!' : `faltam ${days} dias · ${seasonal.day}/${seasonal.month}`}
          </span>
          <p className="text-sm font-semibold flex-shrink-0" style={{ color: seasonal.theme.accent }}>
            {activeClients.length} cliente{activeClients.length !== 1 ? 's' : ''} ativo{activeClients.length !== 1 ? 's' : ''}
          </p>
        </div>
      </div>

      {/* Grid de clientes ativos */}
      {activeClients.length > 0 && (
        <div>
          <p className="text-sm font-semibold text-[var(--color-text-primary)] mb-3">Clientes com esta campanha</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 items-start">
            {activeClients.map(client => {
              const camp = activeCamps.find(c => c.client_id === client.id)!
              const campPosts = posts.filter(p => p.client_id === client.id && p.campaign_type === selected)
              const campKanbanExtras = kanbanExtras.filter(e => e.client_id === client.id && e.campaign_type === selected)
              const campMaterials = materials.filter(m => m.client_id === client.id && m.campaign_type === selected)
              const extras = camp.campaign_extras || []
              const doneExtras = extras.filter((e: any) => e.done).length
              const donePosts = campPosts.filter(p => ['aprovado', 'publicado'].includes(p.status)).length
              const isExp = expanded.has(camp.id)

              return (
                <div key={client.id} className="bg-[var(--color-bg-card)] border border-[var(--color-border)] rounded-2xl overflow-hidden shadow-card">
                  {/* Client header */}
                  <div
                    className="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-[var(--color-bg-alt)] transition-colors"
                    onClick={() => selectClient(camp.id, client.id)}
                  >
                    <div className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-semibold flex-shrink-0 overflow-hidden" style={{ background: client.color_hex }}>{client.logo_url ? <img src={client.logo_url} alt={client.name} className="w-full h-full object-cover" /> : getInitials(client.name)}</div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-[var(--color-text-primary)] truncate">{client.name}</p>
                      <p className="text-xs text-[var(--color-text-secondary)]">{campPosts.length} posts · {campKanbanExtras.length} extras · {campMaterials.length} materiais</p>
                    </div>
                    {/* Progress */}
                    <div className="flex items-center gap-2 flex-shrink-0">
                      {campPosts.length > 0 && (
                        <div className="flex items-center gap-1.5">
                          <div className="w-16 h-1.5 bg-[var(--color-bg-subtle)] rounded-full overflow-hidden">
                            <div className="h-full rounded-full transition-all" style={{ width: `${(donePosts / campPosts.length) * 100}%`, background: seasonal.theme.accent }} />
                          </div>
                          <span className="text-[10px] text-[var(--color-text-muted)]">{donePosts}/{campPosts.length}</span>
                        </div>
                      )}
                      {isExp ? <ChevronUp size={14} className="text-[var(--color-text-muted)]" /> : <ChevronDown size={14} className="text-[var(--color-text-muted)]" />}
                    </div>
                  </div>

                  {/* Expanded */}
                  {isExp && (
                    <div className="border-t border-[var(--color-border)] p-4 flex flex-col gap-4">
                      {/* Criar novo direto daqui, já vinculado a esta campanha */}
                      <div className="flex gap-2 flex-wrap">
                        <button onClick={() => openCreatePost(client.id, selected)} className="flex items-center gap-1 text-[11px] font-medium px-2 py-1 rounded-lg border border-dashed border-[var(--color-border-hover)] text-[var(--color-text-secondary)] hover:border-[var(--color-brand)] hover:text-[var(--color-brand)] transition-colors"><Plus size={11} /> Post do crono</button>
                        <button onClick={() => setCreatingExtra({ clientId: client.id, campType: selected })} className="flex items-center gap-1 text-[11px] font-medium px-2 py-1 rounded-lg border border-dashed border-[var(--color-border-hover)] text-[var(--color-text-secondary)] hover:border-[var(--color-brand)] hover:text-[var(--color-brand)] transition-colors"><Plus size={11} /> Extra</button>
                        <button onClick={() => setCreatingMaterial({ clientId: client.id, campType: selected })} className="flex items-center gap-1 text-[11px] font-medium px-2 py-1 rounded-lg border border-dashed border-[var(--color-border-hover)] text-[var(--color-text-secondary)] hover:border-[var(--color-brand)] hover:text-[var(--color-brand)] transition-colors"><Plus size={11} /> Material</button>
                      </div>

                      {/* Posts */}
                      <div>
                        <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--color-text-muted)] mb-2">Posts</p>
                        {campPosts.length > 0 && (
                          <div className="flex flex-col gap-1.5 mb-2">
                            {campPosts.map(p => (
                              <a key={p.id} href={`/dashboard/clientes/${client.id}?tab=cronograma&m=${p.month}&y=${p.year}&post=${p.id}`}
                                className="flex items-center gap-2 text-xs -mx-1.5 px-1.5 py-0.5 rounded-lg hover:bg-[var(--color-bg-alt)] transition-colors">
                                <span className="font-bold text-[var(--color-text-muted)] w-5">#{p.post_number}</span>
                                <span className="text-[10px] font-medium px-1.5 py-0.5 rounded flex-shrink-0" style={{ background: (isDark ? TYPE_BG_D : TYPE_BG_L)[p.post_type] || 'var(--color-bg-subtle)', color: (isDark ? TYPE_TX_D : TYPE_TX_L)[p.post_type] || 'var(--color-text-secondary)' }}>{TYPE_LABEL[p.post_type] || p.post_type}</span>
                                <span className="flex-1 text-[var(--color-text-primary)] truncate">{p.title}</span>
                                <span className="text-[10px] font-medium px-1.5 py-0.5 rounded flex-shrink-0" style={{ background: (isDark ? STATUS_BG_D : STATUS_BG_L)[p.status] || 'var(--color-bg-subtle)', color: (isDark ? STATUS_TX_D : STATUS_TX_L)[p.status] || 'var(--color-text-secondary)' }}>{STATUS_LABEL[p.status] || p.status}</span>
                              </a>
                            ))}
                          </div>
                        )}
                        {(availablePostsByClient[client.id] || []).length > 0 && (
                          <select onChange={e => { if (e.target.value) { linkExistingPost(client.id, e.target.value, selected); e.target.value = '' } }} className="w-full text-xs border border-dashed border-[var(--color-border-hover)] rounded-lg px-3 py-1.5 bg-[var(--color-bg-card)] outline-none text-[var(--color-text-secondary)] cursor-pointer">
                            <option value="">+ Vincular post do cronograma...</option>
                            {availablePostsByClient[client.id].map(p => <option key={p.id} value={p.id}>#{p.post_number} · {p.title || 'Post sem título'}</option>)}
                          </select>
                        )}
                      </div>

                      {/* Extras do Kanban + Materiais — vinculados e a vincular */}
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div>
                          <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--color-text-muted)] mb-2">Extras (Kanban)</p>
                          {campKanbanExtras.length > 0 && (
                            <div className="flex flex-col gap-1.5 mb-2">
                              {campKanbanExtras.map(e => (
                                <div key={e.id} className="flex items-center gap-2 text-xs">
                                  <span className="flex-1 text-[var(--color-text-primary)] truncate">{e.title || 'Sem título'}</span>
                                  <span className="text-[10px] font-medium px-1.5 py-0.5 rounded flex-shrink-0" style={e.status === 'done' ? { background: 'var(--ds-success-bg)', color: 'var(--ds-success-text)' } : { background: 'var(--color-bg-subtle)', color: 'var(--color-text-secondary)' }}>{e.status === 'done' ? 'Feito' : 'Pendente'}</span>
                                </div>
                              ))}
                            </div>
                          )}
                          {(availableKanbanExtrasByClient[client.id] || []).length > 0 && (
                            <select onChange={e => { if (e.target.value) { linkExistingKanbanExtra(client.id, e.target.value, selected); e.target.value = '' } }} className="w-full text-xs border border-dashed border-[var(--color-border-hover)] rounded-lg px-2.5 py-1.5 bg-[var(--color-bg-card)] outline-none text-[var(--color-text-secondary)] cursor-pointer">
                              <option value="">+ Vincular extra do Kanban...</option>
                              {availableKanbanExtrasByClient[client.id].map(e => <option key={e.id} value={e.id}>{e.title || 'Sem título'}</option>)}
                            </select>
                          )}
                        </div>
                        <div>
                          <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--color-text-muted)] mb-2">Materiais</p>
                          {campMaterials.length > 0 && (
                            <div className="flex flex-col gap-1.5 mb-2">
                              {campMaterials.map(m => (
                                <div key={m.id} className="flex items-center gap-2 text-xs">
                                  <span className="flex-1 text-[var(--color-text-primary)] truncate">{m.title || 'Sem título'}</span>
                                  <span className="text-[10px] font-medium px-1.5 py-0.5 rounded flex-shrink-0" style={m.status === 'finalizado' ? { background: 'var(--ds-success-bg)', color: 'var(--ds-success-text)' } : { background: 'var(--color-bg-subtle)', color: 'var(--color-text-secondary)' }}>{m.status === 'finalizado' ? 'Feito' : 'Pendente'}</span>
                                </div>
                              ))}
                            </div>
                          )}
                          {(availableMaterialsByClient[client.id] || []).length > 0 && (
                            <select onChange={e => { if (e.target.value) { linkExistingMaterial(client.id, e.target.value, selected); e.target.value = '' } }} className="w-full text-xs border border-dashed border-[var(--color-border-hover)] rounded-lg px-2.5 py-1.5 bg-[var(--color-bg-card)] outline-none text-[var(--color-text-secondary)] cursor-pointer">
                              <option value="">+ Vincular material...</option>
                              {availableMaterialsByClient[client.id].map(m => <option key={m.id} value={m.id}>{m.title || 'Sem título'}</option>)}
                            </select>
                          )}
                        </div>
                      </div>

                      {/* Extras (checklist da campanha) */}
                      <div>
                        <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--color-text-muted)] mb-2">Checklist da campanha {extras.length > 0 && `· ${doneExtras}/${extras.length}`}</p>
                        {extras.length > 0 && (
                          <div className="w-full h-1 bg-[var(--color-bg-subtle)] rounded-full mb-2 overflow-hidden">
                            <div className="h-full rounded-full" style={{ width: `${extras.length ? (doneExtras / extras.length) * 100 : 0}%`, background: seasonal.theme.accent }} />
                          </div>
                        )}
                        <div className="flex flex-col gap-1">
                          {extras.map((e: any) => (
                            <div key={e.id} className="flex items-center gap-2">
                              <button onClick={() => toggleExtra(camp.id, e.id, e.done)} className="w-3.5 h-3.5 rounded border flex items-center justify-center flex-shrink-0 transition-colors" style={e.done ? { background: seasonal.theme.accent, borderColor: seasonal.theme.accent } : { borderColor: 'var(--color-border-strong)' }}>
                                {e.done && <Check size={9} color="white" />}
                              </button>
                              <span className={`text-xs flex-1 ${e.done ? 'line-through text-[var(--color-text-muted)]' : 'text-[var(--color-text-primary)]'}`}>{e.title}</span>
                            </div>
                          ))}
                        </div>
                        {addingExtra === camp.id ? (
                          <div className="flex gap-2 mt-2">
                            <input autoFocus value={newExtraText[camp.id] || ''} onChange={e => setNewExtraText(t => ({ ...t, [camp.id]: e.target.value }))} onKeyDown={e => e.key === 'Enter' && addExtra(camp.id)} placeholder="Novo extra..." className="flex-1 text-xs border border-[var(--color-border)] rounded-lg px-2.5 py-1.5 outline-none focus:border-[var(--color-brand)]" />
                            <button onClick={() => addExtra(camp.id)} className="text-xs font-medium px-2.5 py-1.5 rounded-lg text-white" style={{ background: seasonal.theme.accent }}>+</button>
                            <button onClick={() => setAddingExtra(null)} className="text-xs text-[var(--color-text-muted)] px-1">×</button>
                          </div>
                        ) : (
                          <button onClick={() => setAddingExtra(camp.id)} className="flex items-center gap-1 text-xs text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] mt-1.5 transition-colors"><Plus size={11} /> Extra</button>
                        )}
                      </div>

                      {/* Observação — clica pra editar, senão fica como texto normal */}
                      <div>
                        <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--color-text-muted)] mb-1.5">Observação</p>
                        {editingBriefing[camp.id] ? (
                          <textarea
                            autoFocus
                            defaultValue={camp.briefing || ''}
                            rows={2}
                            onBlur={e => { saveBriefing(camp.id, e.target.value); setEditingBriefing(s => ({ ...s, [camp.id]: false })) }}
                            placeholder="Ex: o brinde de Dia dos Pais vai ser chopp em dobro..."
                            className="w-full text-xs border border-[var(--color-border)] rounded-lg px-3 py-2 outline-none focus:border-[var(--color-brand)] resize-none text-[var(--color-text-primary)] leading-relaxed bg-[var(--color-bg-alt)]"
                          />
                        ) : (
                          <p
                            onClick={() => setEditingBriefing(s => ({ ...s, [camp.id]: true }))}
                            className="text-xs text-[var(--color-text-secondary)] leading-relaxed bg-[var(--color-bg-alt)] rounded-lg px-3 py-2 cursor-text hover:bg-[var(--color-bg-subtle)] transition-colors min-h-[30px]"
                          >
                            {camp.briefing || <span className="text-[var(--color-text-faint)]">Clique pra adicionar uma observação...</span>}
                          </p>
                        )}
                      </div>

                      <a href={`/dashboard/clientes/${client.id}?tab=campanhas&camp=${selected}`} className="text-xs hover:underline" style={{ color: 'var(--ds-info-text)' }}>Abrir página do cliente →</a>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Clientes sem campanha ainda */}
      {inactiveClients.length > 0 && (
        <div>
          <p className="text-sm font-semibold text-[var(--color-text-muted)] mb-3">{inactiveClients.length} clientes sem esta campanha</p>
          <div className="flex flex-wrap gap-2">
            {inactiveClients.map(client => (
              <a key={client.id} href={`/dashboard/clientes/${client.id}?tab=campanhas&camp=${selected}`} className="flex items-center gap-2 bg-[var(--color-bg-card)] border border-[var(--color-border)] rounded-lg px-3 py-1.5 hover:border-[var(--color-border-hover)] transition-colors">
                <div className="w-5 h-5 rounded-full flex items-center justify-center text-white text-[8px] font-semibold overflow-hidden" style={{ background: client.color_hex }}>{client.logo_url ? <img src={client.logo_url} alt={client.name} className="w-full h-full object-cover" /> : getInitials(client.name)}</div>
                <span className="text-xs text-[var(--color-text-secondary)]">{client.name}</span>
              </a>
            ))}
          </div>
        </div>
      )}

      {activeClients.length === 0 && (
        <div className="flex flex-col items-center justify-center h-48 text-center border border-dashed border-[var(--color-border)] rounded-2xl">
          <span className="text-3xl mb-2">{seasonal.emoji}</span>
          <p className="text-sm font-medium text-[var(--color-text-primary)]">Nenhum cliente com {seasonal.name} ainda</p>
          <p className="text-xs text-[var(--color-text-muted)] mt-1">Ative a campanha na página de cada cliente</p>
        </div>
      )}

      {creatingPost && (
        <PostCard
          clientId={creatingPost.clientId}
          month={createPeriod.month}
          year={createPeriod.year}
          postNumber={createPostNumber}
          initialCampaignType={creatingPost.campType}
          onClose={() => setCreatingPost(null)}
          onSaved={() => { setCreatingPost(null); load() }}
        />
      )}
      {creatingExtra && (
        <ExtraCard
          fixedClientId={creatingExtra.clientId}
          initialCampaignType={creatingExtra.campType}
          onClose={() => setCreatingExtra(null)}
          onSaved={() => { setCreatingExtra(null); load() }}
        />
      )}
      {creatingMaterial && (
        <MaterialCard
          fixedClientId={creatingMaterial.clientId}
          initialCampaignType={creatingMaterial.campType}
          onClose={() => setCreatingMaterial(null)}
          onSaved={() => { setCreatingMaterial(null); load() }}
        />
      )}
    </div>
  )
}
