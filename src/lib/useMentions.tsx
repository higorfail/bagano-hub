'use client'

import { useRef, useState, useCallback } from 'react'
import { createPortal } from 'react-dom'

type Member = { id: string; name: string; color?: string | null }

// Renderiza o corpo de um comentário destacando as @menções (igual ao cronograma)
export function renderWithMentions(body: string) {
  return body.split(/(@\S+)/g).map((part, i) =>
    /^@\S+/.test(part)
      ? <strong key={i} style={{ color: 'var(--color-accent)' }}>{part}</strong>
      : <span key={i}>{part}</span>
  )
}

function memberInitials(name: string) {
  return name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()
}

/**
 * Hook de @menções para o textarea de comentário — mesma UX do PostCard (cronograma).
 * Retorna a ref do textarea, handlers para compor no onChange/onKeyDown/onBlur,
 * e o dropdown (portal) pronto para renderizar.
 */
export function useMentions(
  value: string,
  setValue: (v: string) => void,
  members: Member[],
) {
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [pos, setPos] = useState<{ top: number; left: number; width: number } | null>(null)

  const handleChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value
    setValue(val)
    const caret = e.target.selectionStart ?? val.length
    const before = val.slice(0, caret)
    const m = before.match(/@(\w*)$/)
    if (m) {
      setOpen(true)
      setQuery(m[1])
      const rect = textareaRef.current?.getBoundingClientRect()
      if (rect) setPos({ top: rect.top, left: rect.left, width: rect.width })
    } else {
      setOpen(false)
    }
  }, [setValue])

  // Deve ser chamado no início do onKeyDown do textarea.
  // Retorna true se consumiu a tecla (o card deve dar return).
  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (open && e.key === 'Escape') { setOpen(false); return true }
    return false
  }, [open])

  const handleBlur = useCallback(() => {
    timer.current = setTimeout(() => setOpen(false), 150)
  }, [])

  const insert = useCallback((member: Member) => {
    const ta = textareaRef.current
    const caret = ta?.selectionStart ?? value.length
    const before = value.slice(0, caret)
    const after = value.slice(caret)
    const match = before.match(/@\w*$/)
    const start = match ? caret - match[0].length : caret
    const firstName = member.name.split(' ')[0]
    const inserted = value.slice(0, start) + `@${firstName} ` + after
    setValue(inserted)
    setOpen(false)
    requestAnimationFrame(() => {
      ta?.focus()
      const p = start + firstName.length + 2
      ta?.setSelectionRange(p, p)
    })
  }, [value, setValue])

  const dropdown = open && pos ? (() => {
    const filtered = members
      .filter(m => !query || m.name.toLowerCase().startsWith(query.toLowerCase()))
      .slice(0, 6)
    if (filtered.length === 0) return null
    return createPortal(
      <div style={{ position: 'fixed', bottom: window.innerHeight - pos.top + 4, left: pos.left, width: pos.width, zIndex: 9999, background: 'var(--color-bg-card)', border: '1px solid var(--color-border)', borderRadius: 12, boxShadow: '0 8px 32px rgba(0,0,0,0.18)', overflow: 'hidden' }}>
        {filtered.map(m => (
          <button key={m.id} onMouseDown={e => { e.preventDefault(); insert(m) }}
            className="w-full flex items-center gap-2 px-3 py-2 hover:bg-[var(--color-bg-subtle)] text-left transition-colors">
            <div className="w-5 h-5 rounded-md flex items-center justify-center text-white text-[9px] font-bold flex-shrink-0"
              style={{ background: m.color || 'var(--color-brand)' }}>
              {memberInitials(m.name)}
            </div>
            <span className="text-xs font-medium text-[var(--color-text-primary)]">{m.name}</span>
          </button>
        ))}
      </div>,
      document.body
    )
  })() : null

  return { textareaRef, handleChange, handleKeyDown, handleBlur, dropdown }
}
