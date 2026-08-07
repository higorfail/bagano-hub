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

  // Data e hora são o DADO PRINCIPAL de um quadro de publicação. Estavam em
  // 9px, cinza, ao lado do tipo — do tamanho de um detalhe.
  const dataFmt = item.scheduledDate
    ? new Date(item.scheduledDate + 'T12:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })
    : null
  const diasAtraso = overdue && item.scheduledDate
    ? Math.round((new Date().setHours(0,0,0,0) - new Date(item.scheduledDate + 'T12:00:00').setHours(0,0,0,0)) / 86400000)
    : 0
  const publicado = item.column === 'publicado'

  // Ações secundárias sobre a prévia: no hover no computador, sempre visíveis
  // no toque (iPad não tem hover). Elas ocupavam uma fileira fixa do card, com
  // borda em cima, pra dois ícones de 24px — a fileira mais vazia do card.
  const acoes = (
    <div className="absolute top-1 right-1 flex items-center gap-1 opacity-0 group-hover:opacity-100 [@media(pointer:coarse)]:opacity-100 transition-opacity">
      <button onClick={copyCaption} disabled={!caption}
        title={caption ? 'Copiar legenda' : 'Sem legenda preenchida'}
        className="w-6 h-6 rounded-md bg-black/55 backdrop-blur flex items-center justify-center text-white/90 hover:text-white disabled:opacity-30">
        {copied ? <Check size={12} /> : <Copy size={12} />}
      </button>
      <button onClick={download} disabled={!hasContent || downloading}
        title={hasContent ? 'Baixar conteúdo' : 'Sem link do Drive'}
        className="w-6 h-6 rounded-md bg-black/55 backdrop-blur flex items-center justify-center text-white/90 hover:text-white disabled:opacity-30">
        {downloading ? <Loader2 size={12} className="animate-spin" /> : <Download size={12} />}
      </button>
    </div>
  )

  return (
    <div
      draggable={draggable}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onClick={onClick}
      className={`group mx-1 bg-[var(--color-bg-card)] rounded-2xl overflow-hidden flex cursor-pointer select-none border transition-all hover:shadow-sm hover:border-[var(--color-border-hover)] ${overdue ? 'border-[var(--ds-error-border)]' : 'border-[var(--color-border)]'}`}
    >
      {/* A arte é o conteúdo deste quadro, e estava em 28x28 — do tamanho de um
          favicon. Agora 4:5, a mesma proporção e posição do cronograma, dos
          extras e dos materiais. Publicado é arquivo: prévia menor, porque
          ninguém age nele. */}
      <div className={`relative ${publicado ? 'w-16' : 'w-24'} aspect-[4/5] self-start flex-shrink-0 bg-[var(--color-bg-subtle)] overflow-hidden`}>
        {thumbUrl ? (
          <img src={thumbUrl} alt="" className="absolute inset-0 w-full h-full object-cover"
            onError={e => { (e.target as HTMLImageElement).style.display = 'none' }} />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center text-[var(--color-text-faint)] text-[10px]">sem arte</div>
        )}
        {isVideo && thumbUrl && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/25 pointer-events-none">
            <div className="w-7 h-7 rounded-full bg-white/90 flex items-center justify-center">
              <Play size={11} className="text-[#111] ml-0.5" fill="currentColor" />
            </div>
          </div>
        )}
        {!publicado && acoes}
      </div>

      <div className="flex-1 min-w-0 p-2.5 flex flex-col gap-1.5">
        {/* Sem selo de estado: a COLUNA já diz onde o card está. Antes o mesmo
            estado aparecia três vezes (faixa colorida + rótulo em caixa alta +
            nome da coluna), e nos publicados quatro. Sobra só o que a coluna
            não conta — que o prazo passou. */}
        <span className="flex items-center gap-1 text-[10px] font-medium text-[var(--color-text-muted)] truncate">
          {client && <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: client.color_hex }} />}
          <span className="truncate">{client?.name}</span>
          <span className="flex-shrink-0" style={{ color: item.source === 'extra' ? '#6366f1' : 'var(--color-text-faint)' }}>· {item.source === 'extra' ? 'Extra' : 'Crono'}</span>
        </span>

        <p className={`text-[13px] font-semibold leading-snug line-clamp-2 ${publicado ? 'text-[var(--color-text-secondary)]' : 'text-[var(--color-text-primary)]'}`}>
          {item.postNumber && <span className="text-[var(--color-text-faint)]">#{item.postNumber} · </span>}
          {item.title}
        </p>

        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded-md flex-shrink-0" style={{ background: typeAccent + '22', color: typeAccent }}>
            {POST_TYPE_LABEL[item.postType || ''] || item.postType}
          </span>
          {dataFmt && (
            <span className="text-[12px] font-semibold tabular-nums"
              style={{ color: overdue ? 'var(--ds-error-text)' : 'var(--color-text-secondary)' }}>
              {overdue && <AlertTriangle size={10} className="inline mb-0.5 mr-0.5" />}
              {dataFmt}{item.scheduledTime ? ` · ${item.scheduledTime.slice(0, 5)}` : ''}
              {overdue && diasAtraso > 0 && ` · ${diasAtraso}d atraso`}
            </span>
          )}
        </div>

        {!compact && !publicado && caption && (
          <p className="text-[10px] text-[var(--color-text-muted)] leading-relaxed line-clamp-2">{caption}</p>
        )}

        {/* UMA ação por coluna, do tamanho de uma ação. No card atrasado ela é
            vermelha: verde-menta num item vencido lia como "está tudo bem". */}
        {item.column === 'aprovado' && onSchedule && (
          scheduling ? (
            <input type="date" autoFocus onClick={e => e.stopPropagation()}
              onChange={e => { if (e.target.value) { onSchedule(e.target.value); setScheduling(false) } }}
              onBlur={() => setScheduling(false)}
              className="text-[12px] px-2 py-1.5 rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-card)] text-[var(--color-text-primary)] outline-none" />
          ) : (
            <button onClick={schedule}
              title={item.scheduledDate ? 'Confirmar agendamento pra essa data' : 'Escolher uma data e agendar'}
              className="mt-auto flex items-center justify-center gap-1.5 text-[12px] font-semibold px-2 py-1.5 rounded-lg transition-colors"
              style={overdue
                ? { background: 'var(--ds-error-accent)', color: '#fff' }
                : { background: '#14B8A6', color: '#fff' }}>
              <CalendarClock size={12} /> Agendar
            </button>
          )
        )}

        {item.column === 'agendado' && (
          <button onClick={markPublished} title="Marcar como publicado"
            className="mt-auto flex items-center justify-center gap-1.5 text-[12px] font-semibold px-2 py-1.5 rounded-lg transition-colors"
            style={{ background: 'var(--ds-success-bg)', color: 'var(--ds-success-text)' }}>
            <CheckCircle2 size={12} /> Marcar publicado
          </button>
        )}
      </div>
    </div>
  )
}
