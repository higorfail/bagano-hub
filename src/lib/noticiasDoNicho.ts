// As fontes reais das tendências.
//
// Duas coisas foram medidas e decidiram este arquivo.
//
// 1. O plano da nossa chave do Gemini NÃO tem `google_search`: chamada simples
//    devolve 200, a mesma com busca devolve 429 na primeira tentativa, em todos
//    os modelos. Cota zero. Então quem busca é o servidor.
//
// 2. O Google News, que era a fonte, NUNCA entrega imagem nem o endereço real
//    da matéria. A "imagem" que ele serve é o logo dele — os mesmos 18.288
//    bytes em todas as matérias que testei — e o link é sempre um
//    redirecionador `news.google.com/rss/articles/CBMi...`, tanto no <link>
//    quanto na <description>.
//
// Por isso agora são os feeds dos próprios veículos: eles trazem a foto da
// matéria e o endereço de verdade. O card de tendência deixa de ser um bloco de
// texto.
//
// O preço é curadoria: G1 e CNN publicam de tudo, então o filtro por assunto
// abaixo é o que separa "morango cravejado viralizou" de escalação de time.

export type Noticia = {
  titulo: string
  link: string
  data: string
  veiculo: string
  imagem: string
  resumo: string
}

// Escolhidos por teste, não por intuição: cada um foi buscado e conferido por
// número de itens e presença de imagem. Ficaram de fora Hypeness (410),
// Mundo do Marketing (404), Panelinha (404), Paladar (404) e Exame (sem imagem).
const FEEDS: { veiculo: string; url: string }[] = [
  // Notícia de plataforma e de conteúdo — é daqui que sai "o Instagram mudou o
  // alcance", "o TikTok abriu recurso novo".
  { veiculo: 'B9',              url: 'https://www.b9.com.br/feed/' },
  { veiculo: 'Meio & Mensagem', url: 'https://www.meioemensagem.com.br/feed' },
  { veiculo: 'Rock Content',    url: 'https://rockcontent.com/br/blog/feed/' },
  // Comida e casa — receita, ingrediente, hábito à mesa.
  { veiculo: 'Casa e Jardim',   url: 'https://revistacasaejardim.globo.com/rss/casaejardim/' },
  { veiculo: 'Catraca Livre',   url: 'https://catracalivre.com.br/feed/' },
]

// G1 e CNN saíram: feed generalista de 100 itens passa acidente de trânsito e
// escalação de time pelo filtro, porque a <description> deles é longa e cruza
// qualquer palavra. Feed de seção sobre comida resolveria — mas quase todos os
// brasileiros estão fora do ar (Receitas Globo, Paladar, Terra Gastronomia e
// Casa e Comida devolvem 404; Guia da Semana, 403). Melhor cinco feeds limpos
// que sete com lixo.

// Duas famílias de assunto, e basta uma. `marketing` e `influenciador` saíram
// de propósito: sozinhos, deixavam passar "fulano deixa o marketing da
// Whirlpool", que é notícia de mercado publicitário, não tendência de conteúdo.
const COMIDA = new RegExp([
  'gastronom', 'restaurante', 'pizzaria', 'hamburgue', 'sushi', 'padaria', 'sorvet',
  'confeitar', 'cozinh', 'chef', 'receita', 'comida', 'prato', 'sabor', 'doce',
  'bebida', 'drink', 'cardápio', 'delivery', 'ifood', 'boteco', 'brunch',
].join('|'), 'i')
const CONTEUDO = new RegExp([
  'viral', 'trend', 'tiktok', 'instagram', 'reels', 'pinterest', 'redes sociais', 'social media',
].join('|'), 'i')
const interessa = (t: string) => COMIDA.test(t) || CONTEUDO.test(t)

const semCData = (s: string) => s.replace(/<!\[CDATA\[|\]\]>/g, '').trim()
const semTags = (s: string) => s.replace(/<[^>]+>/g, ' ').replace(/&[a-z]+;/gi, ' ').replace(/\s+/g, ' ').trim()

function tag(bloco: string, t: string): string {
  const m = bloco.match(new RegExp(`<${t}[^>]*>([\\s\\S]*?)</${t}>`))
  return m ? semCData(m[1]) : ''
}

