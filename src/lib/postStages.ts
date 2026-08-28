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

// Etapas em que o post AINDA NÃO TEM MATERIAL — não existe arte, foto nem
// vídeo, só a ideia e (às vezes) uma data.
//
// `captacao` é literal: o post está esperando ser captado. `estrategia` é a
// pauta antes de sair do papel. `producao` fica FORA desta lista de propósito —
// ali o material está sendo feito, e a pergunta que isto serve é "precisamos
// produzir material novo?", que pra um post em produção já está respondida.
export const POST_SEM_MATERIAL = ['estrategia', 'captacao']

/**
 * Este post conta como conteúdo que a agência tem em mãos?
 *
 * Serve ao fôlego da "Situação dos clientes", que responde quando o conteúdo do
 * cliente acaba. Antes o fôlego contava QUALQUER post com data, e uma data é
 * barata: o Toit aparecia com "10 a publicar até 15/set" tendo 3 — os outros 7
 * eram pauta em captação, sem nada feito. O card dizia que havia fôlego onde
 * não havia, justamente na tela que existe pra avisar que está acabando.
 */
export function temMaterial(status: string | null | undefined) {
  return !POST_SEM_MATERIAL.includes(status || '')
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


// Story não é fôlego.
//
// O fôlego mede quanto conteúdo de FEED o cliente ainda tem — é o que decide
// quando produzir material novo. Story é efêmero: sai em 24h, não ocupa o
// grid e não substitui um post que falta. Contar story como fôlego dizia que
// havia conteúdo onde havia recado.
//
// Reels CONTA: ocupa o feed igual a post e carrossel, e é o formato mais usado
// hoje (44 dos 95 posts futuros). Os híbridos (`carrossel_stories`,
// `post_story`) também contam, porque cada um tem uma peça de feed dentro.
const SO_STORY = ['story', 'stories']

/** Este tipo de conteúdo ocupa o feed? (story sozinho não) */
export function contaComoFolego(tipo: string | null | undefined) {
  return !SO_STORY.includes((tipo || '').trim().toLowerCase())
}
