'use client'

import { useRef } from 'react'

/**
 * Cria o card UMA vez, mesmo com várias chamadas ao mesmo tempo.
 *
 * O guard natural — `if (id) return id` — usa estado do React, e estado não
 * muda na hora: `setId()` só vale no próximo render. Então dois campos tocados
 * em sequência rápida (ou um blur junto com um clique) chamam a criação com o
 * id ainda vazio nos dois, e cada chamada insere um card.
 *
 * Foi assim que saíram 5 e 11 posts "Sem título" em rajada no cronograma —
 * todos do mesmo card, criados enquanto o primeiro insert ainda estava no ar.
 *
 * Duas travas aqui, porque uma só não basta:
 *   - `idRef`: escrito no mesmo instante em que o insert responde, sem esperar
 *     render. Quem chegar depois já enxerga.
 *   - `emVoo`: quem chegar DURANTE o insert espera a mesma promessa em vez de
 *     começar outro. É essa que resolve a rajada de verdade.
 */
export function useEnsureOnce() {
  const idRef = useRef<string | undefined>(undefined)
  const emVoo = useRef<Promise<string | undefined> | null>(null)

  return async function ensure(
    /** O id que o componente já conhece (estado ou prop) — card existente. */
    known: string | undefined,
    criar: () => Promise<string | undefined>,
  ): Promise<string | undefined> {
    if (known) { idRef.current = known; return known }
    if (idRef.current) return idRef.current
    if (emVoo.current) return emVoo.current

    emVoo.current = (async () => {
      const novo = await criar()
      if (novo) idRef.current = novo
      return novo
    })()
    try {
      return await emVoo.current
    } finally {
      // Some depois de resolver: se a criação falhou, a próxima tentativa
      // precisa poder tentar de novo em vez de ficar presa numa promessa velha.
      emVoo.current = null
    }
  }
}
