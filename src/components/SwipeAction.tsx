'use client'

import { useRef, useState } from 'react'

type Action = {
  label: string
  icon: React.ReactNode
  color: string
  onAction: () => void
}

type Props = {
  /** Revelada ao arrastar pra esquerda. */
  right?: Action
  /** Revelada ao arrastar pra direita. */
  left?: Action
  children: React.ReactNode
  className?: string
}

const REVEAL = 84       // largura da faixa de ação
const COMMIT = 130      // arrastou até aqui, dispara direto ao soltar
const LOCK = 10         // antes disso não dá pra saber se é rolagem ou arrasto

/**
 * Arrastar a linha pra revelar uma ação, como no Mail do iPhone. Serve pro que
 * é repetitivo: marcar 10 publicações como publicadas em 10 gestos, em vez de
 * abrir e fechar 10 cards.
 *
 * Só no toque — no desktop os botões equivalentes continuam no próprio card, e
 * é lá que se clica. Gesto nunca é o único caminho pra uma ação.
 */
export default function SwipeAction({ right, left, children, className = '' }: Props) {
  const [dx, setDx] = useState(0)
  const [animating, setAnimating] = useState(false)
  const start = useRef<{ x: number; y: number } | null>(null)
  const locked = useRef<'none' | 'swipe' | 'scroll'>('none')

  function onTouchStart(e: React.TouchEvent) {
    const t = e.touches[0]
    start.current = { x: t.clientX, y: t.clientY }
    locked.current = 'none'
    setAnimating(false)
  }

  function onTouchMove(e: React.TouchEvent) {
    if (!start.current || locked.current === 'scroll') return
    const t = e.touches[0]
    const mx = t.clientX - start.current.x
    const my = t.clientY - start.current.y

    if (locked.current === 'none') {
      if (Math.abs(mx) < LOCK && Math.abs(my) < LOCK) return
      // Mais vertical que horizontal = a pessoa quer rolar a lista. Sai do
      // caminho, senão a rolagem engasga toda vez que o dedo desvia um pouco.
      locked.current = Math.abs(mx) > Math.abs(my) ? 'swipe' : 'scroll'
      if (locked.current === 'scroll') return
    }

    // Sem ação daquele lado, não arrasta pra lá.
    if (mx < 0 && !right) return
    if (mx > 0 && !left) return
    // Resistência depois do ponto de disparo: o arrasto continua respondendo,
    // mas pesado, avisando pelo tato que já passou do necessário.
    const abs = Math.abs(mx)
    const eased = abs <= COMMIT ? abs : COMMIT + (abs - COMMIT) * 0.25
    setDx(Math.sign(mx) * eased)
  }

  function onTouchEnd() {
    const moved = dx
    start.current = null
    locked.current = 'none'
    setAnimating(true)
    setDx(0)
    if (moved <= -COMMIT && right) right.onAction()
    else if (moved >= COMMIT && left) left.onAction()
  }

  const activeRight = dx < 0 && right
  const activeLeft = dx > 0 && left
  const action = activeRight ? right : activeLeft ? left : null
  const armed = Math.abs(dx) >= COMMIT

  return (
    <div className={`relative overflow-hidden ${className}`}>
      {/* Faixa de ação atrás da linha. Só ganha cor cheia quando o arrasto
          passa do ponto de disparo — antes disso fica esmaecida, dizendo
          "ainda não". */}
      {action && (
        <div
          className={`absolute inset-y-0 flex items-center justify-center gap-1.5 px-4 text-white text-xs font-bold transition-opacity ${activeRight ? 'right-0' : 'left-0'}`}
          style={{ width: Math.max(REVEAL, Math.abs(dx)), background: action.color, opacity: armed ? 1 : 0.55 }}
        >
          {action.icon}
          {Math.abs(dx) > 60 && <span className="whitespace-nowrap">{action.label}</span>}
        </div>
      )}

      <div
        // touch-pan-y: o navegador segue dono da rolagem vertical, e só o
        // horizontal chega aqui. Sem isso a lista trava durante o arrasto.
        className={`relative touch-pan-y ${animating ? 'transition-transform duration-200' : ''}`}
        style={{ transform: dx ? `translateX(${dx}px)` : undefined }}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        onTouchCancel={onTouchEnd}
      >
        {children}
      </div>
    </div>
  )
}
