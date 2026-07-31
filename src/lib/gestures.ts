'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

// Gestos de toque do hub. Três regras que valem pra todos daqui:
//
// 1. Todo gesto tem um botão equivalente à mostra. Gesto é invisível — quem não
//    souber que existe precisa continuar conseguindo fazer a mesma coisa.
// 2. Nunca capturar um eixo onde já existe rolagem nativa. Por isso os gestos
//    verticais desistem quando o dedo está sobre algo que rola, e os
//    horizontais desistem quando o movimento é mais vertical que horizontal.
// 3. Nada de preventDefault preventivo: só depois de decidir que o gesto é
//    horizontal/vertical, senão a rolagem normal da página engasga.

/** Antes disso, não dá pra saber se a pessoa quer rolar ou deslizar. */
const DIRECTION_LOCK = 10

export function isStandalone(): boolean {
  if (typeof window === 'undefined') return false
  return window.matchMedia?.('(display-mode: standalone)').matches || (navigator as any).standalone === true
}

/**
 * Existe algum pai que ainda consegue rolar NAQUELE sentido?
 *
 * Só dá pra perguntar isso depois de saber a direção do gesto — por isso a
 * checagem acontece no momento em que a direção trava, não no início do toque.
 * Perguntar antes era um bug real: a barra lateral tem um menu que rola na
 * vertical e, pela regra do CSS, um elemento com `overflow-y: auto` passa a
 * computar `overflow-x: auto` também. A checagem enxergava esse menu como
 * rolável na horizontal e desistia do gesto antes de ele começar — era por
 * isso que arrastar a gaveta de volta não fechava.
 */
function canScrollFurther(
  start: EventTarget | null, axis: 'x' | 'y', sign: 1 | -1, stopAt?: HTMLElement | null,
): boolean {
  let el = start as HTMLElement | null
  while (el && el !== stopAt) {
    const style = window.getComputedStyle(el)
    const overflow = axis === 'x' ? style.overflowX : style.overflowY
    if (overflow === 'auto' || overflow === 'scroll') {
      const max = axis === 'x' ? el.scrollWidth - el.clientWidth : el.scrollHeight - el.clientHeight
      const pos = axis === 'x' ? el.scrollLeft : el.scrollTop
      if (max > 2) {
        // Dedo pra direita/baixo (sign 1) revela conteúdo anterior: só rola se
        // não estiver no começo. Pro outro lado, se não estiver no fim.
        if (sign === 1 ? pos > 1 : pos < max - 1) return true
      }
    }
    el = el.parentElement
  }
  return false
}

type EdgeSwipeOptions = {
  onOpen: () => void
  /** Largura da faixa sensível a partir da borda. */
  zone?: number
  enabled?: boolean
}

/**
 * Arrastar da borda esquerda pra abrir o menu.
 *
 * No app instalado a borda está livre. No Safari solto ela é o "voltar" do
 * iOS — briga que não se ganha nem se deve ganhar —, então a faixa começa
 * alguns pixels pra dentro e deixa o extremo pro sistema.
 */
export function useEdgeSwipe({ onOpen, zone = 28, enabled = true, width = 256 }: EdgeSwipeOptions & { width?: number }) {
  const startX = useRef<number | null>(null)
  const startY = useRef(0)
  const decided = useRef<'none' | 'yes' | 'no'>('none')
  // Deslocamento ao vivo pra gaveta acompanhar o dedo em vez de aparecer de
  // uma vez ao passar de um limite. Abrir "pulando" e fechar acompanhando
  // seriam dois gestos diferentes pro mesmo movimento.
  const [offset, setOffset] = useState(0)
  const [dragging, setDragging] = useState(false)

  useEffect(() => {
    if (!enabled) { setOffset(0); setDragging(false); return }
    const inset = isStandalone() ? 0 : 20

    function onStart(e: TouchEvent) {
      const t = e.touches[0]
      decided.current = 'none'
      startX.current = (t.clientX >= inset && t.clientX <= inset + zone) ? t.clientX : null
      startY.current = t.clientY
    }
    function onMove(e: TouchEvent) {
      if (startX.current === null) return
      const t = e.touches[0]
      const dx = t.clientX - startX.current
      const dy = t.clientY - startY.current
      if (decided.current === 'none') {
        if (Math.abs(dx) < DIRECTION_LOCK && Math.abs(dy) < DIRECTION_LOCK) return
        decided.current = dx > Math.abs(dy) ? 'yes' : 'no'
        if (decided.current === 'yes') setDragging(true)
      }
      if (decided.current !== 'yes') return
      setOffset(Math.max(0, Math.min(dx, width)))
    }
    function onEnd() {
      const opened = decided.current === 'yes' && offsetRef.current > width * 0.35
      startX.current = null
      decided.current = 'none'
      setDragging(false)
      setOffset(0)
      if (opened) onOpen()
    }

    document.addEventListener('touchstart', onStart, { passive: true })
    document.addEventListener('touchmove', onMove, { passive: true })
    document.addEventListener('touchend', onEnd, { passive: true })
    document.addEventListener('touchcancel', onEnd, { passive: true })
    return () => {
      document.removeEventListener('touchstart', onStart)
      document.removeEventListener('touchmove', onMove)
      document.removeEventListener('touchend', onEnd)
      document.removeEventListener('touchcancel', onEnd)
    }
  }, [onOpen, zone, enabled, width])

  // O listener é registrado uma vez e não enxerga o estado novo; a ref é o que
  // permite ler o deslocamento atual na hora de soltar.
  const offsetRef = useRef(0)
  offsetRef.current = offset

  return { offset, dragging }
}

