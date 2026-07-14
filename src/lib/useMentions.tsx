'use client'

import { useRef, useState, useCallback, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { Link2, Folder } from 'lucide-react'

type Member = { id: string; name: string; color?: string | null }

const URL_SPLIT_RE = /(https?:\/\/[^\s]+)/g
const URL_TEST_RE = /^https?:\/\/[^\s]+$/
const DRIVE_TEST_RE = /^https?:\/\/(drive|docs)\.google\.com\//

function extractDriveFileId(url: string): string | null {
  const folder = url.match(/\/folders\/([-\w]{25,})/)
  if (folder) return folder[1]
  const file = url.match(/[-\w]{25,}/)
  return file ? file[0] : null
}

// Link do Drive colado num comentário vira um chip com nome do arquivo (igual anexo do Trello)
function DriveLinkChip({ url }: { url: string }) {
  const [name, setName] = useState<string | null>(null)
  const isFolder = /\/folders\//.test(url)
  useEffect(() => {
    const id = extractDriveFileId(url)
    const key = process.env.NEXT_PUBLIC_GOOGLE_API_KEY
    if (!id || !key) return
    fetch(`https://www.googleapis.com/drive/v3/files/${id}?fields=name&key=${key}`)
      .then(r => r.json())
      .then(d => { if (d.name) setName(d.name) })
      .catch(() => {})
  }, [url])
  return (
    <a href={url} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()}
      className="inline-flex items-center gap-1.5 max-w-full px-2 py-1 rounded-lg text-xs font-medium border transition-colors hover:opacity-80"
      style={{ borderColor: 'var(--color-border)', color: 'var(--ds-info-text)', background: 'var(--color-bg-card)', verticalAlign: 'middle' }}>
      {isFolder ? <Folder size={12} className="flex-shrink-0" /> : <Link2 size={12} className="flex-shrink-0" />}
      <span className="truncate">{name || (isFolder ? 'Pasta do Drive' : 'Abrir no Drive')}</span>
    </a>
  )
}

function renderLine(line: string, key: string) {
  return line.split(URL_SPLIT_RE).map((part, i) => {
    if (URL_TEST_RE.test(part)) {
      return DRIVE_TEST_RE.test(part)
        ? <DriveLinkChip key={`${key}-${i}`} url={part} />
        : <a key={`${key}-${i}`} href={part} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()}
            className="underline break-all" style={{ color: 'var(--ds-info-text)' }}>{part}</a>
    }
    return part.split(/(@\S+)/g).map((sub, j) =>
      /^@\S+/.test(sub)
        ? <strong key={`${key}-${i}-${j}`} style={{ color: 'var(--color-accent)' }}>{sub}</strong>
        : <span key={`${key}-${i}-${j}`}>{sub}</span>
    )
  })
}

// Renderiza o corpo de um comentário destacando @menções e transformando links
// (em especial do Drive, com chip de nome de arquivo) em algo clicável.
// Linhas que são só um link viram um bloco próprio (evita ficar espremido junto do texto).
export function renderWithMentions(body: string) {
  return body.split('\n').map((line, i) => {
    const trimmed = line.trim()
    if (URL_TEST_RE.test(trimmed)) {
      return <div key={i} className="my-1 first:mt-0 last:mb-0">{renderLine(trimmed, String(i))}</div>
    }
    return <div key={i}>{renderLine(line, String(i)) || <>&nbsp;</>}</div>
  })
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
