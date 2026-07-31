'use client'

// ─────────────────────────────────────────────────────────────────────────────
// Arrastar card no iPad/iPhone
//
// Todos os quadros do hub usam a API de arrastar do HTML (`draggable` +
// onDragStart/onDrop). O Safari do iOS NÃO dispara esses eventos a partir do
// toque — só do mouse. Resultado: no iPad, que é o aparelho onde a social
// media mais trabalha, mover card entre colunas simplesmente não funcionava,
// em lugar nenhum: Publicações, Kanban, Materiais, Extras, Quadro pessoal,
// calendário do Cronograma e semana do Social.
//
// Esta ponte escuta o toque e sintetiza os mesmos eventos que o código já
// espera. Uma peça conserta todos os quadros de uma vez, e nada dos caminhos
// de mouse (que funcionam) precisa ser tocado.
//
// TOQUE LONGO pra pegar, não arrasto imediato: o quadro rola na horizontal e
// na vertical, então começar a arrastar ao primeiro movimento roubaria a
// rolagem. É também o que o app do Trello faz no iPad.
// ─────────────────────────────────────────────────────────────────────────────

const HOLD_MS = 220        // tempo de toque parado pra "pegar" o card
const MOVE_TOLERANCE = 10  // mexeu mais que isso antes do tempo = rolagem
const EDGE = 60            // faixa perto da borda que rola sozinha
const EDGE_SPEED = 12

type State = {
  source: HTMLElement
  dataTransfer: DataTransfer
  ghost: HTMLElement
  lastOver: Element | null
  offsetX: number
  offsetY: number
}

let state: State | null = null
let holdTimer: ReturnType<typeof setTimeout> | null = null
let pending: { el: HTMLElement; x: number; y: number } | null = null
let rafId: number | null = null

function fire(target: EventTarget, type: string, dataTransfer: DataTransfer, x: number, y: number) {
  // DragEvent aceita o dataTransfer no construtor, e o React escuta os eventos
  // nativos na raiz — então um evento que borbulha chega nos onDragStart/onDrop
  // que já existem, sem nenhuma mudança nos componentes.
  const ev = new DragEvent(type, {
    bubbles: true, cancelable: true, composed: true,
    clientX: x, clientY: y, dataTransfer,
  })
  target.dispatchEvent(ev)
  return ev
}

function makeGhost(el: HTMLElement, x: number, y: number) {
  const rect = el.getBoundingClientRect()
  const ghost = el.cloneNode(true) as HTMLElement
  ghost.style.position = 'fixed'
  ghost.style.left = `${rect.left}px`
  ghost.style.top = `${rect.top}px`
  ghost.style.width = `${rect.width}px`
  ghost.style.height = `${rect.height}px`
  ghost.style.pointerEvents = 'none'
  ghost.style.zIndex = '9999'
  ghost.style.opacity = '0.9'
  ghost.style.transform = 'scale(1.03) rotate(1.5deg)'
  ghost.style.boxShadow = '0 12px 32px rgba(0,0,0,.28)'
  ghost.style.transition = 'none'
  document.body.appendChild(ghost)
  return { ghost, offsetX: x - rect.left, offsetY: y - rect.top }
}

/** Rola o container quando o dedo chega perto da borda — sem isso não dá pra
 *  levar um card pra uma coluna que está fora da tela. */
function autoScroll(x: number, y: number) {
  let el = document.elementFromPoint(x, y) as HTMLElement | null
  while (el) {
    const canX = el.scrollWidth - el.clientWidth > 2
    const canY = el.scrollHeight - el.clientHeight > 2
    if (canX || canY) {
      const r = el.getBoundingClientRect()
      if (canX && x - r.left < EDGE) el.scrollLeft -= EDGE_SPEED
      else if (canX && r.right - x < EDGE) el.scrollLeft += EDGE_SPEED
      if (canY && y - r.top < EDGE) el.scrollTop -= EDGE_SPEED
      else if (canY && r.bottom - y < EDGE) el.scrollTop += EDGE_SPEED
      if (canX || canY) return
    }
    el = el.parentElement
  }
}

function cancelPending() {
  if (holdTimer) { clearTimeout(holdTimer); holdTimer = null }
  pending = null
}

function endDrag(x: number, y: number, drop: boolean) {
  if (!state) return
  const s = state
  state = null
  detachBlocking()
  if (rafId) { cancelAnimationFrame(rafId); rafId = null }

  s.ghost.remove()
  s.source.style.opacity = ''

  const over = document.elementFromPoint(x, y)
  if (drop && over) {
    fire(over, 'dragover', s.dataTransfer, x, y)
    fire(over, 'drop', s.dataTransfer, x, y)
  }
  fire(s.source, 'dragend', s.dataTransfer, x, y)
  document.body.style.userSelect = ''
}

