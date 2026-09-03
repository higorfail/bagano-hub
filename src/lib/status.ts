// Fonte única da verdade para status de conteúdo (schedules/extras/materials).
//
// Antes disso existiam TRÊS sistemas paralelos: hex solto nos cards, classes
// Tailwind com token --ds-* na página do cliente, e um mapa de "tom" no Início.
// O resultado não era só tom diferente — era a MESMA COR significando etapas
// diferentes: azul era "aprovado" em Publicações e "agendado" no Cronograma,
// verde era "publicado" numa tela e "aprovado" na outra. E dentro do PostCard,
// "estratégia" e "revisão interna" dividiam o mesmo #8b5cf6.
//
// A regra que a paleta segue, na ordem do fluxo:
//   cinza  = ainda não começou          roxo    = trabalho interno acontecendo
//   rosa   = a bola está com o cliente  vermelho = voltou pra consertar
//   azul   = aprovado, falta agendar    teal     = agendado, falta sair
//   verde  = no ar (só o fim é verde)
export type StatusKey =
  | 'estrategia' | 'aguardando_aprovacao_crono' | 'captacao' | 'producao'
  | 'revisao_interna' | 'aguardando_aprovacao' | 'ajuste'
  | 'aprovado' | 'agendado' | 'publicado' | 'pendente' | 'cancelado'
  | 'backlog' | 'feito' | 'finalizado' | 'done'

type Meta = { label: string; short: string; color: string }

export const STATUS: Record<StatusKey, Meta> = {
  estrategia:                 { label: 'Estratégia',           short: 'Estratégia', color: '#6b7280' },
  aguardando_aprovacao_crono: { label: 'Aguardando o cliente (crono)', short: 'Ag. crono', color: '#f472b6' },
  captacao:                   { label: 'Captação',             short: 'Captação',   color: '#0ea5e9' },
  producao:                   { label: 'Produção',             short: 'Produção',   color: '#f59e0b' },
  revisao_interna:            { label: 'Revisão interna',      short: 'Revisão',    color: '#8b5cf6' },
  aguardando_aprovacao:       { label: 'Aguardando aprovação', short: 'Ag. cliente', color: '#ec4899' },
  ajuste:                     { label: 'Ajuste solicitado',    short: 'Ajuste',     color: '#ef4444' },
  aprovado:                   { label: 'Aprovado',             short: 'Aprovado',   color: '#3b82f6' },
  agendado:                   { label: 'Agendado',             short: 'Agendado',   color: '#14b8a6' },
  publicado:                  { label: 'Publicado',            short: 'Publicado',  color: '#22c55e' },
  pendente:                   { label: 'Pendente',             short: 'Pendente',   color: '#6b7280' },
  // Fim que não é entrega. Ardósia apagada de propósito: não é o cinza de
  // "ainda não começou" (esse é o `pendente`, e a diferença importa — um
  // espera trabalho, o outro não espera nada), nem o verde de publicado, que
  // celebraria um post que não aconteceu.
  cancelado:                  { label: 'Descartado',           short: 'Descartado', color: '#94a3b8' },

  // Materiais e Extras têm um fluxo próprio, mais curto — não é o do
  // Cronograma e não deve ser forçado a ser. Mas as etapas que se chamam igual
  // (`producao`, `aguardando_aprovacao`, `ajuste`) usam a MESMA cor das de
  // cima, e "finalizado" partilha o verde de "publicado" porque as duas querem
  // dizer a mesma coisa: acabou.
  backlog:                    { label: 'A fazer',              short: 'A fazer',    color: '#f59e0b' },
  feito:                      { label: 'Feito',                short: 'Feito',      color: '#0ea5e9' },
  finalizado:                 { label: 'Finalizado',           short: 'Finalizado', color: '#22c55e' },
  done:                       { label: 'Finalizado',           short: 'Finalizado', color: '#22c55e' },
}

/** O fluxo de Materiais e Extras, na ordem em que acontece. */
export const STATUS_ORDER_TAREFA: StatusKey[] = ['backlog', 'feito', 'aguardando_aprovacao', 'finalizado']

/** Ordem do fluxo — use isto pra ordenar coluna, filtro ou seletor, em vez de
 *  cada tela reescrever a sequência (e discordar da vizinha). */
export const STATUS_ORDER: StatusKey[] = [
  'estrategia', 'aguardando_aprovacao_crono', 'captacao', 'producao',
  'revisao_interna', 'aguardando_aprovacao', 'ajuste',
  'aprovado', 'agendado', 'publicado',
]

/** Etapas em que o post ACABOU — não espera mais ninguém. */
export const POST_ENCERRADO: StatusKey[] = ['publicado', 'cancelado']

export function statusColor(s: string | null | undefined): string {
  return STATUS[(s || '') as StatusKey]?.color || '#6b7280'
}
export function statusLabel(s: string | null | undefined): string {
  return STATUS[(s || '') as StatusKey]?.label || (s || '—')
}
export function statusShort(s: string | null | undefined): string {
  return STATUS[(s || '') as StatusKey]?.short || (s || '—')
}

/** Estilo de etiqueta: fundo de 10% sobre a cor, texto na cor cheia. Mesmo
 *  padrão que as etiquetas de TIPO já usavam — funciona nos dois temas sem
 *  precisar de um token por status. */
export function statusBadge(s: string | null | undefined) {
  const c = statusColor(s)
  return { background: `${c}1a`, color: c }
}
