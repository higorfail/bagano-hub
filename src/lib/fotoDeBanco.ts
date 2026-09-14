// Uma foto pra ilustrar a tendência que não trouxe foto própria.
//
// Metade das matérias boas de gastronomia chega pelo Google Notícias, e ele
// NUNCA entrega imagem — a que serve é o logo dele, igual em toda matéria. Eu
// tinha "resolvido" cortando toda notícia sem foto, e o resultado foi perder
// justamente as tendências que a equipe achava boas. Resolver a foto cortando a
// notícia é resolver o problema errado.
//
// POR QUE NÃO O GOOGLE IMAGENS, que é o que se pensa primeiro: o resultado dele
// não é licenciado pra uso, a URL costuma expirar e boa parte dos sites bloqueia
// hotlink. Ficaria bonito hoje e quebrado em duas semanas, com foto de terceiro
// num painel da agência.
//
// Openverse (livre e sem chave) foi testado e é instável: 200 quando responde,
// mas estourou 20 s e 25 s em metade das tentativas. Não entra no caminho de uma
// tela que a equipe usa.
//
// Sobrou o Pexels: licença livre inclusive comercial, sem exigência de crédito,
// rápido, e com acervo de comida muito bom. Precisa de uma chave gratuita.
//
// SEM A CHAVE NADA QUEBRA: a tendência entra sem imagem, como entrava antes.
// É de propósito — a busca de tendência não pode depender de um serviço a mais
// pra funcionar.

const PEXELS = 'https://api.pexels.com/v1/search'

/** Uma foto livre pra esse termo, ou null. Nunca lança. */
export async function fotoDeBanco(busca: string): Promise<string | null> {
  const chave = process.env.PEXELS_API_KEY
  const termo = (busca || '').trim()
  if (!chave || !termo) return null
  try {
    const corte = new AbortController()
    const relogio = setTimeout(() => corte.abort(), 6000)
    const res = await fetch(
      `${PEXELS}?query=${encodeURIComponent(termo)}&per_page=1&orientation=landscape`,
      { headers: { Authorization: chave }, signal: corte.signal },
    )
    clearTimeout(relogio)
    if (!res.ok) return null
    const json = await res.json()
    const foto = json?.photos?.[0]?.src
    // `landscape` já vem no recorte do card; `large` é a rede pra quando o
    // recorte não vier.
    return foto?.landscape || foto?.large || null
  } catch {
    return null
  }
}

/**
 * Completa as fotos que faltam, em paralelo.
 *
 * Só pra quem não tem foto própria — a da matéria sempre ganha, porque ela
 * ilustra AQUELE assunto, e a de banco é genérica por natureza.
 *
 * Um teto de chamadas porque isto roda dentro do clique de "buscar novas": vale
 * esperar um pouco por foto, não vale segurar a tela por vinte buscas.
 */
export async function completarFotos<T extends { imagem_url?: string | null; buscaImagem?: string }>(
  itens: T[],
  teto = 12,
): Promise<T[]> {
  if (!process.env.PEXELS_API_KEY) return itens
  const semFoto = itens.filter(i => !i.imagem_url && i.buscaImagem).slice(0, teto)
  if (!semFoto.length) return itens
  const achadas = await Promise.all(semFoto.map(i => fotoDeBanco(i.buscaImagem!)))
  semFoto.forEach((item, i) => { if (achadas[i]) item.imagem_url = achadas[i] })
  return itens
}
