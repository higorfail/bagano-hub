// Os números do mês, tirados do próprio hub.
//
// A separação que rege este arquivo: existe o que o HUB SABE e o que só o
// INSTAGRAM sabe. Entrega, aprovação, captação e material são nossos — estão
// no banco, e ninguém precisa digitar. Alcance, seguidores e engajamento são do
// Instagram, e o hub não tem como ler (a API da Meta exige App Review).
//
// Misturar os dois num relatório é como número inventado nasce: alguém digita
// "12 posts" de cabeça, erra, e o cliente confere. Aqui o que é nosso vem
// contado; o que é do Instagram fica em campo vazio, marcado como tal.
//
// Contagem com `head: true`: só o total volta do servidor, sem as linhas. Numa
// agência com 481 posts isso não faria diferença hoje, mas o relatório roda
// para 21 clientes e o PostgREST corta resposta em 1000 linhas sem avisar.

export type NumerosDoMes = {
  posts: number
  publicados: number
  porTipo: Record<string, number>
  aprovacoesDoCliente: number
  ajustesPedidos: number
  extras: number
  materiais: number
  captacoes: number
}

const TIPOS = ['reels', 'carrossel', 'post', 'story', 'carrossel_stories', 'post_story']

/** Primeiro e último instante do mês, em ISO — o recorte de tudo que é por data. */
export function limitesDoMes(mes: number, ano: number) {
  const inicio = new Date(Date.UTC(ano, mes - 1, 1))
  const fim = new Date(Date.UTC(ano, mes, 1))
  return { inicio: inicio.toISOString(), fim: fim.toISOString(), inicioDia: inicio.toISOString().slice(0, 10), fimDia: fim.toISOString().slice(0, 10) }
}

export async function calcularRelatorio(
  db: any,
  clientId: string,
  mes: number,
  ano: number,
): Promise<NumerosDoMes> {
  const { inicio, fim, inicioDia, fimDia } = limitesDoMes(mes, ano)
  const contar = async (q: any) => (await q).count ?? 0

  // Posts do cronograma: recortados por mês/ano, que é o endereço deles — não
  // por data agendada, que pode estar vazia.
  const { data: posts } = await db.from('schedules')
    .select('post_type, status').eq('client_id', clientId).eq('month', mes).eq('year', ano)
  const lista = posts || []

  const porTipo: Record<string, number> = {}
  for (const t of TIPOS) {
    const n = lista.filter((p: any) => p.post_type === t).length
    if (n) porTipo[t] = n
  }

  const [aprovacoesDoCliente, ajustesPedidos, extras, materiais, captacoes] = await Promise.all([
    // Aprovação vem do HISTÓRICO, não do estado atual: um post aprovado depois
    // de dois ajustes aparece hoje como "aprovado", e o mês inteiro pareceria
    // ter corrido liso.
    contar(db.from('activity_log').select('*', { count: 'exact', head: true })
      .eq('client_id', clientId).eq('action', 'client_approved').gte('created_at', inicio).lt('created_at', fim)),
    contar(db.from('activity_log').select('*', { count: 'exact', head: true })
      .eq('client_id', clientId).eq('action', 'client_rejected').gte('created_at', inicio).lt('created_at', fim)),
    contar(db.from('extras').select('*', { count: 'exact', head: true })
      .eq('client_id', clientId).gte('completed_at', inicio).lt('completed_at', fim)),
    contar(db.from('materials').select('*', { count: 'exact', head: true })
      .eq('client_id', clientId).gte('completed_at', inicio).lt('completed_at', fim)),
    contar(db.from('captacoes').select('*', { count: 'exact', head: true })
      .eq('client_id', clientId).gte('scheduled_date', inicioDia).lt('scheduled_date', fimDia)),
  ])

  return {
    posts: lista.length,
    publicados: lista.filter((p: any) => p.status === 'publicado').length,
    porTipo,
    aprovacoesDoCliente,
    ajustesPedidos,
    extras,
    materiais,
    captacoes,
  }
}

export const ROTULO_TIPO: Record<string, string> = {
  reels: 'Reels', carrossel: 'Carrossel', post: 'Post',
  story: 'Story', carrossel_stories: 'Carrossel/Stories', post_story: 'Post/Story',
}

/** As métricas que só o Instagram sabe — a equipe preenche olhando o painel. */
export const METRICAS_DO_INSTAGRAM = [
  { chave: 'alcance',     rotulo: 'Alcance' },
  { chave: 'impressoes',  rotulo: 'Impressões' },
  { chave: 'seguidores',  rotulo: 'Seguidores no fim do mês' },
  { chave: 'novos',       rotulo: 'Seguidores ganhos' },
  { chave: 'interacoes',  rotulo: 'Interações' },
  { chave: 'visitas',     rotulo: 'Visitas ao perfil' },
]
