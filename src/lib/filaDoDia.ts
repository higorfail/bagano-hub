// A fila do dia de uma pessoa: o que é de hoje, o que atrasou, o que ainda
// nem tem dia.
//
// O "Para você" era "tudo que já te marcaram e não está pronto". Sem recorte
// de dia nenhum. Pro Higor isso dava 24 itens — o mês inteiro de uma vez — e a
// tela ainda carimbava "atrasado" comparando com a data de PUBLICAÇÃO, que não
// é prazo de quem cria: um reel que vai ao ar dia 25 não está atrasado hoje.
// O efeito era ler dívida onde não tinha.
//
// A agenda de criação é que sabe o dia: ela marca CLIENTE por dia, com uma nota
// ("2 marcados", "Cronograma set"). Cruzando com o que está marcado pra pessoa,
// 24 viram 8 — e o único atraso real aparece: um cliente cujo dia passou e o
// trabalho continua aberto.
//
// Só que metade da equipe não está na agenda. Medido em 10/09/2026: Franz tem
// 30 dias marcados e o Higor 23; Gabis, Otávio, Felipe, Laura e Gee têm ZERO —
// e a Gabis é quem carrega mais trabalho no hub (63 posts). Um "Hoje" que só
// funciona pra quem tem agenda deixaria justamente a pessoa mais cheia com a
// tela vazia. Por isso "agora" tem duas fontes, escolhidas pelo dado que a
// pessoa realmente tem, e a tela diz qual das duas está usando: com agenda é
// PLANO ("hoje é NI HAO e Zebuino"); sem agenda é RANKING por proximidade
// ("mais urgente"), que é honesto sobre não saber o dia.

export type Balde =
  /** Cliente pediu ajuste. Fura a fila em qualquer dia. */
  | 'ajuste'
  /** Passou: a data foi, ou o dia combinado na agenda foi. */
  | 'passou'
  /** O de agora: hoje pela agenda, ou o mais próximo pra quem não tem agenda. */
  | 'agora'
  /** Tem dia, mas não é agora. */
  | 'proximos'
  /** Nem agenda nem data. Não é dívida — é buraco de planejamento. */
  | 'semDia'

export type ItemDaFila = {
  clientId: string | null
  ajuste: boolean
  /** Publicação (post) ou entrega (extra/material/tarefa). Null = sem data. */
  data: string | null
  /**
   * A etapa é de repasse: alguém passou a bola e está esperando. Ver
   * `esperandoVoce` em donoDaEtapa.ts.
   */
  esperandoVoce?: boolean
}

export type ContextoDaFila = {
  /** 'YYYY-MM-DD' */
  hoje: string
  /** A pessoa aparece na agenda de criação? Decide o significado de "agora". */
  temAgenda: boolean
  /** Clientes que a agenda marca pra ela HOJE. */
  clientesHoje: Set<string>
  /** Clientes dela cujo dia na agenda já passou. */
  clientesPassados: Set<string>
  /** Clientes dela com dia marcado ainda por vir. */
  clientesFuturos: Set<string>
  /** Sem agenda: quantos dias à frente ainda contam como "agora". */
  janelaDias: number
}

/**
 * Soma dias a uma data 'YYYY-MM-DD'. Aritmética toda em UTC de propósito.
 *
 * `new Date('2026-09-10T12:00:00')` lê como hora LOCAL e `toISOString()`
 * devolve UTC — num fuso adiantado o bastante isso troca o dia, e o hub
 * passaria a olhar a agenda de ontem sem avisar ninguém. Aqui não há hora
 * envolvida em momento nenhum, então não há o que a mudança de fuso torça
 * (e o dia UTC tem 86400000 ms exatos, sem horário de verão no meio).
 */
export function somaDias(data: string, dias: number): string {
  const [ano, mes, dia] = data.split('-').map(Number)
  return new Date(Date.UTC(ano, mes - 1, dia) + dias * 86400000)
    .toISOString().slice(0, 10)
}

/** Uma linha da agenda de criação, já com a data resolvida. */
export type DiaDaAgenda = { dia: string; clientId: string | null }

