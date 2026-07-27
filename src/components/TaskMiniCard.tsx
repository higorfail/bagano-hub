'use client'

import { useState } from 'react'

interface TaskMiniCardProps {
  task: any
  clientMap: Record<string, { name: string; color_hex: string }>
  previewUrl?: string | null
  /** Posição desse post-it entre todas as notas do quadro (0-based) — decide a cor. */
  noteIndex?: number
  totalNotes?: number
  onClick: () => void
  onMarkDone?: () => void
  onDelete?: () => void
  draggable?: boolean
  onDragStart?: (e: React.DragEvent) => void
}

const TYPE_LABEL: Record<string, string> = { tarefa: 'Tarefa', lembrete: 'Lembrete', nota: 'Nota' }
const TYPE_COLOR: Record<string, string> = {
  tarefa:   'bg-[var(--ds-info-bg)] text-[var(--ds-info-text)]',
  lembrete: 'bg-[var(--ds-warn-bg)] text-[var(--ds-warn-text)]',
}
const TYPE_EMOJI: Record<string, string> = { tarefa: '✅', lembrete: '⏰', nota: '📝' }
const PRIORITY_COLOR: Record<string, string> = { low: '#94a3b8', normal: '#6b7280', high: '#ef4444' }
const PRIORITY_LABEL: Record<string, string> = { low: 'Baixa', normal: 'Normal', high: 'Alta' }

// Paleta clássica de bloquinhos de post-it (definida em src/app/layout.tsx como
// tokens --note-c1-N/--note-c2-N/--note-ink-N, com par claro/escuro por tema) —
// index 0 é sempre o amarelo padrão; só entra em cena quando existe mais de uma
// nota no quadro (senão fica tudo amarelo).
const NOTE_PALETTE_SIZE = 6

// Ângulo pequeno e estável por tarefa (não randomiza a cada render)
function hashAngle(id: string) {
  let h = 0
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) % 1000
  return (h / 1000 - 0.5) * 1.4 // entre -0.7° e 0.7°
}

