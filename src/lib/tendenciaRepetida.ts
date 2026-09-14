// Duas tendências são a mesma coisa?
//
// A busca trazia repetido: "Restaurantes que proíbem celulares" apareceu duas
// vezes no mesmo quadro, de matérias diferentes (UOL há 35 min e UOL há 6
// dias). Não havia defesa nenhuma — a IA não sabia o que já existia, e o insert
// entrava cego.
//
// Comparar texto de tendência não é comparar string: "Sushi no tubo (push pop)"
// e "sushi no tubo" são a mesma tendência, e é isso que a equipe vê ao olhar o
// quadro. Por isso a chave normaliza acento, caixa, pontuação e as palavras
// vazias que só enchem o título.

/** Palavras que não distinguem uma tendência de outra. */
const VAZIAS = new Set([
  'a', 'o', 'as', 'os', 'um', 'uma', 'uns', 'umas', 'de', 'do', 'da', 'dos', 'das',
  'e', 'em', 'no', 'na', 'nos', 'nas', 'com', 'sem', 'por', 'para', 'pra', 'que',
  'ao', 'aos', 'à', 'às', 'the',
])

/**
 * A chave de comparação de uma tendência.
 *
 * Sem acento, sem caixa, sem pontuação, sem palavra vazia, e com as palavras
 * em ORDEM ALFABÉTICA — "jantares imersivos com pirotecnia" e "pirotecnia em
 * jantares imersivos" caem na mesma chave, que é o que a pessoa enxerga
 * olhando os dois cards lado a lado.
 */
export function chaveDaTendencia(titulo?: string | null): string {
  return (titulo || '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(p => p && !VAZIAS.has(p))
    .sort()
    .join(' ')
}

/**
 * Uma tendência está contida na outra?
 *
 * "Sushi no tubo" e "Sushi no tubo (push pop)" são a mesma coisa, e o
 * parêntese é esclarecimento, não distinção. Comparar chave com chave não
 * pega isso, e tirar o parêntese quebraria o caso oposto — "Drinks zero álcool
 * (Mocktails)" × "drinks zero alcool mocktails", em que o conteúdo do
 * parêntese é justamente o que iguala os dois.
 *
 * Contenção resolve os dois: um título é o outro com palavras a mais.
 *
 * O piso de DUAS palavras existe pra um título genérico não engolir os
 * específicos — sem ele, uma tendência chamada só "Sushi" faria sumir todas as
 * outras de sushi que viessem depois.
 */
function umaDentroDaOutra(a: string, b: string): boolean {
  const pa = a.split(' ').filter(Boolean)
  const pb = b.split(' ').filter(Boolean)
  const [menor, maior] = pa.length <= pb.length ? [pa, pb] : [pb, pa]
  if (menor.length < 2) return false
  const conjunto = new Set(maior)
  return menor.every(p => conjunto.has(p))
}

/**
 * Tira do lote o que já existe e o que se repete dentro do próprio lote.
 *
 * As duas metades importam: a IA repete o que já está no quadro (não sabia) e
 * às vezes repete dentro da mesma resposta (duas matérias sobre o mesmo
 * assunto viram duas tendências iguais).
 */
export function sóAsNovas<T extends { titulo?: string | null }>(
  candidatas: T[],
  jaExistentes: (string | null | undefined)[],
): T[] {
  const vistas = [...new Set(jaExistentes.map(chaveDaTendencia).filter(Boolean))]
  const novas: T[] = []
  for (const c of candidatas) {
    const k = chaveDaTendencia(c.titulo)
    if (!k) continue
    if (vistas.some(v => v === k || umaDentroDaOutra(v, k))) continue
    vistas.push(k)
    novas.push(c)
  }
  return novas
}
