'use client'

import { useState, useEffect } from 'react'
import { Calendar, Paperclip, Copy, Package, Play, Zap, MessageSquare } from 'lucide-react'

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
  assigned_members?: string[] | null
  comments_count?: number
  ai_summary?: string | null
}

type Props = {
  post: MiniPost
  clientColor?: string
  campaignName?: string | null
  selected?: boolean
  members?: { id: string; name: string; color?: string }[]
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

export default function PostMiniCard({ post, clientColor, campaignName, selected, members, onClick, onDuplicate, onSendToCriacao, draggable, dragging, dragOver, onDragStart, onDragEnd, onDragOver, onDrop }: Props) {
  const assignedData = (post.assigned_members || []).map(id => members?.find(m => m.id === id)).filter(Boolean) as { id: string; name: string; color?: string }[]
  const type   = TYPE[post.post_type] || { label: post.post_type || '—', color: 'var(--color-border)' }
  const status = STATUS[post.status]  || { label: post.status, color: '#6b7280' }
  const isRejected  = post.approval_status === 'não aprovado'
  const isApproved  = post.approval_status === 'aprovado'
  // Ajuste já resolvido: o comentário do cliente continua salvo (histórico), mas
  // o post não está mais em "ajuste" nem rejeitado — mostra selo neutro em vez do alerta vermelho
  const isAdjusted  = !isRejected && post.status !== 'ajuste' && !!post.approval_comment
  const isRevisao   = post.status === 'revisao_interna'
  const refs      = post.reference_images?.length || 0
  const delivered = !!(post.drive_url || post.drive_folder_url)
  const isVideo   = post.post_type === 'reels'

  const [thumbUrl, setThumbUrl] = useState<string | null>(() => {
    const id = post.drive_url?.match(/[-\w]{25,}/)?.[0]
    return id ? `/api/drive-thumb?id=${id}&sz=w480` : null
  })
  const [isThumbVideo, setIsThumbVideo] = useState(isVideo)

  useEffect(() => {
    if (!post.drive_folder_url) return
    const folderId = post.drive_folder_url.match(/\/folders\/([-\w]{25,})/)?.[1]
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
      /* Altura travada — o card NUNCA estica pra bater a altura do vizinho na mesma
         linha do grid (self-start ignora o align-items:stretch padrão). Tamanho sempre
         igual, com ou sem thumbnail, com texto curto ou longo — conteúdo que não coube
         é cortado pelo overflow-hidden, nunca esticado. 176px bate certinho com a foto
         (140 + barra + respiro), que é o caso mais comum (sem descrição). */
      style={{ height: 176, alignSelf: 'start', ...(selected ? { boxShadow: `0 0 0 2px ${clientColor || 'var(--color-accent)'}` } : isRevisao ? { boxShadow: '0 0 0 1px #8b5cf644' } : {}) }}
    >
      <div className="h-[3px] w-full flex-shrink-0" style={{ background: isRevisao ? '#8b5cf6' : type.color }} />

      {/* A linha interna (foto + conteúdo) preenche 100% da altura do card — que já é
          fixa (176px) — então nunca sobra faixa morta embaixo. Como o card não estica
          (self-start), a foto também nunca estica além do previsto. */}
      <div className="flex flex-1 min-h-0 overflow-hidden">
      {/* Drive thumbnail — sempre 4:5: a altura acompanha o card (176 − 3 da barra = 173)
          e a largura é fixada em 138 (173 × 4/5). A largura precisa ser explícita: derivá-la
          da altura via aspect-ratio quebra no Safari (item flex esticado resolve largura 0
          e a foto some sem erro). Zero sobra, zero distorção. */}
      {thumbUrl && (
        <div className="relative flex-shrink-0 self-stretch overflow-hidden bg-[var(--color-bg-subtle)]" style={{ width: 138 }}>
          {/* img absoluta: fora do fluxo, não contribui pra altura do card — quebra a
              dependência circular (img 100% ← container ← card ← tamanho natural da img) */}
          <img src={thumbUrl} alt={post.title}
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
            {post.post_number != null && <span className="text-xs font-bold text-[var(--color-text-faint)]">#{post.post_number}</span>}
            <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full" style={{ background: type.color + '22', color: type.color }}>{type.label}</span>
            <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full" style={{ background: status.color + '22', color: status.color }}>{status.label}</span>
            {post.funil && <span className="text-[10px] font-medium px-2 py-0.5 rounded-md bg-[var(--color-bg-subtle)] text-[var(--color-text-muted)]">{post.funil}</span>}
            {campaignName && <span className="text-[10px] font-semibold px-2 py-0.5 rounded-md" style={{ background: 'var(--ds-info-bg)', color: 'var(--ds-info-text)' }}>📣 {campaignName}</span>}
          </div>
          <div className="flex items-center gap-1 flex-shrink-0">
            {onSendToCriacao && post.status === 'estrategia' && (
              <button onClick={e => { e.stopPropagation(); onSendToCriacao() }}
                className="relative group/zap opacity-0 group-hover:opacity-100 w-6 h-6 rounded-lg flex items-center justify-center flex-shrink-0 transition-all hover:opacity-70"
                style={{ background: '#f59e0b18', color: '#b45309' }}>
                <Zap size={11} />
                <span className="pointer-events-none absolute top-full left-1/2 -translate-x-1/2 mt-1 px-1.5 py-0.5 rounded-md text-[10px] font-medium whitespace-nowrap opacity-0 group-hover/zap:opacity-100 transition-opacity z-10 shadow-sm"
                  style={{ background: 'var(--color-bg-card)', color: 'var(--color-text-secondary)', border: '1px solid var(--color-border)' }}>
                  Pra Criação
                </span>
              </button>
            )}
            {onDuplicate && (
              <button onClick={e => { e.stopPropagation(); onDuplicate() }}
                className="relative group/dup opacity-0 group-hover:opacity-100 w-6 h-6 rounded-lg bg-[var(--color-bg-subtle)] hover:bg-[var(--color-bg-page)] flex items-center justify-center transition-all text-[var(--color-text-muted)] flex-shrink-0">
                <Copy size={11} />
                <span className="pointer-events-none absolute top-full left-1/2 -translate-x-1/2 mt-1 px-1.5 py-0.5 rounded-md text-[10px] font-medium whitespace-nowrap opacity-0 group-hover/dup:opacity-100 transition-opacity z-10 shadow-sm"
                  style={{ background: 'var(--color-bg-card)', color: 'var(--color-text-secondary)', border: '1px solid var(--color-border)' }}>
                  Duplicar
                </span>
              </button>
            )}
          </div>
        </div>

        {/* Title + copy — não mostrar copy se estiver em Ajuste */}
        <div className="flex-1 min-h-0 flex flex-col">
          <p className="font-bold text-[var(--color-text-primary)] text-[15px] leading-snug line-clamp-2 flex-shrink-0">{post.title || 'Sem título'}</p>
          {post.status !== 'ajuste' && (post.ai_summary || post.copy) && (
            <p className="text-sm text-[var(--color-text-muted)] leading-relaxed mt-1.5 flex-1 min-h-0 overflow-hidden"
              style={{ maxHeight: '2.4em', WebkitMaskImage: 'linear-gradient(to bottom, black 60%, transparent 100%)', maskImage: 'linear-gradient(to bottom, black 60%, transparent 100%)' }}>
              {post.ai_summary || post.copy!.replace(/\*/g, '')}
            </p>
          )}
        </div>

        {/* Rejection or adjustment comment */}
        {(isRejected || post.status === 'ajuste') && post.approval_comment && (
          <div className="rounded-lg px-2.5 py-1.5 text-xs italic leading-snug overflow-hidden text-ellipsis line-clamp-2" style={{ background: post.status === 'ajuste' ? '#ef444422' : 'var(--ds-error-bg)', color: post.status === 'ajuste' ? '#ef4444' : 'var(--ds-error-text)' }}>
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
            {!!post.comments_count && post.comments_count > 0 && (
              <span className="flex items-center gap-0.5 text-xs text-[var(--color-text-muted)] flex-shrink-0" title={`${post.comments_count} comentário(s)`}>
                <MessageSquare size={11} /> {post.comments_count}
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
            {delivered
              ? <span className="flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full" style={{ background: 'var(--ds-success-bg)', color: 'var(--ds-success-text)' }}><Package size={10} /> Entregue</span>
              : <span className="flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-full bg-[var(--color-bg-subtle)] text-[var(--color-text-faint)]"><Package size={10} /> Sem entrega</span>}
            {isRejected && <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full" style={{ background: 'var(--ds-error-bg)', color: 'var(--ds-error-text)' }}>Não aprovado</span>}
            {isAdjusted && <span title={post.approval_comment || ''} className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-[var(--color-bg-subtle)] text-[var(--color-text-muted)]">✓ Ajuste aplicado</span>}
            {isApproved && <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full" style={{ background: 'var(--ds-success-bg)', color: 'var(--ds-success-text)' }}>✓</span>}
          </div>
        </div>
      </div>
      </div>
    </div>
  )
}