/**
 * Quantos dias em torno de hoje contam como "esta pessoa trabalha por agenda".
 *
 * Existir UMA linha de agenda não significa nada. A Yasmim tinha exatamente uma,
 * de 20/08 — um dia avulso de três semanas antes —, e isso bastava pra jogá-la
 * no modo plano: tudo do cliente daquele dia virava "passou do dia" e o resto
 * virava "sem dia marcado". O card dela dizia "7 passaram do dia" com ZERO itens
 * de data vencida. Era o mesmo "parece que estou sempre atrasada" que a fila
 * tinha ido consertar, reaparecendo por outra porta.
 *
 * A janela também dá VALIDADE ao atraso: um dia combinado de três semanas atrás
 * não pode marcar trabalho como atrasado pra sempre.
 */
export const JANELA_DA_AGENDA = 7

/** Monta o contexto a partir das linhas cruas da agenda desta pessoa. */
export function contextoDaAgenda(
  dias: DiaDaAgenda[],
  hoje: string,
  janelaDias: number,
): ContextoDaFila {
  const inicio = somaDias(hoje, -JANELA_DA_AGENDA)
  const fim = somaDias(hoje, JANELA_DA_AGENDA)
  const perto = dias.filter(d => !!d.clientId && d.dia >= inicio && d.dia <= fim)

  const clientesHoje = new Set<string>()
  const clientesPassados = new Set<string>()
  const clientesFuturos = new Set<string>()
  perto.forEach(d => {
    if (d.dia === hoje) clientesHoje.add(d.clientId!)
    else if (d.dia < hoje) clientesPassados.add(d.clientId!)
    else clientesFuturos.add(d.clientId!)
  })
  // Cliente que tem dia HOJE não é atraso por um dia anterior — hoje é a
  // combinação que vale.
  clientesHoje.forEach(c => clientesPassados.delete(c))

  return {
    hoje,
    temAgenda: perto.length > 0,
    clientesHoje, clientesPassados, clientesFuturos,
    janelaDias,
  }
}

export function baldeDoItem(item: ItemDaFila, ctx: ContextoDaFila): Balde {
  // Pedido do cliente fura a fila. Não importa de que dia é: alguém está
  // esperando resposta do outro lado.
  if (item.ajuste) return 'ajuste'

  // Data que JÁ passou é atraso de verdade, com agenda ou sem: o post devia
  // estar no ar, o material devia estar entregue. Isto vale pra todo mundo, e
  // é a única leitura de `data` que significa prazo.
  if (item.data && item.data < ctx.hoje) return 'passou'

  // Repasse é AGORA, qualquer que seja a data de publicação.
  //
  // Um post em revisão interna marcado pra você está parado na SUA mão — o
  // time entregou e está esperando. Publicar dia 30 não faz a revisão ser dia
  // 30. Sem esta linha, 6 dos 10 posts em revisão da Yasmim caíam em "outros
  // dias" e sumiam atrás de um link fechado.
  if (item.esperandoVoce) return 'agora'

  if (ctx.temAgenda) {
    // Sem cliente não há como cruzar com a agenda.
    if (!item.clientId) return 'semDia'
    // O dia combinado passou e a coisa continua aberta. Este é o atraso que a
    // pessoa realmente tem, e ele aparece MESMO com a publicação lá na frente
    // — é justamente o caso que a data de publicação escondia.
    if (ctx.clientesPassados.has(item.clientId)) return 'passou'
    if (ctx.clientesHoje.has(item.clientId)) return 'agora'
    if (ctx.clientesFuturos.has(item.clientId)) return 'proximos'
    return 'semDia'
  }

  // Sem agenda: "agora" é proximidade. Não é o plano do dia, e a tela chama de
  // "mais urgente" em vez de "hoje" pra não prometer o que não sabe.
  if (!item.data) return 'semDia'
  return item.data <= somaDias(ctx.hoje, ctx.janelaDias) ? 'agora' : 'proximos'
}

