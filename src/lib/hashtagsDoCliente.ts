// O bloco fixo de hashtags que fecha as legendas de um cliente.
//
// Mora em `client_manuals.hashtags`, escrito na aba "Dia a dia" do manual, e é
// colado no fim da legenda por um botão no card — sem passar pela IA.
//
// Por que colar de verdade, e não somar na hora de copiar: um campo que mostra
// uma coisa e vale outra obriga TODA tela a lembrar de somar o bloco — a
// aprovação do cliente, o feed simulado, o copiar. No dia em que uma esquecer,
// o cliente aprova uma legenda e publica outra. Aqui o que está no campo é o
// que todo mundo vê, e dá pra editar ou apagar depois de colado.

/** Separa a legenda do bloco com uma linha em branco, como se escreve no Insta. */
const SEPARADOR = '\n\n'

const limpo = (s: string | null | undefined) => (s || '').trim()

/**
 * O bloco já está no fim da legenda?
 *
 * Compara ignorando espaço e quebra de linha porque o bloco é colado com
 * separador, e quem editou a legenda depois pode ter mexido no espaçamento —
 * sem isso, o botão ofereceria colar de novo o que já está lá.
 */
export function jaTemHashtags(legenda: string | null | undefined, bloco: string | null | undefined): boolean {
  const b = limpo(bloco)
  if (!b) return false
  const comprimir = (s: string) => s.replace(/\s+/g, ' ').trim()
  return comprimir(limpo(legenda)).endsWith(comprimir(b))
}

/** Devolve a legenda com o bloco no fim. Se já estiver lá, devolve igual. */
export function colarHashtags(legenda: string | null | undefined, bloco: string | null | undefined): string {
  const b = limpo(bloco)
  const l = limpo(legenda)
  if (!b) return l
  if (jaTemHashtags(l, b)) return l
  // Legenda vazia vira só o bloco: começar com duas linhas em branco deixaria
  // um buraco no alto do texto que vai pro cliente.
  return l ? l + SEPARADOR + b : b
}

/** Quantas hashtags tem o bloco — serve de conferência rápida na tela. */
export function contarHashtags(bloco: string | null | undefined): number {
  return limpo(bloco).split(/\s+/).filter(t => t.startsWith('#')).length
}
