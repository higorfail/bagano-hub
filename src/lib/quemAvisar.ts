// Quem precisa saber — e, principalmente, quem NÃO precisa.
//
// Medido em 4 dias antes desta regra existir: Yasmim 61 avisos/dia, Franz 50,
// Higor 49, Gabi 44. Um a cada dez minutos de trabalho. A equipe começou a
// desligar o push, que é a única reação sã — e aí o hub perde também os avisos
// que importam.
//
// 59% eram gente digitando: 93 mudanças de data, 86 de legenda, 47 de etiqueta,
// 43 de título. E o aviso de atraso repetia todo dia: achei o mesmo post
// cobrando a mesma pessoa 15 vezes.
//
// A regra que substitui tudo isso: AVISAR QUANDO A BOLA PASSA PRA VOCÊ, não
// quando algo muda. É o que o Trello faz — estar num card não te inscreve em
// cada edição de campo.

/** Funções em client_team. Ver project_client_team_funcoes. */
export type Funcao = 'videos' | 'posts' | 'estrategia' | 'social' | 'acompanha' | string

export type Evento = {
  tabela: string
  action: string
  /** Qual campo mudou, quando `action === 'updated'`. */
  field?: string | null
  /** Status DEPOIS da mudança. */
  statusNovo?: string | null
  /** Quem está marcado no card. */
  atribuidos?: string[]
  /** Quem observa o card (o comportamento antigo usava só isto). */
  observadores?: string[]
  equipeDoCliente?: { member_id: string; funcao: Funcao }[]
  atorId?: string | null
}

export type Decisao = { ids: string[]; motivo: string }

const NINGUEM = (motivo: string): Decisao => ({ ids: [], motivo })

/** Quem tem uma função na equipe daquele cliente. */
function porFuncao(e: Evento, ...funcoes: Funcao[]): string[] {
  return (e.equipeDoCliente || [])
    .filter(t => funcoes.includes(t.funcao))
    .map(t => t.member_id)
}

/**
 * Quem faz a peça: reels é do editor, o resto é do designer.
 * Mantido frouxo de propósito — na dúvida avisa os dois, que é melhor que
 * silêncio em cima de trabalho que alguém precisa começar.
 */
const producao = (e: Evento) => porFuncao(e, 'videos', 'posts')

export function quemAvisar(e: Evento): Decisao {
  const social = () => porFuncao(e, 'social')
  const estrategia = () => porFuncao(e, 'estrategia')
  const marcados = e.atribuidos || []
  const observa = e.observadores || []

  // ── Edição de campo ───────────────────────────────────────────────────
  //
  // 41% do volume, e o mais inútil: ninguém precisa saber que alguém corrigiu
  // uma vírgula na legenda. Uma exceção só, e ela é real: mudar a DATA de um
  // post que já está aprovado ou agendado quebra a agenda de quem publica.
  if (e.action === 'updated') {
    const mexeuNaData = e.field === 'scheduled_date' || e.field === 'due_date'
    const jaProgramado = ['aprovado', 'agendado', 'publicado'].includes(e.statusNovo || '')
    if (mexeuNaData && jaProgramado) {
      return { ids: social(), motivo: 'data mudou num post já programado' }
    }
    return NINGUEM('edição de campo não avisa ninguém')
  }

  // ── A bola chegou em você ─────────────────────────────────────────────
  if (e.action === 'member_assigned') return { ids: marcados, motivo: 'foi marcado no card' }

  // Comentário é conversa, não mudança de estado — vai pra quem está na
  // conversa, e é dos poucos avisos que a equipe pediu pra manter.
  if (e.action === 'commented') return { ids: observa, motivo: 'comentário no card' }

  // ── Resposta do cliente ───────────────────────────────────────────────
  //
  // Quem cobra o cliente é a social (é ela que manda link e corre atrás). A
  // estrategista entra só quando a resposta é sobre a PAUTA, que é o trabalho
  // dela — não sobre a arte.
  if (e.action === 'client_approved' || e.action === 'client_rejected') {
    return { ids: [...social(), ...producao(e)], motivo: 'cliente respondeu sobre a arte' }
  }
  if (e.action === 'crono_approved' || e.action === 'crono_rejected') {
    return { ids: [...estrategia(), ...social()], motivo: 'cliente respondeu sobre a pauta' }
  }

  // ── Atraso ────────────────────────────────────────────────────────────
  // Só quem tem que fazer. A repetição diária é cortada no cron, não aqui.
  if (e.action === 'overdue') return { ids: marcados, motivo: 'prazo vencido de quem está marcado' }

  // ── Mudança de etapa: avisa quem RECEBE a bola ────────────────────────
  if (e.action === 'status_changed') {
    const s = e.statusNovo || ''
    if (e.tabela === 'schedules') {
      switch (s) {
        // Aprovado o crono, alguém precisa decidir captação ou produção.
        case 'captacao':   return { ids: estrategia(), motivo: 'precisa decidir captação ou produção' }
        case 'producao':   return { ids: [...marcados, ...producao(e)], motivo: 'material chegou, dá pra produzir' }
        case 'revisao_interna': return { ids: estrategia(), motivo: 'arte pronta pra revisão' }
        // Foi pro cliente: internamente ninguém age, mas quem cobra precisa saber.
        case 'aguardando_aprovacao': return { ids: social(), motivo: 'está com o cliente pra cobrar' }
        case 'ajuste':     return { ids: [...marcados, ...producao(e)], motivo: 'cliente pediu ajuste' }
        // Aprovado → é a social que agenda. Este é o momento em que a bola
        // realmente muda de mão.
        case 'aprovado':   return { ids: social(), motivo: 'aprovado, falta agendar' }
        case 'agendado':
        case 'publicado':  return NINGUEM('já resolvido, ninguém precisa agir')
        case 'cancelado':  return NINGUEM('descartado')
        default:           return NINGUEM('etapa sem dono seguinte')
      }
    }
    // Extras e materiais: a social entrega e cobra, então "feito" e "com o
    // cliente" são dela. Foi o Higor quem apontou: é a Gabi que passa material
    // pro Felipe e depois cobra o cliente de tudo.
    if (e.tabela === 'extras' || e.tabela === 'materials') {
      if (s === 'feito') return { ids: social(), motivo: 'pronto, a social entrega' }
      if (s === 'aguardando_aprovacao') return { ids: social(), motivo: 'está com o cliente pra cobrar' }
      return NINGUEM('etapa sem dono seguinte')
    }
    return NINGUEM('tabela sem regra de etapa')
  }

  // ── O resto ───────────────────────────────────────────────────────────
  // `created`, `finalized`, captação, agenda de criação: quem já observa.
  // Volume baixo e são eventos que alguém escolheu acompanhar.
  return { ids: observa, motivo: 'observadores do card' }
}
