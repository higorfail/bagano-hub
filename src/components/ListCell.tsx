'use client'

import { useRef, useState } from 'react'
import { autoGrow } from '@/lib/autoGrow'

// Célula de texto editável da tabela do cronograma.
//
// Segue o mesmo contrato do EditableField que os cards usam — clique entra em
// edição, sair salva, Esc descarta, e clicar pra soltar uma seleção de texto
// NÃO entra em edição (senão copiar um trecho abriria o editor). O que muda é
// o peso: o EditableField traz rótulo, barra de formatação e botões, que numa
// célula de tabela ocupariam mais espaço que o próprio texto.
//
// `stopPropagation` no clique é o que impede a linha de abrir o card por cima
// da edição — a linha tem três gestos (abrir pelo título, arrastar pela alça,
// editar pela célula) e eles não podem se atropelar.
type Props = {
  value: string
  placeholder?: string
  onCommit: (value: string) => void
  /** Falso no celular: lá o toque abre o card, editar em célula estreita é pior. */
  editable?: boolean
  clampLines?: number
}

export default function ListCell({ value, placeholder = '—', onCommit, editable = true, clampLines = 2 }: Props) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')
  const discardRef = useRef(false)

  function start(e: React.MouseEvent) {
    e.stopPropagation()
    if (!editable) return
    const sel = window.getSelection()
    if (sel && sel.toString().length > 0) return
    setDraft(value)
    discardRef.current = false
    setEditing(true)
  }

  function commit() {
    if (discardRef.current) { discardRef.current = false; setEditing(false); return }
    setEditing(false)
    if (draft !== value) onCommit(draft)
  }

  if (editing) {
    return (
      <textarea
        autoFocus
        value={draft}
        onClick={e => e.stopPropagation()}
        onChange={e => { setDraft(e.target.value); autoGrow(e.currentTarget, 9999) }}
        onBlur={commit}
        // Enter continua quebrando linha (briefing é texto corrido). Quem quer
        // fechar sem tirar a mão do teclado usa Cmd/Ctrl+Enter.
        onKeyDown={e => {
          if (e.key === 'Escape') { e.preventDefault(); discardRef.current = true; setEditing(false) }
          if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); e.currentTarget.blur() }
        }}
        ref={el => { if (el) autoGrow(el, 9999) }}
        className="w-full bg-[var(--color-bg-card)] border border-[var(--color-accent)] rounded-md px-1.5 py-1 text-[12px] leading-snug text-[var(--color-text-primary)] outline-none resize-none"
        style={{ minHeight: 40 }}
      />
    )
  }

  return (
    <div
      onClick={start}
      className={`text-[12px] leading-snug rounded-md -mx-1 px-1 py-0.5 transition-colors
        ${editable ? 'cursor-text hover:bg-[var(--color-bg-subtle)]' : ''}
        ${value ? 'text-[var(--color-text-secondary)]' : 'text-[var(--color-text-faint)]'}`}
      style={value ? { display: '-webkit-box', WebkitLineClamp: clampLines, WebkitBoxOrient: 'vertical', overflow: 'hidden' } : undefined}
    >
      {value || placeholder}
    </div>
  )
}