export default function TaskMiniCard({ task: t, clientMap, previewUrl, noteIndex = 0, totalNotes = 1, onClick, onMarkDone, onDelete, draggable, onDragStart }: TaskMiniCardProps) {
  const [checked, setChecked] = useState(t.status === 'feito')
  const [leaving, setLeaving] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)

  function handleDeleteClick(e: React.MouseEvent) {
    e.stopPropagation()
    if (confirmDelete) { onDelete?.(); return }
    setConfirmDelete(true)
    setTimeout(() => setConfirmDelete(false), 2500)
  }
  const reduced = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
  const exitDuration = reduced ? 0 : 420
  const transitionCss = reduced ? 'none' : 'opacity .4s ease, transform .4s ease'
  const due = t.due_date ? new Date(t.due_date + 'T23:59:59') : null
  const diff = due ? Math.ceil((due.getTime() - Date.now()) / (1000 * 60 * 60 * 24)) : null
  const dueColor = diff === null ? '' : diff < 0 ? 'text-[var(--ds-error-text)] bg-[var(--ds-error-bg)]' : diff <= 1 ? 'text-[var(--ds-caution-text)] bg-[var(--ds-caution-bg)]' : 'text-[var(--color-text-secondary)] bg-[var(--color-bg-subtle)]'
  const dueLabel = diff === null ? '' : diff < 0 ? ' · atrasado' : diff === 0 ? ' · hoje' : diff === 1 ? ' · amanhã' : ''
  const client = t.client_id ? clientMap[t.client_id] : null
  const labels: { text: string; color: string }[] = Array.isArray(t.labels) ? t.labels : []
  const isDone = t.status === 'feito'

  function handleMarkDone(e: React.MouseEvent) {
    e.stopPropagation()
    if (checked || leaving) return
    setChecked(true)
    setLeaving(true)
    setTimeout(() => onMarkDone?.(), exitDuration)
  }

  const deleteButton = onDelete && (
    <button onClick={handleDeleteClick} title={confirmDelete ? 'Clique de novo pra confirmar' : 'Excluir'}
      className="absolute top-1.5 right-1.5 z-20 w-6 h-6 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all"
      style={{ background: confirmDelete ? 'var(--ds-error-accent)' : 'rgba(0,0,0,0.14)', color: '#fff' }}>
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M3 6h18" /><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
      </svg>
    </button>
  )

  // ─── NOTA — post-it ────────────────────────────────────────────────────
  if (t.type === 'nota') {
    const paletteIdx = totalNotes > 1 ? noteIndex % NOTE_PALETTE_SIZE : 0
    const inkVar = `var(--note-ink-${paletteIdx})`
    const angle = hashAngle(t.id)
    return (
      <div
        onClick={onClick}
        draggable={draggable}
        onDragStart={onDragStart}
        className="group relative flex flex-col gap-2 cursor-pointer overflow-hidden"
        style={{
          padding: '14px 14px 12px',
          borderRadius: 3,
          borderTopRightRadius: 0,
          background: `linear-gradient(160deg, var(--note-c1-${paletteIdx}) 0%, var(--note-c2-${paletteIdx}) 100%)`,
          transform: leaving ? 'scale(0.9) rotate(0deg)' : `rotate(${angle}deg)`,
          opacity: leaving ? 0 : 1,
          transition: reduced ? 'none' : 'opacity .4s ease, transform .3s ease',
          boxShadow: '0 3px 7px rgba(60, 45, 5, 0.16), 0 1px 2px rgba(60, 45, 5, 0.1)',
        }}
      >
        {onDelete && (
          <button onClick={handleDeleteClick} title={confirmDelete ? 'Clique de novo pra confirmar' : 'Excluir'}
            className="absolute top-1.5 left-1.5 z-20 w-6 h-6 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all"
            style={{ background: confirmDelete ? 'var(--ds-error-accent)' : 'rgba(0,0,0,0.14)', color: '#fff' }}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M3 6h18" /><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
            </svg>
          </button>
        )}
        {/* Dobra do canto — recorte triangular + sombra, encaixado no canto reto (top-right sem radius) */}
        <div className="absolute top-0 right-0 pointer-events-none" style={{ width: 15, height: 15, zIndex: 2,
          clipPath: 'polygon(0 0, 100% 0, 100% 100%)',
          background: 'linear-gradient(135deg, rgba(255,255,255,0.55) 0%, rgba(0,0,0,0.14) 65%)',
          filter: 'drop-shadow(-1px 1px 1.5px rgba(60,45,5,0.25))',
        }} />
        {labels.length > 0 && (
          <div className="flex flex-wrap gap-1 relative z-[1]">
            {labels.map((l, i) => (
              <span key={i} className="text-[9px] font-semibold px-1.5 py-0.5 rounded-full text-white flex-shrink-0" style={{ background: l.color }}>{l.text}</span>
            ))}
          </div>
        )}
        <p className="text-sm leading-snug break-words relative z-[1]" style={{ color: inkVar, fontFamily: 'Georgia, serif' }}>{t.title}</p>
        {(t.ai_summary || t.note) && (
          <p className="text-[11px] leading-relaxed overflow-hidden relative z-[1]" style={{ color: inkVar, opacity: 0.75, maxHeight: '3em', WebkitMaskImage: 'linear-gradient(to bottom, black 70%, transparent 100%)', maskImage: 'linear-gradient(to bottom, black 70%, transparent 100%)' }}>
            {t.ai_summary || t.note}
          </p>
        )}
        {due && (
          <span className="self-start text-[10px] font-medium relative z-[1]" style={{ color: diff !== null && diff < 0 ? '#B91C1C' : inkVar, opacity: diff !== null && diff < 0 ? 1 : 0.75 }}>
            {new Date(t.due_date + 'T12:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })}{dueLabel}
          </span>
        )}
      </div>
    )
  }

  // ─── LEMBRETE — ticket com furo lateral ───────────────────────────────
  if (t.type === 'lembrete') {
    return (
      <div onClick={onClick} draggable={draggable} onDragStart={onDragStart}
        className="group relative flex rounded-xl overflow-visible cursor-pointer shadow-card hover:shadow-pop hover:-translate-y-0.5 transition-all duration-150"
        style={{
          transform: leaving ? 'scale(0.92)' : undefined,
          opacity: leaving ? 0 : 1,
          transition: transitionCss,
        }}>
        {deleteButton}
        {/* Furo circular na lateral esquerda (efeito ticket) */}
        <div className="absolute -left-[6px] top-1/2 -translate-y-1/2 w-3.5 h-3.5 rounded-full z-10"
          style={{ background: 'var(--color-bg-page)', border: '1px solid var(--color-border)' }} />

        <div className="rounded-l-xl overflow-hidden bg-[var(--color-bg-card)] border border-[var(--color-border)] flex w-full">
          {/* Canhoto */}
          <div className="w-8 flex-shrink-0 flex flex-col items-center justify-center gap-1 border-r border-dashed border-[var(--color-border-strong)]"
            style={{ background: 'var(--ds-warn-bg)' }}>
            <span className="text-sm">⏰</span>
          </div>

          <div className="flex-1 min-w-0 p-3 flex flex-col gap-2">
            <div className="flex items-center gap-1.5 flex-wrap">
              {t.priority && t.priority !== 'normal' && (
                <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full" style={{ color: PRIORITY_COLOR[t.priority], background: PRIORITY_COLOR[t.priority] + '18' }}>{PRIORITY_LABEL[t.priority]}</span>
              )}
              {client && (
                <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full text-white" style={{ background: client.color_hex }}>{client.name}</span>
              )}
              {!isDone && (
                <button onClick={handleMarkDone} title="Marcar como feito"
                  className="ml-auto relative w-5 h-5 rounded-full border-2 flex-shrink-0 flex items-center justify-center transition-colors"
                  style={{ borderColor: checked ? 'var(--ds-success-accent)' : 'var(--color-border-strong)', background: checked ? 'var(--ds-success-accent)' : 'transparent' }}>
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3"
                    strokeDasharray="20" strokeDashoffset={checked ? 0 : 20} style={{ transition: 'stroke-dashoffset .3s ease' }}>
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                </button>
              )}
            </div>
            {labels.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {labels.map((l, i) => <span key={i} className="text-[9px] font-semibold px-1.5 py-0.5 rounded-full text-white" style={{ background: l.color }}>{l.text}</span>)}
              </div>
            )}
            <p className={`text-sm font-medium leading-snug ${checked ? 'line-through text-[var(--color-text-faint)]' : 'text-[var(--color-text-primary)]'}`} style={{ transition: 'color .3s ease' }}>{t.title}</p>
            {(t.ai_summary || t.note) && (
              <p className="text-[11px] text-[var(--color-text-muted)] leading-relaxed overflow-hidden"
                style={{ maxHeight: '2.6em', WebkitMaskImage: 'linear-gradient(to bottom, black 70%, transparent 100%)', maskImage: 'linear-gradient(to bottom, black 70%, transparent 100%)' }}>
                {t.ai_summary || t.note}
              </p>
            )}
            {due && (
              <span className={`self-start flex items-center gap-1 px-1.5 py-0.5 rounded text-[11px] font-medium ${dueColor}`}>
                {new Date(t.due_date + 'T12:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })}{dueLabel}
              </span>
            )}
          </div>
        </div>
      </div>
    )
  }

  // ─── TAREFA (padrão) — papel pautado ──────────────────────────────────
  return (
    <div onClick={onClick} draggable={draggable} onDragStart={onDragStart}
      className="group bg-[var(--color-bg-card)] border border-[var(--color-border)] rounded-xl overflow-hidden flex flex-col shadow-card hover:shadow-pop hover:border-[var(--color-border-hover)] hover:-translate-y-0.5 cursor-pointer"
      style={{
        transform: leaving ? 'scale(0.92)' : undefined,
        opacity: leaving ? 0 : 1,
        transition: transitionCss,
      }}>
      {deleteButton}
      {previewUrl && (
        <div className="relative w-full bg-[var(--color-bg-subtle)]" style={{ paddingTop: '56%' }}>
          <img src={previewUrl} alt="" className="absolute inset-0 w-full h-full object-cover"
            onError={e => { const el = e.currentTarget.parentElement; if (el) el.style.display = 'none' }} />
        </div>
      )}
      <div className="relative p-3 pl-4 flex flex-col gap-2"
        style={{ backgroundImage: 'repeating-linear-gradient(to bottom, transparent, transparent 20px, var(--color-border) 20px, var(--color-border) 21px)', backgroundPosition: '0 4px' }}>
        <div className="absolute left-2.5 top-0 bottom-0 w-px" style={{ background: 'var(--color-accent)', opacity: 0.25 }} />
        <div className="flex items-start gap-2">
          {!isDone && (
            <button onClick={handleMarkDone} title="Marcar como feito"
              className="relative w-5 h-5 rounded-full border-2 flex-shrink-0 mt-0.5 flex items-center justify-center transition-colors"
              style={{ borderColor: checked ? 'var(--ds-success-accent)' : 'var(--color-border-strong)', background: checked ? 'var(--ds-success-accent)' : 'transparent' }}>
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3"
                strokeDasharray="20" strokeDashoffset={checked ? 0 : 20} style={{ transition: 'stroke-dashoffset .3s ease' }}>
                <polyline points="20 6 9 17 4 12" />
              </svg>
            </button>
          )}
          <div className="flex-1 min-w-0 flex flex-col gap-2">
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${TYPE_COLOR.tarefa}`}>{TYPE_EMOJI.tarefa} Tarefa</span>
              {t.priority && t.priority !== 'normal' && (
                <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full" style={{ color: PRIORITY_COLOR[t.priority], background: PRIORITY_COLOR[t.priority] + '18' }}>{PRIORITY_LABEL[t.priority]}</span>
              )}
              {client && (
                <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full text-white" style={{ background: client.color_hex }}>{client.name}</span>
              )}
            </div>
            {labels.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {labels.map((l, i) => <span key={i} className="text-[9px] font-semibold px-1.5 py-0.5 rounded-full text-white" style={{ background: l.color }}>{l.text}</span>)}
              </div>
            )}
            <p className={`text-sm font-medium leading-snug ${checked ? 'line-through text-[var(--color-text-faint)]' : 'text-[var(--color-text-primary)]'}`} style={{ transition: 'color .3s ease' }}>{t.title}</p>
          </div>
        </div>
        {(t.ai_summary || t.note) && (
          <p className="text-[11px] text-[var(--color-text-muted)] leading-relaxed overflow-hidden"
            style={{ maxHeight: '2.6em', WebkitMaskImage: 'linear-gradient(to bottom, black 70%, transparent 100%)', maskImage: 'linear-gradient(to bottom, black 70%, transparent 100%)' }}>
            {t.ai_summary || t.note}
          </p>
        )}
        {due && (
          <span className={`self-start flex items-center gap-1 px-1.5 py-0.5 rounded text-[11px] font-medium ${dueColor}`}>
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
            {new Date(t.due_date + 'T12:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })}{dueLabel}
          </span>
        )}
      </div>
    </div>
  )
}
