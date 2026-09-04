'use client'

import { createClient } from './supabase'
import { logActivity } from './activity'
import { numerosNoDestino } from './numeroNoDestino'

// Fechar o mês de um cliente.
//
// NÃO confundir com "finalizar cronograma", que já existe e é outra coisa: ali
// a estrategista diz que a PAUTA está pronta pra ir ao cliente, e o ciclo
// COMEÇA — depois vem captação, produção, aprovação da arte. Finalizar é o
// primeiro passo do mês; fechar é o último, e nunca existiu.
//
// É essa ausência que deixou 58 posts parados em cronograma de mês passado,
// 29 deles de junho de um cliente só. Um mês nunca terminava; ele só parava de
// receber atenção, e o que sobrava seguia contando como trabalho aberto pra
// sempre.
//
// Um mês fecha quando cada post aberto tem um destino. Nunca automaticamente:
// post parado esperando o cliente não é lixo a varrer, é conversa sem resposta.
// Arquivar sozinho faria o hub dizer que está tudo em dia — mentira mais cara
// que a bagunça que ele mostra hoje.

/** Etapas em que o post ainda não terminou. */
export const ABERTO = [
  'estrategia', 'aguardando_aprovacao_crono', 'captacao', 'producao',
  'revisao_interna', 'aguardando_aprovacao', 'ajuste', 'aprovado', 'agendado',
]

export type PostAberto = {
  id: string
  title: string | null
  status: string
  post_number: number | null
  post_type: string | null
  // A prévia é o que faz decidir: post com arte pronta e post que nunca saiu
  // do papel são idênticos numa lista de texto, e são decisões opostas.
  drive_url?: string | null
  drive_folder_url?: string | null
}

/** O que fazer com um post que não terminou dentro do mês. */
export type Saida =
  /** Vai pro cronograma do mês em que se está trabalhando — segue vivo. */
  | 'mover'
  /** Saiu por fora do hub (stories antigo, publicação manual). */
  | 'publicado'
  /**
   * Não vai acontecer. Vira `cancelado`: some das telas de trabalho, da fila
   * de aprovação e do fôlego, mas a linha FICA — com os comentários, o
   * histórico e o que o cliente respondeu. Apagar levaria tudo junto, e o
   * motivo de um post ter morrido costuma valer mais que o post.
   */
  | 'descartar'
  /**
   * Não decidi. Fica exatamente como está e o mês NÃO fecha — este post volta
   * na lista. É uma saída honesta pra quando falta informação, e é diferente
   * de fingir que houve decisão.
   */
  | 'manter'

export async function postsAbertosDoMes(
  clientId: string, month: number, year: number,
): Promise<PostAberto[]> {
  const { data } = await createClient().from('schedules')
    .select('id, title, status, post_number, post_type, drive_url, drive_folder_url')
    .eq('client_id', clientId).eq('month', month).eq('year', year)
    .in('status', ABERTO)
    .order('post_number')
  return (data || []) as PostAberto[]
}

/**
 * Pra onde o post vai quando o mês fecha.
 *
 * NÃO é o mês seguinte literal. Fechando julho em setembro, "mês seguinte" é
 * agosto — que também já passou: o post sairia de um mês encalhado pra outro e
 * voltaria pra lista no mesmo instante. O destino útil é o mês em que se está
 * trabalhando.
 *
 * Fechando o mês passado, o seguinte JÁ É o corrente, e a regra não muda nada.
 */
export function destinoDoMover(month: number, year: number, hoje = new Date()) {
  const seguinte = month === 12 ? { month: 1, year: year + 1 } : { month: month + 1, year }
  const corrente = { month: hoje.getMonth() + 1, year: hoje.getFullYear() }
  const abs = (d: { month: number; year: number }) => d.year * 12 + d.month
  return abs(seguinte) >= abs(corrente) ? seguinte : corrente
}

/**
 * Aplica as decisões e devolve quantos foram por saída.
 *
 * Mover mexe em `month`/`year`, e NÃO na data de publicação: a data pode até
 * já estar certa (post de 2 de setembro montado no cronograma de agosto), e
 * apagá-la ou empurrá-la um mês seria inventar uma decisão que ninguém tomou.
 */
export async function aplicarFechamento(
  clientId: string,
  month: number,
  year: number,
  decisoes: Record<string, Saida>,
  ator?: { id?: string | null; name?: string | null },
): Promise<{ movidos: number; publicados: number; descartados: number; mantidos: number; erro?: string }> {
  const supabase = createClient()
  const prox = destinoDoMover(month, year)
  const ids = (alvo: Saida) => Object.entries(decisoes).filter(([, s]) => s === alvo).map(([id]) => id)
  const mover = ids('mover')
  const pub = ids('publicado')
  const descartar = ids('descartar')
  const manter = Object.values(decisoes).filter(s => s === 'manter').length

  if (mover.length) {
    // Cada um ganha número novo no mês de destino. Sem isso a trava
    // `schedules_numero_unico_no_mes` derruba o fechamento inteiro assim que
    // um dos números já existir lá — e como o update é em lote, basta UM
    // colidir pra nada ser movido.
    const numeros = await numerosNoDestino(supabase, clientId, prox.month, prox.year, mover.length)
    for (let i = 0; i < mover.length; i++) {
      const { error } = await supabase.from('schedules')
        .update({ month: prox.month, year: prox.year, post_number: numeros[i] }).eq('id', mover[i])
      if (error) return { movidos: i, publicados: 0, descartados: 0, mantidos: manter, erro: error.message }
    }
  }
  if (pub.length) {
    const { error } = await supabase.from('schedules')
      .update({ status: 'publicado' }).in('id', pub)
    if (error) return { movidos: mover.length, publicados: 0, descartados: 0, mantidos: manter, erro: error.message }
  }
  if (descartar.length) {
    const { error } = await supabase.from('schedules')
      // Só o status. `approval_status` e os comentários ficam: é neles que
      // está escrito POR QUE o post morreu, e é isso que alguém vai procurar
      // daqui a três meses.
      .update({ status: 'cancelado' }).in('id', descartar)
    if (error) return { movidos: mover.length, publicados: pub.length, descartados: 0, mantidos: manter, erro: error.message }
  }

  await logActivity({
    tableName: 'cronograma_status', recordId: clientId, clientId,
    // `closed` e não `finalized`: finalizar é o começo do ciclo (pauta pronta
    // pro cliente) e já usa aquele nome. Compartilhar a ação misturaria as
    // duas pontas do mês no mesmo registro do histórico.
    action: 'closed', actorName: ator?.name, actorId: ator?.id,
    description: `${ator?.name || 'Alguém'} fechou o cronograma de ${String(month).padStart(2, '0')}/${year}`
      + (mover.length ? ` · ${mover.length} passaram pro mês seguinte` : '')
      + (pub.length ? ` · ${pub.length} marcados como publicados` : '')
      + (descartar.length ? ` · ${descartar.length} descartados` : ''),
  })

  return { movidos: mover.length, publicados: pub.length, descartados: descartar.length, mantidos: manter }
}
