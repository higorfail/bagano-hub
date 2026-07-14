'use client'

// Componente de card minimizado de material — usado em TODOS os lugares do sistema
// Qualquer melhoria aqui aparece automaticamente na aba global E na aba do cliente

interface Member {
  id: string
  name: string
  role?: string
  color?: string
}

interface MaterialCardMiniProps {
  material: any
  members: Member[]
  onClick: () => void
  onMovePrev?: () => void
  onMoveNext?: () => void
  draggable?: boolean
  onDragStart?: (e: React.DragEvent) => void
}

const MAT_TYPE_LABEL: Record<string, string> = {
  menu: 'Menu', cardapio: 'Cardápio', arte_avulsa: 'Arte avulsa',
  logo: 'Logo', manual: 'Manual', placa: 'Placa', cartao: 'Cartão',
  sacola: 'Sacola', sousplat: 'Sousplat', story: 'Story',
  capas_destaque: 'Capas destaque', fundos: 'Fundos', outro: 'Outro'
}

const MAT_TYPE_COLOR: Record<string, string> = {
  menu: 'bg-[var(--ds-warn-bg)] text-[var(--ds-warn-text)]',
  cardapio: 'bg-[var(--ds-caution-bg)] text-[var(--ds-caution-text)]',
  arte_avulsa: 'bg-[var(--ds-purple-bg)] text-[var(--ds-purple-text)]',
  logo: 'bg-[var(--ds-info-bg)] text-[var(--ds-info-text)]',
  manual: 'bg-[var(--ds-success-bg)] text-[var(--ds-success-text)]',
  outro: 'bg-[var(--color-bg-subtle)] text-[var(--color-text-secondary)]',
}

const STATUS_COLOR: Record<string, string> = {
  producao: 'bg-[var(--ds-caution-bg)] text-[var(--ds-caution-text)]',
  aguardando_aprovacao: 'bg-[var(--ds-warn-bg)] text-[var(--ds-warn-text)]',
  finalizado: 'bg-[var(--ds-success-bg)] text-[var(--ds-success-text)]',
}

const STATUS_LABEL: Record<string, string> = {
  producao: 'A fazer',
  aguardando_aprovacao: 'Em aprovação',
  finalizado: 'Finalizado',
}

function initials(name: string) {
  return (name || '?').split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()
}

