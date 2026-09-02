'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase'
import { Check, Trash2, Plus, ChevronDown, ChevronUp, Pencil, Archive } from 'lucide-react'
import { useDarkMode } from '@/lib/useDarkMode'
import PostCard from '@/components/PostCard'
import ExtraCard from '@/components/ExtraCard'
import MaterialCard from '@/components/MaterialCard'
import { campaignDaysUntil, campaignPeriod } from '@/lib/campaignPeriod'
import { campaignProgress } from '@/lib/postStages'
import { useCampaignDates, campaignTheme, campaignDateLabel, orderByProximity, slugifyCampaignType, createCampaignDate, updateCampaignDate, setCampaignDateActive, deleteCampaignDate } from '@/lib/campaigns'
import { statusBadge, statusShort } from '@/lib/status'
import { caminhoCliente } from '@/lib/clienteSlug'

// Ver src/lib/campaignPeriod.ts: a campanha só vira de ano depois da janela de
// encerramento, então `days` pode vir negativo enquanto ainda há trabalho.

const TYPE_LABEL: Record<string, string> = { reels: 'Reel', carrossel: 'Carrossel', post: 'Post', story: 'Story', carrossel_stories: 'C+S' , post_story: '📷'}
const TYPE_BG_L: Record<string, string>  = { reels: '#FEE2E2', carrossel: '#DBEAFE', post: '#FEF3C7', story: '#EDE9FE', carrossel_stories: '#E0E7FF' , post_story: '#d946ef'}
const TYPE_BG_D: Record<string, string>  = { reels: '#450a0a', carrossel: '#172554', post: '#431407', story: '#2e1065', carrossel_stories: '#1e1b4b' , post_story: '#d946ef'}
const TYPE_TX_L: Record<string, string>  = { reels: '#B91C1C', carrossel: '#1E40AF', post: '#92400E', story: '#5B21B6', carrossel_stories: '#3730A3' , post_story: '#d946ef'}
const TYPE_TX_D: Record<string, string>  = { reels: '#fca5a5', carrossel: '#93c5fd', post: '#fde68a', story: '#d8b4fe', carrossel_stories: '#818cf8' , post_story: '#d946ef'}
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
  const { dates: SEASONAL, all: ALL_DATES, reload: reloadDates } = useCampaignDates()
  const [selected, setSelected] = useState(() => (typeof window !== 'undefined' && localStorage.getItem('campanhas:lastType')) || 'natal')
  const [novaAberta, setNovaAberta] = useState(false)
  const [nova, setNova] = useState({ name: '', day: '', month: '', leadDays: '30', color: '#0891B2' })
  const [novaErro, setNovaErro] = useState<string | null>(null)
  const [editando, setEditando] = useState<string | null>(null)
  const [salvandoNova, setSalvandoNova] = useState(false)
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
  // Abrir o card do item ALI MESMO, em vez de navegar pra outra tela. A
  // campanha é uma visão de conferência ("o que falta pro Dia dos Pais?"):
  // sair dela pra ver um post e ter que voltar quebra a conferência no meio.
  // O post era um link pra aba do cliente; extra e material não abriam nada.
  // PostCard exige cliente/mês/ano mesmo abrindo um post que já existe, então
  // guarda o contexto junto e não só o id.
  const [openPost, setOpenPost] = useState<{ id: string; clientId: string; month: number; year: number } | null>(null)
  const [openExtraId, setOpenExtraId] = useState<string | null>(null)
  const [openMaterialId, setOpenMaterialId] = useState<string | null>(null)
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
      supabase.from('clients').select('id, name, color_hex, logo_url, slug').eq('status', 'active').order('name'),
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

  function abrirEdicao(d: { type: string; name: string; day: number; month: number; leadDays: number; color: string }) {
    setNova({ name: d.name, day: String(d.day), month: String(d.month), leadDays: String(d.leadDays), color: d.color })
    setEditando(d.type); setNovaAberta(true); setNovaErro(null)
  }

  async function salvarNovaData() {
    const name = nova.name.trim()
    const day = parseInt(nova.day, 10)
    const month = parseInt(nova.month, 10)
    const leadDays = parseInt(nova.leadDays, 10) || 30
    if (!name)                              return setNovaErro('Falta o nome da campanha.')
    if (!(day >= 1 && day <= 31))           return setNovaErro('Dia precisa ser de 1 a 31.')
    if (!(month >= 1 && month <= 12))       return setNovaErro('Mês precisa ser de 1 a 12.')
    // 31 de fevereiro passaria batido e a campanha nasceria com data que não
    // existe — a contagem regressiva viraria lixo silenciosamente.
    if (new Date(2001, month - 1, day).getMonth() !== month - 1) return setNovaErro('Essa data não existe nesse mês.')
    // Editando, a chave é a que já está gravada nos posts — renomear não pode
    // arrastar o trabalho vinculado junto.
    const type = editando || slugifyCampaignType(name)
    if (!type)                                              return setNovaErro('Esse nome não gera uma chave válida — use letras ou números.')
    if (!editando && ALL_DATES.some(s => s.type === type))  return setNovaErro('Já existe uma campanha com esse nome.')

    setSalvandoNova(true); setNovaErro(null)
    const { error } = editando
      ? await updateCampaignDate(type, { name, month, day, leadDays, color: nova.color })
      : await createCampaignDate({ type, name, month, day, leadDays, color: nova.color })
    setSalvandoNova(false)
    if (error) {
      // Sem a tabela criada no banco, o insert falha — e dizer "erro" seco aqui
      // mandaria alguém procurar bug no lugar errado.
      setNovaErro(error.message?.includes('campaign_dates')
        ? 'A tabela campaign_dates ainda não existe no banco — rode o SQL de criação primeiro.'
        : `Não deu pra criar: ${error.message}`)
      return
    }
    await reloadDates()
    setSelected(type)
    setNovaAberta(false); setEditando(null)
    setNova({ name: '', day: '', month: '', leadDays: '30', color: '#0891B2' })
  }

  // Quanto trabalho está pendurado nesta data, entre todos os clientes. É o que
  // separa arquivar de excluir: com item vinculado, apagar a data deixaria post
  // apontando pra uma campanha que não existe mais.
  function vinculadosDe(type: string) {
    return posts.filter(p => p.campaign_type === type).length
      + kanbanExtras.filter(e => e.campaign_type === type).length
      + materials.filter(m => m.campaign_type === type).length
      + campaigns.filter(c => c.type === type).length
  }

  async function arquivarData(type: string, ativo: boolean) {
    const { error } = await setCampaignDateActive(type, ativo)
    if (error) { setNovaErro(`Não deu pra ${ativo ? 'restaurar' : 'arquivar'}: ${error.message}`); return }
    await reloadDates()
    if (!ativo) setSelected(orderByProximity(SEASONAL.filter(s => s.type !== type))[0]?.type || '')
  }

  async function excluirData(type: string, name: string) {
    const n = vinculadosDe(type)
    if (n > 0) {
      alert(`"${name}" tem ${n} ${n === 1 ? 'vínculo' : 'vínculos'} (clientes ativos, posts, extras ou materiais). Arquive em vez de excluir — assim o histórico continua de pé e ela some das telas.`)
      return
    }
    if (!confirm(`Excluir "${name}" de vez? Ela não tem nada vinculado, então nada se perde além da data em si.`)) return
    const { error } = await deleteCampaignDate(type)
    if (error) { setNovaErro(`Não deu pra excluir: ${error.message}`); return }
    await reloadDates()
    setSelected(orderByProximity(SEASONAL.filter(s => s.type !== type))[0]?.type || '')
  }

  const orderedSeasonal = orderByProximity(SEASONAL)
  const tema = (c: string) => campaignTheme(c, isDark)
  // Sem o `!`: a lista agora vem do banco e pode não ter mais o tipo que ficou
  // guardado no navegador — uma data desativada deixava a tela em branco.
  const seasonal = SEASONAL.find(s => s.type === selected) || orderedSeasonal[0]
  const days = seasonal ? campaignDaysUntil(seasonal.month, seasonal.day) : 0

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
        <p className="text-[var(--color-text-muted)] text-sm flex-1">todos os clientes por campanha</p>
        <button onClick={() => { setNovaAberta(v => !v); setEditando(null); setNovaErro(null); setNova({ name: '', day: '', month: '', leadDays: '30', color: '#0891B2' }) }}
          className="flex items-center gap-1.5 bg-[var(--color-brand)] text-[var(--color-brand-fg)] rounded-lg px-3 py-1.5 text-xs font-semibold flex-shrink-0">
          <Plus size={13} /> Nova data
        </button>
      </div>

      {/* Criar data vale pro hub inteiro, não pra um cliente — é assim que o
          Natal sempre funcionou, e é o que faltava pro Dia do Cliente. Cada
          cliente continua sendo ativado um a um, embaixo. */}
      {novaAberta && (
        <div className="bg-[var(--color-bg-card)] border border-[var(--color-border)] rounded-2xl p-3 flex flex-col gap-2.5">
          <div className="flex flex-wrap items-end gap-2">
            <label className="flex flex-col gap-1 flex-1 min-w-[180px]">
              <span className="text-[11px] font-medium text-[var(--color-text-muted)]">Nome</span>
              <input autoFocus value={nova.name} onChange={e => setNova(n => ({ ...n, name: e.target.value }))}
                placeholder="Dia do Cliente"
                className="text-sm border border-[var(--color-border)] bg-[var(--color-bg-card)] text-[var(--color-text-primary)] rounded-lg px-3 py-2 outline-none focus:border-[var(--color-brand)]" />
            </label>
            <label className="flex flex-col gap-1 w-[72px]">
              <span className="text-[11px] font-medium text-[var(--color-text-muted)]">Dia</span>
              <input value={nova.day} onChange={e => setNova(n => ({ ...n, day: e.target.value.replace(/\D/g, '').slice(0, 2) }))}
                inputMode="numeric" placeholder="15"
                className="text-sm tabular-nums border border-[var(--color-border)] bg-[var(--color-bg-card)] text-[var(--color-text-primary)] rounded-lg px-3 py-2 outline-none focus:border-[var(--color-brand)]" />
            </label>
            <label className="flex flex-col gap-1 w-[72px]">
              <span className="text-[11px] font-medium text-[var(--color-text-muted)]">Mês</span>
              <input value={nova.month} onChange={e => setNova(n => ({ ...n, month: e.target.value.replace(/\D/g, '').slice(0, 2) }))}
                inputMode="numeric" placeholder="09"
                className="text-sm tabular-nums border border-[var(--color-border)] bg-[var(--color-bg-card)] text-[var(--color-text-primary)] rounded-lg px-3 py-2 outline-none focus:border-[var(--color-brand)]" />
            </label>
            {/* Dias de preparo é o que acende o alerta de urgência e desenha o
                traço de prazo na barra — Natal precisa de 60, Halloween de 21. */}
            <label className="flex flex-col gap-1 w-[96px]">
              <span className="text-[11px] font-medium text-[var(--color-text-muted)]">Preparo</span>
              <input value={nova.leadDays} onChange={e => setNova(n => ({ ...n, leadDays: e.target.value.replace(/\D/g, '').slice(0, 3) }))}
                inputMode="numeric"
                className="text-sm tabular-nums border border-[var(--color-border)] bg-[var(--color-bg-card)] text-[var(--color-text-primary)] rounded-lg px-3 py-2 outline-none focus:border-[var(--color-brand)]" />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-[11px] font-medium text-[var(--color-text-muted)]">Cor</span>
              <input type="color" value={nova.color} onChange={e => setNova(n => ({ ...n, color: e.target.value }))}
                className="w-[44px] h-[38px] rounded-lg border border-[var(--color-border)] bg-transparent cursor-pointer" />
            </label>
            <button onClick={salvarNovaData} disabled={salvandoNova}
              className="bg-[var(--color-brand)] text-[var(--color-brand-fg)] text-xs font-semibold px-4 py-2.5 rounded-lg disabled:opacity-50">
              {salvandoNova ? 'Salvando...' : editando ? 'Salvar' : 'Criar'}
            </button>
            <button onClick={() => { setNovaAberta(false); setEditando(null) }} className="text-[var(--color-text-muted)] text-xs px-2 py-2.5">Cancelar</button>
          </div>
          {novaErro && <p className="text-xs" style={{ color: 'var(--ds-error-text)' }}>{novaErro}</p>}
        </div>
      )}

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
          const { total: totalItems, pct: workPct } =
            campaignProgress({ posts: camPosts, extras: camKanban, materials: camMaterials, checklist: camChecklist })
          const timePct = getTimeProgress(d, s.leadDays)
          const behind = totalItems > 0 && workPct < timePct - 10
          const barColor = totalItems === 0 ? 'var(--color-text-faint)' : behind ? 'var(--ds-error-accent)' : s.color

          return (
            <button
              key={s.type}
              onClick={() => setSelected(s.type)}
              className="flex flex-col gap-1.5 px-2.5 py-1.5 rounded-xl border transition-all text-xs md:min-w-[132px]"
              style={selected === s.type
                ? { background: tema(s.color).bg, borderColor: tema(s.color).border, color: s.color, fontWeight: 600 }
                : { background: 'var(--color-bg-card)', borderColor: 'var(--color-border)', color: 'var(--color-text-secondary)' }
              }
            >
              <div className="flex items-center gap-1.5 min-w-0 w-full">
                <span className="truncate text-left flex-1">{s.name}</span>
                <span className="text-[10px] tabular-nums flex-shrink-0 text-[var(--color-text-faint)]">{campaignDateLabel(s)}</span>
                {activeCnt > 0 && <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full" style={{ background: selected === s.type ? s.color : 'var(--color-bg-subtle)', color: selected === s.type ? 'white' : 'var(--color-text-secondary)' }}>{activeCnt}</span>}
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
      {/* Arquivada precisa ter volta, senão arquivar é só apagar com outro nome. */}
      {ALL_DATES.some(d => d.active === false) && (
        <div className="flex items-center gap-2 flex-wrap -mt-1">
          <span className="text-[11px] text-[var(--color-text-faint)]">Arquivadas:</span>
          {ALL_DATES.filter(d => d.active === false).map(d => (
            <button key={d.type} onClick={() => arquivarData(d.type, true)} title="Restaurar esta campanha"
              className="text-[11px] px-2 py-1 rounded-lg border border-dashed border-[var(--color-border)] text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] hover:border-[var(--color-border-hover)] transition-colors">
              {d.name} · restaurar
            </button>
          ))}
        </div>
      )}

      <p className="text-[11px] text-[var(--color-text-faint)] -mt-2">A barra mostra o quanto já está pronto; o traço marca quanto do prazo já passou — se a barra estiver atrás do traço, a campanha tá atrasada.</p>

      {/* Banner da campanha selecionada — slim */}
      {/* No celular empilha em vez de espremer: em linha, o prazo e a contagem
          de clientes eram flex-shrink-0 e comiam a largura toda, sobrando pro
          nome da campanha um "Di…" truncado — justamente o dado mais
          importante da faixa. */}
      <div className="rounded-2xl px-4 py-3 border flex flex-col gap-1 md:flex-row md:items-center md:justify-between md:gap-3" style={{ background: tema(seasonal.color).bg, borderColor: tema(seasonal.color).border }}>
        <div className="flex items-center gap-2.5 min-w-0">
          {/* Barra de cor no lugar do emoji: é o que identifica a campanha
              agora, e nasce igual pra qualquer data nova. */}
          <span className="w-1 h-6 rounded-full flex-shrink-0" style={{ background: seasonal.color }} />
          <h2 className="text-base font-semibold truncate" style={{ color: seasonal.color }}>{seasonal.name}</h2>
        </div>
        <div className="flex items-center justify-between gap-3 pl-[2.4rem] md:pl-0 md:flex-shrink-0">
          <span className="text-sm" style={{ color: seasonal.color, opacity: 0.7 }}>
            {days < 0 ? `passou há ${-days} ${-days === 1 ? 'dia' : 'dias'} · ${seasonal.day}/${seasonal.month}` : days === 0 ? 'hoje!' : `faltam ${days} dias · ${seasonal.day}/${seasonal.month}`}
          </span>
          <p className="text-sm font-semibold flex-shrink-0" style={{ color: seasonal.color }}>
            {activeClients.length} cliente{activeClients.length !== 1 ? 's' : ''} ativo{activeClients.length !== 1 ? 's' : ''}
          </p>
          {/* Editar, arquivar e excluir moram na campanha aberta, não numa
              engrenagem escondida: são três ações raras, mas quando se procura
              uma delas é olhando pra campanha em questão. */}
          <div className="flex items-center gap-1 flex-shrink-0">
            <button onClick={() => abrirEdicao(seasonal)} title="Editar nome, data, preparo e cor"
              className="p-1.5 rounded-lg transition-colors hover:bg-black/10" style={{ color: seasonal.color }}>
              <Pencil size={14} />
            </button>
            <button onClick={() => arquivarData(seasonal.type, false)} title="Arquivar: some das telas, nada se perde"
              className="p-1.5 rounded-lg transition-colors hover:bg-black/10" style={{ color: seasonal.color }}>
              <Archive size={14} />
            </button>
            <button onClick={() => excluirData(seasonal.type, seasonal.name)} title="Excluir de vez (só se não tiver nada vinculado)"
              className="p-1.5 rounded-lg transition-colors hover:bg-black/10" style={{ color: seasonal.color }}>
              <Trash2 size={14} />
            </button>
          </div>
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
              // Mesma conta da barra do topo — posts, extras, materiais e
              // checklist juntos. Só com posts, o Unizushi (0 posts, 1 extra
              // aprovado) ficava sem barra e sem número nenhum.
              const prog = campaignProgress({ posts: campPosts, extras: campKanbanExtras, materials: campMaterials, checklist: extras })
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
                      {prog.total > 0 && (
                        <div className="flex items-center gap-1.5">
                          <div className="w-16 h-1.5 bg-[var(--color-bg-subtle)] rounded-full overflow-hidden">
                            <div className="h-full rounded-full transition-all" style={{ width: `${prog.pct}%`, background: seasonal.color }} />
                          </div>
                          <span className="text-[10px] text-[var(--color-text-muted)]">{prog.done}/{prog.total}</span>
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
                              <button key={p.id} onClick={() => setOpenPost({ id: p.id, clientId: client.id, month: p.month, year: p.year })}
                                className="flex items-center gap-2 text-xs -mx-1.5 px-1.5 py-0.5 rounded-lg hover:bg-[var(--color-bg-alt)] transition-colors text-left w-full">
                                <span className="font-bold text-[var(--color-text-muted)] w-5">#{p.post_number}</span>
                                <span className="text-[10px] font-medium px-1.5 py-0.5 rounded flex-shrink-0" style={{ background: (isDark ? TYPE_BG_D : TYPE_BG_L)[p.post_type] || 'var(--color-bg-subtle)', color: (isDark ? TYPE_TX_D : TYPE_TX_L)[p.post_type] || 'var(--color-text-secondary)' }}>{TYPE_LABEL[p.post_type] || p.post_type}</span>
                                <span className="flex-1 text-[var(--color-text-primary)] truncate">{p.title}</span>
                                <span className="text-[10px] font-medium px-1.5 py-0.5 rounded flex-shrink-0" style={statusBadge(p.status)}>{STATUS_LABEL[p.status] || p.status}</span>
                              </button>
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
                                <button key={e.id} onClick={() => setOpenExtraId(e.id)}
                                  className="flex items-center gap-2 text-xs -mx-1.5 px-1.5 py-0.5 rounded-lg hover:bg-[var(--color-bg-alt)] transition-colors text-left w-full">
                                  <span className="flex-1 text-[var(--color-text-primary)] truncate">{e.title || 'Sem título'}</span>
                                  <span className="text-[10px] font-medium px-1.5 py-0.5 rounded flex-shrink-0" style={e.status === 'done' ? { background: 'var(--ds-success-bg)', color: 'var(--ds-success-text)' } : { background: 'var(--color-bg-subtle)', color: 'var(--color-text-secondary)' }}>{e.status === 'done' ? 'Feito' : 'Pendente'}</span>
                                </button>
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
                                <button key={m.id} onClick={() => setOpenMaterialId(m.id)}
                                  className="flex items-center gap-2 text-xs -mx-1.5 px-1.5 py-0.5 rounded-lg hover:bg-[var(--color-bg-alt)] transition-colors text-left w-full">
                                  <span className="flex-1 text-[var(--color-text-primary)] truncate">{m.title || 'Sem título'}</span>
                                  <span className="text-[10px] font-medium px-1.5 py-0.5 rounded flex-shrink-0" style={m.status === 'finalizado' ? { background: 'var(--ds-success-bg)', color: 'var(--ds-success-text)' } : { background: 'var(--color-bg-subtle)', color: 'var(--color-text-secondary)' }}>{m.status === 'finalizado' ? 'Feito' : 'Pendente'}</span>
                                </button>
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
                            <div className="h-full rounded-full" style={{ width: `${extras.length ? (doneExtras / extras.length) * 100 : 0}%`, background: seasonal.color }} />
                          </div>
                        )}
                        <div className="flex flex-col gap-1">
                          {extras.map((e: any) => (
                            <div key={e.id} className="flex items-center gap-2">
                              <button onClick={() => toggleExtra(camp.id, e.id, e.done)} className="w-3.5 h-3.5 rounded border flex items-center justify-center flex-shrink-0 transition-colors" style={e.done ? { background: seasonal.color, borderColor: seasonal.color } : { borderColor: 'var(--color-border-strong)' }}>
                                {e.done && <Check size={9} color="white" />}
                              </button>
                              <span className={`text-xs flex-1 ${e.done ? 'line-through text-[var(--color-text-muted)]' : 'text-[var(--color-text-primary)]'}`}>{e.title}</span>
                            </div>
                          ))}
                        </div>
                        {addingExtra === camp.id ? (
                          <div className="flex gap-2 mt-2">
                            <input autoFocus value={newExtraText[camp.id] || ''} onChange={e => setNewExtraText(t => ({ ...t, [camp.id]: e.target.value }))} onKeyDown={e => e.key === 'Enter' && addExtra(camp.id)} placeholder="Novo extra..." className="flex-1 text-xs border border-[var(--color-border)] rounded-lg px-2.5 py-1.5 outline-none focus:border-[var(--color-brand)]" />
                            <button onClick={() => addExtra(camp.id)} className="text-xs font-medium px-2.5 py-1.5 rounded-lg text-white" style={{ background: seasonal.color }}>+</button>
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

                      <a href={`${caminhoCliente(client, 'campanhas')}?camp=${selected}`} className="text-xs hover:underline" style={{ color: 'var(--ds-info-text)' }}>Abrir página do cliente →</a>
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
              <a key={client.id} href={`${caminhoCliente(client, 'campanhas')}?camp=${selected}`} className="flex items-center gap-2 bg-[var(--color-bg-card)] border border-[var(--color-border)] rounded-lg px-3 py-1.5 hover:border-[var(--color-border-hover)] transition-colors">
                <div className="w-5 h-5 rounded-full flex items-center justify-center text-white text-[8px] font-semibold overflow-hidden" style={{ background: client.color_hex }}>{client.logo_url ? <img src={client.logo_url} alt={client.name} className="w-full h-full object-cover" /> : getInitials(client.name)}</div>
                <span className="text-xs text-[var(--color-text-secondary)]">{client.name}</span>
              </a>
            ))}
          </div>
        </div>
      )}

      {activeClients.length === 0 && (
        <div className="flex flex-col items-center justify-center h-48 text-center border border-dashed border-[var(--color-border)] rounded-2xl">
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
          onClose={() => { setCreatingPost(null); load() }}
          onSaved={load}
        />
      )}
      {creatingExtra && (
        <ExtraCard
          fixedClientId={creatingExtra.clientId}
          initialCampaignType={creatingExtra.campType}
          onClose={() => { setCreatingExtra(null); load() }}
          onSaved={load}
        />
      )}
      {creatingMaterial && (
        <MaterialCard
          fixedClientId={creatingMaterial.clientId}
          initialCampaignType={creatingMaterial.campType}
          onClose={() => { setCreatingMaterial(null); load() }}
          onSaved={load}
        />
      )}

      {/* `onSaved` NÃO fecha o card — ele dispara a cada campo salvo, não no
          fim da edição. Fechando ali, o card sumia a cada alteração. Quem
          fecha é o `onClose`, e é lá que a lista recarrega pra barra refletir
          o que mudou. Mesma convenção do Kanban e da página de Materiais. */}
      {openPost && (
        <PostCard
          postId={openPost.id}
          clientId={openPost.clientId}
          clientName={clients.find(c => c.id === openPost.clientId)?.name}
          clientColor={clients.find(c => c.id === openPost.clientId)?.color_hex}
          month={openPost.month}
          year={openPost.year}
          onClose={() => { setOpenPost(null); load() }}
          onSaved={load}
        />
      )}
      {openExtraId && (
        <ExtraCard
          extraId={openExtraId}
          onClose={() => { setOpenExtraId(null); load() }}
          onSaved={load}
        />
      )}
      {openMaterialId && (
        <MaterialCard
          materialId={openMaterialId}
          onClose={() => { setOpenMaterialId(null); load() }}
          onSaved={load}
        />
      )}
    </div>
  )
}
