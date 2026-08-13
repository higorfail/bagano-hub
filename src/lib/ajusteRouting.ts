/**
 * Quem é dono de um pedido de alteração do cliente.
 *
 * Até agora o ajuste só aparecia no "Para você" de quem já estava marcado no
 * card — e quando não havia ninguém marcado, ele não aparecia pra ninguém. Foi
 * o que aconteceu com dois posts da Criativa Padaria: cliente esperando
 * resposta, e o pedido invisível no hub inteiro.
 *
 * O hub já sabia a quem mandar, só não estava usando: `client_team.funcao`
 * guarda `videos` (edição), `posts` (design), `social` (legenda/agendamento),
 * `acompanha` e `estrategia` por cliente. Então o destino sai do tipo do post
 * cruzado com o time daquele cliente, sem ninguém precisar marcar nada.
 */

/** O que o cliente pediu pra mudar. `null` = ainda não classificado. */
export type AjusteAlvo = 'arte' | 'legenda' | 'ambos' | 'outro' | null

export const AJUSTE_ALVOS: AjusteAlvo[] = ['arte', 'legenda', 'ambos', 'outro']

export const ALVO_LABEL: Record<string, string> = {
  arte: 'arte', legenda: 'legenda', ambos: 'arte e legenda', outro: 'outro tema',
}

/** Time de um cliente indexado por função: { posts: [id], videos: [id], ... } */
export type TimeDoCliente = Record<string, string[]>

/**
 * Reels é edição; carrossel, post, story e carrossel/stories são design. É a
 * divisão que a Bagano já usa na prática.
 */
export function funcaoDaArte(postType?: string | null) {
  return postType === 'reels' ? 'videos' : 'posts'
}

export function funcoesDoAjuste(postType: string | null | undefined, alvo: AjusteAlvo): string[] {
  const arte = funcaoDaArte(postType)
  if (alvo === 'legenda') return ['social']
  if (alvo === 'ambos') return [arte, 'social']
  // "outro tema" é o post inteiro caindo — não é conserto de arte nem de
  // texto, é decisão de quem conduz o cliente.
  if (alvo === 'outro') return ['acompanha', 'estrategia']
  return [arte]
}

/**
 * Escada de responsáveis. Sem ela, cliente que não tem alguém naquela função
 * específica ficaria com o ajuste sem dono de novo — hoje 4 clientes ativos
 * estão sem design, 4 sem edição e 9 sem social. Cair pra quem acompanha é
 * melhor que cair no vazio.
 */
export function donosDoAjuste(
  time: TimeDoCliente | undefined,
  postType: string | null | undefined,
  alvo: AjusteAlvo,
): string[] {
  const t = time || {}
  const donos = new Set<string>()
  for (const f of funcoesDoAjuste(postType, alvo)) (t[f] || []).forEach(id => donos.add(id))
  if (donos.size === 0) (t.acompanha || []).forEach(id => donos.add(id))
  if (donos.size === 0) (t.estrategia || []).forEach(id => donos.add(id))
  // Último degrau: quem faz a peça. Cobre o "outro tema" num cliente sem
  // ninguém acompanhando — que é justamente o caso que deixava o pedido órfão.
  if (donos.size === 0) (t[funcaoDaArte(postType)] || []).forEach(id => donos.add(id))
  return [...donos]
}
