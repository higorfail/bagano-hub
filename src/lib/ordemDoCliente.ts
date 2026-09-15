// Qual fazer primeiro, dentro do mesmo cliente.
//
// A linha dizia "6 posts pra criar" e parava aí. Quem senta pra trabalhar tinha
// que abrir os seis pra descobrir qual era o urgente — e o hub sabia a resposta
// o tempo todo.
//
// Três coisas decidem, e a ideia é reduzir as três a UMA data comparável:
//
//   voltou da revisão  → a data é HOJE. Alguém entregou, alguém apontou o que
//                        mudar, e está parado esperando. Não é trabalho novo,
//                        é trabalho travado.
//   campanha com data  → a data da campanha. Dia dos Pais não espera, e ela
//                        costuma vir ANTES da publicação do post.
//   resto              → a data de publicação.
//
// Reduzir a uma data só é o que evita a briga de regra contra regra: retrabalho
// vence campanha da semana que vem, e perde pra campanha que já venceu. Sem
// isso seria preciso decidir na mão qual regra ganha de qual, e essa conta
// nunca fica certa pra todos os casos.
//
// Item sem data nenhuma vai pro fim, não pro começo: sem prazo não é urgente,
// é só indefinido — e ordenar indefinido como urgente foi exatamente o erro
// que fez a fila parecer cheia de atraso.

const SEM_DATA = '9999-12-31'

export type ItemOrdenavel = {
  id: string
  dueDate?: string | null
  clientId?: string
  campaignType?: string | null
}

export type ContextoDaOrdem = {
  /** 'YYYY-MM-DD' */
  hoje: string
  /** Ids dos itens que voltaram da revisão interna. */
  voltouDaRevisao: (id: string) => boolean
  /** A data-alvo da campanha do item, se houver. */
  dataDaCampanha: (clientId?: string, campaignType?: string | null) => string | null
}

/** A data que decide a ordem. Quanto menor, mais cedo na lista. */
export function dataQueManda(item: ItemOrdenavel, ctx: ContextoDaOrdem): string {
  if (ctx.voltouDaRevisao(item.id)) return ctx.hoje
  const campanha = ctx.dataDaCampanha(item.clientId, item.campaignType)
  // A mais próxima entre campanha e publicação: a campanha costuma ser antes,
  // mas nada garante — post de Dia dos Pais publicado uma semana depois existe.
  const datas = [campanha, item.dueDate].filter(Boolean) as string[]
  return datas.length ? datas.sort()[0] : SEM_DATA
}

/**
 * Ordena os itens de um cliente. Não muta a lista de entrada.
 *
 * O desempate é pelo `id` de propósito: sem ele, dois itens da mesma data
 * trocariam de lugar entre um render e outro, e lista que se mexe sozinha é
 * lista em que ninguém confia.
 */
export function ordenarDoCliente<T extends ItemOrdenavel>(itens: T[], ctx: ContextoDaOrdem): T[] {
  return [...itens].sort((a, b) => {
    const da = dataQueManda(a, ctx)
    const db = dataQueManda(b, ctx)
    return da === db ? a.id.localeCompare(b.id) : da.localeCompare(db)
  })
}
