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

/**
 * A gaveta inteira num estado só.
 *
 * Antes eram dois ganchos independentes — um pra abrir arrastando da borda,
 * outro pra fechar arrastando de volta — e cada um com seu deslocamento. Como
 * a opacidade do fundo escuro era calculada a partir dos dois, bastava um
 * ficar dessincronizado do outro pra tela ficar preta com a gaveta fechada, ou
 * a gaveta não aparecer com o fundo escuro. Não dava pra remendar: eram dois
 * donos do mesmo pedaço de realidade.
 *
 * Agora existe UM número, `progress` (0 = fechada, 1 = aberta). Posição da
 * gaveta e opacidade do fundo saem os dois dele, então é impossível eles
 * discordarem.
 */
export function useDrawer({ open, setOpen, width = 256, zone = 36 }: {
  open: boolean
  setOpen: (v: boolean) => void
  width?: number
  zone?: number
}) {
  const [drag, setDrag] = useState<number | null>(null) // null = ninguém arrastando
  const openRef = useRef(open); openRef.current = open
  const dragRef = useRef<number | null>(null); dragRef.current = drag
  const setOpenRef = useRef(setOpen); setOpenRef.current = setOpen

  useEffect(() => {
    // ABRIR pela borda só existe no app instalado.
    //
    // No Safari, arrastar da borda esquerda pra direita é o "voltar" do iOS, e
    // minha faixa ficava exatamente em cima dele: em vez de abrir o menu, a
    // página inteira deslizava e voltava. Não dá pra cancelar (os listeners
    // são passivos de propósito, pra não engasgar a rolagem) e nem se deveria
    // — a pessoa perderia o "voltar" do navegador numa faixa da tela.
    //
    // Instalado na tela de início não existe gesto de voltar, então a borda
    // fica livre. É onde a equipe usa, já que notificação no iPhone só
    // funciona nesse modo. No Safari o burger abre, como sempre abriu.
    const canOpenByEdge = isStandalone()
    let startX: number | null = null
    let startY = 0
    let axis: 'none' | 'x' | 'other' = 'none'
    // Últimas amostras pra medir velocidade — um lance rápido fecha mesmo sem
    // chegar na metade, que é como toda gaveta de app se comporta. Só a
    // distância obriga a arrastar o caminho todo, e é isso que faz parecer
    // que "às vezes vai, às vezes não".
    let samples: { t: number; x: number }[] = []

    function onStart(e: TouchEvent) {
      const t = e.touches[0]
      axis = 'none'
      startY = t.clientY
      samples = [{ t: e.timeStamp, x: t.clientX }]
      // ABERTA: arma em QUALQUER ponto da tela. A gaveta é modal — o resto da
      // tela está atrás de um véu e não tem nada pra fazer ali, então exigir
      // que o dedo comece em cima dela é uma restrição sem motivo.
      // FECHADA: só a faixa da borda, senão roubaria a rolagem da página.
      // FECHAR arrastando vale sempre e em qualquer ponto: o movimento é pra
      // esquerda, que não disputa com gesto nenhum do sistema.
      if (openRef.current) startX = t.clientX
      else startX = (canOpenByEdge && t.clientX <= zone) ? t.clientX : null
    }
    function onMove(e: TouchEvent) {
      if (startX === null) return
      const t = e.touches[0]
      const dx = t.clientX - startX
      const dy = t.clientY - startY
      samples.push({ t: e.timeStamp, x: t.clientX })
      if (samples.length > 5) samples.shift()
      if (axis === 'none') {
        if (Math.abs(dx) < DIRECTION_LOCK && Math.abs(dy) < DIRECTION_LOCK) return
        // Vertical vence: é rolagem do menu, não gesto de gaveta.
        axis = Math.abs(dx) > Math.abs(dy) ? 'x' : 'other'
        if (axis !== 'x') { startX = null; return }
      }
      const base = openRef.current ? width : 0
      setDrag(Math.max(0, Math.min(base + dx, width)))
    }
    function onEnd() {
      const d = dragRef.current
      const wasOpen = openRef.current
      const first = samples[0]
      const last = samples[samples.length - 1]
      startX = null
      axis = 'none'
      if (d === null) { samples = []; return }
      setDrag(null)

      // px por milissegundo nas últimas amostras.
      const dt = last && first ? last.t - first.t : 0
      const v = dt > 0 ? (last.x - first.x) / dt : 0
      samples = []

      const FLICK = 0.35
      if (v < -FLICK) { setOpenRef.current(false); return }  // lance pra esquerda fecha
      if (v > FLICK)  { setOpenRef.current(true);  return }  // lance pra direita abre
      // Sem lance, decide pela posição — e o ponto de virada é menor pra
      // fechar (30%) do que pra abrir (50%): fechar é a intenção mais comum
      // de quem já está com a gaveta aberta.
      setOpenRef.current(wasOpen ? d > width * 0.3 : d > width * 0.5)
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
  }, [width, zone])

  // Rede de segurança: qualquer mudança de rota ou fechamento por botão zera o
  // arrasto. Sem isso um gesto interrompido no meio deixava resíduo.
  useEffect(() => { setDrag(null) }, [open])

  const progress = drag !== null ? drag / width : (open ? 1 : 0)
  return { progress, dragging: drag !== null, width }
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
  const armedAxis = useRef<'none' | 'yes' | 'no'>('none')
  const startX = useRef(0)
  const THRESHOLD = 72
  const MAX = 110

  const onTouchStart = useCallback((e: React.TouchEvent) => {
    if (!enabled || refreshing) { startY.current = null; return }
    // Pergunta ao elemento sob o DEDO, não ao <main>.
    //
    // Antes olhava o scrollTop do <main>, que num quadro nunca sai de zero
    // (quem rola é a coluna lá dentro). Resultado: qualquer arrasto pra baixo
    // em qualquer lugar armava o gesto, e rolar a coluna de volta pro topo
    // atualizava a página sem querer — foi o "muito sensível" relatado.
    if (canScrollFurther(e.target, 'y', 1, e.currentTarget as HTMLElement)) { startY.current = null; return }
    const sc = e.currentTarget as HTMLElement
    if (sc.scrollTop > 0) { startY.current = null; return }
    startY.current = e.touches[0].clientY
    startX.current = e.touches[0].clientX
    armedAxis.current = 'none'
  }, [enabled, refreshing])

  const onTouchMove = useCallback((e: React.TouchEvent) => {
    if (startY.current === null) return
    const dy = e.touches[0].clientY - startY.current
    const dx = e.touches[0].clientX - startX.current

    if (armedAxis.current === 'none') {
      if (Math.abs(dy) < DIRECTION_LOCK && Math.abs(dx) < DIRECTION_LOCK) return
      // Movimento mais horizontal = trocar de coluna no quadro, não atualizar.
      armedAxis.current = dy > Math.abs(dx) ? 'yes' : 'no'
      if (armedAxis.current === 'no') { startY.current = null; return }
    }
    if (dy <= 0) { setPull(0); return }
    // Elástico: o indicador anda cada vez menos conforme o dedo desce, então
    // passar do ponto de disparo é sentido pela mão antes de ser lido na tela.
    const eased = MAX * (1 - Math.exp(-dy / 120))
    setPull(eased)
  }, [])

  const onTouchEnd = useCallback(async () => {
    const shouldRefresh = pull >= THRESHOLD
    startY.current = null
    armedAxis.current = 'none'
    setPull(0)
    if (!shouldRefresh || refreshing) return
    setRefreshing(true)
    try { await onRefresh() } finally { setRefreshing(false) }
  }, [pull, refreshing, onRefresh])

  return {
    pull,
    refreshing,
    /** 0→1 até o ponto de disparo, pro anel de progresso. */
    progress: Math.min(pull / THRESHOLD, 1),
    armed: pull >= THRESHOLD,
    handlers: { onTouchStart, onTouchMove, onTouchEnd, onTouchCancel: onTouchEnd },
  }
}