export default function MaterialCardMini({ material: m, members, onClick, onMovePrev, onMoveNext, draggable, onDragStart }: MaterialCardMiniProps) {
  const due = m.due_date ? new Date(m.due_date + 'T23:59:59') : null
  const now = new Date()
  const diff = due ? Math.ceil((due.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)) : null
  const dueColor = diff === null ? '' : diff < 0 ? 'text-[var(--ds-error-text)] bg-[var(--ds-error-bg)]' : diff <= 2 ? 'text-[var(--ds-caution-text)] bg-[var(--ds-caution-bg)]' : 'text-[var(--color-text-secondary)] bg-[var(--color-bg-subtle)]'
  const dueLabel = diff === null ? '' : diff < 0 ? ' · atrasado' : diff === 0 ? ' · hoje' : diff === 1 ? ' · amanhã' : ''

  const assignedArr: string[] = Array.isArray(m.assigned_members) && m.assigned_members.length > 0
    ? m.assigned_members
    : m.assigned_to ? [m.assigned_to] : []

  const assignedData = assignedArr
    .map(id => members.find(x => x.id === id))
    .filter(Boolean) as Member[]

  const driveId = typeof m.drive_url === 'string' ? m.drive_url.match(/[-\w]{25,}/)?.[0] : null
  const previewUrl: string | null = m._preview || (driveId ? `https://drive.google.com/thumbnail?id=${driveId}&sz=w480` : null)
  const delivered = !!m.drive_url

  const labels: { text: string; color: string }[] = Array.isArray(m.labels) ? m.labels : []
  const checkTotal = m._checkTotal ?? 0
  const checkDone = m._checkDone ?? 0
  const commentCount = m._comments ?? 0
  const attachCount = m._attachments ?? 0

  return (
    <div
      onClick={onClick}
      draggable={draggable}
      onDragStart={onDragStart}
      className="group relative bg-[var(--color-bg-card)] border border-[var(--color-border)] rounded-xl flex overflow-hidden shadow-card hover:shadow-pop hover:border-[var(--color-border-hover)] hover:-translate-y-0.5 transition-all duration-150 cursor-pointer"
      style={previewUrl ? { height: 140 } : undefined}
    >
      {/* Move arrows — aparecem no hover */}
      {(onMovePrev || onMoveNext) && (
        <div className="absolute top-2 right-2 hidden group-hover:flex items-center gap-1 z-10"
          onClick={e => e.stopPropagation()}>
          {onMovePrev && (
            <button onClick={onMovePrev}
              className="w-5 h-5 rounded bg-[var(--color-bg-subtle)] hover:bg-[var(--color-border)] flex items-center justify-center text-[var(--color-text-muted)] text-[10px] transition-colors">←</button>
          )}
          {onMoveNext && (
            <button onClick={onMoveNext}
              className="w-5 h-5 rounded bg-[var(--color-bg-subtle)] hover:bg-[var(--color-border)] flex items-center justify-center text-[var(--color-text-muted)] text-[10px] transition-colors">→</button>
          )}
        </div>
      )}
      {/* Preview do arquivo/entrega — vertical na lateral esquerda (evita cortar conteúdo 4:5/9:16).
          Imagem 4:5 como piso (min-height no card), não teto — cresce junto com o texto se precisar. */}
      {previewUrl && (
        <div className="relative w-28 self-stretch flex-shrink-0 overflow-hidden bg-[var(--color-bg-subtle)]">
          <img src={previewUrl} alt={m.title}
            className="w-full h-full object-cover" style={{ height: '100%' }}
            onError={e => { const el = e.currentTarget.parentElement; if (el) el.style.display = 'none' }} />
        </div>
      )}

      <div className="flex-1 min-w-0 p-3 flex flex-col gap-2">
      {/* Etiquetas coloridas */}
      {labels.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {labels.map((l, i) => (
            <span key={i}
              className="text-[10px] font-semibold px-2 py-0.5 rounded-full flex-shrink-0 max-w-[120px] truncate"
              style={{ background: l.color + '28', color: l.color, border: `1px solid ${l.color}55` }}>
              {l.text}
            </span>
          ))}
        </div>
      )}

      {/* Título */}
      <p className="text-sm font-medium text-[var(--color-text-primary)] leading-snug flex-shrink-0">{m.title}</p>

      {/* Briefing snippet — preenche o espaço que sobrar (a imagem cresce junto se precisar) */}
      {(m.ai_summary || m.description) && (
        <p className="text-[11px] text-[var(--color-text-muted)] leading-relaxed flex-1 min-h-0 overflow-hidden"
          style={{ maxHeight: '6.5em', WebkitMaskImage: 'linear-gradient(to bottom, black 75%, transparent 100%)', maskImage: 'linear-gradient(to bottom, black 75%, transparent 100%)' }}>
          {m.ai_summary || m.description}
        </p>
      )}

      {/* Badges: tipo + status */}
      <div className="flex items-center gap-1.5 flex-wrap flex-shrink-0">
        <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${MAT_TYPE_COLOR[m.type] || 'bg-[var(--color-bg-subtle)] text-[var(--color-text-secondary)]'}`}>
          {MAT_TYPE_LABEL[m.type] || m.type}
        </span>
        {m.status && (
          <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${STATUS_COLOR[m.status] || 'bg-[var(--color-bg-subtle)] text-[var(--color-text-secondary)]'}`}>
            {STATUS_LABEL[m.status] || m.status}
          </span>
        )}
        {delivered && (
          <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-[var(--ds-success-bg)] text-[var(--ds-success-text)]">✓ Entregue</span>
        )}
      </div>

      {/* Rodapé: data + badges + avatares — fica colado no fim do card */}
      <div className="flex items-center justify-between mt-auto pt-0.5">
        <div className="flex items-center gap-2 text-[11px] text-[var(--color-text-muted)] flex-wrap">
          {/* Data com cor de alerta */}
          {due && (
            <span className={`flex items-center gap-1 px-1.5 py-0.5 rounded font-medium ${dueColor}`}>
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="3" y="4" width="18" height="18" rx="2"/>
                <line x1="16" y1="2" x2="16" y2="6"/>
                <line x1="8" y1="2" x2="8" y2="6"/>
                <line x1="3" y1="10" x2="21" y2="10"/>
              </svg>
              {new Date(m.due_date + 'T12:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })}
              {dueLabel}
            </span>
          )}

          {/* Checklist */}
          {checkTotal > 0 && (
            <span className={`flex items-center gap-1`} style={checkDone === checkTotal ? { color: 'var(--ds-success-text)' } : {}}>
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polyline points="9 11 12 14 22 4"/>
                <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/>
              </svg>
              {checkDone}/{checkTotal}
            </span>
          )}

          {/* Comentários */}
          {commentCount > 0 && (
            <span className="flex items-center gap-1">
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
              </svg>
              {commentCount}
            </span>
          )}

          {/* Anexos */}
          {attachCount > 0 && (
            <span className="flex items-center gap-1">
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/>
              </svg>
              {attachCount}
            </span>
          )}
        </div>

        {/* Avatares dos responsáveis */}
        {assignedData.length > 0 && (
          <div className="flex -space-x-1.5 flex-shrink-0">
            {assignedData.slice(0, 3).map(mem => (
              <div
                key={mem.id}
                className="w-6 h-6 rounded-full border-2 border-[var(--color-bg-card)] flex items-center justify-center text-white text-[8px] font-bold"
                style={{ background: mem.color || 'var(--color-brand)' }}
                title={mem.name}
              >
                {initials(mem.name)}
              </div>
            ))}
            {assignedData.length > 3 && (
              <div className="w-6 h-6 rounded-full bg-[var(--color-bg-subtle)] border-2 border-white flex items-center justify-center text-[var(--color-text-secondary)] text-[8px] font-bold">
                +{assignedData.length - 3}
              </div>
            )}
          </div>
        )}
      </div>
      </div>
    </div>
  )
}