/**
 * Arrastar pra fechar — usado pelo menu (eixo x) e pelos cards (eixo y).
 * Devolve o deslocamento atual pra quem chama acompanhar com transform,
 * porque um gesto sem resposta visual parece travado.
 */
export function useDragToDismiss(opts: {
  axis: 'x' | 'y'
  /** Sentido que fecha: -1 pra esquerda/cima, 1 pra direita/baixo. */
  direction: 1 | -1
  onDismiss: () => void
  threshold?: number
  enabled?: boolean
}) {
  const { axis, direction, onDismiss, threshold = 90, enabled = true } = opts
  const [offset, setOffset] = useState(0)
  const [dragging, setDragging] = useState(false)
  const start = useRef<{ x: number; y: number } | null>(null)
  const locked = useRef<'none' | 'yes' | 'no'>('none')

  const target = useRef<EventTarget | null>(null)
  const container = useRef<HTMLElement | null>(null)

  const onTouchStart = useCallback((e: React.TouchEvent) => {
    if (!enabled) return
    const t = e.touches[0]
    start.current = { x: t.clientX, y: t.clientY }
    target.current = e.target
    container.current = e.currentTarget as HTMLElement
    locked.current = 'none'
  }, [enabled])

  const onTouchMove = useCallback((e: React.TouchEvent) => {
    if (!start.current || locked.current === 'no') return
    const t = e.touches[0]
    const dx = t.clientX - start.current.x
    const dy = t.clientY - start.current.y
    const main = axis === 'x' ? dx : dy
    const cross = axis === 'x' ? dy : dx

    if (locked.current === 'none') {
      if (Math.abs(main) < DIRECTION_LOCK && Math.abs(cross) < DIRECTION_LOCK) return
      // Movimento mais no outro eixo: é rolagem, sai do caminho.
      if (Math.abs(main) <= Math.abs(cross)) { locked.current = 'no'; return }
      // Agora que a direção é conhecida, dá pra perguntar se algum pai ainda
      // rola PRA ESSE LADO. Se rola, o gesto é dele.
      const sign: 1 | -1 = main > 0 ? 1 : -1
      if (canScrollFurther(target.current, axis, sign, container.current)) { locked.current = 'no'; return }
      locked.current = 'yes'
      setDragging(true)
    }
    // Só arrasta no sentido que fecha; no contrário fica firme.
    const moved = direction === 1 ? Math.max(0, main) : Math.min(0, main)
    setOffset(moved)
  }, [axis, direction])

  const onTouchEnd = useCallback(() => {
    const passed = Math.abs(offset) >= threshold
    start.current = null
    locked.current = 'none'
    setDragging(false)
    setOffset(0)
    if (passed) onDismiss()
  }, [offset, threshold, onDismiss])

  return {
    offset,
    dragging,
    handlers: { onTouchStart, onTouchMove, onTouchEnd, onTouchCancel: onTouchEnd },
  }
}

/**
 * Puxar pra atualizar. No app instalado o navegador não oferece isso, então
 * sem esse gesto não existe NENHUMA forma de recarregar sem fechar e abrir.
 * Só arma quando a lista já está no topo — no meio da rolagem, puxar pra
 * baixo é rolar.
 */
export function usePullToRefresh(onRefresh: () => Promise<void> | void, enabled = true) {
  const [pull, setPull] = useState(0)
  const [refreshing, setRefreshing] = useState(false)
  const startY = useRef<number | null>(null)
  const THRESHOLD = 70

  const onTouchStart = useCallback((e: React.TouchEvent) => {
    if (!enabled || refreshing) return
    const sc = e.currentTarget as HTMLElement
    startY.current = sc.scrollTop <= 0 ? e.touches[0].clientY : null
  }, [enabled, refreshing])

  const onTouchMove = useCallback((e: React.TouchEvent) => {
    if (startY.current === null) return
    const dy = e.touches[0].clientY - startY.current
    if (dy <= 0) { setPull(0); return }
    // Resistência: o arrasto anda menos que o dedo, pra dar a sensação de
    // elástico e não de a tela ter descolado.
    setPull(Math.min(dy * 0.45, THRESHOLD * 1.4))
  }, [])

  const onTouchEnd = useCallback(async () => {
    const shouldRefresh = pull >= THRESHOLD
    startY.current = null
    setPull(0)
    if (!shouldRefresh || refreshing) return
    setRefreshing(true)
    try { await onRefresh() } finally { setRefreshing(false) }
  }, [pull, refreshing, onRefresh])

  return {
    pull,
    refreshing,
    armed: pull >= THRESHOLD,
    handlers: { onTouchStart, onTouchMove, onTouchEnd, onTouchCancel: onTouchEnd },
  }
}
