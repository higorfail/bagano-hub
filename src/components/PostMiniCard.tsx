'use client'

import { useState, useEffect } from 'react'
import { Calendar, Paperclip, Copy, Package, Play, Zap } from 'lucide-react'

const TYPE: Record<string, { label: string; color: string }> = {
  carrossel:         { label: 'Carrossel',         color: '#3b82f6' },
  reels:             { label: 'Reels',             color: '#ef4444' },
  post:              { label: 'Post',              color: '#f59e0b' },
  story:             { label: 'Story',             color: '#8b5cf6' },
  carrossel_stories: { label: 'Carrossel/Stories', color: '#6366f1' },
}
const STATUS: Record<string, { label: string; color: string }> = {
  captacao:             { label: 'Captação',      color: '#0ea5e9' },
  producao:             { label: 'Produção',      color: '#f59e0b' },
  revisao_interna:      { label: 'Revisão interna', color: '#8b5cf6' },
  aguardando_aprovacao: { label: 'Com cliente',    color: '#ec4899' },
  ajuste:              { label: 'Ajuste',          color: '#ef4444' },
  aprovado:             { label: 'Aprovado',       color: '#22c55e' },
  agendado:             { label: 'Agendado',       color: '#3b82f6' },
  publicado:            { label: 'Publicado',      color: '#059669' },
}

export type MiniPost = {
  id: string
  post_number?: number | null
  title: string
  copy?: string | null
  post_type: string
  status: string
  approval_status?: string | null
  approval_comment?: string | null
  scheduled_date?: string | null
  drive_url?: string | null
  drive_folder_url?: string | null
  funil?: string | null
  campaign_type?: string | null
  reference_images?: string[] | null
}

type Props = {
  post: MiniPost
  clientColor?: string
  campaignName?: string | null
  selected?: boolean
  onClick: () => void
  onDuplicate?: () => void
  onSendToCriacao?: () => void
  draggable?: boolean
  dragging?: boolean
  dragOver?: boolean
  onDragStart?: () => void
  onDragEnd?: () => void
  onDragOver?: (e: React.DragEvent) => void
  onDrop?: () => void
}

