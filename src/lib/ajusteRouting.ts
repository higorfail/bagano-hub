/**
 * Quem é dono de um pedido de alteração do cliente.
 *
 * Até agora o ajuste só aparecia no "Para você" de quem já estava marcado no
 * card — e quando não havia ninguém marcado, ele não aparecia pra ninguém. Foi
 * o que aconteceu com dois posts da Criativa Padaria: cliente esperando
 * resposta, e o pedido invisível no hub inteiro.
 *
 * O hub já sabia a quem mandar, só não estava usando: `client_team.funcao`
 * guarda, por cliente, quem é `videos` (Editor na tela), `posts` (Designer),
 * `estrategia`, `social` (Social Media) e `acompanha`.
 *
 * A regra é a divisão de trabalho da Bagano:
 *   reels                              → Editor
 *   post, story, carrossel             → Designer
 *   e se o pedido mexe na legenda      → Estratégia entra JUNTO
 *
 * Social Media não entra: quem posta não escreve legenda. Foi erro meu na
 * primeira versão, mandar ajuste de legenda pra lá.
 */

/**
 * O que o cliente pediu. Só duas saídas importam pro destino: se o pedido toca
 * no texto, a Estratégia entra junto; se não, é conserto de peça e basta quem a
 * produziu. `null` = ainda não classificado, trata como arte.
 */
export type AjusteAlvo = 'arte' | 'legenda' | null

export const ALVO_LABEL: Record<string, string> = {
  arte: 'arte', legenda: 'legenda',
}

/** Time de um cliente indexado por função: { posts: [id], videos: [id], ... } */
export type TimeDoCliente = Record<string, string[]>

/** Reels é edição; post, story, carrossel e carrossel/stories são design. */
export function funcaoDaArte(postType?: string | null) {
  return postType === 'reels' ? 'videos' : 'posts'
}

/**
 * Escada de responsáveis. Sem ela, cliente que não tem alguém naquela função
 * ficaria com o ajuste sem dono de novo — hoje 4 clientes ativos estão sem
 * Designer e 4 sem Editor. Cair pra quem acompanha é melhor que cair no vazio.
 */
export function donosDoAjuste(
  time: TimeDoCliente | undefined,
  postType: string | null | undefined,
  alvo: AjusteAlvo,
): string[] {
  const t = time || {}
  const donos = new Set<string>()

  // Quem produziu a peça, sempre — inclusive quando o pedido é de legenda: a
  // alteração continua sendo naquele post, e quem o fez precisa saber.
  ;(t[funcaoDaArte(postType)] || []).forEach(id => donos.add(id))
  if (donos.size === 0) (t.acompanha || []).forEach(id => donos.add(id))
  if (donos.size === 0) (t.estrategia || []).forEach(id => donos.add(id))

  // Mexeu no texto, a Estratégia entra junto — é quem escreve.
  if (alvo === 'legenda') (t.estrategia || []).forEach(id => donos.add(id))

  return [...donos]
}
