'use client'

interface Member { id: string; name: string; role?: string; color?: string }

interface TaskMiniCardProps {
  task: any
  clientMap: Record<string, { name: string; color_hex: string }>
  onClick: () => void
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

export default function TaskMiniCard({ task: t, clientMap, onClick, draggable, onDragStart }: TaskMiniCardProps) {
  const due = t.due_date ? new Date(t.due_date + 'T23:59:59') : null
  const diff = due ? Math.ceil((due.getTime() - Date.now()) / (1000 * 60 * 60 * 24)) : null
  const dueColor = diff === null ? '' : diff < 0 ? 'text-[var(--ds-error-text)] bg-[var(--ds-error-bg)]' : diff <= 1 ? 'text-[var(--ds-caution-text)] bg-[var(--ds-caution-bg)]' : 'text-[var(--color-text-secondary)] bg-[var(--color-bg-subtle)]'
  const dueLabel = diff === null ? '' : diff < 0 ? ' · atrasado' : diff === 0 ? ' · hoje' : diff === 1 ? ' · amanhã' : ''
  const client = t.client_id ? clientMap[t.client_id] : null

  return (
    <div onClick={onClick} draggable={draggable} onDragStart={onDragStart}
      className="group bg-[var(--color-bg-card)] border border-[var(--color-border)] rounded-xl p-3 flex flex-col gap-2 shadow-card hover:shadow-pop hover:border-[var(--color-border-hover)] hover:-translate-y-0.5 transition-all duration-150 cursor-pointer">
      <div className="flex items-center gap-1.5 flex-wrap">
        <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${TYPE_COLOR[t.type] || 'bg-[var(--color-bg-subtle)] text-[var(--color-text-secondary)]'}`}>
          {TYPE_EMOJI[t.type]} {TYPE_LABEL[t.type] || t.type}
        </span>
        {client && (
          <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full text-white" style={{ background: client.color_hex }}>{client.name}</span>
        )}
      </div>
      <p className="text-sm font-medium text-[var(--color-text-primary)] leading-snug">{t.title}</p>
      {t.note && (
        <p className="text-[11px] text-[var(--color-text-muted)] leading-relaxed overflow-hidden"
          style={{ maxHeight: '2.6em', WebkitMaskImage: 'linear-gradient(to bottom, black 70%, transparent 100%)', maskImage: 'linear-gradient(to bottom, black 70%, transparent 100%)' }}>
          {t.note}
        </p>
      )}
      {due && (
        <span className={`self-start flex items-center gap-1 px-1.5 py-0.5 rounded text-[11px] font-medium ${dueColor}`}>
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
          {new Date(t.due_date + 'T12:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })}{dueLabel}
        </span>
      )}
    </div>
  )
}
