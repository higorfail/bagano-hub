'use client'

import { use, useEffect, useState, Suspense } from 'react'
import { useDarkMode } from '@/lib/useDarkMode'
import { useUser } from '@/lib/UserContext'
import { useRouter, useSearchParams, usePathname } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import IPhoneFeed from '@/components/IPhoneFeed'
import MaterialCard from '@/components/MaterialCard'
import { logActivity } from '@/lib/activity'
import { useToast } from '@/lib/ToastContext'
import { dbError } from '@/lib/dbError'
import { getOrCreateGeneralApprovalToken } from '@/lib/approvalLinks'
import { copyTextAsync } from '@/lib/clipboard'
import { readLastPeriod, saveLastPeriod } from '@/lib/lastPeriod'
import { usePendingMonths, oldestOtherPending, periodKey } from '@/lib/pendingMonths'
import CampaignsTab from '@/components/CampaignsTab'
import CronogramaTab, { CRONO_MONTHS } from '@/components/CronogramaTab'
import MaterialCardMini from '@/components/MaterialCardMini'
import ExtrasKanban from '@/components/ExtrasKanban'
import ActivityLog from '@/components/ActivityLog'
import OnboardingTab from '@/components/OnboardingTab'
import ManualTab from '@/components/ManualTab'
import RecorrentesView from '@/components/recorrentes/RecorrentesView'
import TaskMiniCard from '@/components/TaskMiniCard'
import TaskCard from '@/components/TaskCard'
import { Plus, ChevronLeft, Pencil, Link as LinkIcon } from 'lucide-react'
import { useIsWideScreen } from '@/lib/useMediaQuery'

type Client = {
  id: string; name: string; color_hex: string; logo_url: string
  drive_folder_url: string; sous_chef_url: string; status: string
  instagram_url: string; instagram_followers: number | null; instagram_following: number | null
}

type Post = {
  id: string; post_number: number; title: string; copy: string; legenda?: string
  post_type: string; scheduled_date: string; status: string
  approval_status: string; approval_comment: string
  drive_url: string; drive_folder_url: string; reference_notes: string; funil: string; campaign_type: string
}

const MONTHS = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro']
const typeColor: Record<string,string> = { 'reels':'bg-[var(--ds-error-bg)] text-[var(--ds-error-text)]','carrossel':'bg-[var(--ds-info-bg)] text-[var(--ds-info-text)]','story':'bg-[var(--ds-purple-bg)] text-[var(--ds-purple-text)]','carrossel_stories':'bg-[var(--ds-purple-bg)] text-[var(--ds-purple-text)]','post':'bg-[var(--ds-caution-bg)] text-[var(--ds-caution-text)]','post_story':'bg-[var(--ds-purple-bg)] text-[var(--ds-purple-text)]' }
const statusColor: Record<string,string> = { 'publicado':'bg-[var(--ds-success-bg)] text-[var(--ds-success-text)]','aprovado':'bg-[var(--ds-info-bg)] text-[var(--ds-info-text)]','agendado':'bg-[var(--ds-info-bg)] text-[var(--ds-info-text)]','aguardando_aprovacao':'bg-[var(--ds-warn-bg)] text-[var(--ds-warn-text)]','aguardando_aprovacao_crono':'bg-[var(--ds-purple-bg)] text-[var(--ds-purple-text)]','revisao_interna':'bg-[#8b5cf6]/10 text-[#8b5cf6]','ajuste':'bg-[var(--ds-error-bg)] text-[var(--ds-error-text)]','captacao':'bg-[var(--ds-info-bg)] text-[var(--ds-info-text)]','producao':'bg-[var(--ds-caution-bg)] text-[var(--ds-caution-text)]','estrategia':'bg-[var(--color-bg-subtle)] text-[var(--color-text-secondary)]','pendente':'bg-[var(--color-bg-subtle)] text-[var(--color-text-secondary)]' }
const STATUS_LABEL: Record<string,string> = { estrategia:'Estratégia', aguardando_aprovacao_crono:'Ag. crono', captacao:'Captação', producao:'Produção', revisao_interna:'Revisão', aguardando_aprovacao:'Aguardando aprovação', ajuste:'Ajuste', aprovado:'Aprovado', agendado:'Agendado', publicado:'Publicado' }
const TYPE_LABEL: Record<string,string> = { reels:'Reels', carrossel:'Carrossel', post:'Post', story:'Story', carrossel_stories:'Carrossel/Stories' , post_story:'Post/Story'}
const FUNCAO_LABEL: Record<string,string> = { videos:'Editor', posts:'Designer', estrategia:'Estratégia', social:'Social Media', acompanha:'Acompanha', outro:'Outro' }
function getInitials(name: string) { return name.split(' ').map(w=>w[0]).join('').slice(0,2).toUpperCase() }

