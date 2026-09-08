// As fontes reais das tendências.
//
// O plano da nossa chave do Gemini NÃO tem a busca na web (`google_search`).
// Medido em dois dias seguidos: chamada simples devolve 200, a mesma chamada
// com a ferramenta de busca devolve 429 na primeira tentativa, em todos os
// modelos. Não é cota diária esgotada — é cota zero.
//
// Então a busca é feita aqui, e o modelo só lê o que a gente trouxe. Sai melhor
// do que seria com grounding, por dois motivos:
//
//   1. A FONTE é garantida. O modelo não escreve o link, ele escolhe entre os
//      que recebeu. Tendência inventada com fonte inventada era o pior
//      resultado possível desta tela.
//   2. Dá pra apontar a busca. "Morango cravejado viralizou" é o tipo de
//      matéria que interessa; "Tóquio em 24 horas" não é, e a lista de
//      consultas é o lugar de ajustar isso.
//
// Google News RSS: sem chave, sem cota, devolve item datado com link e veículo.

export type Noticia = { titulo: string; link: string; data: string; veiculo: string }

// Cada consulta é uma pergunta diferente ao mesmo acervo. Junta-se o resultado
// de todas e tira-se o repetido — matéria boa aparece em mais de uma.
const CONSULTAS = [
  'tendência gastronomia restaurante',
  'trend viral comida',
  'receita viral TikTok',
  'tendências redes sociais restaurantes',
  'trend Instagram comida Brasil',
  'Pinterest tendências comida',
]

const semCData = (s: string) => s.replace(/<!\[CDATA\[|\]\]>/g, '').trim()
const tag = (bloco: string, t: string) => {
  const m = bloco.match(new RegExp(`<${t}[^>]*>([\\s\\S]*?)</${t}>`))
  return m ? semCData(m[1]) : ''
}

async function umaConsulta(q: string, dias: number): Promise<Noticia[]> {
  const url = `https://news.google.com/rss/search?q=${encodeURIComponent(q)}+when:${dias}d&hl=pt-BR&gl=BR&ceid=BR:pt-419`
  try {
    // O RSS do Google recusa cliente sem user-agent de navegador.
    const res = await fetch(url, { headers: { 'user-agent': 'Mozilla/5.0' }, next: { revalidate: 1800 } })
    if (!res.ok) return []
    const xml = await res.text()
    return [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)].map(([, bloco]) => ({
      // O Google cola " - Veículo" no fim do título; o veículo já vem em
      // <source>, então repetir só gasta espaço no prompt.
      titulo: tag(bloco, 'title').replace(/\s+-\s+[^-]+$/, ''),
      link: tag(bloco, 'link'),
      data: tag(bloco, 'pubDate').slice(0, 16),
      veiculo: tag(bloco, 'source'),
    })).filter(n => n.titulo && n.link)
  } catch {
    return []
  }
}

/** O que saiu no nicho nos últimos `dias`, sem repetição. */
export async function noticiasDoNicho(dias = 45, teto = 40): Promise<Noticia[]> {
  const listas = await Promise.all(CONSULTAS.map(q => umaConsulta(q, dias)))
  const vistos = new Set<string>()
  const tudo: Noticia[] = []
  for (const lista of listas) {
    for (const n of lista) {
      // Dedupe pelo título, não pelo link: a mesma matéria republicada tem
      // link diferente em cada veículo.
      const chave = n.titulo.toLowerCase().slice(0, 60)
      if (vistos.has(chave)) continue
      vistos.add(chave)
      tudo.push(n)
    }
  }
  return tudo.slice(0, teto)
}
