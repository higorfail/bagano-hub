// De quem é a bola nesta etapa — e qual é o verbo do trabalho.
//
// O "Para você" olhava só `assigned_members`: estar marcado no card significava
// "isto é seu pra fazer". Não é. A Gabis tem 16 materiais, 12 deles em produção
// — e o Felipe está marcado nos doze. Ela está ali porque DEPOIS entrega e cobra
// o cliente, não porque produz. O card mostrava pra ela uma carga de designer
// que ela não tem: 76 itens de "faça isto", quando 24 não eram dela e os outros
// 52 eram "agendar" e "cobrar", que é um dia completamente diferente.
//
// A inteligência já existia em `quemAvisar.ts`, que decide para quem vai o aviso
// de cada etapa. Este módulo é o mesmo raciocínio respondendo a outra pergunta
// ("de quem é o trabalho AGORA?"), e os dois mapas precisam continuar contando a
// mesma história — se um dia divergirem, a notificação vai pra uma pessoa e a
// fila do dia aparece pra outra.
//
// A chave que separa a Gabis do Felipe no MESMO card não é a marcação (os dois
// estão marcados) nem a função sozinha: é que `social` nunca é quem faz. Função
// aqui diz principalmente o que a pessoa NÃO faz.

export type Funcao = 'videos' | 'posts' | 'estrategia' | 'social' | 'acompanha' | string

export type Etapa = {
  /** Funções de quem é a bola nesta etapa. */
  funcoesDonas: Funcao[]
  /**
   * Se estar marcado no card basta pra ser dono aqui.
   *
   * Vale nas etapas de FAZER: nem todo mundo que produz tem função registrada
   * (o Felipe faz material e está como `acompanha` em dois clientes só), e
   * exigir função esconderia o trabalho de quem realmente o faz.
   */
  marcadosSaoDonos: boolean
  /** O trabalho nesta etapa, na voz de quem faz. */
  verbo: string
  /**
   * Alguém passou a bola e está esperando você AGORA.
   *
   * Nessas etapas o prazo não é a data de publicação — é o momento do
   * repasse. O fluxo real: a Yasmim põe o post em produção e marca quem faz;
   * entregue, quem fez sai do card e marca ela em `revisao_interna`; ela
   * confere e passa pra Gabis enviar. Dos 10 posts parados na mão dela, SEIS
   * tinham data de publicação longe — e por isso caíam em "outros dias",
   * escondidos atrás de um link fechado, enquanto o time esperava a revisão.
   *
   * É o mesmo erro que a fila tinha ido consertar (tratar data de publicação
   * como prazo de trabalho), reaparecendo pra quem não está na agenda.
   */
  esperandoVoce?: boolean
}

/**
 * Quem nunca é o "faz" — mesmo marcado no card.
 *
 * Só `social`, e a lista é curta de propósito. `social` é inequívoco: a
 * definição do time é "só posta e acompanha", e o dado confirma — a Gabis está
 * marcada em 12 materiais em produção que quem faz é o Felipe.
 *
 * `acompanha` ficou DE FORA embora o nome sugira o contrário. Os 20 materiais
 * do Felipe hoje são de clientes onde ele não tem função cadastrada, então ele
 * continua dono por estar marcado — mas isso é sorte, não desenho: bastaria
 * alguém cadastrá-lo como `acompanha` num desses clientes pra o trabalho dele
 * sumir da própria fila. Entre esconder trabalho de quem faz e mostrar um item
 * a mais pra um gerente, o segundo erro é MUITO mais barato.
 */
const NUNCA_PRODUZ: Funcao[] = ['social']