/** Junta nomes em português: "A", "A e B", "A, B e C". */
export function juntar(nomes: string[]): string {
  if (nomes.length === 0) return ''
  if (nomes.length === 1) return nomes[0]
  return nomes.slice(0, -1).join(', ') + ' e ' + nomes[nomes.length - 1]
}

function plural(n: number, um: string, varios: string) {
  return `${n} ${n === 1 ? um : varios}`
}

export type ClienteDeHoje = { nome: string; nota: string | null }

/**
 * A frase do "Para você" — a continuação de "Para você, Fulano: ".
 *
 * Era gerada por IA com 20 itens soltos e sem noção de dia, então o melhor que
 * ela conseguia era listar: "um carrossel da Bagano MKT, mais dezenas de reels
 * de clientes como Number Seven, Zebuino, NI HAO... sem tarefas pendentes
 * definidas". Com a agenda em mãos o texto vira dado estruturado — cliente,
 * nota e contagem — e aí modelo nenhum acrescenta: sai igual toda vez, de
 * graça, e sem depender da cota diária que já estourou uma vez.
 */
export function fraseDaFila(e: {
  temAgenda: boolean
  clientesDeHoje: ClienteDeHoje[]
  contagem: Record<Balde, number>
  janelaDias: number
}): string {
  const partes: string[] = []

  if (e.contagem.ajuste > 0) {
    partes.push(`${plural(e.contagem.ajuste, 'ajuste pedido', 'ajustes pedidos')} pelo cliente`)
  }

  if (e.temAgenda) {
    if (e.clientesDeHoje.length > 0) {
      // A nota da agenda é o que diz o TRABALHO ("2 marcados", "Cronograma
      // set"). É a informação mais útil da frase inteira e vinha se perdendo.
      const comNota = e.clientesDeHoje.map(c =>
        c.nota?.trim() ? `${c.nome} (${c.nota.trim().toLowerCase()})` : c.nome)
      const quantos = e.contagem.agora > 0 ? `, ${plural(e.contagem.agora, 'item', 'itens')}` : ''
      partes.push(`hoje é ${juntar(comNota)}${quantos}`)
    } else if (e.contagem.agora === 0) {
      partes.push('nada marcado pra hoje na agenda')
    }
  } else if (e.contagem.agora > 0) {
    partes.push(`${plural(e.contagem.agora, 'item', 'itens')} pra sair nos próximos ${e.janelaDias} dias`)
  }

  if (e.contagem.passou > 0) {
    partes.push(`${plural(e.contagem.passou, 'passou', 'passaram')} do dia`)
  }

  if (partes.length === 0) {
    // Chega aqui quem só tem coisa lá pra frente ou sem dia — dizer "nada" seria
    // mentira, e dizer o número seco não ajudaria a decidir nada.
    const sobra = e.contagem.proximos + e.contagem.semDia
    if (sobra === 0) return ''
    return `nada pra hoje; ${plural(sobra, 'item', 'itens')} mais pra frente.`
  }

  const frase = partes.join('. ')
  return frase.charAt(0).toUpperCase() + frase.slice(1) + '.'
}

/**
 * O convite pra adiantar, quando o dia está limpo.
 *
 * Só aparece com a fila de hoje REALMENTE vazia — sem ajuste e sem atraso.
 * Antes disso seria empurrar trabalho novo por cima de trabalho parado.
 */
export function sugestaoDeAdiantar(e: {
  contagem: Record<Balde, number>
  /** O próximo dia com trabalho: os clientes e quantos itens. */
  proximo: { quando: string; clientes: string[]; itens: number } | null
}): string | null {
  if (e.contagem.ajuste > 0 || e.contagem.passou > 0 || e.contagem.agora > 0) return null
  if (!e.proximo || e.proximo.itens === 0) return null
  const quem = e.proximo.clientes.length > 0 ? ` — ${juntar(e.proximo.clientes)}` : ''
  return `Dia limpo. Quer adiantar ${e.proximo.quando}${quem}? ${plural(e.proximo.itens, 'item', 'itens')}.`
}