function onTouchStart(e: TouchEvent) {
  if (state) return
  const t = e.touches[0]
  // Sobe até achar o elemento marcado como arrastável — o toque quase sempre
  // cai num filho (texto, avatar, selo).
  const el = (t.target as HTMLElement)?.closest?.('[draggable="true"]') as HTMLElement | null
  if (!el) return

  pending = { el, x: t.clientX, y: t.clientY }
  holdTimer = setTimeout(() => {
    if (!pending) return
    const { el, x, y } = pending
    pending = null
    holdTimer = null

    const dataTransfer = new DataTransfer()
    const started = fire(el, 'dragstart', dataTransfer, x, y)
    // Componente pode cancelar o arrasto (ex.: card em estado que não move).
    if (started.defaultPrevented) return

    const { ghost, offsetX, offsetY } = makeGhost(el, x, y)
    el.style.opacity = '0.4'
    document.body.style.userSelect = 'none'
    state = { source: el, dataTransfer, ghost, lastOver: null, offsetX, offsetY }
    attachBlocking()
    // Sinal tátil de que o card foi "pego" — sem isso o toque longo parece
    // que não fez nada até o dedo se mover.
    ;(navigator as any).vibrate?.(8)
  }, HOLD_MS)
}

function onTouchMove(e: TouchEvent) {
  const t = e.touches[0]

  if (pending) {
    // Mexeu antes de completar o tempo: era rolagem, não arrasto.
    if (Math.abs(t.clientX - pending.x) > MOVE_TOLERANCE || Math.abs(t.clientY - pending.y) > MOVE_TOLERANCE) cancelPending()
    return
  }
  if (!state) return

  // Quem segura a rolagem é o listener não-passivo (onTouchMoveBlocking), que
  // só existe enquanto o arrasto está ativo.
  const x = t.clientX, y = t.clientY
  state.ghost.style.left = `${x - state.offsetX}px`
  state.ghost.style.top = `${y - state.offsetY}px`

  const over = document.elementFromPoint(x, y)
  if (over && over !== state.lastOver) {
    if (state.lastOver) fire(state.lastOver, 'dragleave', state.dataTransfer, x, y)
    fire(over, 'dragenter', state.dataTransfer, x, y)
    state.lastOver = over
  }
  if (over) fire(over, 'dragover', state.dataTransfer, x, y)

  if (!rafId) {
    const step = () => { rafId = null; autoScroll(x, y) }
    rafId = requestAnimationFrame(step)
  }
}

function onTouchEnd(e: TouchEvent) {
  cancelPending()
  if (!state) return
  const t = e.changedTouches[0]
  endDrag(t.clientX, t.clientY, true)
}

function onTouchCancel(e: TouchEvent) {
  cancelPending()
  if (!state) return
  const t = e.changedTouches[0]
  endDrag(t?.clientX ?? 0, t?.clientY ?? 0, false)
}

let installed = false
let blockingAttached = false

// O touchmove NÃO-PASSIVO só entra em cena depois que o card já foi pego, e
// sai assim que o arrasto acaba.
//
// Deixá-lo registrado o tempo todo custa caro: um listener não-passivo em
// touchmove no documento desliga o caminho rápido de rolagem do navegador,
// e foi isso que deixou o snap dos quadros "frouxo" — a coluna parava fora
// do lugar em vez de encaixar. O passivo abaixo é suficiente pra detectar.
function attachBlocking() {
  if (blockingAttached) return
  blockingAttached = true
  document.addEventListener('touchmove', onTouchMoveBlocking, { passive: false })
}
function detachBlocking() {
  if (!blockingAttached) return
  blockingAttached = false
  document.removeEventListener('touchmove', onTouchMoveBlocking)
}
function onTouchMoveBlocking(e: TouchEvent) {
  if (state) e.preventDefault()
}

/** Liga a ponte uma vez, no layout. Não faz nada em aparelho sem toque. */
export function installTouchDragBridge() {
  if (installed || typeof window === 'undefined') return
  if (!('ontouchstart' in window)) return
  installed = true
  document.addEventListener('touchstart', onTouchStart, { passive: true })
  document.addEventListener('touchmove', onTouchMove, { passive: true })
  document.addEventListener('touchend', onTouchEnd, { passive: true })
  document.addEventListener('touchcancel', onTouchCancel, { passive: true })
}
