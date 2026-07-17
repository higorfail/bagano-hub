'use client'

import { useState, useEffect } from 'react'
import { Calendar, CheckSquare, AlertCircle, MessageSquare, Play, Package } from 'lucide-react'

interface ExtraLite {
  id: string
  title: string
  status: string
  priority: string
  due_date?: string | null
  drive_url?: string | null
  description?: string | null
  ai_summary?: string | null
  labels?: { text: string; color: string }[] | null
  client_id?: string | null
}

type Props = {
  extra: ExtraLite
  TypeIcon: React.ElementType
  typeColor: string
  priorityColor: string
  overdue: boolean
  assignedData: { id: string; name: string; color?: string }[]
  chk?: { done: number; total: number }
  commentCount: number
  clientBadge?: { name: string; color: string } | null
  showGlobalBadge?: boolean
  formatDue: (d: string) => string
  dragging: boolean
  onClick: () => void
  onDragStart: (e: React.DragEvent) => void
  onDragEnd: () => void
}

export default function ExtraMiniCard({
  extra, TypeIcon, typeColor, priorityColor, overdue, assignedData, chk, commentCount,
  clientBadge, showGlobalBadge, formatDue, dragging, onClick, onDragStart, onDragEnd,
}: Props) {
  // Preview da entrega — resolve arquivo direto ou capa/vídeo de uma pasta do Drive
  const [thumbUrl, setThumbUrl] = useState<string | null>(() => {
    if (!extra.drive_url || /\/folders\//.test(extra.drive_url)) return null
    const id = extra.drive_url.match(/[-\w]{25,}/)?.[0]
    return id ? `/api/drive-thumb?id=${id}&sz=w480` : null
  })
  const [isThumbVideo, setIsThumbVideo] = useState(() => extra.drive_url ? /reel|video|vídeo|\.mp4/i.test(extra.drive_url) : false)

  useEffect(() => {
    if (!extra.drive_url || !/\/folders\//.test(extra.drive_url)) return
    const folderId = extra.drive_url.match(/\/folders\/([-\w]{25,})/)?.[1]
    if (!folderId) return
    fetch(`/api/drive-folder?folderId=${folderId}`)
      .then(r => r.json())
      .then(d => {
        const files: { id: string; name: string; mimeType: string }[] = d.files || []
        const images = files.filter(f => f.mimeType.startsWith('image/'))
        const cover = images.find(f => /^capa\./i.test(f.name)) ?? images[0]
        if (cover) { setThumbUrl(`/api/drive-thumb?id=${cover.id}&sz=w480`); setIsThumbVideo(false); return }
        const pdf = files.find(f => f.mimeType === 'application/pdf')
        if (pdf) { setThumbUrl(`/api/drive-thumb?id=${pdf.id}&sz=w480`); setIsThumbVideo(false); return }
        const video = files.find(f => f.mimeType.startsWith('video/'))
        if (video) { setThumbUrl(`/api/drive-thumb?id=${video.id}&sz=w480`); setIsThumbVideo(true) }
      })
      .catch(() => {})
  }, [extra.drive_url])

  return (
    <div
      draggable
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onClick={onClick}
      className="group text-left bg-[var(--color-bg-card)] border rounded-2xl flex flex-col cursor-grab active:cursor-grabbing transition-all overflow-hidden shadow-card hover:shadow-pop border-[var(--color-border)] hover:border-[var(--color-border-hover)]"
      /* Altura travada em 176 — mesmo tamanho fixo do PostMiniCard (cronograma), pra
         os cards ficarem idênticos entre extras e cronograma. self-start ignora o
         align-items:stretch padrão do grid. */
      style={{ height: 176, alignSelf: 'start', opacity: dragging ? 0.4 : 1 }}
    >
      <div className="h-[3px] w-full flex-shrink-0" style={{ background: priorityColor }} />

      <div className="flex flex-1 min-h-0 overflow-hidden">
        {/* Thumbnail — largura explícita (138px = 4:5 de 173px de altura), igual ao
            PostMiniCard. Nada de aspect-ratio (bug no Safari com item flex esticado). */}
        {thumbUrl && (
          <div className="relative flex-shrink-0 self-stretch overflow-hidden bg-[var(--color-bg-subtle)]" style={{ width: 138 }}>
            <img src={thumbUrl} alt={extra.title}
              className="absolute inset-0 w-full h-full object-cover"
              onError={e => { const el = e.target as HTMLImageElement; if (el.parentElement) el.parentElement.style.display = 'none' }} />
            {isThumbVideo && (
              <div className="absolute inset-0 flex items-center justify-center bg-black/30 pointer-events-none">
                <div className="w-10 h-10 rounded-full bg-white/90 flex items-center justify-center shadow-lg">
                  <Play size={16} className="text-[#111] ml-0.5" fill="currentColor" />
                </div>
              </div>
            )}
          </div>
        )}

        <div className="p-4 flex flex-col gap-3 flex-1 min-w-0">
          {/* Header */}
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-1.5 flex-wrap">
              <TypeIcon size={13} strokeWidth={1.75} style={{ color: typeColor, flexShrink: 0 }} />
              {extra.labels && extra.labels.length > 0 && extra.labels.map((l, i) => (
                <span key={i} className="text-[10px] font-semibold px-2 py-0.5 rounded-full text-white" style={{ background: l.color }}>
                  {l.text}
                </span>
              ))}
            </div>
          </div>

          {/* Title + description */}
          <div className="flex-1 min-h-0 flex flex-col">
            <p className="font-bold text-[var(--color-text-primary)] text-[15px] leading-snug line-clamp-2 flex-shrink-0"
              style={{
                textDecoration: extra.status === 'done' ? 'line-through' : 'none',
                opacity:        extra.status === 'done' ? 0.5 : 1,
              }}>
              {extra.title}
            </p>
            {(extra.ai_summary || extra.description) && (
              <p className="text-sm text-[var(--color-text-muted)] leading-relaxed mt-1.5 flex-1 min-h-0 overflow-hidden"
                style={{ maxHeight: '2.4em', WebkitMaskImage: 'linear-gradient(to bottom, black 60%, transparent 100%)', maskImage: 'linear-gradient(to bottom, black 60%, transparent 100%)' }}>
                {extra.ai_summary || extra.description}
              </p>
            )}
          </div>

          {/* Footer — indicadores */}
          <div className="flex items-center justify-between pt-2.5 border-t border-[var(--color-border)] gap-2 mt-auto">
            <div className="flex items-center gap-2.5 min-w-0">
              {extra.due_date && (
                <span className={`flex items-center gap-1 text-xs text-[var(--color-text-muted)] flex-shrink-0 ${overdue ? 'font-semibold' : ''}`} style={overdue ? { color: 'var(--ds-error-text)' } : {}}>
                  {overdue && <AlertCircle size={11} />}
                  <Calendar size={11} />
                  {formatDue(extra.due_date)}
                </span>
              )}
              {chk && chk.total > 0 && (
                <span className="flex items-center gap-0.5 text-xs text-[var(--color-text-muted)] flex-shrink-0">
                  <CheckSquare size={11} /> {chk.done}/{chk.total}
                </span>
              )}
              {commentCount > 0 && (
                <span className="flex items-center gap-0.5 text-xs text-[var(--color-text-muted)] flex-shrink-0">
                  <MessageSquare size={11} /> {commentCount}
                </span>
              )}
            </div>
            <div className="flex items-center gap-1.5 flex-shrink-0">
              {assignedData.length > 0 && (
                <div className="flex -space-x-1.5">
                  {assignedData.slice(0, 3).map(m => (
                    <div key={m.id} title={m.name}
                      className="w-5 h-5 rounded-full border-2 border-[var(--color-bg-card)] flex items-center justify-center text-[8px] font-bold text-white"
                      style={{ background: m.color || 'var(--color-brand)' }}>
                      {m.name.split(' ').map((w: string) => w[0]).join('').slice(0, 2).toUpperCase()}
                    </div>
                  ))}
                  {assignedData.length > 3 && (
                    <div className="w-5 h-5 rounded-full bg-[var(--color-bg-subtle)] border-2 border-[var(--color-bg-card)] flex items-center justify-center text-[var(--color-text-muted)] text-[8px] font-bold">
                      +{assignedData.length - 3}
                    </div>
                  )}
                </div>
              )}
              {extra.drive_url
                ? <span className="flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full" style={{ background: 'var(--ds-success-bg)', color: 'var(--ds-success-text)' }}><Package size={10} /> Entregue</span>
                : <span className="flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-full bg-[var(--color-bg-subtle)] text-[var(--color-text-faint)]"><Package size={10} /> Sem entrega</span>}
              {clientBadge && (
                <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full text-white" style={{ background: clientBadge.color }}>
                  {clientBadge.name}
                </span>
              )}
              {showGlobalBadge && (
                <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-[var(--color-bg-subtle)] text-[var(--color-text-faint)]">Global</span>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
