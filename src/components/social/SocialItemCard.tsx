'use client'

import { SocialItem, POST_TYPE_LABEL, POST_TYPE_ACCENT, downloadDriveContent, isOverdue } from '@/lib/socialItems'
import { useToast } from '@/lib/ToastContext'
import { useDriveThumbnail } from '@/lib/useDriveThumbnail'
import { Copy, Check, Download, Loader2, CalendarPlus, CheckCircle2, AlertTriangle, Play } from 'lucide-react'
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
  onSetDate?: (date: string) => void
  compact?: boolean
}

export default function SocialItemCard({ item, client, draggable, onDragStart, onDragEnd, onClick, onPublish, onSetDate, compact }: Props) {
  const { toast } = useToast()
  const [copied, setCopied] = useState(false)
  const [downloading, setDownloading] = useState(false)
  const [settingDate, setSettingDate] = useState(false)
  const typeAccent = POST_TYPE_ACCENT[item.postType || ''] || 'var(--color-border)'
  const caption = item.legenda || item.copy || ''
  const published = item.column === 'publicado'
  const needsDate = item.column === 'aprovado' && !item.scheduledDate
  const overdue = isOverdue(item)
  const { thumbUrl, isVideo } = useDriveThumbnail(item.driveUrl, item.driveFolderUrl, item.postType === 'reels')

  async function copyCaption(e: React.MouseEvent) {
    e.stopPropagation()
    if (!caption) { toast('Este item não tem legenda/copy preenchida.'); return }
    await navigator.clipboard.writeText(caption)
    setCopied(true)
    toast('Legenda copiada!')
    setTimeout(() => setCopied(false), 1500)
  }

  const hasContent = !!(item.driveUrl || item.driveFolderUrl)

  async function download(e: React.MouseEvent) {
    e.stopPropagation()
    if (downloading || !hasContent) return
    setDownloading(true)
    const { message } = await downloadDriveContent(item.driveUrl, item.driveFolderUrl)
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
      className={`mx-1 bg-[var(--color-bg-card)] rounded-2xl overflow-hidden flex flex-col cursor-pointer select-none border transition-all hover:shadow-sm hover:border-[var(--color-border-hover)] ${overdue ? 'border-[var(--ds-error-border)]' : 'border-[var(--color-border)]'}`}
    >
      <div className="h-[3px] flex-shrink-0" style={{ background: overdue ? 'var(--ds-error-accent)' : typeAccent }} />
      <div className="p-3 flex flex-col gap-2">
        {overdue && (
          <div className="flex items-center gap-1.5 rounded-lg px-2 py-1" style={{ background: 'var(--ds-error-bg)' }}>
            <AlertTriangle size={11} style={{ color: 'var(--ds-error-text)' }} />
            <span className="text-[10px] font-semibold" style={{ color: 'var(--ds-error-text)' }}>Passou da data e não foi publicado</span>
          </div>
        )}
        <div className="flex items-center justify-between gap-1">
          <span className="flex items-center gap-1.5 text-[10px] font-medium text-[var(--color-text-muted)] truncate max-w-[140px]">
            {client && <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: client.color_hex }} />}
            {client?.name}
          </span>
          <span className="text-[9px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded-md flex-shrink-0" style={{ background: item.source === 'extra' ? '#6366f122' : 'var(--color-bg-subtle)', color: item.source === 'extra' ? '#6366f1' : 'var(--color-text-faint)' }}>
            {item.source === 'extra' ? 'Extra' : 'Crono'}
          </span>
        </div>

        <div className="flex items-start gap-2">
          {thumbUrl && (
            <div className="relative w-9 h-9 rounded-lg overflow-hidden bg-[var(--color-bg-subtle)] flex-shrink-0">
              <img src={thumbUrl} alt="" className="absolute inset-0 w-full h-full object-cover"
                onError={e => { const el = e.target as HTMLImageElement; if (el.parentElement) el.parentElement.style.display = 'none' }} />
              {isVideo && (
                <div className="absolute inset-0 flex items-center justify-center bg-black/25 pointer-events-none">
                  <Play size={10} className="text-white" fill="currentColor" />
                </div>
              )}
            </div>
          )}
          <p className="text-xs font-semibold text-[var(--color-text-primary)] leading-snug line-clamp-2 flex-1 min-w-0">{item.title}</p>
        </div>

        {!compact && caption && (
          <p className="text-[10px] text-[var(--color-text-muted)] leading-relaxed line-clamp-2">{caption}</p>
        )}

        <div className="flex items-center gap-1.5 text-[10px]">
          <span className="font-semibold px-1.5 py-0.5 rounded-md" style={{ background: typeAccent + '22', color: typeAccent }}>
            {POST_TYPE_LABEL[item.postType || ''] || item.postType}
          </span>
          {item.scheduledDate && (
            <span className="text-[var(--color-text-muted)]">
              {new Date(item.scheduledDate + 'T12:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })}
              {item.scheduledTime ? ` · ${item.scheduledTime.slice(0, 5)}` : ''}
            </span>
          )}
        </div>

        {needsDate && onSetDate && (
          settingDate ? (
            <input
              type="date"
              autoFocus
              onClick={e => e.stopPropagation()}
              onChange={e => { if (e.target.value) { onSetDate(e.target.value); setSettingDate(false) } }}
              onBlur={() => setSettingDate(false)}
              className="text-[11px] px-2 py-1 rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-card)] text-[var(--color-text-primary)] outline-none"
            />
          ) : (
            <button
              onClick={e => { e.stopPropagation(); setSettingDate(true) }}
              className="flex items-center gap-1 text-[11px] font-medium px-2 py-1 rounded-lg border border-dashed"
              style={{ borderColor: 'var(--ds-warn-border)', color: 'var(--ds-warn-text)', background: 'var(--ds-warn-bg)' }}
            >
              <CalendarPlus size={11} /> Definir data
            </button>
          )
        )}

        <div className="flex items-center gap-1 pt-1.5 border-t border-[var(--color-border)]">
          <button
            onClick={copyCaption}
            title={caption ? 'Copiar legenda' : 'Sem legenda/copy preenchida'}
            disabled={!caption}
            className="w-7 h-7 rounded-lg flex items-center justify-center text-[var(--color-text-faint)] hover:bg-[var(--color-bg-subtle)] hover:text-[var(--color-text-secondary)] transition-colors disabled:opacity-30 disabled:hover:bg-transparent"
          >
            {copied ? <Check size={13} className="text-[var(--ds-success-text)]" /> : <Copy size={13} />}
          </button>
          <button
            onClick={download}
            title={hasContent ? 'Baixar conteúdo' : 'Sem link do Drive'}
            disabled={!hasContent || downloading}
            className="w-7 h-7 rounded-lg flex items-center justify-center text-[var(--color-text-faint)] hover:bg-[var(--color-bg-subtle)] hover:text-[var(--color-text-secondary)] transition-colors disabled:opacity-30 disabled:hover:bg-transparent"
          >
            {downloading ? <Loader2 size={13} className="animate-spin" /> : <Download size={13} />}
          </button>
          <div className="flex-1" />
          {published ? (
            <span className="flex items-center gap-1 text-[10px] font-semibold px-2 py-1 rounded-md" style={{ color: 'var(--ds-success-text)' }}>
              <CheckCircle2 size={12} /> Publicado
            </span>
          ) : (
            <button
              onClick={markPublished}
              title="Marcar como publicado"
              className="text-[10px] font-semibold px-2.5 py-1 rounded-md"
              style={{ background: 'var(--ds-success-bg)', color: 'var(--ds-success-text)' }}
            >
              Publicar
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
