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

// ── Que TIPO de compromisso é ────────────────────────────────────────────────
//
// O calendário não tem campo de tipo, e ninguém vai passar a preencher um.
// Mas a equipe já escreve a palavra: "CONFRA", "COWORKING", "REUNIÃO COM X".
// Ler isso é dar cor e etiqueta a um evento que hoje chega cinza e anônimo.
//
// A ordem importa: ausência primeiro, porque "FOLGA — CONFRA" é ausência (a
// pessoa não está), não uma confra a organizar. Depois o resto, do mais
// específico pro mais genérico.

export type TipoEvento = {
  chave: 'ausencia' | 'confra' | 'coworking' | 'reuniao' | 'captacao' | 'criacao' | 'outro'
  rotulo: string
  cor: string
}

const TIPOS: { chave: TipoEvento['chave']; rotulo: string; cor: string; padrao: RegExp }[] = [
  // Escrito de tudo quanto é jeito: confra, confraternização, aniversário da
  // equipe, happy hour da casa.
  { chave: 'confra',    rotulo: 'Confra',    cor: '#ec4899', padrao: /\b(CONFRA|CONFRATERNIZACAO|CONFRATERNIZACOES|HAPPY\s?HOUR\s?INTERNO|ANIVERSARIO\s?DA\s?EQUIPE)\b/ },
  { chave: 'coworking', rotulo: 'Coworking', cor: '#0ea5e9', padrao: /\b(COWORKING|CO\s?WORKING|ESCRITORIO|PRESENCIAL|SALA)\b/ },
  { chave: 'reuniao',   rotulo: 'Reunião',   cor: '#8b5cf6', padrao: /\b(REUNIAO|REUNIOES|MEET|CALL|ALINHAMENTO|BRIEFING|ONBOARDING|APRESENTACAO)\b/ },
  { chave: 'captacao',  rotulo: 'Captação',  cor: '#f59e0b', padrao: /\b(CAPTACAO|CAPTACOES|GRAVACAO|FILMAGEM|SHOOTING|ENSAIO|FOTO|FOTOS)\b/ },
  { chave: 'criacao',   rotulo: 'Criação',   cor: '#f59e0b', padrao: /\b(CRIACAO|DESIGN|EDICAO)\b/ },
]

/**
 * O tipo do compromisso, lido do título.
 *
 * Devolve `outro` quando não reconhece — e isso é o normal, não uma falha: a
 * maior parte dos títulos é só o nome do cliente em caixa alta, e esse caso já
 * é resolvido por `identificarCliente`. Inventar um tipo pra ele seria pior que
 * deixar cinza.
 */
export function tipoDoEvento(titulo: string): TipoEvento {
  const n = normalizar(titulo)
  // Ausência ganha de tudo: "FOLGA — CONFRA" é alguém fora, não uma confra.
  if (MARCAS_AUSENCIA.test(n)) return { chave: 'ausencia', rotulo: 'Ausência', cor: '#94a3b8' }
  for (const t of TIPOS) {
    if (t.padrao.test(n)) return { chave: t.chave, rotulo: t.rotulo, cor: t.cor }
  }
  return { chave: 'outro', rotulo: '', cor: '#64748b' }
}

// ── Quem está no evento ──────────────────────────────────────────────────────

/**
 * As pessoas da equipe convidadas, casadas pelo E-MAIL da conta do hub.
 *
 * E-mail e não nome: "Gee" no título é ambíguo e some quando alguém escreve
 * "Geovana", enquanto o convite carrega o endereço exato. Os 8 da equipe já têm
 * e-mail em `team_members` — é o mesmo com que entram no hub.
 *
 * Só quem não recusou. Convite recusado é justamente a informação de que a
 * pessoa NÃO vai, e mostrá-la como presente seria pior que não mostrar nada.
 */
export function membrosDoEvento(
  convidados: { email?: string | null; responseStatus?: string | null }[] | null | undefined,
  equipe: { id: string; name: string; email?: string | null; emails_alternativos?: string[] | null }[],
): { id: string; name: string }[] {
  if (!convidados?.length) return []
  // Uma pessoa, vários endereços. Medido nos 80 eventos reais do calendário:
  // dois dos convidados mais frequentes — `lucaspasetti@outlook.com` e
  // `otavio@nouzlab.com` — não são os e-mails com que essas pessoas entram no
  // hub. Casar só pelo e-mail da conta perderia os dois em todo evento.
  const porEmail = new Map<string, { id: string; name: string }>()
  for (const m of equipe) {
    for (const e of [m.email, ...(m.emails_alternativos || [])]) {
      if (e?.trim()) porEmail.set(e.trim().toLowerCase(), { id: m.id, name: m.name })
    }
  }
  const achados: { id: string; name: string }[] = []
  for (const c of convidados) {
    if (c.responseStatus === 'declined') continue
    const m = porEmail.get((c.email || '').trim().toLowerCase())
    if (m && !achados.some(x => x.id === m.id)) achados.push({ id: m.id, name: m.name })
  }
  return achados
}
