'use client'

import { useEffect, useState, useMemo, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import { donosDoAjuste, ALVO_LABEL, type AjusteAlvo, type TimeDoCliente } from '@/lib/ajusteRouting'
import { useUser } from '@/lib/UserContext'
import {
  ArrowRight, AlertTriangle, Clock, CalendarDays, ChevronRight, ChevronDown,
  Zap, CheckCircle2, Camera, CheckSquare, SquarePen, CalendarClock, UserCheck, Send,
  Feather, Kanban, Package, Target,
  Calendar, LayoutList, ClipboardCheck, Share2,
} from 'lucide-react'
import Button from '@/components/ui/Button'
import { Card, SectionCard } from '@/components/ui/Card'
import IconBadge, { type BadgeTone } from '@/components/ui/IconBadge'
import DonutChart from '@/components/ui/DonutChart'
import LineChart from '@/components/ui/LineChart'
import { brasiliaISOFromDate } from '@/lib/timezone'
import { POST_DONE_STAGES, temMaterial, contaComoFolego } from '@/lib/postStages'
import { fromActiveClients } from '@/lib/activeClients'
import { withBase } from '@/lib/base'
import { caminhoCliente } from '@/lib/clienteSlug'
import { fetchAgencyAlerts, type AgencyAlert } from '@/lib/agencyAlerts'
import { baldeDoItem, contextoDaAgenda, fraseDaFila, sugestaoDeAdiantar, somaDias, type Balde, type ClienteDeHoje } from '@/lib/filaDoDia'

// ─── CFG — nomes de colunas/tabelas Supabase (corrigir aqui se mudar) ───────
const CFG = {
  t: {
    clients:      'clients',
    schedules:    'schedules',
    specialDates: 'special_dates',
  },
  S: {
    estrategia:          'estrategia',
    captacao:            'captacao',
    producao:            'producao',
    revisaoInterna:      'revisao_interna',
    aguardandoAprovacao: 'aguardando_aprovacao',
    ajuste:              'ajuste',
    aprovado:            'aprovado',
    agendado:            'agendado',
    publicado:           'publicado',
  },
  A: {
    pendente:    'pendente',
    aprovado:    'aprovado',
    naoAprovado: 'não aprovado',
  },
}

const TONE_BG: Record<BadgeTone, string> = {
  red: 'var(--color-accent-bg)', orange: 'var(--ds-warn-bg)', amber: 'var(--ds-caution-bg)',
  green: 'var(--ds-success-bg)', blue: 'var(--ds-info-bg)', purple: 'var(--ds-purple-bg)',
  neutral: 'var(--color-bg-subtle)',
}
const TONE_FG: Record<BadgeTone, string> = {
  red: 'var(--color-accent)', orange: 'var(--ds-warn-accent)', amber: 'var(--ds-caution-accent)',
  green: 'var(--ds-success-accent)', blue: 'var(--ds-info-accent)', purple: 'var(--ds-purple-accent)',
  neutral: 'var(--color-text-secondary)',
}

const MONTHS    = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro']
const DAYS      = ['Domingo','Segunda','Terça','Quarta','Quinta','Sexta','Sábado']

type Client   = { id: string; name: string; color_hex: string; logo_url?: string | null }
type Schedule = {
  id: string; client_id: string; title: string
  status: string; approval_status: string; post_type: string
  scheduled_date: string | null; funil: string | null
  month: number; year: number; created_at?: string | null
  /** É o que o endereço do post usa: /cronograma/2026-09/11 */
  post_number?: number | null
  assigned_members?: string[] | null
  legenda?: string | null
}
// Etapas que ainda não terminaram. `publicado` fica de fora porque é fim; os
// outros todos são trabalho que alguém ainda precisa tocar.
const ABERTO_NO_MES = [
  'estrategia', 'aguardando_aprovacao_crono', 'captacao', 'producao',
  'revisao_interna', 'aguardando_aprovacao', 'ajuste', 'aprovado', 'agendado',
]  // 'publicado' e 'cancelado' ficam de fora: os dois são fim.

type SpecialDate = { id: string; name: string; date: string }
type Captacao    = { id: string; client_id: string; scheduled_date: string; status: string; months_covered: number }
type ClientTeamRow = { client_id: string; member_id: string; funcao: string }

// Quais tipos de post cada função cobre. null = cobre todos os tipos do cliente.
const FUNCAO_POST_TYPES: Record<string, string[] | null> = {
  videos: ['reels'],
  posts:  ['carrossel', 'story', 'carrossel_stories', 'post', 'post_story'],
}

function getInitials(name: string) {
  return name.split(' ').slice(0, 2).map((w: string) => w[0]).join('').toUpperCase()
}

function getDayGreeting() {
  const h = new Date().getHours()
  if (h < 12) return 'Bom dia'
  if (h < 18) return 'Boa tarde'
  return 'Boa noite'
}

// Período do dia — vira parte da chave do cache da frase: a saudação já muda
// sozinha (bom dia → boa tarde → boa noite), então a frase acompanha. Dentro
// do mesmo período ela fica fixa, senão trocaria a cada refresh e perderia a
// graça de "a frase de hoje".

function daysBetween(a: Date, b: Date) {
  const aMid = new Date(a); aMid.setHours(0, 0, 0, 0)
  const bMid = new Date(b); bMid.setHours(0, 0, 0, 0)
  return Math.round((bMid.getTime() - aMid.getTime()) / (1000 * 60 * 60 * 24))
}

function pl(n: number, s: string, p: string) { return n === 1 ? s : p }

const KIND_ICON: Record<string, string> = { post: '🎬', extra: '📎', material: '📦', task: '📌' }
const KIND_CHIP_BG: Record<string, string> = { post: 'var(--ds-purple-bg)', extra: 'var(--ds-info-bg)', material: 'var(--color-bg-subtle)', task: 'var(--ds-warn-bg)' }
const KIND_LABEL: Record<string, [string, string]> = { post: ['post', 'posts'], extra: ['extra', 'extras'], material: ['material', 'materiais'], task: ['tarefa', 'tarefas'] }
// Tipo de conteúdo de verdade (Reel/Carrossel/Story…), não um ícone genérico
// de "post" — mesmo mapa usado no Cronograma/Aprovações, pra bater visualmente.
const TYPE_META: Record<string, { emoji: string; label: string; plural: string }> = {
  carrossel:         { emoji: '🎠', label: 'Carrossel',          plural: 'carrosséis' },
  reels:             { emoji: '🎬', label: 'Reels',              plural: 'reels' },
  post:              { emoji: '🖼️', label: 'Post',               plural: 'posts' },
  story:             { emoji: '📸', label: 'Story',              plural: 'stories' },
  carrossel_stories: { emoji: '🎞️', label: 'Carrossel/Stories',  plural: 'carrossel/stories' }, post_story: { emoji: '🎞️', label: 'Post/Story',  plural: 'carrossel/stories' },
}

function dueCountdown(dueDate: string | null, todayStr: string): string | null {
  if (!dueDate) return null
  const d1 = new Date(todayStr + 'T12:00:00')
  const d2 = new Date(dueDate + 'T12:00:00')
  const diff = Math.round((d2.getTime() - d1.getTime()) / 86400000)
  if (diff < 0) return null // já tem o selo "atrasado" separado, não repete aqui
  if (diff === 0) return 'vence hoje'
  if (diff === 1) return 'vence amanhã'
  return `vence em ${diff}d`
}

type CardLabel = { text: string; color: string }
type ParaVoceRowItem = {
  id: string; kind: string; title: string; clientId: string; dueDate: string | null
  ajuste: boolean; href: string; postType?: string | null; campaignType?: string | null
  labels?: CardLabel[] | null; ajusteAlvo?: string | null
}

function ClientAvatar({ client }: { client?: { name: string; color_hex?: string; logo_url?: string | null } }) {
  return (
    <span className="w-7 h-7 rounded-full overflow-hidden flex items-center justify-center text-white text-[10px] font-bold flex-shrink-0"
      style={{ background: client?.color_hex || '#6b7280' }}>
      {client?.logo_url ? <img src={client.logo_url} alt="" className="w-full h-full object-cover" /> : getInitials(client?.name || '?')}
    </span>
  )
}

function ParaVoceGroup({ label, items, clientMap, router, todayStr, muted, cap = 5, agingMap, campaignNameMap, sempreCliente }: {
  label: string
  items: ParaVoceRowItem[]
  /**
   * A linha é SEMPRE um cliente, e SEMPRE abre a lista de itens dele.
   *
   * A lista misturava duas granularidades na mesma forma de linha: cliente com
   * um item só desenhava O ITEM e abria o card; com dois ou mais desenhava o
   * RESUMO e expandia. Mesma linha, dois significados e duas reações — a seta
   * aparecia só num dos casos. Era isso que fazia a tela parecer bagunçada e
   * "nem tudo clicável".
   *
   * Minha primeira correção foi longe demais: fiz a linha NAVEGAR pro cliente,
   * e com isso sumiu o poder de ver os itens sem sair da tela — que é metade
   * do valor do card de manhã. A consistência não exigia isso. Exigia que
   * TODA linha fizesse a mesma coisa: abrir. Inclusive a de um item só, que
   * antes era a exceção.
   */
  sempreCliente?: boolean
  clientMap: Record<string, { name: string; color_hex?: string; logo_url?: string | null }>
  router: ReturnType<typeof useRouter>
  todayStr: string
  muted?: boolean
  cap?: number
  agingMap?: Record<string, string>
  campaignNameMap?: Record<string, string>
}) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  function toggle(key: string) {
    setExpanded(prev => { const next = new Set(prev); next.has(key) ? next.delete(key) : next.add(key); return next })
  }

  function emojiFor(it: ParaVoceRowItem) {
    if (it.ajuste) return '⚠️'
    if (it.postType && TYPE_META[it.postType]) return TYPE_META[it.postType].emoji
    return KIND_ICON[it.kind] || '•'
  }

  // Uma linha por item, tudo inline — nada de sublinha embaixo do título,
  // que dobrava a altura de cada linha e fazia o card ocupar meia tela.
  function renderRow(it: ParaVoceRowItem, key?: string) {
    const overdue = !!it.dueDate && it.dueDate < todayStr && !it.ajuste
    const updatedAt = agingMap?.[it.id]
    const ageDays = updatedAt ? Math.floor((Date.now() - new Date(updatedAt).getTime()) / 86400000) : null
    const ageThreshold = muted ? 1 : 3
    const showAge = !overdue && ageDays !== null && ageDays >= ageThreshold
    const countdown = dueCountdown(it.dueDate, todayStr)
    const campaignName = it.campaignType ? campaignNameMap?.[`${it.clientId}:${it.campaignType}`] : null
    return (
      <button key={key || it.id} onClick={() => router.push(it.href)}
        className="w-full text-left rounded-lg px-2.5 py-1.5 flex items-center gap-2 transition-colors hover:brightness-[0.97]"
        style={{ background: it.ajuste ? 'var(--ds-error-bg)' : muted ? 'transparent' : 'var(--color-bg-card)' }}>
        <span className="text-[11px] flex-shrink-0">{emojiFor(it)}</span>
        <span className={`text-xs font-medium truncate flex-1 min-w-0 ${muted ? 'text-[var(--color-text-secondary)]' : 'text-[var(--color-text-primary)]'}`}>
          {it.title || 'Sem título'}
        </span>
        {/* O que o cliente pediu pra mudar. Sem isto o designer abre o card
            pra descobrir que a alteração era só na legenda. */}
        {it.ajuste && it.ajusteAlvo && ALVO_LABEL[it.ajusteAlvo] && (
          <span className="flex-shrink-0 text-[9px] font-semibold px-1.5 py-0.5 rounded-full" style={{ color: 'var(--ds-error-text)', background: 'var(--ds-error-bg)' }}>
            {ALVO_LABEL[it.ajusteAlvo]}
          </span>
        )}
        {countdown && <span className="text-[10px] text-[var(--color-text-muted)] flex-shrink-0">{countdown}</span>}
        {campaignName && <span className="text-[10px] text-[var(--color-text-muted)] flex-shrink-0 hidden sm:inline">📣 {campaignName}</span>}
        {/* Etiqueta é o que diz o trabalho que falta ali (CRIAR LEGENDA,
            Criar o design…) — precisa ser visível sem abrir o card. */}
        {it.labels?.slice(0, 2).map((l, i) => (
          <span key={i} className="flex-shrink-0 text-[9px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded text-white" style={{ background: l.color }}>
            {l.text}
          </span>
        ))}
        {/* Quanto tempo faz, não só "atrasado". Sem recorte de mês nenhum, a
            lista pode trazer coisa de meses atrás — e "atrasado 43d" se
            denuncia sozinho, enquanto "atrasado" seco parece de ontem. */}
        {overdue && (
          <span className="flex-shrink-0 text-[9px] font-semibold px-1.5 py-0.5 rounded-full" style={{ color: 'var(--ds-error-text)', background: 'var(--ds-error-bg)' }}>
            atrasado {Math.round((new Date(todayStr + 'T12:00:00').getTime() - new Date(it.dueDate! + 'T12:00:00').getTime()) / 86400000)}d
          </span>
        )}
        {showAge && (
          <span className="flex-shrink-0 text-[9px] font-semibold px-1.5 py-0.5 rounded-full" style={{ color: 'var(--ds-warn-text)', background: 'var(--ds-warn-bg)' }}>
            {muted ? `${ageDays}d` : `parado ${ageDays}d`}
          </span>
        )}
      </button>
    )
  }

  // Agrupa SÓ por cliente — tudo daquele cliente (posts do crono, extras,
  // materiais e tarefas) numa linha expansível, em vez de uma linha por
  // cliente+tipo, que repetia o mesmo cliente várias vezes seguidas.
  const byClient = new Map<string, ParaVoceRowItem[]>()
  for (const it of items) {
    if (!byClient.has(it.clientId)) byClient.set(it.clientId, [])
    byClient.get(it.clientId)!.push(it)
  }
  const clientGroups = [...byClient.entries()].map(([clientId, its]) => ({ key: clientId, its }))
  const totalItems = items.length
  const shownItems = clientGroups.slice(0, cap).reduce((s, g) => s + g.its.length, 0)

  // "1 material, 2 posts" — resumo curto do que tem ali dentro, já que o
  // grupo agora mistura tipos.
  function summarize(its: ParaVoceRowItem[]) {
    const counts: Record<string, number> = {}
    its.forEach(i => { counts[i.kind] = (counts[i.kind] || 0) + 1 })
    return (['post', 'extra', 'material', 'task'] as const)
      .filter(k => counts[k])
      .map(k => { const n = counts[k]; const [s1, p1] = KIND_LABEL[k]; return `${n} ${pl(n, s1, p1)}` })
      .join(', ')
  }

  return (
    <div>
      {label && <p className="text-[10px] font-bold uppercase tracking-wider text-[var(--color-text-faint)] mb-1.5 px-0.5">{label}</p>}
      <div className="flex flex-col gap-1">
        {clientGroups.slice(0, cap).map(({ key, its }) => {
          const isOpen = expanded.has(key)
          const client = clientMap[its[0].clientId]
          const overdueCount = its.filter(it => !!it.dueDate && it.dueDate < todayStr && !it.ajuste).length
          const hasAjuste = its.some(it => it.ajuste)
          // Quantos pedem cada coisa (3 pra criar legenda, 2 pro design…),
          // pra saber o trabalho sem precisar abrir.
          const labelCounts = new Map<string, { color: string; n: number }>()
          its.forEach(i => i.labels?.forEach(l => {
            const cur = labelCounts.get(l.text)
            labelCounts.set(l.text, { color: l.color, n: (cur?.n || 0) + 1 })
          }))
          // No modo por cliente NUNCA há linha-item: a granularidade é uma só.
          const single = sempreCliente ? null : (its.length === 1 ? its[0] : null)
          const singleOverdue = !!single?.dueDate && single.dueDate < todayStr && !single.ajuste
          const singleCountdown = single ? dueCountdown(single.dueDate, todayStr) : null
          const singleCampaign = single?.campaignType ? campaignNameMap?.[`${single.clientId}:${single.campaignType}`] : null

          return (
            <div key={key}>
              <button onClick={() => single ? router.push(single.href) : toggle(key)}
                className="w-full text-left rounded-xl px-3 py-2 flex items-center gap-2 transition-colors hover:brightness-[0.97]"
                style={{ background: hasAjuste ? 'var(--ds-error-bg)' : muted ? 'transparent' : 'var(--color-bg-subtle)' }}>
                <ClientAvatar client={client} />
                <span className={`text-xs font-semibold truncate flex-shrink-0 ${muted ? 'text-[var(--color-text-secondary)]' : 'text-[var(--color-text-primary)]'}`}>
                  {client?.name || 'Sem cliente'}
                </span>
                {single ? (
                  // Título do item no lugar do "1 post" — mesma informação que
                  // apareceria ao expandir, só que já visível. A campanha vem
                  // junto: é ela que dá o senso de prazo real (Dia dos Pais
                  // não espera), e some se ficar só na linha de dentro.
                  <span className="text-[11px] text-[var(--color-text-secondary)] truncate flex-1 min-w-0">
                    {emojiFor(single)} {single.title || 'Sem título'}
                    {singleCountdown ? <span className="text-[var(--color-text-muted)]"> · {singleCountdown}</span> : null}
                    {singleCampaign ? <span className="text-[var(--color-text-muted)]"> · 📣 {singleCampaign}</span> : null}
                  </span>
                ) : (
                  // Com UM item só, o título dele no lugar de "1 post": é a
                  // mesma informação que apareceria ao expandir, e não custa
                  // nada mostrar antes. A linha continua abrindo igual às
                  // outras — o que mudou é o que ela já conta sem abrir.
                  <span className="text-[10px] text-[var(--color-text-muted)] truncate flex-1 min-w-0">
                    {its.length === 1
                      ? `${emojiFor(its[0])} ${its[0].title || 'Sem título'}`
                      : summarize(its)}
                  </span>
                )}
                {[...labelCounts.entries()].slice(0, 2).map(([text, { color, n }]) => (
                  <span key={text} className="flex-shrink-0 text-[9px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded text-white" style={{ background: color }}>
                    {n === its.length ? text : `${n} ${text}`}
                  </span>
                ))}
                {single ? (
                  singleOverdue && (
                    <span className="flex-shrink-0 text-[9px] font-semibold px-1.5 py-0.5 rounded-full" style={{ color: 'var(--ds-error-text)', background: 'var(--ds-error-bg)' }}>atrasado</span>
                  )
                ) : overdueCount > 0 && (
                  <span className="flex-shrink-0 text-[9px] font-semibold px-1.5 py-0.5 rounded-full" style={{ color: 'var(--ds-error-text)', background: 'var(--ds-error-bg)' }}>
                    {overdueCount} atrasado{overdueCount !== 1 ? 's' : ''}
                  </span>
                )}
                {!single && (
                  <ChevronRight size={13} className="flex-shrink-0 text-[var(--color-text-faint)] transition-transform duration-200"
                    style={{ transform: isOpen ? 'rotate(90deg)' : 'none' }} />
                )}
              </button>
              {!single && isOpen && (
                <div className="flex flex-col gap-1 mt-1 pl-3">
                  {its.map(it => renderRow(it, `${key}-${it.id}`))}
                </div>
              )}
            </div>
          )
        })}
        {totalItems > shownItems && (
          <p className="text-[11px] text-[var(--color-text-faint)] px-0.5">
            + {totalItems - shownItems} {totalItems - shownItems === 1 ? 'item' : 'itens'}
          </p>
        )}
      </div>
    </div>
  )
}

