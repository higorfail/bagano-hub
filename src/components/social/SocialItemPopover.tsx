'use client'

import { useEffect, useRef, useState } from 'react'
import { SocialItem, POST_TYPE_LABEL, downloadDriveContent } from '@/lib/socialItems'
import { useToast } from '@/lib/ToastContext'
import { Copy, Check, ExternalLink, Download, Loader2, CheckCircle2 } from 'lucide-react'

export type PopoverAnchor = { top: number; bottom: number; left: number; right: number }

type Props = {
  item: SocialItem
  clientName?: string
  anchor: PopoverAnchor
  onClose: () => void
  onOpen: () => void
  onPublish: () => void
}

const POPOVER_WIDTH = 264
const POPOVER_MAX_HEIGHT = 260
const GAP = 6

// Popover leve usado nas visões de calendário/semana — ações rápidas sem
// abrir o modal completo (PostCard/ExtraCard). Ancorado no retângulo do
// elemento clicado (não nas coordenadas do mouse), com clamp pra nunca
// estourar a viewport.
export default function SocialItemPopover({ item, clientName, anchor, onClose, onOpen, onPublish }: Props) {
  const { toast } = useToast()
  const [copied, setCopied] = useState(false)
  const [downloading, setDownloading] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const caption = item.legenda || item.copy || ''
  const published = item.column === 'publicado'

  useEffect(() => {
    function h(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose()
    }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [onClose])

  async function copyCaption() {
    if (!caption) { toast('Este item não tem legenda/copy preenchida.'); return }
    await navigator.clipboard.writeText(caption)
    setCopied(true)
    toast('Legenda copiada!')
    setTimeout(() => setCopied(false), 1500)
  }

  async function download() {
    if (downloading || !item.driveUrl) { if (!item.driveUrl) toast('Este item não tem link do Drive.'); return }
    setDownloading(true)
    const { message } = await downloadDriveContent(item.driveUrl)
    toast(message)
    setDownloading(false)
  }

  const vw = typeof window !== 'undefined' ? window.innerWidth : 1200
  const vh = typeof window !== 'undefined' ? window.innerHeight : 800
  const openUp = anchor.bottom + POPOVER_MAX_HEIGHT > vh
  const left = Math.min(Math.max(anchor.left, 8), vw - POPOVER_WIDTH - 8)
  const style: React.CSSProperties = openUp
    ? { position: 'fixed', left, bottom: vh - anchor.top + GAP, zIndex: 200 }
    : { position: 'fixed', left, top: anchor.bottom + GAP, zIndex: 200 }

  return (
    <div ref={ref} style={style} className="w-64 bg-[var(--color-bg-card)] border border-[var(--color-border)] rounded-2xl shadow-xl p-3 flex flex-col gap-2">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[10px] font-medium text-[var(--color-text-muted)] truncate">{clientName}</span>
        <span className="text-[9px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded-md" style={{ background: item.source === 'extra' ? '#6366f122' : 'var(--color-bg-subtle)', color: item.source === 'extra' ? '#6366f1' : 'var(--color-text-faint)' }}>
          {item.source === 'extra' ? 'Extra' : 'Crono'}
        </span>
      </div>
      <p className="text-xs font-semibold text-[var(--color-text-primary)] leading-snug">{item.title}</p>
      {caption && <p className="text-[10px] text-[var(--color-text-muted)] leading-relaxed line-clamp-3">{caption}</p>}
      <div className="flex items-center gap-1.5 text-[10px] text-[var(--color-text-faint)]">
        {POST_TYPE_LABEL[item.postType || ''] || item.postType}
        {item.scheduledTime && <span>· {item.scheduledTime.slice(0, 5)}</span>}
      </div>
      <div className="flex items-center gap-1 pt-1.5 border-t border-[var(--color-border)]">
        <button
          onClick={copyCaption}
          disabled={!caption}
          title={caption ? 'Copiar legenda' : 'Sem legenda/copy preenchida'}
          className="w-7 h-7 flex-shrink-0 flex items-center justify-center rounded-lg border border-[var(--color-border)] text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-subtle)] transition-colors disabled:opacity-30"
        >
          {copied ? <Check size={12} className="text-[var(--ds-success-text)]" /> : <Copy size={12} />}
        </button>
        <button
          onClick={download}
          disabled={!item.driveUrl || downloading}
          title={item.driveUrl ? 'Baixar conteúdo' : 'Sem link do Drive'}
          className="w-7 h-7 flex-shrink-0 flex items-center justify-center rounded-lg border border-[var(--color-border)] text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-subtle)] transition-colors disabled:opacity-30"
        >
          {downloading ? <Loader2 size={12} className="animate-spin" /> : <Download size={12} />}
        </button>
        <div className="flex-1">
          {published ? (
            <span className="flex items-center justify-center gap-1 text-[10px] font-semibold px-2 py-1.5 rounded-lg" style={{ color: 'var(--ds-success-text)' }}>
              <CheckCircle2 size={12} /> Publicado
            </span>
          ) : (
            <button onClick={onPublish} className="w-full text-[10px] font-semibold px-2 py-1.5 rounded-lg" style={{ background: 'var(--ds-success-bg)', color: 'var(--ds-success-text)' }}>
              Publicar
            </button>
          )}
        </div>
        <button onClick={onOpen} title="Abrir card completo" className="w-7 h-7 flex-shrink-0 flex items-center justify-center rounded-lg border border-[var(--color-border)] text-[var(--color-text-faint)] hover:bg-[var(--color-bg-subtle)] transition-colors">
          <ExternalLink size={11} />
        </button>
      </div>
    </div>
  )
}
