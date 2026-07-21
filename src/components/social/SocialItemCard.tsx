'use client'

import { SocialItem, POST_TYPE_LABEL, POST_TYPE_ACCENT, downloadDriveContent } from '@/lib/socialItems'
import { useToast } from '@/lib/ToastContext'
import { Copy, Check, Download, Loader2 } from 'lucide-react'
import { useState } from 'react'

type Client = { id: string; name: string; color_hex: string }

type Props = {
  item: SocialItem
  client?: Client
  draggable?: boolean
  onDragStart?: () => void
  onDragEnd?: () => void
  onClick?: () => void
  onPublish?: () => void
  compact?: boolean
}

export default function SocialItemCard({ item, client, draggable, onDragStart, onDragEnd, onClick, onPublish, compact }: Props) {
  const { toast } = useToast()
  const [copied, setCopied] = useState(false)
  const [downloading, setDownloading] = useState(false)
  const typeAccent = POST_TYPE_ACCENT[item.postType || ''] || 'var(--color-border)'
  const caption = item.legenda || item.copy || ''

  async function copyCaption(e: React.MouseEvent) {
    e.stopPropagation()
    if (!caption) { toast('Este item não tem legenda/copy preenchida.'); return }
    await navigator.clipboard.writeText(caption)
    setCopied(true)
    toast('Legenda copiada!')
    setTimeout(() => setCopied(false), 1500)
  }

  async function download(e: React.MouseEvent) {
    e.stopPropagation()
    if (downloading) return
    setDownloading(true)
    const { message } = await downloadDriveContent(item.driveUrl)
    toast(message)
    setDownloading(false)
  }

  function markPublished(e: React.MouseEvent) {
    e.stopPropagation()
    onPublish?.()
  }

  return (
    <div
      draggable={draggable}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onClick={onClick}
      className="mx-1 bg-[var(--color-bg-card)] rounded-2xl overflow-hidden flex flex-col cursor-pointer select-none border border-[var(--color-border)] transition-all hover:shadow-sm hover:border-[var(--color-border-hover)]"
    >
      <div className="h-[3px] flex-shrink-0" style={{ background: typeAccent }} />
      <div className="p-3 flex flex-col gap-2">
        <div className="flex items-center justify-between gap-1">
          <span className="flex items-center gap-1.5 text-[10px] font-medium text-[var(--color-text-muted)] truncate max-w-[140px]">
            {client && <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: client.color_hex }} />}
            {client?.name}
          </span>
          <span className="text-[9px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded-md flex-shrink-0" style={{ background: item.source === 'extra' ? '#6366f122' : 'var(--color-bg-subtle)', color: item.source === 'extra' ? '#6366f1' : 'var(--color-text-faint)' }}>
            {item.source === 'extra' ? 'Extra' : 'Crono'}
          </span>
        </div>

        <p className="text-xs font-semibold text-[var(--color-text-primary)] leading-snug line-clamp-2">{item.title}</p>

        {!compact && caption && (
          <p className="text-[10px] text-[var(--color-text-muted)] leading-relaxed line-clamp-2">{caption}</p>
        )}

        <div className="flex items-center justify-between gap-2 pt-1 border-t border-[var(--color-border)]">
          <div className="flex items-center gap-1.5">
            <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-md" style={{ background: typeAccent + '22', color: typeAccent }}>
              {POST_TYPE_LABEL[item.postType || ''] || item.postType}
            </span>
            {item.scheduledDate && (
              <span className="text-[10px] text-[var(--color-text-muted)]">
                {new Date(item.scheduledDate + 'T12:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })}
                {item.scheduledTime ? ` · ${item.scheduledTime.slice(0, 5)}` : ''}
              </span>
            )}
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={copyCaption}
              title="Copiar legenda"
              className="w-6 h-6 rounded-lg flex items-center justify-center text-[var(--color-text-faint)] hover:bg-[var(--color-bg-subtle)] hover:text-[var(--color-text-secondary)] transition-colors"
            >
              {copied ? <Check size={12} className="text-[var(--ds-success-text)]" /> : <Copy size={12} />}
            </button>
            {item.driveUrl && (
              <button
                onClick={download}
                title="Baixar conteúdo"
                className="w-6 h-6 rounded-lg flex items-center justify-center text-[var(--color-text-faint)] hover:bg-[var(--color-bg-subtle)] hover:text-[var(--color-text-secondary)] transition-colors"
              >
                {downloading ? <Loader2 size={12} className="animate-spin" /> : <Download size={12} />}
              </button>
            )}
            {onPublish && item.column !== 'publicado' && (
              <button
                onClick={markPublished}
                title="Marcar como publicado"
                className="text-[10px] font-semibold px-2 py-1 rounded-md"
                style={{ background: 'var(--ds-success-bg)', color: 'var(--ds-success-text)' }}
              >
                Publicar
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
