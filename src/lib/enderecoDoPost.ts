// Quem manda no endereço quando um card de post abre e fecha.
//
// São duas correntes puxando a mesma corda: o endereço quer abrir um card, e o
// card aberto quer virar endereço. Se as duas rodarem soltas elas se atropelam
// — foi assim que clicar num item do "Para você" caía no cronograma do mês
// inteiro: a tela reescrevia o caminho sem o post ANTES do cronograma montar.
//
// A decisão mora aqui, fora do React, porque a ordem em que os efeitos rodam é
// justamente a parte que erra em silêncio. Aqui ela é uma função pura, dá pra
// ler de cima a baixo e dá pra testar sem navegador.

export type EntradaDoEndereco = {
  /** O post que o endereço aponta agora: número ("11") ou UUID. Null = nenhum. */
  noEndereco: string | null
  /** O que a tela já reflete. É a memória entre as duas correntes. */
  refletido: string | null
  /**
   * O id do post carregado que corresponde a `noEndereco`. Null quando a lista
   * ainda não chegou ou quando o post é de outro mês.
   */
  idNoEndereco: string | null
  /** O número do post aberto no card. Null se nada aberto, ou se é post novo. */
  numeroAberto: string | null
}

export type PassoDoEndereco =
  /** Abrir este post (é o id, não o número). */
  | { abrir: string }
  /** Escrever isto no endereço. Null limpa o post e deixa só o mês. */
  | { escrever: string | null }
  /** Já está tudo alinhado. */
  | null

export function proximoPassoDoEndereco(e: EntradaDoEndereco): PassoDoEndereco {
  // Endereço → card tem prioridade, e sai DIRETO.
  //
  // Sair aqui é o ponto todo: enquanto existe um pedido do endereço que a tela
  // ainda não atendeu, ninguém escreve endereço nenhum. Sem isso, a corrente
  // de baixo leria "nenhum card aberto" no exato instante entre o pedido e a
  // abertura, e limparia o endereço que acabou de chegar.
  if (e.noEndereco && e.noEndereco !== e.refletido) {
    // Sem o post carregado não dá pra abrir — mas também não se escreve nada,
    // senão o pedido morre. Quando a lista chegar, passa de novo por aqui.
    return e.idNoEndereco ? { abrir: e.idNoEndereco } : null
  }
  // Card → endereço.
  if (e.numeroAberto === e.refletido) return null
  return { escrever: e.numeroAberto }
}
