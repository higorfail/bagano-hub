// Entender o que está escrito nos eventos do Google.
//
// O calendário da Bagano não é uma agenda genérica: tem uma convenção. Medido
// em 132 ocorrências entre 2026 e 2027:
//   · 72 são "GEE OFF" — ausência, sempre NOME + OFF
//   · quase todo o resto é captação escrita à mão, em CAIXA ALTA, com o nome do
//     cliente e às vezes um complemento entre parênteses ou depois de traço:
//     "ZEBUÍNO + ISRA", "PIASTRO (HAPPY HOUR + PIZZA DO MÊS)", "GRUH - PENHA"
//
// Ou seja: o registro real de captação vive no Google, não no hub — que tem 7
// captações contra ~55 de lá. Ler esses títulos é o que permite ao hub saber de
// quem é cada compromisso, e quem está fora, sem pedir pra ninguém mudar de
// hábito nem preencher nada a mais.

/** Sem acento, caixa alta, sem pontuação — pra comparar "SATŌ" com "Satō Sushi". */
export function normalizar(s: string): string {
  return (s || '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

const PALAVRAS_VAZIAS = new Set([
  'DE', 'DA', 'DO', 'E', 'A', 'O', 'RESTAURANTE', 'RESTAURANTES', 'PIZZARIA',
  'GASTRONOMIA', 'CAFE', 'SUSHI', 'PARRILLA', 'PADARIA', 'CUCINA', 'LANCHERIA',
  'GOURMET', 'ACAI', 'SORVETES', 'PIZZA', 'BURGER', 'SALAD',
])

/** Palavras que valem pra identificar — tira genérico que quase todo nome tem. */
function tokens(s: string): string[] {
  return normalizar(s).split(' ').filter(t => t.length >= 3 && !PALAVRAS_VAZIAS.has(t))
}

/**
 * Marcas de ausência. "GEE OFF" é o caso real (72 ocorrências), mas a equipe
 * escreve à mão, então vale aceitar o vocabulário vizinho em vez de exigir a
 * palavra exata — quem escrever "FOLGA" um dia não vira um buraco silencioso.
 */
const MARCAS_AUSENCIA = /\b(OFF|FOLGA|FERIAS|ATESTADO|LICENCA)\b/

export type Ausencia = { memberId: string | null; nome: string; titulo: string }

/**
 * "GEE OFF" → a Gee está fora.
 *
 * Devolve null quando não é ausência. Quando é ausência mas não dá pra dizer de
 * quem (um "FOLGA" solto), devolve com `memberId: null` — porque o dia continua
 * bloqueado mesmo sem saber o dono, e engolir isso seria pior que a dúvida.
 */
export function detectarAusencia(
  titulo: string,
  membros: { id: string; name: string }[],
): Ausencia | null {
  const n = normalizar(titulo)
  if (!MARCAS_AUSENCIA.test(n)) return null

  for (const m of membros) {
    // Compara pelo primeiro nome: o calendário diz "GEE", o cadastro diz "Gee".
    const primeiro = normalizar(m.name).split(' ')[0]
    if (primeiro && primeiro.length >= 3 && new RegExp(`\\b${primeiro}\\b`).test(n)) {
      return { memberId: m.id, nome: m.name, titulo }
    }
  }
  return { memberId: null, nome: n.replace(MARCAS_AUSENCIA, '').trim() || 'Alguém', titulo }
}

/**
 * De qual cliente é este evento?
 *
 * Conservador de propósito: na dúvida devolve null. Errar o cliente é pior que
 * não saber — um evento pintado com a cor errada mente com confiança, e ninguém
 * confere. Por isso exige que o título contenha um token INTEIRO do nome do
 * cliente, e recusa quando dois clientes empatam ("UNI" serve pra Unizushi e
 * pra mais nada com certeza).
 */
export function identificarCliente(
  titulo: string,
  clientes: { id: string; name: string }[],
): { id: string; name: string } | null {
  const alvo = normalizar(titulo)
  if (!alvo || MARCAS_AUSENCIA.test(alvo)) return null

  const alvoTokens = new Set(alvo.split(' '))
  // Sem espaço nenhum: no calendário está "NIHAO", no cadastro "NI HAO". São o
  // mesmo cliente e nenhuma comparação por palavra os aproxima.
  const alvoColado = alvo.replace(/\s/g, '')

  const candidatos: { c: { id: string; name: string }; forca: number }[] = []

  for (const c of clientes) {
    const ts = tokens(c.name)
    if (!ts.length) continue

    // 1. token inteiro batendo — o caso normal e o mais confiável.
    const acertos = ts.filter(t => alvoTokens.has(t)).length
    if (acertos > 0) { candidatos.push({ c, forca: acertos * 1000 + ts.join('').length }); continue }

    // 2. nome colado dentro do título colado — pega "NIHAO" ↔ "NI HAO".
    //    Aqui NÃO vale o corte de 3 letras que `tokens` aplica: ele derruba o
    //    "NI" e sobra "HAO", que não casa com nada. Pedaço curto só atrapalha
    //    quando está sozinho; colado ao vizinho ele é justamente o que
    //    identifica.
    const colado = normalizar(c.name).split(' ').filter(t => !PALAVRAS_VAZIAS.has(t)).join('')
    if (colado.length >= 4 && alvoColado.includes(colado)) {
      candidatos.push({ c, forca: 500 + colado.length }); continue
    }

    // 3. abreviação por prefixo: "UNI" pra Unizushi, "UNI FLORIPA" pra a filial.
    //    Mínimo de 3 letras e só quando o prefixo é uma palavra INTEIRA do
    //    título — sem isso "PIA" de qualquer coisa pegaria o Piastro.
    const abrev = ts.find(t => [...alvoTokens].some(a => a.length >= 3 && t.startsWith(a) && t !== a))
    if (abrev) candidatos.push({ c, forca: 200 + abrev.length })
  }

  // Apelidos que a equipe usa e nenhuma regra deriva: "N7" não se parece com
  // "Number Seven" por letra nenhuma. Fica explícito em vez de virar uma
  // heurística frouxa que erraria em outro lugar pra acertar aqui.
  if (!candidatos.length) {
    for (const [apelido, pedaco] of Object.entries(APELIDOS)) {
      if (!alvoTokens.has(apelido)) continue
      const c = clientes.find(c => normalizar(c.name).includes(pedaco))
      if (c) return c
    }
  }

  if (!candidatos.length) return null
  candidatos.sort((a, b) => b.forca - a.forca)
  // Empate real = ambiguidade. Melhor não dizer nada: pintar o evento com o
  // cliente errado mente com confiança, e ninguém confere.
  if (candidatos.length > 1 && candidatos[0].forca === candidatos[1].forca) return null
  return candidatos[0].c
}

/** Abreviações da casa. Chave = como aparece no calendário; valor = pedaço do nome. */
const APELIDOS: Record<string, string> = {
  N7: 'NUMBER SEVEN',
}

/** É um bloqueio de agenda (alguém fora), e não um compromisso? */
export function ehBloqueio(titulo: string): boolean {
  return MARCAS_AUSENCIA.test(normalizar(titulo))
}
