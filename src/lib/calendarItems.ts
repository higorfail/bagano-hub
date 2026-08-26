// Um item de calendário, seja ele o que for.
//
// O Calendário guardava cinco listas separadas — posts, captações, criação,
// eventos do hub, eventos do Google — e cada trecho da tela as remisturava à
// mão. Deu pra viver assim enquanto existia só a visão de mês, onde tudo é
// "coisa que cai num dia". Não dá pra viver assim com semana e dia, onde o que
// tem hora ocupa faixa e o que não tem fica na tira de cima: cada visão teria
// que reescrever a mesma mistura, e discordar da vizinha.
//
// Aqui a mistura acontece uma vez e as visões só desenham.

export type CalKind = 'post' | 'captacao' | 'criacao' | 'evento' | 'google' | 'bloqueio'

export type CalItem = {
  /** Único na tela toda — `kind` + id, porque ids se repetem entre tabelas. */
  key: string
  kind: CalKind
  id: string
  title: string
  /** YYYY-MM-DD, sempre local. */
  date: string
  /** HH:MM, ou null pra quem não tem hora (post, criação, evento de dia inteiro). */
  startTime: string | null
  endTime: string | null
  color: string
  clientId: string | null
  clientName: string | null
  /** Endereço externo — só o que é do Google tem. */
  href: string | null
  /** O registro original, pra tela abrir o que precisa abrir. */
  data: any
}

/** Tem hora marcada? É o que decide entre a faixa horária e a tira de dia inteiro. */
export const temHora = (i: CalItem) => !!i.startTime

/** Minutos desde a meia-noite — como as visões posicionam o bloco na faixa. */
export function minutos(hhmm: string | null): number {
  if (!hhmm) return 0
  const [h, m] = hhmm.split(':').map(Number)
  return h * 60 + (m || 0)
}

/**
 * Fim garantido, pra um bloco nunca ter altura zero.
 *
 * Evento de hora marcada sem fim existe (captação antiga sem duração, evento do
 * Google criado como "às 15h"), e sem isto ele viraria uma linha de 0px —
 * invisível justamente na visão que existe pra mostrar horário.
 */
export function fimEfetivo(i: CalItem, minimoMin = 30): number {
  const ini = minutos(i.startTime)
  const fim = i.endTime ? minutos(i.endTime) : ini + minimoMin
  return Math.max(fim, ini + minimoMin)
}

/** Ordem dentro de um dia: quem tem hora primeiro, em ordem; sem hora depois. */
export function ordenarDoDia(a: CalItem, b: CalItem) {
  if (temHora(a) !== temHora(b)) return temHora(a) ? -1 : 1
  if (temHora(a) && temHora(b)) return minutos(a.startTime) - minutos(b.startTime)
  return a.title.localeCompare(b.title)
}

/**
 * Agrupa itens que se sobrepõem no tempo, pra dividirem a largura da coluna.
 *
 * Sem isto, duas captações no mesmo horário ficam uma EM CIMA da outra e a de
 * baixo some — que é exatamente o caso que a equipe tem (a Gee está em quase
 * todas as captações). Devolve, pra cada item, em qual coluna ele fica e de
 * quantas.
 */
export function repartirColunas(itens: CalItem[]): Map<string, { col: number; de: number }> {
  const out = new Map<string, { col: number; de: number }>()
  const comHora = itens.filter(temHora).sort((a, b) => minutos(a.startTime) - minutos(b.startTime))

  let grupo: CalItem[] = []
  let fimDoGrupo = -1

  const fechar = () => {
    if (!grupo.length) return
    // Dentro do grupo, cada item vai pra primeira coluna livre no seu horário.
    const colunas: number[] = [] // fim ocupado de cada coluna
    const posicao = new Map<string, number>()
    for (const it of grupo) {
      const ini = minutos(it.startTime)
      let c = colunas.findIndex(f => f <= ini)
      if (c === -1) { c = colunas.length; colunas.push(0) }
      colunas[c] = fimEfetivo(it)
      posicao.set(it.key, c)
    }
    for (const it of grupo) out.set(it.key, { col: posicao.get(it.key)!, de: colunas.length })
    grupo = []
    fimDoGrupo = -1
  }

  for (const it of comHora) {
    if (grupo.length && minutos(it.startTime) >= fimDoGrupo) fechar()
    grupo.push(it)
    fimDoGrupo = Math.max(fimDoGrupo, fimEfetivo(it))
  }
  fechar()
  return out
}

/** Datas de uma semana a partir de segunda. */
export function diasDaSemana(inicio: Date): Date[] {
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(inicio)
    d.setDate(inicio.getDate() + i)
    return d
  })
}

/** Segunda-feira da semana em que a data cai. */
export function segundaDe(d: Date): Date {
  const out = new Date(d)
  // getDay(): 0 = domingo. Domingo pertence à semana que começou na segunda
  // anterior, e não à seguinte — sem o caso especial, todo domingo pula a
  // semana inteira pra frente.
  const diff = out.getDay() === 0 ? -6 : 1 - out.getDay()
  out.setDate(out.getDate() + diff)
  out.setHours(0, 0, 0, 0)
  return out
}
