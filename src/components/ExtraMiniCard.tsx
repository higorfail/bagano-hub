'use client'

import { useState, useEffect } from 'react'
import { Calendar, CheckSquare, AlertCircle, MessageSquare, Paperclip, Play, Archive } from 'lucide-react'
import { cardDue } from '@/lib/cardDue'

interface ExtraLite {
  id: string
  title: string
  status: string
  priority: string
  due_date?: string | null
  drive_url?: string | null
  description?: string | null
  briefing?: string | null
  ai_summary?: string | null
  labels?: { text: string; color: string }[] | null
  client_id?: string | null
  client_approval_status?: string | null
  client_approval_comment?: string | null
}

type Props = {
  extra: ExtraLite
  TypeIcon: React.ElementType
  typeColor: string
  priorityColor: string
  assignedData: { id: string; name: string; color?: string }[]
  chk?: { done: number; total: number }
  commentCount: number
  attachCount?: number
  clientBadge?: { name: string; color: string } | null
  showGlobalBadge?: boolean
  dragging: boolean
  onClick: () => void
  onDragStart: (e: React.DragEvent) => void
  onDragEnd: () => void
  onArchive?: () => void
  onMovePrev?: () => void
  onMoveNext?: () => void
}

export default function ExtraMiniCard({
  extra, TypeIcon, typeColor, priorityColor, assignedData, chk, commentCount, attachCount = 0,
  clientBadge, showGlobalBadge, dragging, onClick, onDragStart, onDragEnd, onArchive,
  onMovePrev, onMoveNext,
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

  // Card "voltou pra A fazer" porque o cliente pediu ajuste — precisa saltar
  // aos olhos no meio dos outros cards da coluna, não só um selinho pequeno
  // no rodapé (fácil de não notar entre vários cards).
  const isAjuste = extra.client_approval_status === 'recusado'
  const due = cardDue(extra.due_date)

  return (
    <div
      draggable
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onClick={onClick}
      className="group border rounded-xl flex cursor-grab active:cursor-grabbing shadow-card hover:shadow-pop hover:-translate-y-0.5 transition-all duration-150 relative overflow-hidden"
      style={{
        borderTopColor: isAjuste ? '#f59e0b66' : 'var(--color-border)',
        borderLeftColor: isAjuste ? '#f59e0b66' : 'var(--color-border)',
        borderRightColor: isAjuste ? '#f59e0b66' : 'var(--color-border)',
        borderBottomColor: isAjuste ? '#f59e0b66' : 'var(--color-border)',
        background: isAjuste ? '#f59e0b14' : 'var(--color-bg-card)',
        opacity: dragging ? 0.4 : 1,
        minHeight: 140,
      }}
    >
      {(onMovePrev || onMoveNext || onArchive) && (
        <div className="absolute top-1.5 right-1.5 z-10 hidden group-hover:flex items-center gap-1" onClick={e => e.stopPropagation()}>
          {onMovePrev && (
            <button onClick={onMovePrev} title="Coluna anterior"
              className="w-5 h-5 rounded bg-[var(--color-bg-subtle)] hover:bg-[var(--color-border)] flex items-center justify-center text-[var(--color-text-muted)] text-[10px] transition-colors">←</button>
          )}
          {onMoveNext && (
            <button onClick={onMoveNext} title="Próxima coluna"
              className="w-5 h-5 rounded bg-[var(--color-bg-subtle)] hover:bg-[var(--color-border)] flex items-center justify-center text-[var(--color-text-muted)] text-[10px] transition-colors">→</button>
          )}
          {onArchive && (
            <button onClick={onArchive} title="Arquivar"
              className="w-5 h-5 rounded bg-[var(--color-bg-subtle)] hover:bg-[var(--color-border)] flex items-center justify-center text-[var(--color-text-muted)] transition-colors">
              <Archive size={11} />
            </button>
          )}
        </div>
      )}

      {/* Preview da entrega — SEMPRE 4:5, o formato combinado. Antes ela
          esticava até a altura do card (`self-stretch`), então card mais alto
          dava prévia mais comprida e a proporção mudava de um card pro outro.
          112×140 é exatamente 4:5 e casa com a altura mínima do card. */}
      {thumbUrl && (
        <div className="relative w-28 aspect-[4/5] self-start flex-shrink-0 overflow-hidden bg-[var(--color-bg-subtle)]">
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

      <div className="flex-1 min-w-0 min-h-0 p-3 flex flex-col overflow-hidden">
        {/* Cliente e etiquetas na primeira linha: no modo "todos os clientes"
            o cliente é o que agrupa a leitura, então vem primeiro — antes ele
            era o último item de um rodapé que embrulhava, e por isso era sempre
            ele que sobrava e saía cortado.

            Sempre renderizada e com altura fixa. Card com um selo e card com
            dois faziam o título começar em alturas diferentes — é isso que
            desalinhava as linhas entre cards vizinhos. `overflow-hidden`
            garante que um terceiro selo não empurre nada pra baixo. */}
        <div className="flex items-center gap-1 mb-1.5 h-[18px] overflow-hidden flex-shrink-0">
            {clientBadge && (
              <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full text-white max-w-[130px] truncate flex-shrink-0"
                style={{ background: clientBadge.color }}>{clientBadge.name}</span>
            )}
            {showGlobalBadge && (
              <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-[var(--color-bg-subtle)] text-[var(--color-text-faint)] flex-shrink-0">Global</span>
            )}
          {extra.labels?.map((l, i) => (
            <span key={i} className="text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full text-white max-w-[120px] truncate flex-shrink-0" style={{ background: l.color }}>
              {l.text}
            </span>
          ))}
        </div>

        {/* Type icon + title */}
        <div className="flex items-start gap-2 flex-shrink-0">
          <TypeIcon size={13} strokeWidth={1.75}
            style={{ color: typeColor, flexShrink: 0, marginTop: 1.5 }} />
          {/* Uma linha, com reticências. Título comprido quebrando em duas
              linhas era o que fazia um card ficar mais alto que o vizinho —
              e altura desigual entre cards da mesma coluna é justamente o que
              a gente veio tirar. O nome inteiro fica no title do hover. */}
          <p title={extra.title}
            className="text-sm font-medium text-[var(--color-text-primary)] leading-snug flex-1 min-w-0 truncate"
            style={{
              textDecoration: extra.status === 'done' ? 'line-through' : 'none',
              opacity:        extra.status === 'done' ? 0.5 : 1,
            }}>
            {extra.title}
          </p>
        </div>

        {/* Resumo em UMA linha, e só em "A fazer".

            A linha continua vindo da IA — é ela que condensa um briefing longo
            em algo que cabe num card. O que estava errado era a altura: o card
            reservava três linhas e desbotava o fim, então um resumo curto virava
            parágrafo. Agora é uma linha, cortada no fim.

            E some depois de feito: com a arte na prévia, quem olha o card já
            sabe do que se trata — ali a linha só disputa espaço. */}
        {extra.status === 'backlog' && (
          <p className="text-[11px] text-[var(--color-text-muted)] mt-1 ml-5 leading-snug truncate flex-shrink-0 min-h-[15px]">
            {extra.ai_summary || extra.briefing || extra.description || ''}
          </p>
        )}

        {/* Rodapé com papéis fixos: contadores à esquerda, avatares à direita.
            Era uma fileira só onde data, contadores, selos de estado, avatares
            e cliente disputavam a mesma linha e embrulhavam — o formato do card
            de Material, que já funcionava.

            Os selos que a COLUNA já diz saíram: "Com cliente" dentro da coluna
            "Com o cliente" e "✓ Aprovado" dentro de "Finalizados" eram o card
            repetindo o cabeçalho. Sobra o que a coluna NÃO conta. */}
        <div className="flex items-center justify-between gap-2 mt-auto pt-2">
          <div className="flex items-center gap-2 flex-wrap min-w-0">
            {due && (
              <span className="flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded-full"
                style={due.overdue ? { background: 'var(--ds-error-bg)', color: 'var(--ds-error-text)' }
                     : due.soon    ? { background: 'var(--ds-warn-bg)', color: 'var(--ds-warn-text)' }
                                   : { background: 'var(--color-bg-subtle)', color: 'var(--color-text-muted)' }}>
                {due.overdue ? <AlertCircle size={9} /> : <Calendar size={9} />}
                {due.date}{due.relative && ` · ${due.relative}`}
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
            {attachCount > 0 && (
              <span className="flex items-center gap-1 text-[10px] font-medium text-[var(--color-text-muted)]">
                <Paperclip size={9} /> {attachCount}
              </span>
            )}
            {/* "Entregue" só quando NÃO há prévia: os dois saem do mesmo campo
                (drive_url), então com a arte na tela o chip repete em palavras
                o que a imagem já provou. Sem prévia — link de pasta, thumbnail
                que falhou, entrega que não é imagem — ele é a única pista. */}
            {extra.drive_url && !thumbUrl && (
              <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-[var(--ds-success-bg)] text-[var(--ds-success-text)]">✓ Entregue</span>
            )}
            {/* Fica: a coluna não conta que o cliente pediu ajuste — o card
                volta pra "A fazer" e nada ali denunciaria isso. */}
            {isAjuste && (
              <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full text-white flex-shrink-0" style={{ background: '#ef4444' }}>⚠ Ajuste pedido</span>
            )}
            {extra.client_approval_status === 'aguardando' && extra.client_approval_comment && (
              <span title={extra.client_approval_comment} className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full flex-shrink-0" style={{ background: '#f59e0b22', color: '#f59e0b' }}>🟡 Ajustado</span>
            )}
          </div>

          {assignedData.length > 0 && (
            <span className="flex -space-x-1.5 flex-shrink-0">
              {assignedData.slice(0, 3).map(m => (
                <span key={m.id} title={m.name}
                  className="w-6 h-6 rounded-full border-2 border-[var(--color-bg-card)] flex items-center justify-center text-white text-[8px] font-bold"
                  style={{ background: m.color || 'var(--color-brand)' }}>
                  {m.name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()}
                </span>
              ))}
              {assignedData.length > 3 && (
                <span className="w-6 h-6 rounded-full bg-[var(--color-bg-subtle)] border-2 border-[var(--color-bg-card)] flex items-center justify-center text-[var(--color-text-muted)] text-[8px] font-bold">+{assignedData.length - 3}</span>
              )}
            </span>
          )}
        </div>
      </div>
    </div>
  )
}
