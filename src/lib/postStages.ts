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

// Progresso de uma campanha. Post, extra do Kanban, material e item do
// checklist contam JUNTO — cada um com o próprio nome pra "pronto".
//
// Contar só os posts deixava sem barra nenhuma o cliente cuja contribuição
// inteira é de outro tipo: o Unizushi tem 0 posts e 1 extra aprovado no Dia
// dos Pais, e o card dele não mostrava progresso nem número. E a mesma tela
// tinha duas contas diferentes — a barra do topo somava os quatro tipos, a de
// cada cliente só os posts.
export function campaignProgress(args: {
  posts?: { status: string }[]
  extras?: { status: string }[]
  materials?: { status: string }[]
  checklist?: { done?: boolean }[]
}) {
  const posts = args.posts || []
  const extras = args.extras || []
  const materials = args.materials || []
  const checklist = args.checklist || []
  const total = posts.length + extras.length + materials.length + checklist.length
  const done = posts.filter(p => isPostDone(p.status)).length
    + extras.filter(e => e.status === 'done').length
    + materials.filter(m => m.status === 'finalizado').length
    + checklist.filter(c => c.done).length
  return { done, total, pct: total > 0 ? (done / total) * 100 : 0 }
}
