// Em que etapas um post já está PRONTO do ponto de vista da agência.
//
// `agendado` mora aqui, e é justamente o que sempre escapa: é a etapa MAIS
// adiantada antes de ir ao ar — o cliente já aprovou e a publicação já está
// programada. Deixado de fora, o post mais adiantado da campanha conta como
// não feito, e a barra ANDA PRA TRÁS no momento em que alguém agenda. Foi
// exatamente o caso do "Pais" do Fiorellato: agendado, e a barra em 0/1.
//
// Existe como lugar único porque a mesma lista já foi reescrita à mão em três
// telas diferentes, e cada cópia esqueceu um status diferente.
export const POST_DONE_STAGES = ['aprovado', 'agendado', 'publicado']

export function isPostDone(status: string | null | undefined) {
  return POST_DONE_STAGES.includes(status || '')
}
