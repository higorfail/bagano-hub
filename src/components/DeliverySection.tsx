'use client'

// Seção "Entrega do conteúdo" — padrão único do design system (referência: cronograma).
// Vazio: botão tracejado azul "+ Colar link do Drive" → vira input ao clicar.
// Preenchido: preview do Drive + linha verde "✓ Conteúdo entregue" + editar.

import { useRef, useState } from 'react'
import { Package, Link2, ExternalLink } from 'lucide-react'
import { DriveThumbnail, FolderThumbnail } from '@/components/DriveThumbnail'

type Props = {
  value: string
  isVideo?: boolean
  onCommit: (v: string) => void
}

export default function DeliverySection({ value, isVideo = false, onCommit }: Props) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')
  const discardRef = useRef(false)
  const hasDelivery = !!value
  const isFolder = /\/folders\//.test(value)

  function startEdit() { setDraft(value); discardRef.current = false; setEditing(true) }
  function commit() {
    if (discardRef.current) { discardRef.current = false; setEditing(false); return }
    setEditing(false)
    const v = draft.trim()
    if (v !== value) onCommit(v)
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-baseline gap-2">
        <span className="text-xs font-bold text-[var(--color-text-secondary)] uppercase tracking-wider flex items-center gap-1.5">
          <Package size={13} style={{ color: hasDelivery ? 'var(--ds-success-accent)' : 'var(--color-text-muted)' }} /> Entrega do conteúdo
        </span>
        {hasDelivery && <span className="text-[10px] font-semibold" style={{ color: 'var(--ds-success-text)' }}>✓ entregue</span>}
      </div>
      <div>
        {editing ? (
          <input autoFocus value={draft}
            onChange={e => setDraft(e.target.value)}
            onBlur={commit}
            onKeyDown={e => {
              if (e.key === 'Enter') e.currentTarget.blur()
              else if (e.key === 'Escape') { e.preventDefault(); discardRef.current = true; setEditing(false) }
            }}
            placeholder="https://drive.google.com/…"
            className="w-full bg-[var(--color-bg-card)] border border-[var(--ds-success-accent)] rounded-lg px-3 py-2 text-sm text-[var(--color-text-primary)] outline-none" />
        ) : hasDelivery ? (
          <>
            {isFolder ? <FolderThumbnail folderUrl={value} /> : <DriveThumbnail driveUrl={value} isVideo={isVideo} />}
            <div className="flex items-center gap-2">
              <a href={value} target="_blank" rel="noopener noreferrer"
                className="flex-1 flex items-center gap-2 bg-[var(--color-bg-card)] rounded-lg px-3 py-2 text-sm font-semibold truncate hover:opacity-90 transition-opacity" style={{ color: 'var(--ds-success-text)' }}>
                <ExternalLink size={13} className="flex-shrink-0" />
                <span className="truncate">✓ {isFolder ? 'Abrir pasta no Drive' : 'Conteúdo entregue — Abrir no Drive'}</span>
              </a>
              <button onClick={startEdit} className="text-[11px] hover:underline flex-shrink-0" style={{ color: 'var(--ds-success-text)' }}>editar</button>
            </div>
          </>
        ) : (
          <button onClick={startEdit}
            className="w-full flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium border-2 border-dashed transition-colors"
            style={{ borderColor: 'var(--ds-info-border)', color: 'var(--ds-info-text)' }}>
            <Link2 size={14} /> + Colar link do Drive
          </button>
        )}
      </div>
    </div>
  )
}
