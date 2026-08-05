'use client'

import { useEffect, useState } from 'react'

/**
 * Consulta de mídia como estado de React, pro caso em que a diferença entre
 * telas não é só visual e sim de COMPORTAMENTO — aí CSS não resolve.
 *
 * Começa `false` e só liga depois de montar, de propósito: no servidor não
 * existe janela, e chutar um valor faria o primeiro render do cliente
 * divergir do HTML entregue.
 */
export function useMediaQuery(query: string) {
  const [matches, setMatches] = useState(false)

  useEffect(() => {
    const mq = window.matchMedia(query)
    setMatches(mq.matches)
    const onChange = (e: MediaQueryListEvent) => setMatches(e.matches)
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [query])

  return matches
}

/** Onde a tabela do cronograma cabe e a edição em linha faz sentido. */
export function useIsWideScreen() {
  return useMediaQuery('(min-width: 640px)')
}
