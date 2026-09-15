// Este post (ou extra) vai chegar mudo no cliente?
//
// O link final mostra SÓ a legenda — o `copy` é campo interno e às vezes guarda
// roteiro de gravação, com direção de câmera. Então post sem legenda chega no
// cliente com a arte e nenhum texto.
//
// A regra morava dentro do card pequeno e olhava só "aguardando aprovação", o
// que soava certo ("antes disso a legenda ainda está sendo escrita") e na
// prática avisava tarde demais: quando o post está aguardando aprovação, o link
// já foi. Medido em 15/09:
//
//   produção              69 sem legenda   (normal: a legenda vem depois)
//   revisão interna       16               ← o portão da Yasmim
//   aguardando aprovação   2               ← só estes apareciam
//   aprovado               3               ← estes vão ao ar mudos
//
// A regra atual pegava 2 de 21. O aviso passou a valer DA REVISÃO INTERNA EM
// DIANTE, que é onde alguém confere o post antes de soltar — e segue valendo
// depois, porque post aprovado sem legenda é o caso mais caro de todos.
//
// Produção fica de fora de propósito: lá são 69, a legenda realmente vem
// depois, e aviso que aparece em tudo deixa de ser aviso.

/** Post: da revisão interna em diante. */
const ETAPAS_POST = new Set([
  'revisao_interna',
  'ajuste',
  'aguardando_aprovacao',
  'aprovado',
  'agendado',
])

/**
 * Extra: de "feito" em diante.
 *
 * O extra não tem revisão interna — o fluxo é backlog → feito → com o cliente.
 * "Feito" é o portão equivalente: quem produziu terminou e a social vai
 * entregar. `backlog` fica de fora pelo mesmo motivo que `producao` fica nos
 * posts: lá a legenda ainda vem.
 *
 * Que extra tem legenda não é suposição: os 33 já criados são todos peça de
 * Instagram (post, story, carrossel, reels) e 13 deles têm o campo preenchido.
 */
const ETAPAS_EXTRA = new Set([
  'feito',
  'ajuste',
  'aguardando_aprovacao',
])

export function faltaLegenda(
  item: { status?: string | null; legenda?: string | null },
  tipo: 'post' | 'extra' = 'post',
): boolean {
  const etapas = tipo === 'extra' ? ETAPAS_EXTRA : ETAPAS_POST
  if (!etapas.has(item.status || '')) return false
  return !(item.legenda || '').trim()
}
