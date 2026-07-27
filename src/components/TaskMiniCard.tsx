'use client'

import { useState } from 'react'

interface TaskMiniCardProps {
  task: any
  clientMap: Record<string, { name: string; color_hex: string }>
  previewUrl?: string | null
  onClick: () => void
  onMarkDone?: () => void
  draggable?: boolean
  onDragStart?: (e: React.DragEvent) => void
}

const TYPE_LABEL: Record<string, string> = { tarefa: 'Tarefa', lembrete: 'Lembrete', nota: 'Nota' }
const TYPE_COLOR: Record<string, string> = {
  tarefa:   'bg-[var(--ds-info-bg)] text-[var(--ds-info-text)]',
  lembrete: 'bg-[var(--ds-warn-bg)] text-[var(--ds-warn-text)]',
  nota:     'bg-[var(--ds-purple-bg)] text-[var(--ds-purple-text)]',
}
const TYPE_EMOJI: Record<string, string> = { tarefa: '✅', lembrete: '⏰', nota: '📝' }
const PRIORITY_COLOR: Record<string, string> = { low: '#94a3b8', normal: '#6b7280', high: '#ef4444' }
const PRIORITY_LABEL: Record<string, string> = { low: 'Baixa', normal: 'Normal', high: 'Alta' }

export default function TaskMiniCard({ task: t, clientMap, previewUrl, onClick, onMarkDone, draggable, onDragStart }: TaskMiniCardProps) {
  const [checked, setChecked] = useState(t.status === 'feito')
  const [leaving, setLeaving] = useState(false)
  const reduced = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
  const exitDuration = reduced ? 0 : 420
  const transitionCss = reduced ? 'none' : 'opacity .4s ease, transform .4s ease'
  const due = t.due_date ? new Date(t.due_date + 'T23:59:59') : null
  const diff = due ? Math.ceil((due.getTime() - Date.now()) / (1000 * 60 * 60 * 24)) : null
  const dueColor = diff === null ? '' : diff < 0 ? 'text-[var(--ds-error-text)] bg-[var(--ds-error-bg)]' : diff <= 1 ? 'text-[var(--ds-caution-text)] bg-[var(--ds-caution-bg)]' : 'text-[var(--color-text-secondary)] bg-[var(--color-bg-subtle)]'
  const dueLabel = diff === null ? '' : diff < 0 ? ' · atrasado' : diff === 0 ? ' · hoje' : diff === 1 ? ' · amanhã' : ''
  const client = t.client_id ? clientMap[t.client_id] : null
  const labels: { text: string; color: string }[] = Array.isArray(t.labels) ? t.labels : []
  const isNota = t.type === 'nota'
  const isDone = t.status === 'feito'

  function handleMarkDone(e: React.MouseEvent) {
    e.stopPropagation()
    if (checked || leaving) return
    setChecked(true)
    setLeaving(true)
    setTimeout(() => onMarkDone?.(), exitDuration)
  }

  if (isNota) {
    return (
      <div
        onClick={onClick}
        draggable={draggable}
        onDragStart={onDragStart}
        className="group relative rounded-lg p-3.5 flex flex-col gap-2 cursor-pointer transition-transform duration-150 hover:-translate-y-0.5 hover:rotate-0"
        style={{
          background: 'linear-gradient(135deg, #FEF6C8 0%, #FDECA0 100%)',
          transform: leaving ? 'scale(0.9) rotate(0deg)' : 'rotate(-1.4deg)',
          opacity: leaving ? 0 : 1,
          transition: transitionCss,
          boxShadow: '0 3px 6px rgba(120, 95, 10, 0.18), 0 1px 2px rgba(120, 95, 10, 0.12)',
        }}
      >
        {/* Canto dobrado */}
        <div className="absolute top-0 right-0 w-4 h-4 pointer-events-none"
          style={{ background: 'linear-gradient(135deg, transparent 50%, rgba(120,95,10,0.18) 50%)', borderBottomLeftRadius: 3 }} />
        {labels.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {labels.map((l, i) => (
              <span key={i} className="text-[9px] font-semibold px-1.5 py-0.5 rounded-full text-white flex-shrink-0" style={{ background: l.color }}>{l.text}</span>
            ))}
          </div>
        )}
        <p className="text-sm leading-snug break-words" style={{ color: '#5C4A0A', fontFamily: 'Georgia, serif' }}>{t.title}</p>
        {(t.ai_summary || t.note) && (
          <p className="text-[11px] leading-relaxed overflow-hidden" style={{ color: '#8A7420', maxHeight: '3em', WebkitMaskImage: 'linear-gradient(to bottom, black 70%, transparent 100%)', maskImage: 'linear-gradient(to bottom, black 70%, transparent 100%)' }}>
            {t.ai_summary || t.note}
          </p>
        )}
        {due && (
          <span className="self-start text-[10px] font-medium" style={{ color: diff !== null && diff < 0 ? '#B91C1C' : '#8A7420' }}>
            {new Date(t.due_date + 'T12:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })}{dueLabel}
          </span>
        )}
      </div>
    )
  }

  return (
    <div onClick={onClick} draggable={draggable} onDragStart={onDragStart}
      className="group bg-[var(--color-bg-card)] border border-[var(--color-border)] rounded-xl overflow-hidden flex flex-col shadow-card hover:shadow-pop hover:border-[var(--color-border-hover)] hover:-translate-y-0.5 cursor-pointer"
      style={{
        transform: leaving ? 'scale(0.92)' : undefined,
        opacity: leaving ? 0 : 1,
        transition: transitionCss,
      }}>
      {previewUrl && (
        <div className="relative w-full bg-[var(--color-bg-subtle)]" style={{ paddingTop: '56%' }}>
          <img src={previewUrl} alt="" className="absolute inset-0 w-full h-full object-cover"
            onError={e => { const el = e.currentTarget.parentElement; if (el) el.style.display = 'none' }} />
        </div>
      )}
      <div className="p-3 flex flex-col gap-2">
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
              <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${TYPE_COLOR[t.type] || 'bg-[var(--color-bg-subtle)] text-[var(--color-text-secondary)]'}`}>
                {TYPE_EMOJI[t.type]} {TYPE_LABEL[t.type] || t.type}
              </span>
              {t.priority === 'high' && (
                <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full" style={{ color: PRIORITY_COLOR.high, background: PRIORITY_COLOR.high + '18' }}>
                  {PRIORITY_LABEL.high}
                </span>
              )}
              {client && (
                <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full text-white" style={{ background: client.color_hex }}>{client.name}</span>
              )}
            </div>
            {labels.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {labels.map((l, i) => (
                  <span key={i} className="text-[9px] font-semibold px-1.5 py-0.5 rounded-full text-white" style={{ background: l.color }}>{l.text}</span>
                ))}
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
