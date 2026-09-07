import { temMaterial, contaComoFolego } from './postStages'

// Quanto conteúdo o cliente ainda tem em mãos, e até quando.
//
// A pergunta é "quando o conteúdo acaba", não "quanto já foi aprovado" — é ela
// que decide quando montar o próximo cronograma e quando marcar captação.
//
// As regras vieram da "Situação dos clientes" no painel, e ficam AQUI pra as
// duas telas não divergirem: um alerta que conta diferente do painel é pior que
// alerta nenhum, porque manda a equipe conferir e não encontrar nada.
//
//   - Só conta post que TEM material. Data é barata: marcar 10/set num post em
//     captação não cria conteúdo. Era assim que o Big Poke prometia "até
//     10/set" tendo um único post pronto pro dia 29/ago.
//   - Só post e carrossel. Story não conta — sai no mesmo dia e não sustenta
//     cronograma.
//   - Extra pronto conta, mesmo sem data: é conteúdo em mãos, encaixa num
//     buraco sem produzir nada novo.

export type PostFolego = { status?: string | null; post_type?: string | null; scheduled_date?: string | null }
export type ExtraFolego = { status?: string | null; type?: string | null; published_at?: string | null }

export type Folego = {
  /** Posts com material e data de hoje em diante. */
  restantes: number
  /** Última data com material marcada. */
  ultima: string | null
  /** Dias entre hoje e a última data. 0 quando não há data. */
  diasAte: number
  /** Extras prontos, que dão fôlego sem ter data. */
  extrasProntos: number
  /** Posts datados que ainda não têm material — cronograma existe, falta fazer. */
  semMaterialFuturo: number
  estado: 'ok' | 'curto' | 'fim' | 'sem-material' | 'sem-data'
}

/** Quando o fôlego é "curto": pouco conteúdo, ou pouco tempo. */
export const RESTANTES_CURTO = 2
export const DIAS_CURTO = 7

export function calcularFolego(posts: PostFolego[], extras: ExtraFolego[], hojeISO: string): Folego {
  const datas = posts
    .filter(p => temMaterial(p.status) && contaComoFolego(p.post_type))
    .map(p => p.scheduled_date).filter(Boolean).sort() as string[]

  const restantes = datas.filter(d => d >= hojeISO).length
  const ultima = datas.length ? datas[datas.length - 1] : null
  const diasAte = ultima
    ? Math.round((new Date(ultima + 'T12:00:00').getTime() - new Date(hojeISO + 'T12:00:00').getTime()) / 86400000)
    : 0

  const semMaterialFuturo = posts.filter(
    p => !temMaterial(p.status) && contaComoFolego(p.post_type)
      && p.scheduled_date && p.scheduled_date >= hojeISO).length

  // `feito` e "com o cliente" contam; `backlog` não (nada feito ainda) e `done`
  // também não, porque no uso real ele já saiu.
  const extrasProntos = extras.filter(
    e => ['feito', 'aguardando_aprovacao'].includes(e.status || '') && !e.published_at
      && contaComoFolego(e.type)).length

  // Sem data marcada não é "acabou" — é "ainda não foi programado". Tratar os
  // dois igual manda a equipe correr atrás do cronograma errado.
  const estado: Folego['estado'] =
    !datas.length ? (semMaterialFuturo > 0 ? 'sem-material' : 'sem-data')
    : restantes === 0 ? (semMaterialFuturo > 0 ? 'sem-material' : 'fim')
    : (restantes <= RESTANTES_CURTO || diasAte <= DIAS_CURTO) ? 'curto'
    : 'ok'

  return { restantes, ultima, diasAte, extrasProntos, semMaterialFuturo, estado }
}

/** Frase curta pro aviso. */
export function fraseFolego(nomeCliente: string, f: Folego): string {
  if (f.estado === 'fim') return `${nomeCliente} está sem post com material daqui pra frente.`
  if (f.estado === 'sem-material') return `${nomeCliente} tem ${f.semMaterialFuturo} post${f.semMaterialFuturo !== 1 ? 's' : ''} com data mas sem material.`
  if (f.estado === 'sem-data') return `${nomeCliente} não tem post datado — o cronograma ainda não foi montado.`
  const dias = f.diasAte <= 0 ? 'hoje' : f.diasAte === 1 ? 'amanhã' : `em ${f.diasAte} dias`
  const extras = f.extrasProntos ? ` (+${f.extrasProntos} extra${f.extrasProntos !== 1 ? 's' : ''} pronto${f.extrasProntos !== 1 ? 's' : ''})` : ''
  return `${nomeCliente} tem ${f.restantes} post${f.restantes !== 1 ? 's' : ''} até acabar, ${dias}${extras}.`
}