function ClientePageInner({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const router = useRouter()
  const searchParams = useSearchParams()
  const pathname = usePathname()
  const isDark = useDarkMode()
  const { toast } = useToast()
  const { currentMember, showOnlyMine } = useUser()
  const [client, setClient] = useState<Client | null>(null)
  const [posts, setPosts] = useState<Post[]>([])
  const [tab, setTab] = useState(() => searchParams.get('tab') || 'cronograma')
  // Faixa encolhida. Basta o primeiro gesto de rolagem: 16px pra encolher, e
  // volta ao topo de verdade (4px). Os dois limiares são diferentes de propósito
  // — com um só, parar de rolar exatamente em cima dele faz o cabeçalho piscar
  // entre os dois tamanhos a cada pixel.
  const [compacto, setCompacto] = useState(false)
  // Encolhido E com largura pra isso: no celular as abas continuam na linha de
  // baixo, senão sobrariam três delas visíveis ao lado do nome.
  const telaLarga = useIsWideScreen()
  const inline = compacto && telaLarga

  // Ordem do fluxo, não alfabética nem histórica: o que se abre todo dia vem
  // primeiro e o que é consulta fica no fim.
  const TABS = [
    { key: 'cronograma', label: 'Cronograma' }, { key: 'extras', label: 'Extras' },
    // Recorrentes ao lado de Extras: os dois são o que sai fora do cronograma.
    { key: 'recorrentes', label: 'Recorrentes' },
    { key: 'materiais', label: 'Materiais' },   { key: 'tarefas', label: 'Tarefas' },
    { key: 'campanhas', label: 'Campanhas' },   { key: 'feed', label: 'Feed' },
    { key: 'drive', label: 'Arquivos' },        { key: 'onboarding', label: 'Onboarding' },
    { key: 'manual', label: 'Manual' },         { key: 'historico', label: 'Histórico' },
    { key: 'time', label: 'Time' },
  ]

  function renderTabs(menor: boolean) {
    return TABS.map(t => (
      <button key={t.key} onClick={() => setTab(t.key)}
        className={`flex-shrink-0 rounded-lg font-medium transition-all whitespace-nowrap ${menor ? 'px-2 py-1 text-[11px]' : 'px-3 md:px-4 py-1.5 md:py-2 text-xs md:text-sm'} ${tab === t.key ? 'bg-[var(--color-text-primary)] text-[var(--color-bg-page)]' : 'text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-subtle)]'}`}>
        {t.label}
      </button>
    ))
  }
  // Prioridade: o que veio no link > último período visto no Cronograma >
  // mês atual. Sem o meio, abrir um cliente jogava sempre no mês atual, mesmo
  // com a pessoa trabalhando no cronograma do mês seguinte.
  const [selectedMonth, setSelectedMonth] = useState(() => {
    const mParam = searchParams.get('m')
    const m = mParam ? parseInt(mParam) : NaN
    if (!isNaN(m) && m >= 1 && m <= 12) return m
    return readLastPeriod()?.m ?? new Date().getMonth() + 1
  })
  const [selectedYear, setSelectedYear] = useState(() => {
    const yParam = searchParams.get('y')
    const y = yParam ? parseInt(yParam) : NaN
    if (!isNaN(y) && y > 2000) return y
    return readLastPeriod()?.y ?? new Date().getFullYear()
  })
  const [showMonthPicker, setShowMonthPicker] = useState(false)
  const pendingMonths = usePendingMonths(id as string)
  const otherPending = oldestOtherPending(pendingMonths, selectedMonth, selectedYear)
  const [loading, setLoading] = useState(true)
  const [team, setTeam] = useState<any[]>([])
  const [allMembers, setAllMembers] = useState<any[]>([])
  const [myClientTasks, setMyClientTasks] = useState<any[]>([])
  const [openTaskId, setOpenTaskId] = useState<string | null>(null)
  const [showNewTask, setShowNewTask] = useState(false)
  const [showAddMember, setShowAddMember] = useState(false)
  const [materials,    setMaterials]    = useState<any[]>([])
  const [matCounts,    setMatCounts]    = useState<Record<string,any>>({})
  const [cardOpen,     setCardOpen]     = useState<string | 'new' | null>(null)
  const [matDragging,  setMatDragging]  = useState<string | null>(null)
  const [matDragOver,  setMatDragOver]  = useState<string | null>(null)
  const [newMemberId, setNewMemberId] = useState('')
  const [newFuncao, setNewFuncao] = useState('posts')
  const [showEditClient, setShowEditClient] = useState(false)
  const [editClientForm, setEditClientForm] = useState({ name: '', color_hex: '', logo_url: '', drive_folder_url: '', sous_chef_url: '', instagram_url: '', instagram_followers: '', instagram_following: '' })
  const [savingClient, setSavingClient] = useState(false)

  useEffect(() => { document.title = client ? `${client.name} · Bagano Hub` : 'Cliente · Bagano Hub' }, [client])

  // Tarefas do quadro pessoal vinculadas a este cliente — só as suas (mesma regra
  // de privacidade do quadro: cada um só vê o que está atribuído a si mesmo).
  // Geral, de todos da equipe — tarefas vinculadas a este cliente não são privadas
  // aqui (diferente do Quadro pessoal de cada um), já que o time inteiro precisa
  // ver o que está pendente pra esse cliente.
  async function loadMyClientTasks() {
    if (!id) return
    const supabase = createClient()
    const { data } = await supabase.from('personal_tasks')
      .select('*').eq('client_id', id)
      .order('position', { ascending: true }).order('created_at', { ascending: false })
    setMyClientTasks(data || [])
  }
  useEffect(() => { if (tab === 'tarefas') loadMyClientTasks() }, [tab, id])

  async function markClientTaskDone(taskId: string) {
    const supabase = createClient()
    const prev = myClientTasks
    setMyClientTasks(ts => ts.map(t => t.id === taskId ? { ...t, status: 'feito' } : t))
    const { error } = await supabase.from('personal_tasks').update({ status: 'feito', completed_at: new Date().toISOString() }).eq('id', taskId)
    if (error) setMyClientTasks(prev)
  }
  async function deleteClientTask(taskId: string) {
    const supabase = createClient()
    const prev = myClientTasks
    setMyClientTasks(ts => ts.filter(t => t.id !== taskId))
    const { error } = await supabase.from('personal_tasks').delete().eq('id', taskId)
    if (error) setMyClientTasks(prev)
  }

  // Mantém aba/mês/ano na URL, pra dar pra copiar e colar o link e cair direto na mesma view
  useEffect(() => {
    saveLastPeriod(selectedMonth, selectedYear)
    const params = new URLSearchParams(searchParams.toString())
    params.set('tab', tab)
    params.set('m', String(selectedMonth))
    params.set('y', String(selectedYear))
    if (params.toString() !== searchParams.toString()) {
      router.replace(`${pathname}?${params.toString()}`, { scroll: false })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, selectedMonth, selectedYear])

  useEffect(() => {
    async function load() {
      const supabase = createClient()
      const [{ data: clientData }, { data: postData }] = await Promise.all([
        supabase.from('clients').select('*').eq('id', id).single(),
        supabase.from('schedules').select('*').eq('client_id', id).eq('month', selectedMonth).eq('year', selectedYear).order('post_number'),
      ])
      setClient(clientData)
      setPosts(postData || [])
      const { data: membersData } = await supabase.from('team_members').select('id, name, role, color').order('name')
      const { data: teamData } = await supabase.from('client_team').select('id, funcao, member_id').eq('client_id', id)
      // Junta manualmente para não depender do join do PostgREST
      const enriched = (teamData || []).map(t => ({
        ...t,
        team_members: (membersData || []).find(m => m.id === t.member_id)
      }))
      setTeam(enriched)
      setAllMembers(membersData || [])
      const { data: matData } = await supabase.from('materials').select('*').eq('client_id', id).order('created_at', { ascending: false })
      setMaterials(matData || [])
      const [{ data: chk }, { data: cms }, { data: atts }, { data: ups }] = await Promise.all([
        supabase.from('material_checklist').select('material_id, done'),
        supabase.from('material_comments').select('material_id'),
        supabase.from('material_attachments').select('material_id'),
        supabase.from('material_uploads').select('material_id, file_url, created_at').order('created_at', { ascending: true }),
      ])
      const mc: Record<string,any> = {}
      ;(matData || []).forEach((m: any) => { mc[m.id] = { checklist: 0, checkDone: 0, comments: 0, attachments: 0, preview: null } })
      ;(chk || []).forEach((x: any) => { if (mc[x.material_id]) { mc[x.material_id].checklist++; if (x.done) mc[x.material_id].checkDone++ } })
      ;(cms || []).forEach((x: any) => { if (mc[x.material_id]) mc[x.material_id].comments++ })
      ;(atts || []).forEach((x: any) => { if (mc[x.material_id]) mc[x.material_id].attachments++ })
      ;(ups || []).forEach((x: any) => { if (mc[x.material_id] && !mc[x.material_id].preview && /\.(png|jpe?g|webp|gif|avif)(\?|$)/i.test(x.file_url || '')) mc[x.material_id].preview = x.file_url })
      setMatCounts(mc)
      setLoading(false)
    }
    load()
  }, [id, selectedMonth, selectedYear])

  async function reloadMaterials() {
    const supabase = createClient()
    const { data } = await supabase.from('materials').select('*').eq('client_id', id).order('created_at', { ascending: false })
    setMaterials(data || [])
  }

  function openNewMaterial() {
    setCardOpen('new')
  }


  async function moveMatStatus(matId: string, newStatus: string) {
    const labels: Record<string,string> = { producao: 'A fazer', feito: 'Feito', aguardando_aprovacao: 'Com o cliente', ajuste: 'Ajuste', finalizado: 'Finalizado' }
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
      logo_url: client.logo_url || '',
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
    <div className="flex h-full" onClick={() => setShowMonthPicker(false)}>
      <div className="flex-1 flex flex-col overflow-hidden">
        <div className="p-3 md:p-6 border-b border-[var(--color-border)]">

          {/* Uma faixa só, que encolhe quando você rola.
              Antes eram três: breadcrumb ("Clientes / Zebuino"), identidade
              (foto, nome, três pílulas de números) e abas — ~200px de altura
              fixa antes do primeiro card, num painel que a pessoa usa o dia
              inteiro montando cronograma.
              O nome do cliente aparecia duas vezes (breadcrumb e título), e
              "Setembro 2026" três (aqui, no texto do crono e no seletor de mês).
              Os números desceram pro cronograma, que é de onde eles falam: em
              Materiais ou no Time, "0/12 publicados de setembro" é ruído.
              Rolando o conteúdo, foto e nome encolhem e sobra a linha de abas —
              fixa continua fixa, o custo em tela é que sai. */}
          <div className="flex items-center justify-between gap-3">
            <div className={`flex items-center gap-2.5 min-w-0 ${inline ? "flex-shrink-0 max-w-[38%]" : ""}`}>
              <button onClick={() => router.push('/dashboard/clientes')} title="Voltar pros clientes"
                className="w-8 h-8 rounded-lg flex items-center justify-center text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-bg-subtle)] transition-colors flex-shrink-0 -ml-1">
                <ChevronLeft size={18} />
              </button>
              {client.logo_url
                ? <img src={client.logo_url} alt={client.name} className={`rounded-full object-cover flex-shrink-0 transition-all duration-200 ${compacto ? 'w-8 h-8' : 'w-9 h-9 md:w-12 md:h-12'}`} onError={e => { (e.target as HTMLImageElement).style.display = 'none' }} />
                : <div className={`rounded-full flex items-center justify-center text-white font-bold flex-shrink-0 transition-all duration-200 ${compacto ? 'w-8 h-8 text-[10px]' : 'w-9 h-9 md:w-12 md:h-12 text-xs md:text-sm'}`} style={{ background: client.color_hex }}>{getInitials(client.name)}</div>
              }
              <h1 className={`font-bold text-[var(--color-text-primary)] tracking-tight truncate transition-all duration-200 ${compacto ? 'text-base' : 'text-base md:text-2xl'}`}>{client.name}</h1>
            </div>

            {/* As abas ao lado do nome, menores, ocupando o espaço que a foto
                grande e os números liberaram ao encolher. */}
            {inline && (
              <div className="flex items-center gap-0.5 flex-1 min-w-0 overflow-x-auto">
                {renderTabs(true)}
              </div>
            )}

            <div className="flex items-center gap-1.5 flex-shrink-0">
              {/* Links que SAEM do hub, com o glifo da plataforma: o texto
                  "Instagram" e "Drive" comia ~250px de largura e ainda colidia
                  com o nome das abas de dentro do hub. */}
              {client.instagram_url && (
                <a href={client.instagram_url} target="_blank" rel="noopener noreferrer" title="Abrir o Instagram do cliente"
                  className="w-9 h-9 rounded-xl border border-[var(--color-border)] flex items-center justify-center text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-subtle)] hover:text-[var(--color-text-primary)] transition-colors">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <rect x="2" y="2" width="20" height="20" rx="5" /><circle cx="12" cy="12" r="4" /><circle cx="17.5" cy="6.5" r="1.2" fill="currentColor" stroke="none" />
                  </svg>
                </a>
              )}
              {client.drive_folder_url && (
                <a href={client.drive_folder_url} target="_blank" rel="noopener noreferrer" title="Abrir a pasta no Google Drive"
                  className="w-9 h-9 rounded-xl border border-[var(--color-border)] flex items-center justify-center text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-subtle)] hover:text-[var(--color-text-primary)] transition-colors">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                    <path d="M8.4 2.6h7.2l6.4 11.1-3.6 6.2-6.4-11.1z" opacity=".55" />
                    <path d="M1.9 13.7 8.4 2.6l3.6 6.2-6.4 11.1z" opacity=".8" />
                    <path d="M5.6 19.9h12.8l-3.6 1.5H9.2z" opacity=".35" />
                    <path d="M5.6 19.9 9.2 13.7h12.8l-3.6 6.2z" />
                  </svg>
                </a>
              )}
              <button onClick={async () => {
                const ok = await copyTextAsync(async () => {
                  const generalToken = await getOrCreateGeneralApprovalToken(client.id)
                  if (!generalToken) throw new Error('sem token')
                  return `${window.location.origin}/aprovar/${generalToken}`
                })
                toast(ok ? 'Link da Central de aprovação copiado!' : 'Erro ao gerar link')
              }} className={`hidden md:flex items-center justify-center gap-1.5 border border-[var(--color-border)] text-[var(--color-text-primary)] rounded-xl h-9 font-medium hover:bg-[var(--color-bg-subtle)] transition-colors whitespace-nowrap ${inline ? 'w-9' : 'px-3 text-sm'}`} title="Copia o link com tudo que está pendente de aprovação (crono + final + extras)">
                <LinkIcon size={14} />{!inline && 'Central de aprovação'}
              </button>
              <button onClick={openEditClient} title="Editar cliente"
                className="w-9 h-9 rounded-xl border border-[var(--color-border)] flex items-center justify-center text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-subtle)] hover:text-[var(--color-text-primary)] transition-colors">
                <Pencil size={14} />
              </button>
            </div>
          </div>

          {/* No celular a Central não cabe na linha de cima e é a ação mais
              usada da tela — fica sozinha embaixo, inteira. */}
          <button onClick={async () => {
            const ok = await copyTextAsync(async () => {
              const generalToken = await getOrCreateGeneralApprovalToken(client.id)
              if (!generalToken) throw new Error('sem token')
              return `${window.location.origin}/aprovar/${generalToken}`
            })
            toast(ok ? 'Link da Central de aprovação copiado!' : 'Erro ao gerar link')
          }} className="md:hidden flex items-center justify-center gap-1.5 mt-2 w-full border border-[var(--color-border)] text-[var(--color-text-primary)] rounded-lg py-2 text-xs font-semibold">
            <LinkIcon size={12} /> Central de aprovação
          </button>

          {/* Só quando NÃO está encolhido: rolando, as abas sobem pra linha do
              nome (lá em cima) em vez de ocuparem uma linha própria. */}
          {!inline && (
            <div className="flex items-center gap-1 mt-2.5 md:mt-3 overflow-x-auto -mx-3 px-3 md:-mx-4 md:px-4 lg:mx-0 lg:px-0">
              {renderTabs(false)}
            </div>
          )}
        </div>

        <div className="flex-1 overflow-y-auto p-4 md:p-6" onScroll={e => {
          const el = e.target as HTMLDivElement
          // Encolher devolve ~44px de altura ao conteúdo — ou seja, a própria
          // `sobra` de rolagem DIMINUI ~44px assim que o cabeçalho encolhe.
          //
          // Por isso o limiar tem que ser diferente pra entrar e pra sair. Com
          // um número só (era 200 nos dois), qualquer página com sobra entre
          // 200 e 244 passava no teste aberta (210 > 200), reprovava fechada
          // (166 < 200), reabria, e voltava a passar — piscando pra sempre. O
          // mesmo vale pro scrollTop, que o navegador corrige junto.
          //
          // Os 100px de folga entre os dois limiares são bem maiores que os
          // ~44px que o cabeçalho tira, então nenhum estado consegue derrubar
          // o outro.
          const sobra = el.scrollHeight - el.clientHeight
          const y = el.scrollTop
          setCompacto(c => (c ? sobra > 100 && y > 4 : sobra > 200 && y > 16))
        }}>
          {tab === 'cronograma' && (
            <div className="flex flex-col gap-4">
              {/* Month/year nav */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 min-w-0 flex-wrap">
                  {/* Estes números moravam lá em cima, no header do cliente,
                      junto de mais um "Setembro 2026" — o terceiro da tela. São
                      do MÊS, então vivem ao lado do seletor de mês; e o mês em
                      si só aparece no seletor, à direita. */}
                  <span className="text-sm text-[var(--color-text-secondary)]">{posts.length} posts</span>
                  {notApproved > 0 && <span className="text-xs font-semibold px-2 py-0.5 rounded-full" style={{ background: 'var(--ds-error-bg)', color: 'var(--ds-error-text)' }}>{notApproved} não aprovado{notApproved>1?'s':''}</span>}
                  {approved > 0 && <span className="text-xs font-semibold px-2 py-0.5 rounded-full" style={{ background: 'var(--ds-success-bg)', color: 'var(--ds-success-text)' }}>{approved} aprovado{approved>1?'s':''}</span>}
                  <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-[var(--color-bg-subtle)] text-[var(--color-text-secondary)]">{published}/{posts.length} publicados</span>
                  {/* Mesmo atalho da página de Cronograma: no dia 1º a aba
                      abre no mês novo e o mês anterior parado com o cliente
                      desaparecia da vista de quem está trabalhando. */}
                  {otherPending && (
                    <button
                      onClick={() => { setSelectedMonth(otherPending.month); setSelectedYear(otherPending.year) }}
                      title={`${otherPending.count} post${otherPending.count !== 1 ? 's' : ''} esperando resposta em ${CRONO_MONTHS[otherPending.month - 1]}`}
                      className="flex items-center gap-1.5 px-2 py-1 rounded-lg text-[11px] font-semibold flex-shrink-0 transition-opacity hover:opacity-80"
                      style={{ background: 'var(--ds-warn-bg)', color: 'var(--ds-warn-text)' }}>
                      <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: 'var(--ds-warn-accent)' }} />
                      {CRONO_MONTHS[otherPending.month - 1].slice(0, 3)} · {otherPending.count}
                    </button>
                  )}
                </div>
                <div className="relative flex items-center gap-1">
                  <button onClick={() => setSelectedMonth(m => { const prev = m===1?12:m-1; if (prev===12) setSelectedYear(y=>y-1); return prev })} className="w-8 h-8 rounded-lg border border-[var(--color-border)] flex items-center justify-center text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-subtle)]">‹</button>
                  <button onClick={() => setShowMonthPicker(p => !p)} className="text-sm font-medium text-[var(--color-text-primary)] px-2 py-1 rounded-lg hover:bg-[var(--color-bg-subtle)] min-w-[120px] text-center">
                    {CRONO_MONTHS[selectedMonth-1]} {selectedYear}
                  </button>
                  <button onClick={() => setSelectedMonth(m => { const next = m===12?1:m+1; if (next===1) setSelectedYear(y=>y+1); return next })} className="w-8 h-8 rounded-lg border border-[var(--color-border)] flex items-center justify-center text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-subtle)]">›</button>
                  {showMonthPicker && (
                    <div className="absolute top-full mt-1 right-0 z-50 bg-[var(--color-bg-card)] border border-[var(--color-border)] rounded-xl shadow-xl p-3 w-56" onClick={e => e.stopPropagation()}>
                      <div className="flex items-center justify-between mb-2.5">
                        <button onClick={() => setSelectedYear(y => y - 1)} className="w-7 h-7 rounded-lg hover:bg-[var(--color-bg-subtle)] text-[var(--color-text-secondary)] flex items-center justify-center">‹</button>
                        <span className="text-sm font-semibold text-[var(--color-text-primary)]">{selectedYear}</span>
                        <button onClick={() => setSelectedYear(y => y + 1)} className="w-7 h-7 rounded-lg hover:bg-[var(--color-bg-subtle)] text-[var(--color-text-secondary)] flex items-center justify-center">›</button>
                      </div>
                      <div className="grid grid-cols-3 gap-1">
                        {CRONO_MONTHS.map((mo, i) => {
                          const pend = pendingMonths[periodKey(i + 1, selectedYear)] || 0
                          return (
                            <button key={i} onClick={() => { setSelectedMonth(i + 1); setShowMonthPicker(false) }}
                              title={pend ? `${pend} esperando resposta` : undefined}
                              className={`relative text-xs py-1.5 rounded-lg font-medium transition-all ${selectedMonth===i+1 ? 'bg-[var(--color-text-primary)] text-[var(--color-bg-page)]' : 'hover:bg-[var(--color-bg-subtle)] text-[var(--color-text-secondary)]'}`}>
                              {mo.slice(0, 3)}
                              {pend > 0 && (
                                <span className="absolute top-0.5 right-1 w-1.5 h-1.5 rounded-full" style={{ background: 'var(--ds-warn-accent)' }} />
                              )}
                            </button>
                          )
                        })}
                      </div>
                    </div>
                  )}
                </div>
              </div>
              <CronogramaTab
                key={`${id}-${selectedMonth}-${selectedYear}`}
                clientId={id}
                clientName={client?.name}
                clientColor={client?.color_hex}
                month={selectedMonth}
                year={selectedYear}
                postParam={searchParams.get('post')}
                showViewToggle
              />
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
                  drive_folder_url: p.drive_folder_url,
                  copy: p.copy,
                  legenda: p.legenda,
                  scheduled_date: p.scheduled_date,
                  post_number: p.post_number,
                }))}
                clientName={client.name}
                clientColor={client.color_hex}
                clientInitials={getInitials(client.name)}
                followersCount={client.instagram_followers ?? undefined}
                followingCount={client.instagram_following ?? undefined}
                instagramUrl={client.instagram_url || undefined}
                logoUrl={client.logo_url || undefined}
                onReorder={async (reordered) => {
                  await Promise.all(reordered.map(p => createClient().from('schedules').update({ post_number: p.post_number }).eq('id', p.id)))
                }}
              />
            </div>
          )}

          {tab === 'materiais' && (
            <div className="flex flex-col gap-4 h-full min-h-0">
              {/* Título e ação na MESMA linha — o botão caía numa fileira
                  própria embaixo da explicação e gastava uma faixa inteira. */}
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-[var(--color-text-primary)]">Materiais extras</p>
                  <p className="text-xs text-[var(--color-text-muted)] mt-0.5">Menus, cardápios, artes avulsas, logos.</p>
                </div>
                <button onClick={() => setCardOpen('new')}
                  className="flex-shrink-0 bg-[var(--color-text-primary)] text-[var(--color-bg-page)] rounded-xl px-3 py-1.5 text-sm font-medium">
                  + Novo material
                </button>

              </div>

              {/* Kanban 3 colunas */}
              {(() => {
                // Mesmas colunas do quadro geral de Materiais — este aqui é
                // uma terceira cópia do mesmo board e vivia divergindo.
                // As MESMAS quatro colunas da página de Materiais. "Ajuste"
                // era uma quinta coluna só aqui: ajuste não é etapa do fluxo,
                // é retorno — o card volta pra "A fazer", e é lá que ele cai
                // pelo fallback de status desconhecido.
                const MAT_COLS = [
                  { key: 'producao',             label: 'A fazer',       color: '#F59E0B' },
                  { key: 'feito',                label: 'Feito',         color: '#0EA5E9' },
                  { key: 'aguardando_aprovacao', label: 'Com o cliente', color: '#EC4899' },
                  { key: 'finalizado',           label: 'Finalizados',   color: '#22C55E' },
                ]
                const MAT_KNOWN = MAT_COLS.map(c => c.key)
                const matVisible = materials.filter(m => {
                  if (!showOnlyMine || !currentMember) return true
                  const assigned = m.assigned_members?.length ? m.assigned_members : m.assigned_to ? [m.assigned_to] : []
                  return assigned.includes(currentMember.id)
                })
                function colItems(colKey: string) {
                  return matVisible.filter(m => {
                    const s = m.status || 'producao'
                    if (colKey === 'producao') return s === 'producao' || !MAT_KNOWN.includes(s)
                    return s === colKey
                  })
                }
                return (
                  <div className="flex-1 min-h-[55svh] md:min-h-0 overflow-x-auto -mx-3 px-3 md:mx-0 md:px-0 snap-x snap-mandatory md:snap-none">
                    {/* Mesma estrutura das páginas de Extras e Materiais: só a
                        área de cards de cada coluna rola na vertical. */}
                    <div className="flex gap-3 h-full md:w-full">
                    {MAT_COLS.map((col, ci) => {
                      const items      = colItems(col.key)
                      const isDragOver = matDragOver === col.key
                      const prevCol    = MAT_COLS[ci - 1]
                      const nextCol    = MAT_COLS[ci + 1]
                      return (
                        <div key={col.key} className="flex flex-col w-[calc(100vw-1.5rem)] flex-shrink-0 md:w-auto md:flex-1 md:min-w-[268px] md:flex-shrink snap-center snap-always md:snap-align-none overflow-hidden"
                          onDragOver={e => { e.preventDefault(); setMatDragOver(col.key) }}
                          onDragLeave={() => setMatDragOver(null)}
                          onDrop={e => { e.preventDefault(); if (matDragging) moveMatStatus(matDragging, col.key); setMatDragging(null); setMatDragOver(null) }}>
                          <div className="flex items-center justify-between mb-2 px-1 flex-shrink-0">
                            <div className="flex items-center gap-2 min-w-0">
                              <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: col.color }} />
                              <span className="text-xs font-semibold text-[var(--color-text-primary)] truncate">{col.label}</span>
                              <span className="text-[10px] font-bold text-[var(--color-text-muted)] bg-[var(--color-bg-card)] border border-[var(--color-border)] rounded-full w-5 h-5 flex items-center justify-center flex-shrink-0">{items.length}</span>
                            </div>
                          </div>
                          <div className={`flex flex-col gap-2 flex-1 min-h-[80px] overflow-y-auto rounded-xl transition-colors p-1 ${isDragOver ? 'ring-2 ring-dashed ring-[var(--color-brand)] bg-[var(--color-bg-subtle)]' : ''}`}
                            style={{ scrollbarGutter: 'stable' }}>
                            {items.map(m => {
                              const ct = matCounts[m.id] || {}
                              return (
                                <MaterialCardMini key={m.id}
                                  material={{ ...m, _checkTotal: ct.checklist||0, _checkDone: ct.checkDone||0, _comments: ct.comments||0, _attachments: ct.attachments||0, _preview: ct.preview||null }}
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
                              <div className={`flex items-center justify-center h-20 border-2 border-dashed rounded-xl transition-colors ${isDragOver ? 'border-[var(--color-brand)]' : 'border-[var(--color-border)]'}`}>
                                <p className={`text-[10px] font-medium ${isDragOver ? 'text-[var(--color-brand)]' : 'text-[var(--color-text-faint)]'}`}>
                                  {isDragOver ? 'Solte aqui' : '—'}
                                </p>
                              </div>
                            )}
                          </div>
                        </div>
                      )
                    })}
                    </div>
                  </div>
                )
              })()}

              {cardOpen && (
                <MaterialCard
                  materialId={cardOpen.startsWith('new') ? undefined : cardOpen}
                  initialStatus={cardOpen.startsWith('new:') ? cardOpen.slice(4) : undefined}
                  fixedClientId={id as string}
                  clients={[client].filter(Boolean)}
                  onClose={() => setCardOpen(null)}
                  onSaved={reloadMaterials}
                  onDeleted={handleMatDeleted}
                />
              )}
            </div>
          )}

          {tab === 'recorrentes' && (
            <RecorrentesView fixedClientId={id as string} />
          )}

          {tab === 'campanhas' && (
            <CampaignsTab
              clientId={id as string}
              clientColor={client.color_hex}
              members={allMembers}
              initialType={searchParams.get('camp')}
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
                      <div className="w-9 h-9 rounded-full flex items-center justify-center text-white text-xs font-semibold flex-shrink-0" style={{ background: m.team_members?.color || 'var(--color-brand)' }}>
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
            // h-full/min-h-0: o quadro precisa de altura definida pra cada
            // coluna rolar por dentro. A área da aba já é um flex-1 com
            // rolagem, então 100% dela resolve — sem isso o Extras ficava
            // sendo o único quadro do hub sem rolagem por coluna.
            <div className="flex flex-col gap-4 h-full min-h-0">
              {/* Título vai DENTRO da barra do quadro: solto acima, as ações
                  caíam numa fileira própria embaixo da explicação. */}
              <ExtrasKanban clientId={client.id} members={allMembers}
                heading={<>
                  <p className="text-sm font-medium text-[var(--color-text-primary)]">Extras de {client.name}</p>
                  <p className="text-xs text-[var(--color-text-muted)] mt-0.5">Tarefas, notas e lembretes específicos deste cliente</p>
                </>} />
            </div>
          )}

          {tab === 'tarefas' && (
            <div className="flex flex-col gap-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-[var(--color-text-primary)]">Tarefas ligadas a {client.name}</p>
                  <p className="text-xs text-[var(--color-text-muted)] mt-0.5">De todo mundo da equipe — do Quadro pessoal de cada um, filtradas por este cliente</p>
                </div>
                <button onClick={() => setShowNewTask(true)}
                  className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-xl text-white hover:opacity-90 transition-opacity"
                  style={{ background: 'var(--color-brand)' }}>
                  <Plus size={13} /> Nova tarefa
                </button>
              </div>
              {myClientTasks.length === 0 ? (
                <p className="text-sm text-[var(--color-text-muted)] py-8 text-center">Nada aqui ainda.</p>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {myClientTasks.map(t => {
                    const assigneeMember = allMembers.find((m: any) => m.id === t.assigned_to)
                    return (
                      <TaskMiniCard key={t.id} task={t} clientMap={{ [client.id]: { name: client.name, color_hex: client.color_hex } }}
                        assignee={assigneeMember ? { name: assigneeMember.name, color: assigneeMember.color || 'var(--color-brand)' } : undefined}
                        onClick={() => setOpenTaskId(t.id)}
                        onMarkDone={t.status !== 'feito' ? () => markClientTaskDone(t.id) : undefined}
                        onDelete={() => deleteClientTask(t.id)}
                      />
                    )
                  })}
                </div>
              )}
            </div>
          )}

          {tab === 'onboarding' && (
            <OnboardingTab clientId={client.id} />
          )}

          {tab === 'manual' && (
            <ManualTab clientId={id} />
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
                    style={{ minHeight: 'calc(100vh - 220px)', filter: isDark ? 'invert(1) hue-rotate(180deg)' : undefined }}
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

      {(openTaskId || showNewTask) && currentMember && (
        <TaskCard
          taskId={openTaskId || undefined}
          defaultAssignedTo={currentMember.id}
          defaultClientId={client.id}
          clients={[client].filter(Boolean)}
          onClose={() => { setOpenTaskId(null); setShowNewTask(false) }}
          onSaved={loadMyClientTasks}
          onDeleted={() => { loadMyClientTasks(); setOpenTaskId(null); setShowNewTask(false) }}
        />
      )}

      {showEditClient && (
        <div className="fixed inset-0 z-50 flex items-center justify-center md:p-4">
          <div className="absolute inset-0 bg-black/30" onClick={() => setShowEditClient(false)} />
          <div className="relative bg-[var(--color-bg-card)] rounded-none md:rounded-2xl shadow-xl w-full h-full md:h-auto max-w-md md:max-h-[85vh] flex flex-col overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 md:px-6 md:py-0 border-b border-[var(--color-border)] md:border-none flex-shrink-0"
              style={{ paddingTop: 'calc(0.75rem + env(safe-area-inset-top))' }}>
              <h2 className="text-base font-semibold text-[var(--color-text-primary)]">Editar cliente</h2>
              <button onClick={() => setShowEditClient(false)} className="w-8 h-8 rounded-lg hover:bg-[var(--color-bg-subtle)] flex items-center justify-center text-[var(--color-text-muted)] text-lg flex-shrink-0">×</button>
            </div>

            <div className="flex-1 overflow-y-auto px-4 md:px-6 py-4 md:py-5 flex flex-col gap-5" style={{ paddingBottom: 'calc(1rem + env(safe-area-inset-bottom))' }}>
            <div className="flex items-center gap-3">
              {editClientForm.logo_url
                ? <img src={editClientForm.logo_url} alt={editClientForm.name} className="w-12 h-12 rounded-xl object-cover flex-shrink-0" onError={e => { (e.target as HTMLImageElement).style.display = 'none' }} />
                : <div className="w-12 h-12 rounded-xl flex items-center justify-center text-white font-bold text-sm flex-shrink-0" style={{ background: editClientForm.color_hex }}>{editClientForm.name ? editClientForm.name.split(' ').map((w: string) => w[0]).join('').slice(0,2).toUpperCase() : '?'}</div>
              }
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
                <label className="text-xs font-medium text-[var(--color-text-secondary)] mb-1.5 block">Foto / Logo (URL)</label>
                <input type="url" value={editClientForm.logo_url} onChange={e => setEditClientForm((f: any) => ({ ...f, logo_url: e.target.value }))} placeholder="https://… (foto do Instagram, logo, etc.)" className="w-full border border-[var(--color-border)] rounded-xl px-3 py-2.5 text-sm outline-none focus:border-[var(--color-brand)] text-[var(--color-text-primary)]" />
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
        </div>
      )}
    </div>
  )
}

export default function ClientePage({ params }: { params: Promise<{ id: string }> }) {
  return <Suspense><ClientePageInner params={params} /></Suspense>
}
