'use client'

import { useState, useEffect } from 'react'
import { Calendar, CheckSquare, AlertCircle, MessageSquare, Play } from 'lucide-react'

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
    return id ? `https://drive.google.com/thumbnail?id=${id}&sz=w480` : null
  })
  const [isThumbVideo, setIsThumbVideo] = useState(() => extra.drive_url ? /reel|video|vídeo|\.mp4/i.test(extra.drive_url) : false)

  useEffect(() => {
    if (!extra.drive_url || !/\/folders\//.test(extra.drive_url)) return
    const folderId = extra.drive_url.match(/\/folders\/([-\w]{25,})/)?.[1]
    if (!folderId) return
    const key = process.env.NEXT_PUBLIC_GOOGLE_API_KEY
    if (!key) return
    fetch(`https://www.googleapis.com/drive/v3/files?q=%27${folderId}%27+in+parents&fields=files(id,name,mimeType)&orderBy=name&key=${key}`)
      .then(r => r.json())
      .then(d => {
        const files: { id: string; name: string; mimeType: string }[] = d.files || []
        const images = files.filter(f => f.mimeType.startsWith('image/'))
        const cover = images.find(f => /^capa\./i.test(f.name)) ?? images[0]
        if (cover) { setThumbUrl(`https://drive.google.com/thumbnail?id=${cover.id}&sz=w480`); setIsThumbVideo(false); return }
        const pdf = files.find(f => f.mimeType === 'application/pdf')
        if (pdf) { setThumbUrl(`https://drive.google.com/thumbnail?id=${pdf.id}&sz=w480`); setIsThumbVideo(false); return }
        const video = files.find(f => f.mimeType.startsWith('video/'))
        if (video) { setThumbUrl(`https://drive.google.com/thumbnail?id=${video.id}&sz=w480`); setIsThumbVideo(true) }
      })
      .catch(() => {})
  }, [extra.drive_url])

  return (
    <div
      draggable
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onClick={onClick}
      className="group bg-[var(--color-bg-card)] border border-[var(--color-border)] rounded-xl flex cursor-grab active:cursor-grabbing shadow-card hover:shadow-pop hover:border-[var(--color-border-hover)] hover:-translate-y-0.5 transition-all duration-150 relative overflow-hidden"
      style={{
        borderLeft: `3px solid ${priorityColor}`,
        opacity: dragging ? 0.4 : 1,
        ...(thumbUrl ? { height: 140 } : {}),
      }}
    >
      {/* Preview da entrega — vertical na lateral esquerda (evita cortar conteúdo 4:5/9:16).
          Altura travada em 140 (não mínima) com overflow-hidden no card inteiro — nada
          consegue estourar além disso, custe o que custar em conteúdo cortado. */}
      {thumbUrl && (
        <div className="relative w-28 self-stretch flex-shrink-0 overflow-hidden bg-[var(--color-bg-subtle)]">
          {/* img absoluta: fora do fluxo, não contribui pra altura do card — quebra a
              dependência circular (img 100% ← container ← card ← tamanho natural da img) */}
          <img src={thumbUrl} alt={extra.title} className="absolute inset-0 w-full h-full object-cover"
            onError={e => { const el = e.currentTarget.parentElement; if (el) el.style.display = 'none' }} />
          {isThumbVideo && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/30 pointer-events-none">
              <div className="w-8 h-8 rounded-full bg-white/90 flex items-center justify-center shadow-lg">
                <Play size={13} className="text-[#111] ml-0.5" fill="currentColor" />
              </div>
            </div>
          )}
        </div>
      )}

      <div className="flex-1 min-w-0 p-3 flex flex-col">
        {/* Labels strip */}
        {extra.labels && extra.labels.length > 0 && (
          <div className="flex flex-wrap gap-1 mb-2">
            {extra.labels.map((l, i) => (
              <span key={i} className="text-[9px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded text-white" style={{ background: l.color }}>
                {l.text}
              </span>
            ))}
          </div>
        )}

        {/* Type icon + title */}
        <div className="flex items-start gap-2 flex-shrink-0">
          <TypeIcon size={13} strokeWidth={1.75}
            style={{ color: typeColor, flexShrink: 0, marginTop: 1.5 }} />
          <p className="text-sm font-medium text-[var(--color-text-primary)] leading-snug flex-1 min-w-0 break-words"
            style={{
              textDecoration: extra.status === 'done' ? 'line-through' : 'none',
              opacity:        extra.status === 'done' ? 0.5 : 1,
            }}>
            {extra.title}
          </p>
        </div>

        {/* Description snippet — preenche o espaço que sobrar (a imagem cresce junto se precisar) */}
        {(extra.ai_summary || extra.description) && (
          <p className="text-[11px] text-[var(--color-text-muted)] mt-1.5 ml-5 leading-relaxed flex-1 min-h-0 overflow-hidden"
            style={{ maxHeight: '6.5em', WebkitMaskImage: 'linear-gradient(to bottom, black 75%, transparent 100%)', maskImage: 'linear-gradient(to bottom, black 75%, transparent 100%)' }}>
            {extra.ai_summary || extra.description}
          </p>
        )}

        {/* Meta row — fica colado no fim do card */}
        <div className="flex flex-wrap items-center gap-2 mt-auto pt-2 ml-5">
          {extra.due_date && (
            <span className={`flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded-full ${overdue ? '' : 'bg-[var(--color-bg-subtle)] text-[var(--color-text-muted)]'}`} style={overdue ? { background: 'var(--ds-error-bg)', color: 'var(--ds-error-text)' } : {}}>
              {overdue && <AlertCircle size={9} />}
              <Calendar size={9} />
              {formatDue(extra.due_date)}
            </span>
          )}
          {chk && chk.total > 0 && (
            <span className="flex items-center gap-1 text-[10px] font-medium" style={chk.done === chk.total ? { color: 'var(--ds-success-text)' } : { color: 'var(--color-text-muted)' }}>
              <CheckSquare size={9} /> {chk.done}/{chk.total}
            </span>
          )}
          {commentCount > 0 && (
            <span className="flex items-center gap-1 text-[10px] font-medium text-[var(--color-text-muted)]">
              <MessageSquare size={9} /> {commentCount}
            </span>
          )}
          {extra.drive_url && (
            <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-[var(--ds-success-bg)] text-[var(--ds-success-text)]">✓ Entregue</span>
          )}
          {assignedData.length > 0 && (
            <span className="flex -space-x-1.5 ml-auto">
              {assignedData.slice(0, 3).map(m => (
                <span key={m.id} title={m.name}
                  className="w-5 h-5 rounded-full border-2 border-[var(--color-bg-card)] flex items-center justify-center text-white text-[8px] font-bold"
                  style={{ background: m.color || 'var(--color-brand)' }}>
                  {m.name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()}
                </span>
              ))}
              {assignedData.length > 3 && (
                <span className="w-5 h-5 rounded-full bg-[var(--color-bg-subtle)] border-2 border-[var(--color-bg-card)] flex items-center justify-center text-[var(--color-text-muted)] text-[8px] font-bold">+{assignedData.length - 3}</span>
              )}
            </span>
          )}
          {clientBadge && (
            <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full text-white"
              style={{ background: clientBadge.color }}>
              {clientBadge.name}
            </span>
          )}
          {showGlobalBadge && (
            <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-[var(--color-bg-subtle)] text-[var(--color-text-faint)]">Global</span>
          )}
        </div>
      </div>
    </div>
  )
}
