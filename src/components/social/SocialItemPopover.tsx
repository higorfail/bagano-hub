'use client'

import { useEffect, useRef, useState } from 'react'
import { SocialItem, POST_TYPE_LABEL, downloadDriveContent } from '@/lib/socialItems'
import { useToast } from '@/lib/ToastContext'
import { Copy, Check, ExternalLink, Download, Loader2 } from 'lucide-react'

type Props = {
  item: SocialItem
  clientName?: string
  anchor: { x: number; y: number }
  onClose: () => void
  onOpen: () => void
  onPublish: () => void
}

// Popover leve usado nas visões de calendário/semana — ações rápidas sem
// abrir o modal completo (PostCard/ExtraCard).
export default function SocialItemPopover({ item, clientName, anchor, onClose, onOpen, onPublish }: Props) {
  const { toast } = useToast()
  const [copied, setCopied] = useState(false)
  const [downloading, setDownloading] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const caption = item.legenda || item.copy || ''

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
    if (downloading) return
    setDownloading(true)
    const { message } = await downloadDriveContent(item.driveUrl)
    toast(message)
    setDownloading(false)
  }

  const style: React.CSSProperties = {
    position: 'fixed',
    left: Math.min(anchor.x, (typeof window !== 'undefined' ? window.innerWidth : 1200) - 280),
    top: Math.min(anchor.y, (typeof window !== 'undefined' ? window.innerHeight : 800) - 220),
    zIndex: 200,
  }

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
      <div className="flex items-center gap-1.5 pt-1.5 border-t border-[var(--color-border)]">
        <button onClick={copyCaption} className="flex-1 flex items-center justify-center gap-1 text-[10px] font-semibold px-2 py-1.5 rounded-lg border border-[var(--color-border)] text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-subtle)] transition-colors">
          {copied ? <Check size={11} className="text-[var(--ds-success-text)]" /> : <Copy size={11} />} Copiar legenda
        </button>
        {item.column !== 'publicado' && (
          <button onClick={onPublish} className="flex-1 text-[10px] font-semibold px-2 py-1.5 rounded-lg" style={{ background: 'var(--ds-success-bg)', color: 'var(--ds-success-text)' }}>
            Publicar
          </button>
        )}
        {item.driveUrl && (
          <button onClick={download} title="Baixar conteúdo" className="w-7 h-7 flex-shrink-0 flex items-center justify-center rounded-lg border border-[var(--color-border)] text-[var(--color-text-faint)] hover:bg-[var(--color-bg-subtle)] transition-colors">
            {downloading ? <Loader2 size={11} className="animate-spin" /> : <Download size={11} />}
          </button>
        )}
        <button onClick={onOpen} title="Abrir card completo" className="w-7 h-7 flex-shrink-0 flex items-center justify-center rounded-lg border border-[var(--color-border)] text-[var(--color-text-faint)] hover:bg-[var(--color-bg-subtle)] transition-colors">
          <ExternalLink size={11} />
        </button>
      </div>
    </div>
  )
}
