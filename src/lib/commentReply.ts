// Responder comentário no estilo do Trello: em vez de aninhar a resposta
// embaixo do original, a caixa de comentário já abre preenchida com o trecho
// citado e a menção ao autor. A lista segue achatada e em ordem de tempo, que
// é o que o feed do card precisa — comentários e atividades ("Fulano mudou a
// data") dividem a mesma lista ordenada por hora, e aninhar quebraria essa
// leitura.
//
// A menção não é enfeite: `ensureWatchingFromMentions` transforma @Nome em
// observador do card, então quem é respondido recebe push mesmo sem estar
// acompanhando. Sem ela, responder seria silencioso.

// Citação longa demais vira parede de texto e engole a resposta em si.
const MAX_QUOTE = 140

export function quoteOf(body: string): string {
  // Citação de citação empilha ">" a cada rodada e em três respostas o
  // comentário vira só marcação — fica só o texto de quem escreveu.
  const ownText = body
    .split('\n')
    .filter(line => !line.trim().startsWith('>'))
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim()

  if (!ownText) return ''
  return ownText.length > MAX_QUOTE ? ownText.slice(0, MAX_QUOTE).trimEnd() + '…' : ownText
}

/**
 * Monta o rascunho da resposta. Preserva o que a pessoa já tinha digitado —
 * clicar em "Responder" com um texto pela metade na caixa não pode apagá-lo.
 */
export function buildReplyDraft(authorName: string | null, body: string, currentDraft = ''): string {
  const quote = quoteOf(body)
  const mention = authorName ? `@${authorName} ` : ''
  const header = quote ? `> ${authorName ? `${authorName}: ` : ''}${quote}\n\n` : ''
  const kept = currentDraft.trim()
  return `${header}${mention}${kept}`
}

/** Linhas de citação ficam agrupadas pra virar um bloco só na renderização. */
export function isQuoteLine(line: string): boolean {
  return line.trimStart().startsWith('>')
}

export function stripQuoteMarker(line: string): string {
  return line.replace(/^\s*>\s?/, '')
}
