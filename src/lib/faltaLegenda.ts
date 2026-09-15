// Este post vai chegar mudo no cliente?
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

/** Etapas em que a legenda já deveria existir. */
const DEPOIS_DA_REVISAO = new Set([
  'revisao_interna',
  'ajuste',
  'aguardando_aprovacao',
  'aprovado',
  'agendado',
])

export function faltaLegenda(post: { status?: string | null; legenda?: string | null }): boolean {
  if (!DEPOIS_DA_REVISAO.has(post.status || '')) return false
  return !(post.legenda || '').trim()
}