function ParaVoceSummaryRow({ icon, label, onClick, muted, aberto }: { icon: string; label: string; onClick: () => void; muted?: boolean; aberto?: boolean }) {
  return (
    <button onClick={onClick}
      className={`w-full text-left rounded-xl px-3 py-2 flex items-center gap-2.5 transition-colors ${muted ? 'text-[var(--color-text-muted)] hover:bg-[var(--color-bg-subtle)]' : 'bg-[var(--color-bg-subtle)] hover:bg-[var(--color-bg-page)] text-[var(--color-text-secondary)]'}`}>
      <span className="text-sm flex-shrink-0">{icon}</span>
      <span className="text-xs font-medium flex-1">{label}</span>
      <ChevronRight size={13} className="text-[var(--color-text-faint)] flex-shrink-0 transition-transform duration-200"
        style={{ transform: aberto ? 'rotate(90deg)' : 'none' }} />
    </button>
  )
}

export default function DashboardPage() {
  useEffect(() => { document.title = 'Início · Bagano Hub' }, [])
  const router    = useRouter()
  const supabase  = createClient()
  const { currentMember } = useUser()

  const [clients,      setClients]      = useState<Client[]>([])
  // TODOS os posts, sem recorte de mês nenhum — e é de propósito.
  //
  // Mês é etiqueta de arquivo, não prazo. O post pertence a agosto; a espera
  // pela resposta do cliente, o post que passou da data, o card atribuído a
  // você e ainda não feito — nada disso pertence a mês nenhum. Some quando
  // resolve, não quando o calendário vira.
  //
  // Este painel já teve três recortes diferentes (mês corrente, janela de
  // mês-1 a mês+3) e cada um escondeu um trabalho real: o cronograma de agosto
  // da Gabi, o cronograma de julho parado com o cliente no dia 1º de agosto,
  // os 12 posts vencidos que o alerta contava como zero. Um recorte a menos é
  // uma classe de bug a menos. As visões que SÃO de um mês (Visão geral,
  // métricas, gráfico) derivam daqui logo abaixo.
  const [allSchedules, setAllSchedules] = useState<Schedule[]>([])
  const [specialDates, setSpecialDates] = useState<SpecialDate[]>([])
  const [captacoes,    setCaptacoes]    = useState<Captacao[]>([])
  const [clientTeam,   setClientTeam]   = useState<ClientTeamRow[]>([])
  const [ajusteAlvos,  setAjusteAlvos]  = useState<Record<string, string>>({})
  // Extras e materiais de TODOS os clientes (colunas mínimas) — o bloco
  // "Situação dos clientes" contava só posts, então cliente cujo trabalho é
  // extra aparecia como "sem cronograma · nenhum post". O Unizushi tem dois
  // extras e era mostrado como cliente parado.
  const [allExtras,    setAllExtras]    = useState<{ client_id: string | null; status: string; client_approval_status?: string | null }[]>([])
  const [allMaterials, setAllMaterials] = useState<{ client_id: string | null; status: string }[]>([])
  const [myExtras,     setMyExtras]     = useState<any[]>([])


  const [myMaterials,  setMyMaterials]  = useState<any[]>([])
  const [myTasks,      setMyTasks]      = useState<any[]>([])
  /** Os dias da agenda de criação desta pessoa: quando, qual cliente, e a nota. */
  const [greetingLine, setGreetingLine] = useState('')
  const [verResto,     setVerResto]     = useState(false)
  const [minhaAgenda,  setMinhaAgenda]  = useState<{ dia: string; clientId: string | null; nota: string | null }[]>([])
  // A fila do dia. `fetchAgencyAlerts` já existia e já calculava tudo isto —
  // urgências, extras parados, captação chegando, post travado — mas morava só
  // atrás do sininho, e ninguém clica no sininho pra saber por onde começar.
  const [fila, setFila] = useState<AgencyAlert[]>([])
  useEffect(() => {
    let vivo = true
    fetchAgencyAlerts().then(a => { if (vivo) setFila(a) }).catch(() => {})
    return () => { vivo = false }
  }, [])
  const [agingMap,     setAgingMap]     = useState<Record<string, string>>({})
  const [campaignNameMap, setCampaignNameMap] = useState<Record<string, string>>({})
  const [loading,      setLoading]      = useState(true)
  const [loadError,    setLoadError]    = useState(false)

  // Visão geral do mês — mês e período selecionáveis (escopo do widget)
  const [ovMonth,     setOvMonth]     = useState(new Date().getMonth() + 1)
  const [ovYear,      setOvYear]      = useState(new Date().getFullYear())
  const [ovSchedules, setOvSchedules] = useState<{ status: string; approval_status: string; client_id: string; created_at?: string | null }[]>([])

  const now      = new Date()
  const month    = now.getMonth() + 1
  const year     = now.getFullYear()
  const todayStr = now.toISOString().split('T')[0]
  const in120Str = new Date(now.getTime() + 120 * 86400000).toISOString().split('T')[0]

  // O recorte mensal vive aqui, num lugar só, e serve às visões que de fato
  // são de um mês: Visão geral, métricas e o gráfico de evolução. Fora daqui,
  // nada no painel enxerga mês.
  const schedules = useMemo(
    () => allSchedules.filter(s => s.month === month && s.year === year),
    [allSchedules, month, year])
  // "Em aberto" = não fechado. Agendado e publicado saíram da mesa; aprovado
  // ainda não, porque post aprovado que passou da data e não foi publicado é
  // exatamente o tipo de coisa que precisa aparecer.
  const openSchedules = useMemo(
    () => allSchedules.filter(s => ![CFG.S.agendado, CFG.S.publicado].includes(s.status)),
    [allSchedules])

  // Recarrega quando você volta pra aba.
  //
  // O painel buscava tudo uma vez, na montagem, e nunca mais. Quem deixa o
  // Início aberto num monitor, ou volta pra aba depois de mexer no cronograma
  // noutra, ficava vendo o retrato de quando abriu — dava a impressão de que a
  // tela é um relatório congelado, não o estado de agora.
  //
  // Voltar pra aba é o gatilho certo: não custa nada enquanto você está fora e
  // acerta exatamente no instante em que você volta a olhar. `loadRef` existe
  // porque o listener é registrado uma vez e precisa chamar a versão atual.
  const loadRef = useRef<() => void>(() => {})
  useEffect(() => {
    const aoVoltar = () => { if (document.visibilityState === 'visible') loadRef.current() }
    document.addEventListener('visibilitychange', aoVoltar)
    window.addEventListener('focus', aoVoltar)
    return () => {
      document.removeEventListener('visibilitychange', aoVoltar)
      window.removeEventListener('focus', aoVoltar)
    }
  }, [])

  useEffect(() => {
    async function load() {
      try {
        const in90Str = new Date(now.getTime() + 90 * 86400000).toISOString().split('T')[0]
        const ago45Str = new Date(now.getTime() - 45 * 86400000).toISOString().split('T')[0]
        const [{ data: cls, error: e1 }, { data: sch }, { data: sd }, { data: cap }, { data: ct }, { data: ex }, { data: mt }] = await Promise.all([
          supabase.from(CFG.t.clients)
            .select('id, name, color_hex, logo_url, slug')
            .eq('status', 'active')
            .order('name'),
          // Uma consulta só, sem where de período. São colunas leves e o
          // Kanban já carrega a tabela inteira do mesmo jeito — o custo é
          // menor que o de mais um recorte pra esquecer de manter.
          supabase.from(CFG.t.schedules)
            .select('id, client_id, title, status, approval_status, post_type, scheduled_date, funil, month, year, post_number, created_at, assigned_members, campaign_type, labels, legenda, ajuste_alvo'),
          supabase.from(CFG.t.specialDates)
            .select('id, name, date')
            .gte('date', todayStr)
            .lte('date', in120Str)
            .order('date'),
          supabase.from('captacoes')
            .select('id, client_id, scheduled_date, status, months_covered')
            .gte('scheduled_date', ago45Str)
            .lte('scheduled_date', in90Str)
            .order('scheduled_date'),
          // Sem filtro de função: o roteamento de ajuste precisa saber quem é
          // design, edição e social de cada cliente, não só a estrategista.
          supabase.from('client_team')
            .select('client_id, member_id, funcao'),
          supabase.from('extras').select('client_id, type, status, client_approval_status, published_at').is('archived_at', null),
          supabase.from('materials').select('client_id, status').is('archived_at', null),
        ])
        if (e1) { setLoadError(true); setLoading(false); return }
        // `cls` já vem só com cliente ativo, mas o conteúdo acima é buscado por
        // pessoa e por data, sem passar por cliente nenhum. Sem este recorte,
        // desativar um cliente não tirava os posts dele do painel: seguiam
        // contando como pendência e como atrasado, com o nome do cliente em
        // branco porque o mapa de clientes nem os tinha.
        const ativos = new Set((cls || []).map(c => c.id))
        setClients(cls || [])
        setAllSchedules(fromActiveClients(sch, ativos))
        setSpecialDates(sd || [])
        setCaptacoes(fromActiveClients(cap, ativos))
        setClientTeam(fromActiveClients(ct, ativos))
        setAllExtras(fromActiveClients(ex, ativos) as any)
        setAllMaterials(fromActiveClients(mt, ativos) as any)
      } catch {
        setLoadError(true)
      }
      setLoading(false)
    }
    load()
    // Só recarrega os dados; não volta pro estado de carregando, senão a tela
    // pisca toda vez que você troca de aba.
    loadRef.current = () => { load() }
  }, [])

  useEffect(() => {
    if (!currentMember?.id) return
    supabase
      .from('extras')
      .select('id, title, type, status, priority, client_id, due_date, client_approval_status, campaign_type, labels')
      .neq('status', 'done')
      // Arquivado sai do radar. Desde que dá pra arquivar arrastando de
      // qualquer coluna, um extra ainda "a fazer" pode ir pro arquivo — e sem
      // este filtro ele voltaria a cobrar no "Para você".
      .is('archived_at', null)
      .contains('assigned_members', [currentMember.id])
      .order('due_date', { ascending: true, nullsFirst: false })
      .then(({ data }) => { if (data) setMyExtras(data) })
  }, [currentMember?.id])

  useEffect(() => {
    if (!currentMember?.id) return
    supabase
      .from('materials')
      .select('id, title, status, client_id, due_date, assigned_members, assigned_to, labels')
      .neq('status', 'finalizado')
      .is('archived_at', null)
      .order('due_date', { ascending: true, nullsFirst: false })
      .then(({ data }) => {
        if (!data) return
        setMyMaterials(data.filter(m => {
          const assigned = m.assigned_members?.length ? m.assigned_members : m.assigned_to ? [m.assigned_to] : []
          return assigned.includes(currentMember.id)
        }))
      })
  }, [currentMember?.id])

  // A agenda de criação da pessoa. É ela que sabe QUE DIA cada cliente é —
  // o "Para você" ignorava isso por completo e por isso mostrava o mês inteiro
  // de uma vez, com data de publicação fazendo as vezes de prazo.
  //
  // Três semanas pra trás bastam: o que interessa do passado é "o dia combinado
  // passou e continua aberto". Mais fundo que isso é arqueologia, e o item já
  // apareceria pela própria data vencida.
  useEffect(() => {
    if (!currentMember?.id) return
    const inicio = somaDias(todayStr, -21)
    supabase
      .from('agenda_criacao')
      .select('week_start, day_of_week, client_id, member_ids, notes')
      .gte('week_start', somaDias(inicio, -6))
      .then(({ data }) => {
        if (!data) return
        setMinhaAgenda(data
          .filter(d => Array.isArray(d.member_ids) && d.member_ids.includes(currentMember.id))
          .map(d => ({
            // week_start é segunda e day_of_week começa em 1 — ver a tela de Criação.
            dia: somaDias(d.week_start, (d.day_of_week || 1) - 1),
            clientId: d.client_id as string | null,
            nota: (d.notes || null) as string | null,
          }))
          .filter(d => !!d.clientId))
      })
  }, [currentMember?.id, todayStr])

  // Tarefas/lembretes/notas do Quadro pessoal que estão ligadas a um cliente —
  // ficavam de fora do "Para você", que só olhava post/extra/material, então
  // um lembrete atribuído a você simplesmente não aparecia aqui. Só entram as
  // que têm cliente: sem cliente não há bloco onde encaixar.
  useEffect(() => {
    if (!currentMember?.id) return
    supabase
      .from('personal_tasks')
      .select('id, title, type, status, client_id, due_date, labels')
      .neq('status', 'feito')
      .not('client_id', 'is', null)
      .eq('assigned_to', currentMember.id)
      .order('due_date', { ascending: true, nullsFirst: false })
      .then(({ data }) => { if (data) setMyTasks(data) })
  }, [currentMember?.id])

  // Donut + evolução do "Visão geral" — busca o mês escolhido (só quando difere
  // do mês atual; o atual reusa `schedules`). client_id entra pra poder excluir
  // posts de clientes arquivados/inativos; created_at pra alimentar a linha de
  // evolução (que agora reflete o MESMO mês selecionado aqui, não um período
  // solto e desconectado do resto do card).
  useEffect(() => {
    if (ovMonth === month && ovYear === year) return
    supabase.from(CFG.t.schedules).select('status, approval_status, client_id, created_at').eq('month', ovMonth).eq('year', ovYear)
      .then(({ data }) => setOvSchedules((data as any) || []))
  }, [ovMonth, ovYear])

  // ── Computed ─────────────────────────────────────────────────────────────
  // As listas pessoais são buscadas por atribuição, em efeitos próprios que
  // rodam antes de `clients` chegar — então o recorte de cliente ativo não cabe
  // na consulta e é feito aqui, onde as duas coisas já existem.
  const clientesAtivos = useMemo(() => new Set(clients.map(c => c.id)), [clients])

  // Meses que não fecharam.
  //
  // Trabalho aberto em cronograma de mês PASSADO. Junto num lugar só vira uma
  // conversa de cinco minutos ("o Satō precisa aprovar junho"); diluído entre
  // telas, como estava, vira um incômodo difuso que ninguém ataca — e foi assim
  // que 58 posts se acumularam, 29 deles de um mês só.
  //
  // Sai de `allSchedules`, que a tela já carrega: nenhuma consulta a mais.
  const mesesEmAberto = useMemo(() => {
    const agora = new Date()
    const mesAtual = agora.getFullYear() * 12 + agora.getMonth()
    const por = new Map<string, { clientId: string; month: number; year: number; posts: any[] }>()
    for (const s of allSchedules) {
      if (!ABERTO_NO_MES.includes(s.status)) continue
      if (s.year * 12 + (s.month - 1) >= mesAtual) continue      // mês corrente não conta
      const k = `${s.client_id}:${s.year}-${s.month}`
      if (!por.has(k)) por.set(k, { clientId: s.client_id, month: s.month, year: s.year, posts: [] })
      por.get(k)!.posts.push(s)
    }
    return [...por.values()].sort((a, b) =>
      (a.year * 12 + a.month) - (b.year * 12 + b.month) || b.posts.length - a.posts.length)
  }, [allSchedules])

  // O endereço do cliente sai do apelido quando existe. Aqui a maioria dos
  // links tem só o `client_id` na mão, então a tradução passa pelo mapa.
  const linkCliente = (cid: string | null | undefined) => {
    if (!cid) return null
    const c = clients.find(x => x.id === cid)
    return (aba?: string) => caminhoCliente(c ? { id: c.id, slug: (c as any).slug } : { id: cid }, aba)
  }

  const clientMap = useMemo(() => {
    const m: Record<string, Client> = {}
    clients.forEach(c => { m[c.id] = c })
    return m
  }, [clients])

  // Post vencido é o caso mais gritante do recorte mensal: no dia 2 de agosto
  // este alerta dizia ZERO com 12 posts de julho passados da data e não
  // publicados. Data que passou não desmarca no dia 1º — ela piora.
  const delayed = useMemo(() =>
    openSchedules.filter(s => s.scheduled_date && s.scheduled_date < todayStr),
  [openSchedules, todayStr])

  // Cliente que pediu alteração dia 30 de julho sumia do alerta dia 1º de
  // agosto, com o pedido dele em aberto.
  const rejected = useMemo(() =>
    openSchedules.filter(s => s.approval_status === CFG.A.naoAprovado && s.status !== CFG.S.aprovado),
  [openSchedules])


  // Situação de cada cliente — pelo CICLO ATIVO dele, não pelo mês do relógio.
  //
  // Preso ao mês corrente, este bloco mentia duas vezes no dia 3 de agosto:
  // treze clientes com 109 posts de julho em aberto apareciam como "0 posts ·
  // sem posts", e os dois clientes de agosto — todos os 12 posts em produção,
  // ou seja, no ritmo certo — apareciam como "0/12 publicados" com a barra
  // vazia, que lê como fracasso.
  //
  // A Bagano entrega adiantado e cada cliente anda no ritmo dele. Então o card
  // mostra o mês mais antigo que ainda tem trabalho aberto, com o selo do mês:
  // é o que precisa de cobrança. Sem nada aberto, mostra o último fechado.
  //
  // "Pronto" aqui é APROVADO, não publicado. `publicado` é uma caixinha que
  // alguém precisaria voltar pra marcar depois de postar no Instagram, e em
  // julho só 33 de 142 posts chegaram lá — a barra media o esquecimento do
  // time, não o trabalho. Aprovado é o marco real da agência; publicado
  // continua existindo, como o último pedaço da barra.
  const DONE_STAGES = POST_DONE_STAGES
  const clientCycles = useMemo(() => {
    const byClient = new Map<string, Map<string, Schedule[]>>()
    for (const s of allSchedules) {
      let per = byClient.get(s.client_id)
      if (!per) { per = new Map(); byClient.set(s.client_id, per) }
      const k = `${s.year}-${String(s.month).padStart(2, '0')}`
      const arr = per.get(k)
      if (arr) arr.push(s); else per.set(k, [s])
    }
    // Extras e materiais entram na conta do cliente. Não entram na BARRA nem
    // no fôlego — barra é o ciclo do cronograma e fôlego é o que vai ao ar, e
    // extra/material não têm data de publicação. Mas precisam aparecer, senão
    // o card afirma que o cliente não tem nada quando ele tem.
    const abertoEx = (st: string) => st !== 'done'
    const abertoMt = (st: string) => st !== 'finalizado'
    const rows = clients.map(c => {
      const exs = allExtras.filter(x => x.client_id === c.id)
      const mts = allMaterials.filter(x => x.client_id === c.id)
      const outros = { exTotal: exs.length, mtTotal: mts.length, exs, mts,
                       abertos: exs.filter(x => abertoEx(x.status)).length + mts.filter(x => abertoMt(x.status)).length }
      // Extra pronto é conteúdo em mãos: dá pra encaixar num buraco do
      // cronograma sem produzir nada novo. Por isso entra no fôlego, mesmo não
      // tendo data de publicação — a pergunta aqui é "quanto temos", não
      // "quando sai".
      //
      // `feito` e "com o cliente" contam; `backlog` não (nada feito ainda) e
      // `done` também não, porque no uso real ele já saiu — dos 10 extras
      // abertos hoje, os dois em `done` têm published_at preenchido.
      const extrasProntos = exs.filter(
        x => ['feito', 'aguardando_aprovacao'].includes(x.status) && !(x as any).published_at
          && contaComoFolego((x as any).type)).length
      const per = byClient.get(c.id)
      const keys = per ? [...per.keys()].sort() : []
      // Fôlego: até quando ainda tem post marcado pra ir ao ar.
      //
      // Responde "quando o conteúdo desse cliente acaba", que é outra
      // pergunta que "quanto já foi aprovado" — e é a que decide quando
      // montar o próximo cronograma e quando marcar captação.
      //
      // Conta TODOS os posts do cliente, não só o ciclo ativo: o cronograma de
      // julho do Terras Altas tem post indo ao ar dia 1º de setembro. Mês é o
      // ciclo de PRODUÇÃO; scheduled_date é quando vai PRO AR. São coisas
      // diferentes, e quem responde sobre falta de conteúdo é a segunda.
      const todas = per ? [...per.values()].flat() : []
      // Só entra no fôlego o post que TEM material. Data é barata: marcar 10 de
      // setembro num post em captação não cria conteúdo nenhum, e era assim que
      // o card prometia fôlego que não existia — o Big Poke dizia "até 10/set"
      // tendo um único post pronto, pro dia 29/ago.
      const datas = todas.filter(s => temMaterial(s.status) && contaComoFolego(s.post_type))
        .map(s => s.scheduled_date).filter(Boolean).sort() as string[]
      const restantes = datas.filter(d => d >= todayStr).length
      const ultima = datas.length ? datas[datas.length - 1] : null
      // Quantos posts estão programados mas ainda sem material. Sem isto, tirar
      // os sem-material do fôlego trocaria uma mentira por outra: o cliente que
      // só tem pauta datada passaria a dizer "sem datas marcadas", ou seja, que
      // nada foi programado — quando o cronograma existe e o que falta é fazer.
      const semMaterialFuturo = todas.filter(
        s => !temMaterial(s.status) && contaComoFolego(s.post_type)
          && s.scheduled_date && s.scheduled_date >= todayStr).length
      // Sem data marcada não é "acabou" — é "ainda não foi programado". Tratar
      // os dois igual mandaria a equipe correr atrás do cronograma errado.
      const runway: 'sem-data' | 'sem-material' | 'fim' | 'ok' =
        !datas.length ? (semMaterialFuturo > 0 ? 'sem-material' : 'sem-data')
        : restantes === 0 ? (semMaterialFuturo > 0 ? 'sem-material' : 'fim')
        : 'ok'
      const diasAte = ultima ? Math.round((new Date(ultima + 'T12:00:00').getTime() - new Date(todayStr + 'T12:00:00').getTime()) / 86400000) : 0
      const runwayCurto = runway === 'ok' && (restantes <= 2 || diasAte <= 7)
      const base = { client: c, restantes, ultima, runway, runwayCurto, semMaterialFuturo, extrasProntos, outros }
      if (!keys.length) return { ...base, state: 'nunca' as const, key: '', posts: [] as Schedule[] }

      // Ciclo SEM NENHUMA DATA marcada ainda está sendo montado — não é o
      // cronograma que a agência está tocando, é o próximo sendo preparado.
      // A Bem Viver tinha agosto inteiro aprovado e no ar, e o card mostrava
      // "SET · 0/5" porque setembro (4 rascunhos, sem data) era o ciclo aberto
      // mais antigo. O card dizia que a melhor cliente do quadro era a pior, e
      // ainda se contradizia: selo de setembro com fôlego "até 31/ago".
      const programados = keys.filter(k => per!.get(k)!.some(s => s.scheduled_date))
      const candidatos = programados.length ? programados : keys

      // Rascunho não conta como trabalho aberto. Mesma regra que a tela de
      // aprovação de crono já usa: post em `estrategia` sequer foi enviado.
      const semRascunho = (k: string) => per!.get(k)!.filter(s => s.status !== CFG.S.estrategia)

      const openKey = candidatos.find(k => semRascunho(k).some(s => !DONE_STAGES.includes(s.status)))
      const key = openKey || candidatos[candidatos.length - 1]
      return { ...base, state: (openKey ? 'ativo' : 'entregue') as 'ativo' | 'entregue', key, posts: semRascunho(key) }
    })
    // Quem tem trabalho em aberto primeiro; quem está em dia depois; quem nem
    // cronograma tem, no fim. O bloco é sobre situação, então a ordem é a
    // própria informação.
    // Cliente sem cronograma MAS com extra/material não é cliente parado —
    // fica antes de quem não tem nada.
    const rank = (r: typeof rows[number]) =>
      r.state === 'ativo' ? 0 : r.state === 'entregue' ? 1 : (r.outros.exTotal + r.outros.mtTotal > 0 ? 2 : 3)
    return rows.sort((a, b) => rank(a) - rank(b) || a.client.name.localeCompare(b.client.name))
  }, [allSchedules, clients, allExtras, allMaterials])

  // Pendências de aprovação por cliente E MÊS.
  //
  // O agrupamento é por mês de propósito: "o Satō tem 6 esperando" esconde que
  // 4 são de julho e 2 de agosto — e são cobranças diferentes, com urgências
  // diferentes. Cada linha é um cronograma esperando resposta.
  const pendingApprovalByClient = useMemo(() => {
    const activeIds = new Set(clients.map(c => c.id))
    const groups = new Map<string, { cid: string; month: number; year: number; pending: Schedule[] }>()
    for (const s of allSchedules) {
      if (!activeIds.has(s.client_id)) continue
      if (![CFG.S.aguardandoAprovacao, CFG.S.ajuste].includes(s.status)) continue
      const key = `${s.client_id}:${s.month}:${s.year}`
      let g = groups.get(key)
      if (!g) { g = { cid: s.client_id, month: s.month, year: s.year, pending: [] }; groups.set(key, g) }
      g.pending.push(s)
    }
    return [...groups.values()]
      .map(g => ({
        ...g,
        pendingCount: g.pending.length,
        // Barra de progresso: o mês inteiro daquele cliente, inclusive o que
        // já está pronto — é o que responde "quanto falta pra fechar esse
        // cronograma", e não só "quanto está parado".
        monthPosts: allSchedules.filter(p => p.client_id === g.cid && p.month === g.month && p.year === g.year),
      }))
      // Mês mais velho primeiro. Depois da virada, é o mês que ficou pra trás
      // que ninguém está mais olhando — e é exatamente o que precisa cobrança.
      .sort((a, b) => (a.year - b.year) || (a.month - b.month) || (b.pendingCount - a.pendingCount))
  }, [allSchedules, clients, allExtras, allMaterials])

  const pendingApproval = useMemo(() =>
    schedules.filter(s => s.status === CFG.S.aguardandoAprovacao),
  [schedules])

  // Métricas
  const total      = schedules.length
  const published  = schedules.filter(s => s.status === CFG.S.publicado).length
  // "Aprovados" = aprovação do cliente confirmada OU já passou para agendado/publicado
  const approved   = schedules.filter(s =>
    s.approval_status === CFG.A.aprovado ||
    [CFG.S.aprovado, CFG.S.agendado, CFG.S.publicado].includes(s.status)
  ).length
  const inProd     = schedules.filter(s => [CFG.S.captacao, CFG.S.producao].includes(s.status)).length
  const withClient = schedules.filter(s => s.status === CFG.S.aguardandoAprovacao).length

  // `short`: no celular são 5 colunas numa faixa só, onde "Posts do mês"
  // quebraria em três linhas e desalinharia tudo.
  const metricCards: { label: string; short: string; value: number; icon: typeof SquarePen; tone: BadgeTone }[] = [
    { label: 'Posts do mês', short: 'Total',      value: total,      icon: SquarePen,     tone: 'red'     },
    { label: 'Em produção',  short: 'Produção',   value: inProd,      icon: CalendarClock, tone: 'orange'  },
    { label: 'Aprovados',    short: 'Aprovados',  value: approved,    icon: CheckCircle2,  tone: 'green'   },
    { label: 'Com cliente',  short: 'Cliente',    value: withClient,  icon: UserCheck,     tone: 'purple'  },
    { label: 'Publicados',   short: 'Publicados', value: published,   icon: Send,          tone: 'neutral' },
  ]

  // Atalhos rápidos
  //
  // O selo do atalho "Aprovações" precisa bater com o que a página de
  // Aprovações mostra — e ela não filtra por mês. Contado sobre o mês corrente,
  // o selo dizia 0 no dia 1º com o cronograma do mês anterior inteiro parado
  // com o cliente.
  // Inclui os extras esperando resposta: a página de Aprovações mostra post E
  // extra, então um selo que só conta post fica menor que o que você encontra
  // ao clicar nele.
  const approvalsBadge = pendingApprovalByClient.reduce((n, g) => n + g.pendingCount, 0)
    + allExtras.filter(x => x.client_approval_status === 'aguardando').length
  // Mesmos ícones da barra lateral de propósito: atalho e menu apontam pro
  // mesmo lugar, então ícone diferente pro mesmo destino faria parecer que são
  // telas diferentes.
  const shortcuts: { label: string; icon: typeof Feather; tone: BadgeTone; href: string; badge?: number }[] = [
    { label: 'Cronograma',   icon: Calendar,       tone: 'red',     href: '/dashboard/cronograma' },
    { label: 'Extras',       icon: LayoutList,     tone: 'amber',   href: '/dashboard/extras' },
    { label: 'Materiais',    icon: Package,        tone: 'neutral', href: '/dashboard/materiais' },
    { label: 'Aprovações',   icon: ClipboardCheck, tone: 'green',   href: '/dashboard/aprovacao', badge: approvalsBadge },
    { label: 'Kanban',       icon: Kanban,         tone: 'blue',    href: '/dashboard/kanban' },
    { label: 'Publicações',  icon: Share2,         tone: 'purple',  href: '/dashboard/social' },
  ]

  // ── Alertas de captação ──────────────────────────────────────────────────
  const captacaoAlerts = useMemo(() => {
    const futureCaptacoes  = captacoes.filter(c => c.scheduled_date >= todayStr && c.status === 'agendada')
    const recentCaptacoes  = captacoes.filter(c => c.scheduled_date < todayStr && c.status === 'realizada')
    const clientsWithFuture = new Set(futureCaptacoes.map(c => c.client_id))
    const clientsWithRecent = new Set(recentCaptacoes.map(c => c.client_id))

    const semAgendada: Client[] = []
    const vencida:     Client[] = []
    const postsAcabando: Client[] = []

    clients.forEach(cl => {
      const hasFuture = clientsWithFuture.has(cl.id)
      const hasRecent = clientsWithRecent.has(cl.id)
      if (!hasFuture) semAgendada.push(cl)
      if (!hasFuture && !hasRecent) vencida.push(cl)
    })

    // "Conteúdo acabando" = pouco post AINDA POR IR AO AR.
    //
    // A conta antiga era o contrário disso: contava os posts do mês corrente
    // que ainda NÃO estavam prontos. Um cliente com o mês inteiro aprovado
    // dava 0 e era acusado de estar acabando, enquanto um com 12 posts
    // travados em produção passava batido. E, presa ao mês corrente, no dia 3
    // de agosto ela acusaria todo mundo de uma vez.
    //
    // Cliente sem data marcada fica de fora: não é falta de conteúdo, é falta
    // de programação — outro problema, outra conversa.
    for (const c of clientCycles) {
      if (c.state === 'nunca' || c.runway === 'sem-data') continue
      // Extra pronto entra na conta: dá pra encaixar num buraco do cronograma
      // sem produzir nada. Acusar de "acabando" quem tem dois extras na mão é
      // o mesmo erro de antes, ao contrário — e alerta que erra é alerta que
      // se aprende a ignorar.
      const emMaos = c.restantes + c.extrasProntos
      if ((c.runway === 'fim' && emMaos === 0) || emMaos < 3) postsAcabando.push(c.client)
    }
    return { semAgendada, vencida, postsAcabando }
  }, [clients, captacoes, clientCycles, todayStr])

  const semAgendadaOnly = captacaoAlerts.semAgendada.filter(cl => !captacaoAlerts.vencida.some(v => v.id === cl.id))

  // Lista unificada de alertas (o primeiro vira o destaque do card "Atenção")
  type Alert = { n: number; label: string; sub: string; icon: typeof Clock; tone: BadgeTone; href: string; cta: string }
  const alertList: Alert[] = [
    delayed.length > 0 && { n: delayed.length, label: `${pl(delayed.length,'post vencido','posts vencidos')}`, sub: 'Data passou, não publicado', icon: Clock, tone: 'red' as BadgeTone, href: '/dashboard/cronograma', cta: 'Ver cronograma' },
    captacaoAlerts.vencida.length > 0 && { n: captacaoAlerts.vencida.length, label: 'clientes sem captação', sub: 'Resolver essa semana', icon: Camera, tone: 'red' as BadgeTone, href: '/dashboard/agenda', cta: 'Ver clientes' },
    rejected.length > 0 && { n: rejected.length, label: `${pl(rejected.length,'alteração solicitada','alterações solicitadas')}`, sub: 'Cliente pediu revisão', icon: AlertTriangle, tone: 'orange' as BadgeTone, href: '/dashboard/aprovacao', cta: 'Ver aprovações' },
    semAgendadaOnly.length > 0 && { n: semAgendadaOnly.length, label: 'sem captação futura', sub: 'Nenhuma captação agendada', icon: Camera, tone: 'purple' as BadgeTone, href: '/dashboard/agenda', cta: 'Ver agenda' },
    captacaoAlerts.postsAcabando.length > 0 && { n: captacaoAlerts.postsAcabando.length, label: 'com conteúdo acabando', sub: 'Menos de 3 posts pra ir ao ar', icon: Zap, tone: 'amber' as BadgeTone, href: '/dashboard/cronograma', cta: 'Ver cronograma' },
  ].filter(Boolean) as Alert[]

  // ── Visão geral do mês ──────────────────────────────────────────────────
  const isCurrentOv = ovMonth === month && ovYear === year
  // Só clientes ativos — um post de cliente arquivado não deve inflar o total
  // do mês nem aparecer no gráfico, mesmo que a linha em `schedules` continue
  // existindo.
  const activeClientIds = new Set(clients.map(c => c.id))
  const donutSource = (isCurrentOv ? schedules : ovSchedules).filter(s => activeClientIds.has(s.client_id))
  const ovTotal     = donutSource.length
  // "Precisam ajuste" é transversal (approval_status), mostrado como alerta à parte
  const ovNotOk     = donutSource.filter(s => s.approval_status === CFG.A.naoAprovado && ![CFG.S.aprovado, CFG.S.agendado, CFG.S.publicado].includes(s.status)).length

  // Rosca = distribuição por status (exclusivos → soma sempre = total).
  // IMPORTANTE: essa lista precisa cobrir TODOS os status possíveis de um post
  // (ver STATUSES em PostCard.tsx) — um status esquecido aqui fica invisível
  // no gráfico mas continua contando no total, e as fatias nunca somam 100%.
  const STATUS_SLICES: { key: string; label: string; tone: BadgeTone }[] = [
    { key: 'estrategia',                 label: 'Estratégia',      tone: 'neutral' },
    { key: 'aguardando_aprovacao_crono', label: 'Ag. crono',       tone: 'purple'  },
    { key: CFG.S.captacao,            label: 'Captação',        tone: 'blue'    },
    { key: CFG.S.producao,            label: 'Em produção',     tone: 'amber'   },
    { key: CFG.S.revisaoInterna,      label: 'Revisão interna', tone: 'orange'  },
    { key: CFG.S.aguardandoAprovacao, label: 'Com cliente',     tone: 'blue'    },
    { key: CFG.S.ajuste,              label: 'Ajuste',          tone: 'red'     },
    { key: CFG.S.aprovado,            label: 'Aprovado',        tone: 'purple'  },
    { key: CFG.S.agendado,            label: 'Agendado',        tone: 'green'   },
    { key: CFG.S.publicado,           label: 'Publicado',       tone: 'neutral' },
  ]
  const legend = STATUS_SLICES.map(s => ({ label: s.label, tone: s.tone, value: donutSource.filter(x => x.status === s.key).length }))
  const donutSegments = legend.map(l => ({ value: l.value, color: TONE_FG[l.tone] }))

  const monthOptions = Array.from({ length: 12 }, (_, k) => {
    const d = new Date(year, month - 1 - k, 1)
    return { y: d.getFullYear(), m: d.getMonth() + 1, label: `${MONTHS[d.getMonth()]} ${d.getFullYear()}` }
  })

  // Evolução de posts CRIADOS ao longo do mesmo mês selecionado acima (antes
  // era "últimos N dias" fixo, sem nenhuma relação com o mês escolhido — por
  // isso trocar de mês não mudava a curva, e junho/julho pareciam idênticos).
  // Usa o dia em horário de Brasília (não UTC) pra não jogar posts criados à
  // noite pro dia seguinte.
  const evolution = (() => {
    const out: { label: string; value: number }[] = []
    const daysInMonth = new Date(ovYear, ovMonth, 0).getDate()
    const lastDay = isCurrentOv ? now.getDate() : daysInMonth
    for (let day = 1; day <= lastDay; day++) {
      const key = `${ovYear}-${String(ovMonth).padStart(2, '0')}-${String(day).padStart(2, '0')}`
      const count = donutSource.filter(s => s.created_at && brasiliaISOFromDate(new Date(s.created_at)) === key).length
      out.push({ label: String(day), value: count })
    }
    return out
  })()

  // "Para você": SÓ o que tem a pessoa marcada como responsável direto no card
  // (assigned_members), ainda não finalizado — sem misturar trabalho geral da
  // equipe por cliente/função. Pra quem enxerga o hub inteiro (dono/gestor),
  // isso evita que apareça tarefa de outras pessoas na sua lista pessoal.
  // "Revisão interna" é etapa da estrategista do cliente, não de quem produziu o
  // post — nessa etapa específica o card conta como "pra você" pra quem tem
  // funcao='estrategia' com o cliente (client_team), não pelo assigned_members do card.
  const myStrategistClients = useMemo(() =>
    new Set(clientTeam.filter(t => t.member_id === currentMember?.id && t.funcao === 'estrategia').map(t => t.client_id)),
  [clientTeam, currentMember])

  // { clienteId: { posts: [ids], videos: [ids], social: [ids], ... } }
  const teamByClient = useMemo(() => {
    const m: Record<string, TimeDoCliente> = {}
    clientTeam.forEach(t => { ((m[t.client_id] ||= {})[t.funcao] ||= []).push(t.member_id) })
    return m
  }, [clientTeam])

  const directAssigned = useMemo(() => {
    if (!currentMember) return []
    // Sem recorte de período nenhum. Já foi o mês corrente (e sumia o
    // cronograma de agosto da Gabi, montado em julho) e já foi uma janela de
    // mês-1 a mês+3, que só empurrava o mesmo problema pra trás: post de junho
    // ainda não feito e atribuído a você caía fora da SUA lista. Se está
    // atribuído a você e não está fechado, é seu — em qualquer mês.
    return allSchedules.filter(s => {
      // Descartado entra na lista dos fechados: post cancelado não é pendência
      // de ninguém, e sem isto ele continuaria cobrando quem estava marcado —
      // exatamente o problema que o descarte existe pra resolver.
      if ([CFG.S.aprovado, CFG.S.agendado, CFG.S.publicado, 'cancelado'].includes(s.status)) return false
      // Em "Revisão interna" a estrategista do cliente vê o card MESMO sem
      // estar marcada nele — é etapa dela. Mas isso é um acréscimo, não uma
      // troca: quem está marcado continua vendo. Escrito como troca (um
      // `return` que só olhava a estrategista), o card sumia de quem estava
      // marcado — foi o que aconteceu com a Gabi nos posts do Number Seven,
      // onde ela é a responsável mas não é da equipe do cliente.
      const assignedToMe = (s.assigned_members || []).includes(currentMember.id)
      if (s.status === CFG.S.revisaoInterna) return assignedToMe || myStrategistClients.has(s.client_id)
      // Captação é onde o post cai quando o cliente aprova a estratégia, e é um
      // estado que espera uma DECISÃO da estrategista: este precisa de foto e
      // vídeo, ou já pode ir pra produção? Enquanto ela não decide, ninguém
      // mais tem o que fazer com o card — e ele normalmente ainda não está
      // atribuído a pessoa nenhuma, então não aparecia pra absolutamente
      // ninguém. Mesmo acréscimo da revisão interna: quem está marcado continua
      // vendo, a estrategista passa a ver também.
      if (s.status === CFG.S.captacao) return assignedToMe || myStrategistClients.has(s.client_id)
      // Pedido de alteração do cliente vai pra quem faz aquele tipo de peça:
      // reels pro editor, carrossel/post/story pro designer, e só a legenda
      // pro social — mesma lógica de acréscimo da revisão interna, quem está
      // marcado continua vendo.
      if (s.status === CFG.S.ajuste) {
        return assignedToMe || donosDoAjuste(teamByClient[s.client_id], s.post_type, (ajusteAlvos[s.id] || null) as AjusteAlvo).includes(currentMember.id)
      }
      return assignedToMe
    })
  }, [allSchedules, currentMember, myStrategistClients, teamByClient, ajusteAlvos])

  // Unifica posts + extras + materiais numa lista só, cada item marcado como
  // "precisa de você" (ação sua) ou "esperando o cliente" (aguardando aprovação) —
  // ajuste solicitado conta como "precisa de você" (é ação sua consertar).
  type ParaVoceItem = {
    id: string; kind: 'post' | 'extra' | 'material' | 'task'; title: string
    clientId: string; dueDate: string | null; ajuste: boolean; waitingClient: boolean; entregue: boolean; href: string
    postType?: string | null; campaignType?: string | null; labels?: CardLabel[] | null
    ajusteAlvo?: string | null
  }
  // Etiqueta às vezes vem como texto JSON do banco, não como lista — normaliza
  // pra nunca quebrar a exibição nem o resumo da IA.
  const asLabels = (v: any): CardLabel[] => {
    const raw = typeof v === 'string' ? (() => { try { return JSON.parse(v) } catch { return [] } })() : v
    return Array.isArray(raw) ? raw.filter(l => l && typeof l.text === 'string') : []
  }
  // "Esperando o cliente" e "precisa de você" NÃO são estados exclusivos.
  //
  // Um post pode estar em aprovação com o cliente enquanto a equipe ainda deve
  // a legenda — e é exatamente esse o caso do Mundo Selvagem: 12 posts em
  // `aguardando_aprovacao` com a etiqueta CRIAR LEGENDA. O código marcava
  // todos como "esperando o cliente", então o trabalho da Gabi caía na linha
  // cinza de espera e nunca aparecia como pendência dela.
  //
  // A etiqueta é a tarefa (convenção da Bagano: "CRIAR LEGENDA", "Criar o
  // design", "AGENDAR"). Então: tem etiqueta = tem trabalho aberto,
  // independente de quem mais esteja olhando o card.
  // A etiqueta diz QUAL é a tarefa; o campo correspondente diz se ela ainda
  // está aberta. Etiqueta é marcação manual — quem escreve a legenda muitas
  // vezes esquece de tirar a etiqueta, e o card ficaria cobrando pra sempre um
  // trabalho já feito. O conteúdo do campo é o fato.
  const openLabels = (labels: CardLabel[], legenda?: string | null) =>
    labels.filter(l => (/legenda/i.test(l.text) ? !(legenda || '').trim() : true))

  const stillOwesWork = (labels: CardLabel[]) => labels.length > 0

  const paraVoceItems: ParaVoceItem[] = [
    ...directAssigned.map((s): ParaVoceItem => ({
      id: `post-${s.id}`, kind: 'post', title: s.title, clientId: s.client_id,
      dueDate: s.scheduled_date, ajuste: s.status === CFG.S.ajuste,
      waitingClient: s.status === CFG.S.aguardandoAprovacao && !stillOwesWork(openLabels(asLabels((s as any).labels), s.legenda)),
      entregue: false,
      // post/m/y — sem isso o clique só caía na aba de cronograma do cliente,
      // sem abrir o post específico (o CronogramaTab já sabe abrir direto
      // quando recebe esses 3 parâmetros, só não estavam sendo passados).
      // Sem número, para no período: abre o mês certo em vez de um endereço
      // terminado em barra, que cairia na aba sem post nenhum aberto.
      href: `${linkCliente(s.client_id)?.('cronograma')}/${s.year}-${String(s.month).padStart(2, '0')}${s.post_number ? `/${s.post_number}` : ''}`,
      postType: s.post_type, campaignType: (s as any).campaign_type || null,
      labels: openLabels(asLabels((s as any).labels), s.legenda),
      ajusteAlvo: ajusteAlvos[s.id] || null,
    })),
    ...fromActiveClients(myExtras, clientesAtivos).map((e): ParaVoceItem => ({
      id: `extra-${e.id}`, kind: 'extra', title: e.title, clientId: e.client_id,
      dueDate: e.due_date, ajuste: e.client_approval_status === 'recusado',
      waitingClient: e.client_approval_status === 'aguardando' && !stillOwesWork(asLabels(e.labels)),
      entregue: e.status === 'feito',
      // `?post=` abre o extra direto — sem ele, o clique caía no quadro
      // inteiro e a pessoa tinha que achar o card no meio das colunas.
      // O `||` fica ANTES da interpolação de propósito: montada a string, ela
      // é sempre verdadeira, e um cliente sem endereço viraria "undefined?post=".
      href: `${(e.client_id && linkCliente(e.client_id)?.('extras')) || '/dashboard/extras'}?post=${e.id}`,
      postType: e.type, campaignType: e.campaign_type || null,
      labels: asLabels(e.labels),
    })),
    ...fromActiveClients(myMaterials, clientesAtivos).map((m): ParaVoceItem => ({
      id: `material-${m.id}`, kind: 'material', title: m.title, clientId: m.client_id,
      dueDate: m.due_date, ajuste: m.status === 'ajuste',
      waitingClient: m.status === 'aguardando_aprovacao' && !stillOwesWork(asLabels(m.labels)),
      entregue: m.status === 'feito',
      // `?post=` abre o material direto, igual extras e post. Mesmo cuidado do
      // extra: o `||` vem ANTES da interpolação, senão "undefined?post=" seria
      // uma string verdadeira e o fallback nunca valeria.
      href: `${(m.client_id && linkCliente(m.client_id)?.('materiais')) || '/dashboard/materiais'}?post=${m.id}`,
      labels: asLabels(m.labels),
    })),
    ...fromActiveClients(myTasks, clientesAtivos).map((t): ParaVoceItem => ({
      id: `task-${t.id}`, kind: 'task', title: t.title, clientId: t.client_id,
      dueDate: t.due_date, ajuste: false, waitingClient: false, entregue: false,
      href: `/dashboard/tarefas?task=${t.id}`,
      labels: asLabels(t.labels),
    })),
  ]
  // Três baldes, não dois. "Feito" não é pendência de ninguém e também não é
  // espera pelo cliente: é entrega feita esperando o próximo passo nosso
  // (mandar pro cliente, agendar). Ficava no meio das pendências, então marcar
  // Feito não mudava nada na tela — o card continuava cobrando quem já tinha
  // entregado, e quem precisava dar o passo seguinte só via um aviso passar.
  const entregues = paraVoceItems.filter(i => i.entregue)
  const needsYou = paraVoceItems.filter(i => !i.waitingClient && !i.entregue)
  const waitingOnClient = paraVoceItems.filter(i => i.waitingClient && !i.entregue)

  function itemSort(a: ParaVoceItem, b: ParaVoceItem) {
    if (a.ajuste !== b.ajuste) return a.ajuste ? -1 : 1
    const aOverdue = !!a.dueDate && a.dueDate < todayStr
    const bOverdue = !!b.dueDate && b.dueDate < todayStr
    if (aOverdue !== bOverdue) return aOverdue ? -1 : 1
    if (!a.dueDate && !b.dueDate) return 0
    if (!a.dueDate) return 1
    if (!b.dueDate) return -1
    return a.dueDate.localeCompare(b.dueDate)
  }
  needsYou.sort(itemSort)
  waitingOnClient.sort(itemSort)
  entregues.sort(itemSort)

  // Destino do clique em "N itens esperando o cliente": foca o cliente certo
  // (e se for 1 item só, já abre o preview dele) em vez de sempre cair na
  // central de aprovações sem nenhuma pista de qual item era. Materiais não
  // têm fluxo de aprovação pelo cliente (sem link público /aprovar) — não tem
  // o que focar na central, então esses continuam indo pro próprio cliente.

  // Ajuste pedido pelo cliente é sempre o grupo de maior prioridade, com ou sem prazo —
  // o resto vira uma lista só ("Pendências"), já ordenada por urgência (itemSort).
  // ── A fila do dia ──────────────────────────────────────────────────────────
  // A lógica mora em src/lib/filaDoDia.ts, fora do React e testada: é ela que
  // decide o que é de hoje, o que passou e o que nem tem dia. Aqui só se monta
  // o contexto (a agenda desta pessoa) e se distribui.
  const JANELA_SEM_AGENDA = 3
  const contextoFila = useMemo(
    () => contextoDaAgenda(minhaAgenda, todayStr, JANELA_SEM_AGENDA),
    [minhaAgenda, todayStr])

  const minhaFila = useMemo(() => {
    const b: Record<Balde, ParaVoceItem[]> = { ajuste: [], passou: [], agora: [], proximos: [], semDia: [] }
    needsYou.forEach(i => {
      b[baldeDoItem({ clientId: i.clientId || null, ajuste: i.ajuste, data: i.dueDate || null }, contextoFila)].push(i)
    })
    return b
  }, [needsYou, contextoFila])

  const contagemFila = useMemo(() => ({
    ajuste: minhaFila.ajuste.length, passou: minhaFila.passou.length, agora: minhaFila.agora.length,
    proximos: minhaFila.proximos.length, semDia: minhaFila.semDia.length,
  }), [fila])

  /** Os clientes de hoje, com a nota da agenda — é o que dá nome à frase. */
  const clientesDeHoje = useMemo(() => {
    const vistos = new Map<string, ClienteDeHoje>()
    minhaAgenda.filter(d => d.dia === todayStr && d.clientId).forEach(d => {
      const nome = clientMap[d.clientId!]?.name
      if (!nome || vistos.has(d.clientId!)) return
      vistos.set(d.clientId!, { nome, nota: d.nota })
    })
    return [...vistos.values()]
  }, [minhaAgenda, todayStr, clientMap])

  /** O próximo dia com trabalho, pro convite de adiantar. */
  const proximoDaAgenda = useMemo(() => {
    const futuros = minhaAgenda.filter(d => d.dia > todayStr).sort((a, b) => a.dia.localeCompare(b.dia))
    if (futuros.length === 0) return null
    const quando = futuros[0].dia
    const doDia = futuros.filter(d => d.dia === quando)
    const ids = new Set(doDia.map(d => d.clientId!))
    return {
      quando: quando === somaDias(todayStr, 1) ? 'amanhã' : new Date(quando + 'T12:00:00').toLocaleDateString('pt-BR', { weekday: 'long' }),
      clientes: [...ids].map(c => clientMap[c]?.name).filter(Boolean) as string[],
      itens: minhaFila.proximos.filter(i => i.clientId && ids.has(i.clientId)).length,
    }
  }, [minhaAgenda, todayStr, clientMap, minhaFila.proximos])

  const needsYouAjusteItems = minhaFila.ajuste

  /**
   * O bloco de agora: o que passou do dia PRIMEIRO, depois o de hoje.
   *
   * "Passou do dia" era seção própria e não devia ser: a ação é idêntica —
   * sentar com aquele cliente. Duas seções pro mesmo gesto viravam duas
   * listas pra ler de manhã. Como o agrupamento respeita a ordem de entrada,
   * pôr os atrasados na frente já os deixa no topo, com a etiqueta vermelha
   * que a própria linha desenha.
   */
  const fazerAgora = useMemo(
    () => [...minhaFila.passou, ...minhaFila.agora],
    [minhaFila.passou, minhaFila.agora])

  /**
   * Tudo que NÃO é de agora, numa frase só. Some quando não há nada.
   *
   * Eram quatro linhas separadas (outros dias, sem dia, entregue, esperando o
   * cliente) — quatro contagens que não pedem ação nenhuma hoje ocupando o
   * mesmo peso visual do trabalho de verdade.
   */
  /**
   * Tudo que não é de agora, na ordem em que se olharia: o que tem dia marcado
   * pra frente, o que não tem dia, o que já foi entregue e falta o próximo
   * passo, e o que está com o cliente.
   */
  const resto = useMemo(
    () => [...minhaFila.proximos, ...minhaFila.semDia, ...entregues, ...waitingOnClient],
    [minhaFila.proximos, minhaFila.semDia, entregues, waitingOnClient])

  const resumoDoResto = useMemo(() => {
    const partes = [
      minhaFila.proximos.length > 0 && `${minhaFila.proximos.length} de outros dias`,
      minhaFila.semDia.length > 0 && `${minhaFila.semDia.length} sem dia`,
      entregues.length > 0 && `${entregues.length} ${pl(entregues.length, 'entregue', 'entregues')}`,
      waitingOnClient.length > 0 && `${waitingOnClient.length} com o cliente`,
    ].filter(Boolean) as string[]
    return partes.length ? partes.join(' · ') : ''
  }, [minhaFila.proximos, minhaFila.semDia, entregues, waitingOnClient])

  // A chamada de IA que gerava esta frase saiu junto: sem ninguém lendo o
  // resultado, ela só queimaria a cota diária gratuita a cada carregamento.

  // "Parado há X dias" — busca updated_at à parte, isolado com try/catch: se a
  // coluna ainda não existir (migração não rodada), falha em silêncio e o
  // indicador simplesmente não aparece, sem quebrar o resto do dashboard.
  useEffect(() => {
    if (loading || paraVoceItems.length === 0) return
    const postIds    = directAssigned.map(s => s.id)
    const extraIds   = myExtras.map(e => e.id)
    const materialIds = myMaterials.map(m => m.id)

    async function fetchAging(table: string, ids: string[], prefix: string) {
      if (ids.length === 0) return
      try {
        const { data, error } = await supabase.from(table).select('id, updated_at').in('id', ids)
        if (error || !data) return
        setAgingMap(prev => {
          const next = { ...prev }
          data.forEach((r: any) => { if (r.updated_at) next[`${prefix}-${r.id}`] = r.updated_at })
          return next
        })
      } catch {}
    }

    fetchAging('schedules', postIds, 'post')
    fetchAging('extras', extraIds, 'extra')
    fetchAging('materials', materialIds, 'material')
    fetchAging('personal_tasks', myTasks.map(t => t.id), 'task')
  }, [loading, directAssigned.length, myExtras.length, myMaterials.length, myTasks.length])

  // Nome de exibição da campanha (ex: "Dia dos Pais") pro selo em cada item —
  // campaign_type guarda só o slug ("pais"), o nome de verdade (que pode ser
  // customizado por cliente) mora na tabela campaigns.
  useEffect(() => {
    if (loading || paraVoceItems.length === 0) return
    const withCampaign = paraVoceItems.filter(i => i.campaignType)
    if (withCampaign.length === 0) return
    const clientIds = [...new Set(withCampaign.map(i => i.clientId))]
    supabase.from('campaigns').select('client_id, type, name').in('client_id', clientIds)
      .then(({ data, error }) => {
        if (error || !data) return
        const next: Record<string, string> = {}
        data.forEach((c: any) => { next[`${c.client_id}:${c.type}`] = c.name })
        setCampaignNameMap(next)
      })
  }, [loading, paraVoceItems.length])

  // Frase do dia, a que acompanha "Bom dia, Fulano". É escrita pela IA e a
  // equipe lê — eu tinha tirado junto com o problema, e o problema não era ela.
  //
  // O que confundia era ela CONTAR POR CONTA PRÓPRIA: recebia a pilha inteira
  // da pessoa e dizia "28 tasks te olhando feio" enquanto o card logo abaixo
  // dizia "8 hoje, 1 atrasado". Agora ela come da mesma tigela — os números
  // saem da fila, os mesmos que o card desenha — e a rota tem regra explícita
  // de não inventar número. Duas vozes, uma conta só.
  //
  // Cacheada por pessoa+dia+período, com os números na chave: sem isso a frase
  // ficava presa dizendo um número velho depois que a lista mudava.
  useEffect(() => {
    if (!currentMember || loading) return
    const h = now.getHours()
    const period = h < 12 ? 'manhã' : h < 18 ? 'tarde' : 'noite'
    const nextDate = specialDates[0]
      ? `${specialDates[0].name} em ${daysBetween(now, new Date(specialDates[0].date + 'T12:00:00'))} dias`
      : null

    const countsKey = [
      fazerAgora.length, contagemFila.passou, contagemFila.ajuste,
      waitingOnClient.length, clientesDeHoje.map(c => c.nome).join('|'),
    ].join(':')
    const cacheKey = `bagano_greeting_v3_${currentMember.id}_${todayStr}_${period}`
    try {
      const cached = localStorage.getItem(cacheKey)
      if (cached) {
        const parsed = JSON.parse(cached)
        if (parsed.countsKey === countsKey) { setGreetingLine(parsed.text); return }
      }
    } catch {}

    fetch(withBase('/api/ai-greeting'), {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        memberName: currentMember.name?.split(' ')[0],
        role: currentMember.role,
        weekday: DAYS[now.getDay()],
        period,
        dateLabel: `${now.getDate()} de ${MONTHS[now.getMonth()]}`,
        // "Agora" e não "tudo que existe": é o que o card mostra.
        pending: fazerAgora.length,
        overdue: contagemFila.passou,
        ajustes: contagemFila.ajuste,
        waitingClient: waitingOnClient.length,
        clientsWithWork: clientesDeHoje.length
          ? clientesDeHoje.map(c => c.nome)
          : [...new Set(fazerAgora.map(i => clientMap[i.clientId]?.name).filter(Boolean))],
        nextSpecialDate: nextDate,
        publishedThisMonth: published,
        totalThisMonth: total,
      }),
    })
      .then(r => r.json())
      .then(data => {
        if (!data.greeting) return
        setGreetingLine(data.greeting)
        try { localStorage.setItem(cacheKey, JSON.stringify({ countsKey, text: data.greeting })) } catch {}
      })
      .catch(() => {})
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentMember?.id, loading, todayStr, fazerAgora.length, contagemFila.passou, contagemFila.ajuste])

  if (loading) return (
    <div className="flex items-center justify-center h-full">
      <div className="w-5 h-5 border-2 border-[var(--color-border)] border-t-[var(--color-accent)] rounded-full animate-spin" />
    </div>
  )

  if (loadError) return (
    <div className="flex flex-col items-center justify-center h-full gap-3 text-center px-8">
      <p className="text-sm text-[var(--color-text-muted)]">Não foi possível carregar o dashboard.</p>
      <button onClick={() => window.location.reload()}
        className="text-xs px-4 py-2 rounded-xl border border-[var(--color-border)] text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-card)] transition-colors">
        Tentar novamente
      </button>
    </div>
  )

  // ── Helpers de UI ────────────────────────────────────────────────────────
  function ClientAvatar({ clientId, size = 36 }: { clientId: string; size?: number }) {
    const c = clientMap[clientId]
    if (!c) return null
    if (c.logo_url) return (
      <img src={c.logo_url} alt={c.name}
        style={{ width: size, height: size, borderRadius: '50%' }}
        className="object-cover flex-shrink-0"
        onError={e => { (e.target as HTMLImageElement).style.display = 'none' }}
      />
    )
    return (
      <div className="flex items-center justify-center text-white font-bold flex-shrink-0"
        style={{ width: size, height: size, borderRadius: '50%', fontSize: size / 3, background: c.color_hex }}>
        {getInitials(c.name)}
      </div>
    )
  }

  const firstName = currentMember?.name.split(' ')[0]
  const paraVoceContent = paraVoceItems.length > 0

  // A frase saiu da IA.
  //
  // Ela recebia 20 itens soltos, sem noção de dia e sem a agenda, então o
  // melhor que conseguia era listar: "um carrossel da Bagano MKT, mais dezenas
  // de reels de clientes como Number Seven, Zebuino, NI HAO, Criativa Padaria,
  // Toit e Unizushi sem tarefas pendentes definidas". Tudo verdade e nada útil
  // — nenhum daqueles clientes era o de hoje.
  //
  // O que faltava não era modelo melhor, era a agenda na entrada. Com ela o
  // texto vira dado estruturado (cliente + nota + contagem), e aí a frase sai
  // igual toda vez, na hora, sem depender da cota diária gratuita — que já
  // estourou uma vez e deixou o card mudo.
  const paraVoceSummary = fraseDaFila({
    temAgenda: contextoFila.temAgenda,
    clientesDeHoje,
    contagem: contagemFila,
    janelaDias: JANELA_SEM_AGENDA,
  })
  const convitePraAdiantar = sugestaoDeAdiantar({ contagem: contagemFila, proximo: proximoDaAgenda })
  const paraVoceTitle = paraVoceContent && paraVoceSummary ? `Para você, ${firstName}: ${paraVoceSummary}` : `Para você, ${firstName}`

  return (
    <div className="min-h-screen bg-[var(--color-bg-page)]">
      {/* Respiro de 16px no celular (20 no desktop): recupera uns 25px ao
          longo da rolagem, e padding é o tipo de coisa cuja falta ninguém
          sente — diferente de cortar conteúdo. */}
      <div className="max-w-[1440px] mx-auto px-4 md:px-8 py-4 md:py-8 space-y-4 md:space-y-6">

        {/* ── Header ──────────────────────────────────────────────────────── */}
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl md:text-3xl font-bold text-[var(--color-text-primary)] tracking-tight">
              {getDayGreeting()}{firstName ? `, ${firstName}` : ''}{greetingLine ? '.' : ' 👋'}
            </h1>
            <p className="text-sm text-[var(--color-text-muted)] mt-1">
              {greetingLine || 'Aqui está o que está acontecendo hoje na Bagano.'}
            </p>
            {/* A frase da IA (ver o efeito que chama /api/ai-greeting).
                A equipe lê, e ela fica.

                O que confundia era ela contar SOZINHA: dizia "28 tasks te
                olhando feio" com a pilha inteira, enquanto o card logo abaixo
                dizia "8 hoje, 1 atrasado". Número que não bate com o vizinho
                derruba a confiança nos dois. Cheguei a tirar a frase junto com
                o problema — errado: o problema era a conta, não o humor.
                Agora ela recebe os números da MESMA fila que o card desenha, e
                a rota tem regra explícita de não inventar número. */}
          </div>
          {/* No celular a data vive na barra do topo (ver layout.tsx): lá ela
              não custa altura nenhuma, porque aquela faixa já existe. */}
          <p className="hidden md:block text-xs font-medium text-[var(--color-text-muted)] whitespace-nowrap mt-1">
            {DAYS[now.getDay()]}, {now.getDate()} de {MONTHS[now.getMonth()]} de {year}
          </p>
        </div>


        {/* ── Atalhos (celular) ─────────────────────────────────────────────
            No lugar da faixa de métricas: números de panorama não levam a
            lugar nenhum, e aqui em cima o que vale é chegar rápido na tela de
            trabalho. Seis colunas de ícone — no desktop os atalhos seguem no
            card da direita e as métricas voltam como cards. */}
        <div className="md:hidden">
          {/* p-3 em vez do p-5 padrão: com o conteúdo em ~54px, os 20px de
              respiro em cima e embaixo eram quase metade da altura do card —
              era o vazio em volta, não o ícone, que fazia isso não parecer
              um atalho. O ladrilho ocupa a coluna inteira (antes era um
              quadrado fixo de 36px numa coluna de ~52px, sobrando espaço
              morto dos dois lados), no padrão de tela inicial de celular. */}
          <Card className="p-3 flex items-stretch gap-1">
            {shortcuts.map(s => (
              <button key={s.label} onClick={() => router.push(s.href)}
                title={s.label}
                className="relative flex-1 min-w-0 flex flex-col items-center gap-1">
                <span className="w-full h-11 rounded-xl flex items-center justify-center" style={{ background: TONE_BG[s.tone] }}>
                  <s.icon size={24} strokeWidth={2} style={{ color: TONE_FG[s.tone] }} />
                </span>
                <span className="text-[8px] font-medium text-[var(--color-text-muted)] leading-none whitespace-nowrap">{s.label}</span>
                {!!s.badge && s.badge > 0 && (
                  <span className="absolute -top-1 -right-0.5 min-w-[15px] h-[15px] rounded-full text-white text-[8px] font-bold flex items-center justify-center px-1 ring-2 ring-[var(--color-bg-card)]" style={{ background: 'var(--color-accent)' }}>{s.badge}</span>
                )}
              </button>
            ))}
          </Card>
        </div>
        <div className="hidden md:grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
          {metricCards.map(m => (
            <Card key={m.label} padded className="flex items-center gap-3.5">
              <IconBadge icon={m.icon} tone={m.tone} size="lg" />
              <div>
                <p className="text-3xl font-bold leading-none" style={{ color: TONE_FG[m.tone] }}>{m.value}</p>
                <p className="text-xs text-[var(--color-text-muted)] mt-1.5">{m.label}</p>
              </div>
            </Card>
          ))}
        </div>

        {/* ── Bento ───────────────────────────────────────────────────────── */}
        <div className="grid grid-cols-12 gap-4 md:gap-5 items-start">

          {/* Região esquerda */}
          <div className="col-span-12 lg:col-span-8 space-y-4 md:space-y-5">

            {/* Para você — sozinha na linha, sem "buraco" causado por um vizinho mais curto */}
            {/* Sem pendência, o card inteiro (cabeçalho + corpo folgado) gastava
                ~110px pra dizer uma frase. Vira uma linha fina de ~36px. Não
                some de vez de propósito: o card carrega depois dos dados, então
                ausência ficaria indistinguível de "não carregou" — e o "nada
                pendente" é a única confirmação de que a pessoa está em dia. */}
            {currentMember && !paraVoceContent && (
              <Card className="px-4 py-2.5 flex items-center gap-2.5">
                <IconBadge icon={Zap} tone="amber" size="sm" />
                <p className="text-sm text-[var(--color-text-secondary)] min-w-0">
                  <span className="font-semibold text-[var(--color-text-primary)]">Para você, {firstName}</span>
                  <span className="mx-1.5 text-[var(--color-text-faint)]">·</span>
                  Nada pendente 🎉
                </p>
              </Card>
            )}

            {currentMember && paraVoceContent && (
              <SectionCard title={paraVoceTitle} icon={Zap} iconTone="amber" bodyClassName="px-4 pb-4 space-y-3">
                {/* TRÊS REGIÕES, no máximo. Eram até oito — o card do Franz
                    tinha sete seções abertas ao mesmo tempo, e isso não é
                    problema de layout, é de escopo: a tela de manhã responde UMA
                    pergunta, "o que eu faço primeiro?". Status, índice do que
                    existe e planejamento são outra conversa, e agora cabem numa
                    linha só no rodapé. */}

                {/* 1. Alguém está esperando resposta. Aqui a unidade é o ITEM,
                       porque o cliente pediu sobre um post específico. */}
                {needsYouAjusteItems.length > 0 && (
                  <ParaVoceGroup label="🔴 Esperando você" items={needsYouAjusteItems} clientMap={clientMap} router={router} todayStr={todayStr} cap={4} agingMap={agingMap} campaignNameMap={campaignNameMap} />
                )}

                {/* 2. O trabalho de agora. Aqui a unidade é o CLIENTE — é assim
                       que o dia acontece: senta com um cliente e faz o lote
                       dele. O que passou do dia não é seção separada: entra
                       aqui, primeiro na lista e com etiqueta vermelha, porque a
                       ação é a mesma (sentar com aquele cliente). */}
                {fazerAgora.length > 0 && (
                  <ParaVoceGroup
                    // Sem enumerar cliente no título: eles JÁ são as linhas
                    // logo abaixo, e o bloco carrega também o que passou do dia
                    // de OUTROS clientes — "Hoje · Zebuino · NI HAO" com Bagano
                    // MKT na lista era o título contradizendo o conteúdo.
                    label={contextoFila.temAgenda ? '📌 Hoje'
                      : `📌 Mais urgente · sai em até ${JANELA_SEM_AGENDA} dias`}
                    items={fazerAgora} clientMap={clientMap} router={router} todayStr={todayStr} cap={6}
                    agingMap={agingMap} campaignNameMap={campaignNameMap}
                    sempreCliente />
                )}

                {convitePraAdiantar && (
                  <ParaVoceSummaryRow icon="⚡" label={convitePraAdiantar} onClick={() => router.push('/dashboard/criacao')} />
                )}

                {/* 3. Todo o resto numa linha só. Contagem não é navegação: como
                       linha morta no meio da manhã, "10 itens sem dia marcado"
                       é ruído — e é informação de quem MONTA a agenda, não de
                       quem executa. */}
                {resto.length > 0 && (
                  <div>
                    <ParaVoceSummaryRow icon="📂" label={resumoDoResto} aberto={verResto} muted
                      onClick={() => setVerResto(v => !v)} />
                    {/* Abre a lista INTEIRA, agrupada por cliente e clicável
                        até o card — igual ao bloco de cima. Era um link cego
                        pra outra tela: a pessoa via "6 de outros dias" e não
                        tinha como saber quais sem sair daqui. Fechado por
                        padrão, porque de manhã isso não é decisão; aberto, é a
                        mesma lista de sempre. */}
                    {verResto && (
                      <div className="mt-1.5">
                        <ParaVoceGroup label="" items={resto} clientMap={clientMap} router={router}
                          todayStr={todayStr} cap={20} agingMap={agingMap}
                          campaignNameMap={campaignNameMap} sempreCliente muted />
                      </div>
                    )}
                  </div>
                )}
              </SectionCard>
            )}

            {/* Situação dos clientes — o título mudou junto com a lógica: "do
                mês" era a origem conceitual do problema. */}
            <div>
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-bold text-[var(--color-text-primary)] tracking-tight">Situação dos clientes</h2>
                <button onClick={() => router.push('/dashboard/clientes')} className="flex items-center gap-1.5 text-xs font-semibold text-[var(--color-accent)] hover:underline">
                  Ver todos <ArrowRight size={13} />
                </button>
              </div>
              {/* 2 colunas já no celular: em 1 coluna a lista de ~19 clientes
                  virava uma rolagem interminável. O card encolhe junto (avatar,
                  fontes e espaçamentos) pra caber nos ~170px de cada coluna. */}
              <div className="grid grid-cols-2 xl:grid-cols-3 gap-2.5 md:gap-4">
                {clientCycles.map(({ client, state, key, posts, restantes, ultima, runway, runwayCurto, semMaterialFuturo, extrasProntos, outros }) => {
                  const [cy, cm] = key ? key.split('-').map(Number) : [0, 0]
                  const mesLabel = key ? `${MONTHS[cm - 1].slice(0, 3)}${cy !== year ? `/${String(cy).slice(2)}` : ''}` : null
                  // A barra é do CRONOGRAMA quando existe cronograma.
                  //
                  // Ela chegou a somar posts + extras + materiais, o que fazia
                  // o número não bater com a tela do cliente: o Bem Viver tem
                  // 12 posts em agosto e o card dizia 13, porque somava um
                  // material. Número que não bate com o cronograma não serve
                  // pra ler cronograma.
                  //
                  // Extra e material continuam aparecendo — como acréscimo
                  // explícito no rodapé. E pra quem NÃO tem cronograma nenhum
                  // (Unizushi) eles viram a própria barra, que foi o problema
                  // oposto que a gente consertou antes.
                  const ex = outros.exs, mt = outros.mts
                  const soOutros   = posts.length === 0
                  const total      = soOutros ? ex.length + mt.length : posts.length
                  const publicado  = soOutros ? 0 : posts.filter(s => s.status === CFG.S.publicado).length
                  const entregue   = soOutros
                    ? ex.filter(x => x.status === 'done').length + mt.filter(x => x.status === 'finalizado').length
                    : posts.filter(s => DONE_STAGES.includes(s.status)).length
                  const comCliente = soOutros
                    ? ex.filter(x => x.status === 'aguardando_aprovacao').length + mt.filter(x => x.status === 'aguardando_aprovacao').length
                    : posts.filter(s => s.status === CFG.S.aguardandoAprovacao).length
                  const ajuste     = soOutros
                    ? ex.filter(x => (x as any).client_approval_status === 'recusado').length + mt.filter(x => x.status === 'ajuste').length
                    : posts.filter(s => s.status === CFG.S.ajuste).length
                  const producao   = Math.max(0, total - entregue - comCliente - ajuste)
                  const atrasados  = posts.filter(s => s.scheduled_date && s.scheduled_date < todayStr && !DONE_STAGES.includes(s.status)).length
                  // Mesma paleta e mesma ordem da barra de "Aguardando
                  // aprovação": duas leituras do mesmo dado no mesmo painel
                  // precisam parecer a mesma coisa. A diferença é que "pronto"
                  // se parte em dois — o que JÁ FOI AO AR em verde cheio e o
                  // que está pronto esperando a data em verde apagado —, que é
                  // como o publicado fica visível sem virar mais uma linha.
                  const segs = [
                    { n: publicado,            color: 'var(--ds-success-accent)', op: 1,    label: pl(publicado, 'publicado', 'publicados') },
                    { n: entregue - publicado, color: 'var(--ds-success-accent)', op: 0.45, label: 'pronto, aguardando a data' },
                    { n: comCliente,           color: 'var(--ds-info-accent)',    op: 1,    label: 'com o cliente' },
                    { n: producao,             color: 'var(--ds-warn-accent)',    op: 1,    label: 'em produção' },
                    { n: ajuste,               color: 'var(--color-accent)',      op: 1,    label: pl(ajuste, 'ajuste', 'ajustes') },
                  ].filter(s => s.n > 0)
                  const fmtDia = (iso: string) => {
                    const d = new Date(iso + 'T12:00:00')
                    return `${String(d.getDate()).padStart(2, '0')}/${MONTHS[d.getMonth()].slice(0, 3).toLowerCase()}`
                  }
                  // A linha de baixo do nome responde "quando o conteúdo dele
                  // acaba" — antes repetia os entregues, que já estão no
                  // rodapé do card.
                  // Sem cronograma NÃO quer dizer sem trabalho: o Unizushi tem
                  // dois extras e aparecia como "sem cronograma · nenhum post",
                  // que lê como cliente parado.
                  const outrosTxt = [
                    outros.exTotal > 0 ? `${outros.exTotal} ${pl(outros.exTotal, 'extra', 'extras')}` : '',
                    outros.mtTotal > 0 ? `${outros.mtTotal} ${pl(outros.mtTotal, 'material', 'materiais')}` : '',
                  ].filter(Boolean).join(' · ')
                  const sub = (state === 'nunca'
                      ? (outrosTxt ? `só ${outrosTxt}` : 'sem cronograma')
                    : runway === 'sem-data' ? 'sem datas marcadas'
                    : runway === 'sem-material' ? `${semMaterialFuturo} programado${semMaterialFuturo !== 1 ? 's' : ''} · nada pronto`
                    : runway === 'fim' ? 'sem post futuro'
                    : `${restantes} a publicar · até ${fmtDia(ultima!)}`)
                    + (extrasProntos > 0 ? ` · +${extrasProntos} extra${extrasProntos !== 1 ? 's' : ''} pronto${extrasProntos !== 1 ? 's' : ''}` : '')
                  const subTone = state === 'nunca' ? 'var(--color-text-muted)'
                    : runway === 'fim' ? 'var(--ds-error-text)'
                    : runwayCurto ? 'var(--ds-warn-text)'
                    : 'var(--color-text-muted)'
                  return (
                    <Card key={client.id} hover padded
                      className={`cursor-pointer${state === 'nunca' && !outrosTxt ? ' opacity-60' : ''}`}
                      onClick={() => router.push(key
                        ? `${caminhoCliente(client, 'cronograma')}/${cy}-${String(cm).padStart(2, '0')}`
                        : caminhoCliente(client))}>
                      <div className="flex items-center gap-2 md:gap-3 mb-2.5 md:mb-3">
                        {client.logo_url
                          ? <img src={client.logo_url} alt={client.name} className="w-8 h-8 md:w-10 md:h-10 rounded-full object-cover flex-shrink-0" onError={e => { (e.target as HTMLImageElement).style.display = 'none' }} />
                          : <div className="w-8 h-8 md:w-10 md:h-10 rounded-full flex items-center justify-center text-white text-[11px] md:text-sm font-bold flex-shrink-0" style={{ background: client.color_hex }}>{getInitials(client.name)}</div>
                        }
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5 min-w-0">
                            <p className="font-semibold text-[var(--color-text-primary)] truncate text-xs md:text-sm">{client.name}</p>
                            {/* Selo do mês: sem ele, cards de julho e de agosto
                                lado a lado seriam indistinguíveis. */}
                            {mesLabel && (
                              <span className="text-[9px] font-bold uppercase tracking-wide px-1 py-px rounded flex-shrink-0"
                                style={{ background: 'var(--color-bg-subtle)', color: 'var(--color-text-muted)' }}>
                                {mesLabel}
                              </span>
                            )}
                          </div>
                          <p className="text-[10px] md:text-xs truncate" style={{ color: subTone }}>{sub}</p>
                        </div>
                      </div>
                      <div className="flex h-1.5 bg-[var(--color-bg-subtle)] rounded-full mb-2.5 overflow-hidden"
                        title={segs.map(s => `${s.n} ${s.label}`).join(' · ')}>
                        {segs.map((s, i) => <div key={i} className="h-full transition-all" style={{ width: `${(s.n / total) * 100}%`, background: s.color, opacity: s.op }} />)}
                      </div>
                      <div className="flex items-center justify-between gap-1 flex-wrap">
                        <span className="text-[10px] md:text-xs text-[var(--color-text-muted)]">
                          {total === 0
                            ? 'nenhum trabalho'
                            : <>
                                {publicado > 0 ? `${publicado} no ar · ${entregue}/${total} prontos` : `${entregue}/${total} prontos`}
                                {/* Fora do cronograma, e dito com todas as letras
                                    pra ninguém somar com o número acima. */}
                                {!soOutros && outros.abertos > 0 && (
                                  <span className="text-[var(--color-text-faint)]"> · +{outros.abertos} fora do crono</span>
                                )}
                              </>}
                        </span>
                        <div className="flex items-center gap-1 flex-wrap">
                          {atrasados > 0 && <span className="text-[10px] px-1.5 py-0.5 rounded-md font-semibold" style={{ background: 'var(--ds-error-bg)', color: 'var(--ds-error-text)' }}>{atrasados} atrasado{atrasados !== 1 ? 's' : ''}</span>}
                          {ajuste > 0 && <span className="text-[10px] px-1.5 py-0.5 rounded-md font-semibold" style={{ background: 'var(--ds-warn-bg)', color: 'var(--ds-warn-text)' }}>{ajuste} ajuste{ajuste !== 1 ? 's' : ''}</span>}
                          {/* "✓ em dia" só quando o fôlego também está bem. O
                              D'Mori mostrava "sem post futuro" em vermelho e
                              "em dia" em verde no mesmo card — as duas coisas
                              eram verdade e liam como opostos. Quando o
                              conteúdo acabou, é isso que importa. */}
                          {state === 'entregue' && atrasados === 0 && runway === 'ok' && <span className="text-[10px] px-1.5 py-0.5 rounded-md font-semibold" style={{ background: 'var(--ds-success-bg)', color: 'var(--ds-success-text)' }}>✓ em dia</span>}
                        </div>
                      </div>
                    </Card>
                  )
                })}
              </div>
            </div>
          </div>

          {/* Região direita */}
          <div className="col-span-12 lg:col-span-4 space-y-4 md:space-y-5">

            {/* Atalhos rápidos — no celular já estão em cima, na faixa de 6 */}
            <SectionCard title="Atalhos rápidos" className="hidden md:block">
              {/* Ícone maior e rótulo menor, com o respiro encolhendo na mesma
                  medida em que o ícone cresce — a célula fica com a mesma
                  altura de antes. */}
              <div className="grid grid-cols-3 gap-2.5">
                {shortcuts.map(s => (
                  <button key={s.label} onClick={() => router.push(s.href)}
                    className="relative rounded-xl py-3.5 px-2 flex flex-col items-center gap-1.5 border border-[var(--color-border)] hover:-translate-y-0.5 hover:shadow-card transition-all"
                    style={{ background: TONE_BG[s.tone] }}>
                    <s.icon size={28} strokeWidth={2} style={{ color: TONE_FG[s.tone] }} />
                    <span className="text-[10px] font-medium text-[var(--color-text-primary)] text-center leading-tight">{s.label}</span>
                    {!!s.badge && s.badge > 0 && (
                      <span className="absolute top-1.5 right-1.5 min-w-[16px] h-[16px] rounded-full text-white text-[9px] font-bold flex items-center justify-center px-1" style={{ background: 'var(--color-accent)' }}>{s.badge}</span>
                    )}
                  </button>
                ))}
              </div>
            </SectionCard>

            {/* Datas importantes */}
            <SectionCard
              title="Datas importantes" icon={CalendarDays} iconTone="neutral"
              action={specialDates.length > 0 && (
                <button onClick={() => router.push('/dashboard/datas-especiais')} className="text-xs font-semibold text-[var(--color-accent)] hover:underline">Ver todas →</button>
              )}
              bodyClassName="px-3 pb-3"
            >
              {specialDates.length === 0 ? (
                <p className="text-sm text-[var(--color-text-muted)] py-6 text-center">Nenhuma data próxima</p>
              ) : (
                <div className="space-y-1">
                  {specialDates.slice(0, 3).map(sd => {
                    const d = new Date(sd.date + 'T12:00:00')
                    const diff = daysBetween(now, d)
                    return (
                      <div key={sd.id} className="flex items-center gap-3.5 px-2 py-2.5">
                        <div className="flex flex-col items-center w-9 flex-shrink-0">
                          <span className="text-2xl font-bold leading-none text-[var(--color-text-primary)] tabular-nums">{String(d.getDate()).padStart(2, '0')}</span>
                          <span className="text-[10px] font-bold uppercase tracking-wide leading-none mt-1" style={{ color: 'var(--color-accent)' }}>{MONTHS[d.getMonth()].slice(0, 3)}</span>
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-[var(--color-text-primary)] truncate">{sd.name}</p>
                          <p className="text-xs text-[var(--color-text-muted)]">{diff === 0 ? 'hoje' : `em ${diff} ${pl(diff, 'dia', 'dias')}`}</p>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </SectionCard>

            {/* Aguardando aprovação por cliente — mês inteiro, não só a semana */}
            {/* ── Geral da Bagano ──────────────────────────────────────────────
                O que está travado na AGÊNCIA — de todo mundo, não seu. O que é seu
                está no "Para você", acima, e é por lá que a pessoa começa o dia.

                Ficou embaixo por isso: a primeira versão nasceu no topo e empurrava
                o "Para você" pra baixo, invertendo a prioridade. Duas listas
                parecidas competindo, e a de fora ganhando da de dentro.

                Nada aqui é conta nova — `fetchAgencyAlerts` já existia e já sabia
                de tudo isso. Só que morava atrás do sininho, e ninguém abre o
                sininho pra descobrir o que está pegando.

                Some quando não há nada: silêncio também informa. */}
            {fila.length > 0 && (
              <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-bg-card)] overflow-hidden">
                <div className="px-4 md:px-5 py-3 border-b border-[var(--color-border)] flex items-baseline gap-2 flex-wrap">
                  <p className="text-sm font-semibold text-[var(--color-text-primary)]">
                    Geral da Bagano
                  </p>
                  {fila.some(a => a.severity === 'alta') && (
                    <span className="text-xs font-semibold" style={{ color: 'var(--ds-error-accent)' }}>
                      {fila.filter(a => a.severity === 'alta').length} urgente{fila.filter(a => a.severity === 'alta').length !== 1 ? 's' : ''}
                    </span>
                  )}
                  <span className="text-xs text-[var(--color-text-muted)] ml-auto">{fila.length} {fila.length === 1 ? 'item' : 'itens'}</span>
                </div>
                <div className="divide-y divide-[var(--color-border)]">
                  {fila.slice(0, 5).map(a => (
                    <button key={a.id} onClick={() => router.push(a.href)}
                      className="w-full text-left flex items-center gap-3 px-4 md:px-5 py-3 hover:bg-[var(--color-bg-subtle)] transition-colors">
                      <span className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                        style={{ background: a.severity === 'alta' ? 'var(--ds-error-accent)' : 'var(--ds-warn-accent)' }} />
                      <span className="text-sm text-[var(--color-text-primary)] min-w-0 flex-1">{a.label}</span>
                      {a.detail && <span className="hidden sm:block text-xs text-[var(--color-text-muted)] truncate max-w-[38%]">{a.detail}</span>}
                      <ChevronRight size={14} className="text-[var(--color-text-faint)] flex-shrink-0" />
                    </button>
                  ))}
                </div>
                {fila.length > 5 && (
                  <p className="px-4 md:px-5 py-2 text-xs text-[var(--color-text-muted)] border-t border-[var(--color-border)]">
                    e mais {fila.length - 5} — o sininho tem a lista inteira
                  </p>
                )}
              </div>
            )}

            <SectionCard
              title="Aguardando aprovação"
              action={<span className="text-xs text-[var(--color-text-muted)]">{pendingApprovalByClient.reduce((n, g) => n + g.pendingCount, 0)} {pl(pendingApprovalByClient.reduce((n, g) => n + g.pendingCount, 0), 'post', 'posts')}</span>}
              bodyClassName="px-4 pb-4 space-y-2.5"
            >
              {pendingApprovalByClient.length === 0 ? (
                <p className="text-sm text-[var(--color-text-muted)] py-6 text-center">Nada esperando o cliente 🎉</p>
              ) : (
                <>
                  {pendingApprovalByClient.slice(0, 4).map(({ cid, month: gm, year: gy, pending, pendingCount, monthPosts }) => {
                    const client = clientMap[cid]
                    const pronto     = monthPosts.filter(s => [CFG.S.aprovado, CFG.S.agendado, CFG.S.publicado].includes(s.status)).length
                    const comCliente = monthPosts.filter(s => s.status === CFG.S.aguardandoAprovacao).length
                    const ajuste     = monthPosts.filter(s => s.status === CFG.S.ajuste).length
                    const producao   = monthPosts.length - pronto - comCliente - ajuste
                    const segs = [
                      { n: pronto,     color: 'var(--ds-success-accent)', label: pl(pronto, 'aprovado', 'aprovados') },
                      { n: comCliente, color: 'var(--ds-info-accent)',    label: 'com cliente' },
                      { n: producao,   color: 'var(--ds-warn-accent)',    label: 'em produção' },
                      { n: ajuste,     color: 'var(--color-accent)',      label: pl(ajuste, 'ajuste', 'ajustes') },
                    ].filter(s => s.n > 0)
                    // Mês que já passou fica marcado: é a informação que o
                    // painel escondia antes, e a que muda a decisão de cobrar.
                    const atrasado = gy < year || (gy === year && gm < month)
                    const soAjuste = pending.every(s => s.status === CFG.S.ajuste)
                    return (
                      <button key={`${cid}:${gm}:${gy}`}
                        onClick={() => router.push(`${linkCliente(cid)?.('cronograma')}/${gy}-${String(gm).padStart(2, '0')}`)}
                        className="w-full text-left rounded-2xl border border-[var(--color-border)] bg-[var(--color-bg-card)] p-4 hover:border-[var(--color-border-hover)] hover:shadow-card transition-all">
                        <div className="flex items-center gap-3">
                          <ClientAvatar clientId={cid} size={40} />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-1.5 min-w-0">
                              <p className="text-sm font-semibold text-[var(--color-text-primary)] truncate">{client?.name}</p>
                              <span className="text-[10px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded flex-shrink-0"
                                style={atrasado
                                  ? { background: 'var(--ds-warn-bg)', color: 'var(--ds-warn-text)' }
                                  : { background: 'var(--color-bg-subtle)', color: 'var(--color-text-muted)' }}>
                                {MONTHS[gm - 1].slice(0, 3)}{gy !== year ? `/${String(gy).slice(2)}` : ''}
                              </span>
                            </div>
                            <p className="text-xs text-[var(--color-text-muted)] truncate">
                              {pendingCount} {soAjuste
                                ? pl(pendingCount, 'post em ajuste', 'posts em ajuste')
                                : `${pl(pendingCount, 'post esperando', 'posts esperando')} resposta`}
                            </p>
                          </div>
                          <ChevronRight size={15} className="text-[var(--color-text-faint)] flex-shrink-0" />
                        </div>
                        {monthPosts.length > 0 && (
                          <>
                            <div className="flex h-1.5 rounded-full bg-[var(--color-bg-subtle)] mt-3 overflow-hidden">
                              {segs.map((s, i) => <div key={i} style={{ width: `${(s.n / monthPosts.length) * 100}%`, background: s.color }} />)}
                            </div>
                            <div className="flex items-center gap-x-3 gap-y-1 mt-2 flex-wrap">
                              {segs.map((s, i) => (
                                <span key={i} className="flex items-center gap-1.5 text-[11px] text-[var(--color-text-muted)]">
                                  <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: s.color }} />
                                  {s.n} {s.label}
                                </span>
                              ))}
                            </div>
                          </>
                        )}
                      </button>
                    )
                  })}
                  {pendingApprovalByClient.length > 4 && (
                    <button onClick={() => router.push('/dashboard/aprovacao')} className="w-full text-center text-xs font-semibold text-[var(--color-accent)] hover:underline py-1">
                      Ver aprovações →
                    </button>
                  )}
                </>
              )}
            </SectionCard>

            {/* Meses que não fecharam — widget, não painel.
                Aqui embaixo de "Aguardando aprovação" porque é vizinho de
                assunto: os dois são coisa parada esperando decisão. Só o
                NÚMERO, porque decidir isso exige ver a arte, e arte não cabe
                no Início — cabe na página. */}
            {mesesEmAberto.length > 0 && (
              <button onClick={() => router.push('/dashboard/fechar-mes')}
                className="w-full flex items-center gap-3 px-4 py-3 rounded-2xl border border-[var(--color-border)] bg-[var(--color-bg-card)] hover:border-[var(--color-border-hover)] transition-colors text-left">
                <CalendarClock size={16} className="flex-shrink-0" style={{ color: 'var(--ds-caution-text, #b45309)' }} />
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-semibold text-[var(--color-text-primary)]">
                    {mesesEmAberto.reduce((n, m) => n + m.posts.length, 0)} posts ficaram para trás
                  </p>
                  <p className="text-[11px] text-[var(--color-text-muted)]">
                    em {mesesEmAberto.length} {pl(mesesEmAberto.length, 'mês que não fechou', 'meses que não fecharam')}
                  </p>
                </div>
                <span className="text-[11px] font-semibold text-[var(--color-accent)] flex-shrink-0">Ver</span>
              </button>
            )}

          </div>
        </div>

        {/* ── Visão geral do mês ──────────────────────────────────────────── */}
        <Card padded>
          <div className="flex items-center justify-between mb-6 gap-3 flex-wrap">
            <h2 className="text-lg font-bold text-[var(--color-text-primary)] tracking-tight">Visão geral do mês</h2>
            <div className="flex items-center gap-2">
              <div className="relative">
                <select
                  value={`${ovYear}-${ovMonth}`}
                  onChange={e => { const [y, m] = e.target.value.split('-').map(Number); setOvYear(y); setOvMonth(m) }}
                  className="appearance-none cursor-pointer text-xs font-medium text-[var(--color-text-secondary)] border border-[var(--color-border)] rounded-lg pl-3 pr-7 py-1.5 bg-[var(--color-bg-card)] outline-none hover:border-[var(--color-border-hover)] transition-colors"
                >
                  {monthOptions.map(o => <option key={`${o.y}-${o.m}`} value={`${o.y}-${o.m}`}>{o.label}</option>)}
                </select>
                <ChevronDown size={13} className="absolute right-2 top-1/2 -translate-y-1/2 text-[var(--color-text-muted)] pointer-events-none" />
              </div>
            </div>
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            {/* Donut + legenda */}
            {/* No celular o donut vai pra cima e a legenda vira 2 colunas
                embaixo: lado a lado, os 10 status espremiam a legenda a ponto
                de "Em produção" e "Revisão interna" quebrarem em duas linhas
                cada, desalinhando números e porcentagens. */}
            <div className="flex flex-col items-center gap-5 sm:flex-row sm:items-center sm:gap-6">
              <DonutChart segments={donutSegments} size={150} thickness={16}>
                <span className="text-[10px] text-[var(--color-text-muted)]">Total de posts</span>
                <span className="text-3xl font-bold text-[var(--color-text-primary)] leading-tight">{ovTotal}</span>
                <span className="text-[10px] text-[var(--color-text-muted)]">posts</span>
              </DonutChart>
              <div className="w-full sm:flex-1 grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-1 sm:gap-y-2.5">
                {legend.map(l => (
                  <div key={l.label} className="flex items-center gap-2 sm:gap-2.5 min-w-0">
                    <span className="w-2 h-2 sm:w-2.5 sm:h-2.5 rounded-full flex-shrink-0" style={{ background: TONE_FG[l.tone] }} />
                    <span className="flex-1 min-w-0 truncate text-xs sm:text-sm text-[var(--color-text-secondary)]">{l.label}</span>
                    <span className="text-xs sm:text-sm font-semibold text-[var(--color-text-primary)] tabular-nums">{l.value}</span>
                    <span className="text-[10px] sm:text-xs text-[var(--color-text-muted)] w-8 sm:w-9 text-right tabular-nums">{ovTotal > 0 ? Math.round((l.value / ovTotal) * 100) : 0}%</span>
                  </div>
                ))}
                {ovNotOk > 0 && (
                  <div className="col-span-2 sm:col-span-1 flex items-center gap-2 pt-2.5 mt-1 border-t border-[var(--color-border)]">
                    <AlertTriangle size={13} style={{ color: 'var(--ds-error-accent)' }} className="flex-shrink-0" />
                    <span className="text-xs font-medium" style={{ color: 'var(--ds-error-text)' }}>
                      {ovNotOk} {pl(ovNotOk, 'post precisa', 'posts precisam')} de ajuste
                    </span>
                  </div>
                )}
              </div>
            </div>
            {/* Evolução */}
            <div>
              <p className="text-sm font-semibold text-[var(--color-text-primary)]">Evolução de posts</p>
              <p className="text-xs text-[var(--color-text-muted)] mb-4">Criados em {MONTHS[ovMonth - 1]}</p>
              <LineChart data={evolution} />
            </div>
          </div>
        </Card>

      </div>
    </div>
  )
}