export default function PostMiniCard({ post, clientColor, campaignName, selected, onClick, onDuplicate, onSendToCriacao, draggable, dragging, dragOver, onDragStart, onDragEnd, onDragOver, onDrop }: Props) {
  const type   = TYPE[post.post_type] || { label: post.post_type || '—', color: 'var(--color-border)' }
  const status = STATUS[post.status]  || { label: post.status, color: '#6b7280' }
  const isRejected  = post.approval_status === 'não aprovado'
  const isApproved  = post.approval_status === 'aprovado'
  const isRevisao   = post.status === 'revisao_interna'
  const refs      = post.reference_images?.length || 0
  const delivered = !!(post.drive_url || post.drive_folder_url)
  const isVideo   = post.post_type === 'reels'

  const [thumbUrl, setThumbUrl] = useState<string | null>(() => {
    const id = post.drive_url?.match(/[-\w]{25,}/)?.[0]
    return id ? `https://drive.google.com/thumbnail?id=${id}&sz=w480` : null
  })

  useEffect(() => {
    if (!post.drive_folder_url) return
    const folderId = post.drive_folder_url.match(/\/folders\/([-\w]{25,})/)?.[1]
    if (!folderId) return
    const key = process.env.NEXT_PUBLIC_GOOGLE_API_KEY
    if (!key) return
    fetch(`https://www.googleapis.com/drive/v3/files?q=%27${folderId}%27+in+parents&fields=files(id,name,mimeType)&orderBy=name&key=${key}`)
      .then(r => r.json())
      .then(d => {
        const images: { id: string; name: string; mimeType: string }[] = (d.files || []).filter((f: { id: string; name: string; mimeType: string }) => f.mimeType.startsWith('image/'))
        const img = images.find(f => /^capa\./i.test(f.name)) ?? images[0]
        if (img) setThumbUrl(`https://drive.google.com/thumbnail?id=${img.id}&sz=w480`)
      })
      .catch(() => {})
  }, [post.drive_folder_url])

  return (
    <div
      onClick={onClick}
      draggable={draggable}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onDragOver={onDragOver}
      onDrop={onDrop}
      className={`group text-left bg-[var(--color-bg-card)] border rounded-2xl flex flex-col transition-all overflow-hidden shadow-card hover:shadow-pop
        ${draggable ? 'cursor-grab active:cursor-grabbing' : 'cursor-pointer'}
        ${dragging ? 'opacity-40' : ''}
        ${dragOver ? 'ring-2 ring-[var(--color-accent)]' : ''}
        ${selected ? 'border-transparent' : isRejected ? 'border-[var(--ds-error-border)]' : isRevisao ? 'border-[#8b5cf6]/40' : 'border-[var(--color-border)] hover:border-[var(--color-border-hover)]'}`}
      style={selected ? { boxShadow: `0 0 0 2px ${clientColor || 'var(--color-accent)'}` } : isRevisao ? { boxShadow: '0 0 0 1px #8b5cf644' } : {}}
    >
      <div className="h-[3px] w-full flex-shrink-0" style={{ background: isRevisao ? '#8b5cf6' : type.color }} />

      {/* Drive thumbnail */}
      {thumbUrl && (
        <div className="relative overflow-hidden bg-[var(--color-bg-subtle)] flex-shrink-0"
          style={{ height: isVideo ? 140 : 110 }}>
          <img src={thumbUrl} alt={post.title}
            className="w-full h-full object-cover"
            onError={e => { const el = e.target as HTMLImageElement; if (el.parentElement) el.parentElement.style.display = 'none' }} />
          {isVideo && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/30 pointer-events-none">
              <div className="w-10 h-10 rounded-full bg-white/90 flex items-center justify-center shadow-lg">
                <Play size={16} className="text-[#111] ml-0.5" fill="currentColor" />
              </div>
            </div>
          )}
        </div>
      )}

      <div className="p-4 flex flex-col gap-3 flex-1">
        {/* Header */}
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 flex-wrap">
            {post.post_number != null && <span className="text-xs font-bold text-[var(--color-text-faint)]">#{post.post_number}</span>}
            <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full" style={{ background: type.color + '22', color: type.color }}>{type.label}</span>
            <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full" style={{ background: status.color + '22', color: status.color }}>{status.label}</span>
            {post.funil && <span className="text-[10px] font-medium px-2 py-0.5 rounded-md bg-[var(--color-bg-subtle)] text-[var(--color-text-muted)]">{post.funil}</span>}
            {campaignName && <span className="text-[10px] font-semibold px-2 py-0.5 rounded-md" style={{ background: 'var(--ds-info-bg)', color: 'var(--ds-info-text)' }}>📣 {campaignName}</span>}
          </div>
          <div className="flex items-center gap-1 flex-shrink-0">
            {onSendToCriacao && post.status === 'estrategia' && (
              <div className="relative group/zap opacity-0 group-hover:opacity-100 transition-all">
                <button onClick={e => { e.stopPropagation(); onSendToCriacao() }}
                  className="w-6 h-6 rounded-lg flex items-center justify-center flex-shrink-0"
                  style={{ background: '#f59e0b18', color: '#b45309' }}>
                  <Zap size={11} />
                </button>
                <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 px-1.5 py-0.5 rounded text-[9px] font-semibold whitespace-nowrap opacity-0 group-hover/zap:opacity-100 transition-opacity pointer-events-none z-10"
                  style={{ background: 'var(--color-text-primary)', color: 'var(--color-bg-card)' }}>
                  Pra Criação
                </div>
              </div>
            )}
            {onDuplicate && (
              <div className="relative group/dup opacity-0 group-hover:opacity-100 transition-all">
                <button onClick={e => { e.stopPropagation(); onDuplicate() }}
                  className="w-6 h-6 rounded-lg bg-[var(--color-bg-subtle)] hover:bg-[var(--color-bg-page)] flex items-center justify-center transition-all text-[var(--color-text-muted)] flex-shrink-0">
                  <Copy size={11} />
                </button>
                <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 px-1.5 py-0.5 rounded text-[9px] font-semibold whitespace-nowrap opacity-0 group-hover/dup:opacity-100 transition-opacity pointer-events-none z-10"
                  style={{ background: 'var(--color-text-primary)', color: 'var(--color-bg-card)' }}>
                  Duplicar
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Title + copy */}
        <div className="flex-1">
          <p className="font-bold text-[var(--color-text-primary)] text-[15px] leading-snug line-clamp-2">{post.title || 'Sem título'}</p>
          {post.copy && <p className="text-sm text-[var(--color-text-muted)] leading-relaxed mt-1.5 line-clamp-2">{post.copy.replace(/\*/g, '')}</p>}
        </div>

        {/* Rejection comment */}
        {isRejected && post.approval_comment && (
          <div className="rounded-lg px-2.5 py-1.5 text-xs italic leading-snug" style={{ background: 'var(--ds-error-bg)', color: 'var(--ds-error-text)' }}>
            "{post.approval_comment}"
          </div>
        )}

        {/* Footer — indicadores */}
        <div className="flex items-center justify-between pt-2.5 border-t border-[var(--color-border)] gap-2 mt-auto">
          <div className="flex items-center gap-2.5 min-w-0">
            <span className="flex items-center gap-1 text-xs text-[var(--color-text-muted)] flex-shrink-0">
              <Calendar size={11} />
              {post.scheduled_date ? new Date(post.scheduled_date + 'T12:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' }) : 'Sem data'}
            </span>
            {refs > 0 && (
              <span className="flex items-center gap-0.5 text-xs text-[var(--color-text-muted)] flex-shrink-0" title={`${refs} referência(s)`}>
                <Paperclip size={11} /> {refs}
              </span>
            )}
          </div>
          <div className="flex items-center gap-1.5 flex-shrink-0">
            {delivered
              ? <span className="flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full" style={{ background: 'var(--ds-success-bg)', color: 'var(--ds-success-text)' }}><Package size={10} /> Entregue</span>
              : <span className="flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-full bg-[var(--color-bg-subtle)] text-[var(--color-text-faint)]"><Package size={10} /> Sem entrega</span>}
            {isRejected && <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full" style={{ background: 'var(--ds-error-bg)', color: 'var(--ds-error-text)' }}>Não aprovado</span>}
            {isApproved && <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full" style={{ background: 'var(--ds-success-bg)', color: 'var(--ds-success-text)' }}>✓</span>}
          </div>
        </div>
      </div>
    </div>
  )
}