const SCHEDULES: Record<string, Etapa> = {
  estrategia:                 { funcoesDonas: ['estrategia'], marcadosSaoDonos: false, verbo: 'montar a pauta' },
  aguardando_aprovacao_crono: { funcoesDonas: ['social'],     marcadosSaoDonos: false, verbo: 'cobrar' },
  captacao:                   { funcoesDonas: ['estrategia'], marcadosSaoDonos: false, verbo: 'decidir captação' },
  producao:                   { funcoesDonas: ['videos', 'posts'], marcadosSaoDonos: true, verbo: 'criar' },
  ajuste:                     { funcoesDonas: ['videos', 'posts'], marcadosSaoDonos: true, verbo: 'ajustar', esperandoVoce: true },
  // Marcação CONTA aqui: o repasse desta equipe é literalmente "saio do card e
  // marco quem revisa". Exigir função registrada faria a bola sumir justamente
  // de quem acabou de recebê-la.
  revisao_interna:            { funcoesDonas: ['estrategia'], marcadosSaoDonos: true, verbo: 'revisar', esperandoVoce: true },
  aguardando_aprovacao:       { funcoesDonas: ['social'],     marcadosSaoDonos: false, verbo: 'cobrar' },
  aprovado:                   { funcoesDonas: ['social'],     marcadosSaoDonos: false, verbo: 'agendar' },
  // `agendado`, `publicado` e `cancelado` ficam FORA do mapa de propósito:
  // etapa sem dono é ausência de chave, não uma chave com valor vazio.
}

const EXTRAS_MATERIAIS: Record<string, Etapa> = {
  backlog:              { funcoesDonas: ['videos', 'posts'], marcadosSaoDonos: true,  verbo: 'criar' },
  producao:             { funcoesDonas: ['videos', 'posts'], marcadosSaoDonos: true,  verbo: 'criar' },
  ajuste:               { funcoesDonas: ['videos', 'posts'], marcadosSaoDonos: true,  verbo: 'ajustar', esperandoVoce: true },
  // "A social entrega e cobra" — a regra é a mesma que já vale no aviso.
  feito:                { funcoesDonas: ['social'], marcadosSaoDonos: false, verbo: 'entregar', esperandoVoce: true },
  aguardando_aprovacao: { funcoesDonas: ['social'], marcadosSaoDonos: false, verbo: 'cobrar' },
}

export function etapaDoItem(tabela: string, status?: string | null): Etapa | null {
  const s = (status || '').trim()
  if (!s) return null
  if (tabela === 'schedules') return SCHEDULES[s] || null
  if (tabela === 'extras' || tabela === 'materials') return EXTRAS_MATERIAIS[s] || null
  // Tarefa pessoal não tem etapa de time: é de quem está nela.
  return { funcoesDonas: [], marcadosSaoDonos: true, verbo: 'fazer' }
}

export type Papel =
  /** É seu trabalho agora. */
  | 'meu'
  /**
   * Você está no card, mas a bola é de outra pessoa nesta etapa.
   *
   * Este estado existe pra que o filtro não faça ninguém PERDER trabalho de
   * vista. Continua visível, numa faixa discreta — só sai da fila de fazer.
   */
  | 'acompanhando'
  /** Nem seu, nem você está no card. */
  | null

export function papelNoItem(entrada: {
  tabela: string
  status?: string | null
  /** Você está marcado no card? */
  marcado: boolean
  /** Sua função NESTE cliente, se houver. */
  minhaFuncao?: Funcao | null
}): Papel {
  const etapa = etapaDoItem(entrada.tabela, entrada.status)
  if (!etapa) return entrada.marcado ? 'acompanhando' : null

  const f = entrada.minhaFuncao || null
  if (f && etapa.funcoesDonas.includes(f)) return 'meu'

  if (entrada.marcado) {
    // Marcado numa etapa de fazer é dono — MENOS quem nunca produz. É aqui que
    // a Gabis (social) e o Felipe (faz) se separam no mesmo card.
    if (etapa.marcadosSaoDonos && !(f && NUNCA_PRODUZ.includes(f))) return 'meu'
    return 'acompanhando'
  }
  return null
}