/** A foto da matéria, no primeiro lugar em que o feed a coloca. */
function imagemDoItem(bloco: string): string {
  const atributo = (re: RegExp) => (bloco.match(re) || [])[1] || ''
  return atributo(/<media:content[^>]+url=["']([^"']+)["']/i)
    || atributo(/<media:thumbnail[^>]+url=["']([^"']+)["']/i)
    || atributo(/<enclosure[^>]+url=["']([^"']+\.(?:jpe?g|png|webp)[^"']*)["']/i)
    // Último recurso: a primeira <img> do corpo, que vem escapada na
    // description de vários feeds.
    || atributo(/&lt;img[^&]*?src=&quot;([^&]+)&quot;/i)
    || atributo(/<img[^>]+src=["']([^"']+)["']/i)
}

async function umFeed(f: { veiculo: string; url: string }): Promise<Noticia[]> {
  try {
    const corte = new AbortController()
    // Feed lento não pode segurar a busca inteira: são sete, e quem espera é
    // uma pessoa olhando um botão.
    const relogio = setTimeout(() => corte.abort(), 8000)
    const res = await fetch(f.url, {
      headers: { 'user-agent': 'Mozilla/5.0' },
      signal: corte.signal,
      next: { revalidate: 1800 },
    })
    clearTimeout(relogio)
    if (!res.ok) return []
    const xml = await res.text()
    return [...xml.matchAll(/<item[ >]([\s\S]*?)<\/item>/g)].map(([, bloco]) => ({
      titulo: semTags(tag(bloco, 'title')),
      link: tag(bloco, 'link'),
      data: tag(bloco, 'pubDate').slice(0, 16),
      veiculo: f.veiculo,
      imagem: imagemDoItem(bloco),
      resumo: semTags(tag(bloco, 'description')).slice(0, 300),
    })).filter(n => n.titulo && n.link)
  } catch {
    return []
  }
}

// Buscas no Google News, como SEGUNDA fonte e só de texto.
//
// Medido lado a lado: só com os feeds saíram 2 tendências, ambas de plataforma
// (campanha da Starbucks, comentário por voz no TikTok). Com o Google News
// saíam 4, e de comida — morango cravejado, restaurante proibindo celular,
// rodízio pra pet. Os feeds trazem a FOTO; o Google News busca em toda a
// imprensa por consulta, e é de lá que vem a tendência gastronômica.
//
// Ele nunca dá imagem (a que serve é o logo dele, idêntico em toda matéria) nem
// o endereço real. Por isso entra depois dos feeds: card com foto primeiro, e
// os de texto completando embaixo.
const CONSULTAS_NEWS = [
  'tendência gastronomia restaurante',
  'trend viral comida',
  'receita viral TikTok',
]

async function umaBuscaNews(q: string, dias: number): Promise<Noticia[]> {
  const url = `https://news.google.com/rss/search?q=${encodeURIComponent(q)}+when:${dias}d&hl=pt-BR&gl=BR&ceid=BR:pt-419`
  try {
    const corte = new AbortController()
    const relogio = setTimeout(() => corte.abort(), 8000)
    const res = await fetch(url, { headers: { 'user-agent': 'Mozilla/5.0' }, signal: corte.signal, next: { revalidate: 1800 } })
    clearTimeout(relogio)
    if (!res.ok) return []
    const xml = await res.text()
    return [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)].map(([, bloco]) => ({
      // O Google cola " - Veículo" no fim do título, e o veículo já vem em
      // <source>.
      titulo: semTags(tag(bloco, 'title')).replace(/\s+-\s+[^-]+$/, ''),
      link: tag(bloco, 'link'),
      data: tag(bloco, 'pubDate').slice(0, 16),
      veiculo: tag(bloco, 'source') || 'Google Notícias',
      imagem: '',
      resumo: '',
    })).filter(n => n.titulo && n.link)
  } catch {
    return []
  }
}

/** O que saiu no nicho: feeds com foto, mais a busca de texto por cima. */
export async function noticiasDoNicho(teto = 45, dias = 45): Promise<Noticia[]> {
  const listas = await Promise.all([
    ...FEEDS.map(umFeed),
    ...CONSULTAS_NEWS.map(q => umaBuscaNews(q, dias)),
  ])
  const vistos = new Set<string>()
  const tudo: Noticia[] = []
  for (const lista of listas) {
    for (const n of lista) {
      // O Google News já foi filtrado pela consulta; o filtro por palavra é pros
      // feeds, que publicam de tudo.
      if (n.resumo !== '' || n.imagem !== '') {
        if (!interessa(n.titulo + ' ' + n.resumo)) continue
      }
      const chave = n.titulo.toLowerCase().slice(0, 60)
      if (vistos.has(chave)) continue
      vistos.add(chave)
      tudo.push(n)
    }
  }
  // Item com foto primeiro: é o que faz o card valer a pena, e o modelo escolhe
  // entre os primeiros quando a lista é cortada.
  return tudo.sort((a, b) => (b.imagem ? 1 : 0) - (a.imagem ? 1 : 0)).slice(0, teto)
}
