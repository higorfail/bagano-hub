'use client'

import { SocialItem, POST_TYPE_LABEL, POST_TYPE_ACCENT, downloadDriveContent, isOverdue } from '@/lib/socialItems'
import { useToast } from '@/lib/ToastContext'
import { useDriveThumbnail } from '@/lib/useDriveThumbnail'
import { Copy, Check, Download, Loader2, CalendarClock, CheckCircle2, AlertTriangle, Clock3, BadgeCheck, Play } from 'lucide-react'
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
  onSchedule?: (date: string) => void
  compact?: boolean
}

const STATUS_META = {
  aprovado:  { label: 'Aprovado',  icon: BadgeCheck,   color: '#3B82F6' },
  agendado:  { label: 'Agendado',  icon: Clock3,       color: '#14B8A6' },
  publicado: { label: 'Publicado', icon: CheckCircle2, color: '#22C55E' },
  atrasado:  { label: 'Atrasado',  icon: AlertTriangle, color: 'var(--ds-error-accent)' },
} as const

export default function SocialItemCard({ item, client, draggable, onDragStart, onDragEnd, onClick, onPublish, onSchedule, compact }: Props) {
  const { toast } = useToast()
  const [copied, setCopied] = useState(false)
  const [downloading, setDownloading] = useState(false)
  const [scheduling, setScheduling] = useState(false)
  const typeAccent = POST_TYPE_ACCENT[item.postType || ''] || 'var(--color-border)'
  const caption = item.legenda || item.copy || ''
  const overdue = isOverdue(item)
  const statusKey = overdue ? 'atrasado' : item.column
  const status = STATUS_META[statusKey]
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

  function schedule(e: React.MouseEvent) {
    e.stopPropagation()
    if (item.scheduledDate) { onSchedule?.(item.scheduledDate); return }
    setScheduling(true)
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
      <div className="p-2 flex flex-col gap-1.5">
        <div className="flex items-center gap-1 text-[9px] font-bold uppercase tracking-wide" style={{ color: status.color }}>
          <status.icon size={10} />
          {status.label}
        </div>
        <div className="flex items-start gap-1.5">
          {thumbUrl && (
            <div className="relative w-7 h-7 rounded-md overflow-hidden bg-[var(--color-bg-subtle)] flex-shrink-0">
              <img src={thumbUrl} alt="" className="absolute inset-0 w-full h-full object-cover"
                onError={e => { const el = e.target as HTMLImageElement; if (el.parentElement) el.parentElement.style.display = 'none' }} />
              {isVideo && (
                <div className="absolute inset-0 flex items-center justify-center bg-black/25 pointer-events-none">
                  <Play size={8} className="text-white" fill="currentColor" />
                </div>
              )}
            </div>
          )}
          <div className="flex-1 min-w-0 flex flex-col gap-0.5">
            <span className="flex items-center gap-1 text-[9px] font-medium text-[var(--color-text-muted)] truncate">
              {client && <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: client.color_hex }} />}
              {client?.name}
              <span className="flex-shrink-0" style={{ color: item.source === 'extra' ? '#6366f1' : 'var(--color-text-faint)' }}>· {item.source === 'extra' ? 'Extra' : 'Crono'}</span>
            </span>
            <p className="text-xs font-semibold text-[var(--color-text-primary)] leading-snug line-clamp-2">
              {item.postNumber && <span className="text-[var(--color-text-faint)]">#{item.postNumber} · </span>}
              {item.title}
            </p>
          </div>
        </div>

        {!compact && caption && (
          <p className="text-[10px] text-[var(--color-text-muted)] leading-relaxed line-clamp-2">{caption}</p>
        )}

        <div className="flex items-center gap-1.5 text-[9px]">
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

        {item.column === 'aprovado' && onSchedule && (
          scheduling ? (
            <input
              type="date"
              autoFocus
              onClick={e => e.stopPropagation()}
              onChange={e => { if (e.target.value) { onSchedule(e.target.value); setScheduling(false) } }}
              onBlur={() => setScheduling(false)}
              className="text-[11px] px-2 py-1 rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-card)] text-[var(--color-text-primary)] outline-none"
            />
          ) : (
            <button
              onClick={schedule}
              title={item.scheduledDate ? 'Confirmar agendamento pra essa data' : 'Escolher uma data e agendar'}
              className="flex items-center justify-center gap-1 text-[11px] font-semibold px-2 py-1 rounded-lg"
              style={{ background: '#14B8A622', color: '#0d8a7a' }}
            >
              <CalendarClock size={11} /> Agendar
            </button>
          )
        )}

        <div className="flex items-center gap-0.5 pt-1 border-t border-[var(--color-border)]">
          <button
            onClick={copyCaption}
            title={caption ? 'Copiar legenda' : 'Sem legenda/copy preenchida'}
            disabled={!caption}
            className="w-6 h-6 rounded-md flex items-center justify-center text-[var(--color-text-faint)] hover:bg-[var(--color-bg-subtle)] hover:text-[var(--color-text-secondary)] transition-colors disabled:opacity-30 disabled:hover:bg-transparent"
          >
            {copied ? <Check size={12} className="text-[var(--ds-success-text)]" /> : <Copy size={12} />}
          </button>
          <button
            onClick={download}
            title={hasContent ? 'Baixar conteúdo' : 'Sem link do Drive'}
            disabled={!hasContent || downloading}
            className="w-6 h-6 rounded-md flex items-center justify-center text-[var(--color-text-faint)] hover:bg-[var(--color-bg-subtle)] hover:text-[var(--color-text-secondary)] transition-colors disabled:opacity-30 disabled:hover:bg-transparent"
          >
            {downloading ? <Loader2 size={12} className="animate-spin" /> : <Download size={12} />}
          </button>
          <div className="flex-1" />
          {item.column === 'publicado' ? (
            <span className="flex items-center gap-1 text-[9px] font-semibold px-1.5 py-0.5 rounded-md" style={{ color: 'var(--ds-success-text)' }}>
              <CheckCircle2 size={11} /> Publicado
            </span>
          ) : item.column === 'agendado' ? (
            <button
              onClick={markPublished}
              title="Marcar como publicado"
              className="text-[9px] font-semibold px-2 py-0.5 rounded-md"
              style={{ background: 'var(--ds-success-bg)', color: 'var(--ds-success-text)' }}
            >
              Publicar
            </button>
          ) : null}
        </div>
      </div>
    </div>
  )
}
