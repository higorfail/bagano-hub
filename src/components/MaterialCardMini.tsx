'use client'

// Componente de card minimizado de material — usado em TODOS os lugares do sistema
// Qualquer melhoria aqui aparece automaticamente na aba global E na aba do cliente

interface Member {
  id: string
  name: string
  role?: string
}

interface MaterialCardMiniProps {
  material: any
  members: Member[]
  onClick: () => void
}

const MAT_TYPE_LABEL: Record<string, string> = {
  menu: 'Menu', cardapio: 'Cardápio', arte_avulsa: 'Arte avulsa',
  logo: 'Logo', manual: 'Manual', placa: 'Placa', cartao: 'Cartão',
  sacola: 'Sacola', sousplat: 'Sousplat', story: 'Story',
  capas_destaque: 'Capas destaque', fundos: 'Fundos', outro: 'Outro'
}

const MAT_TYPE_COLOR: Record<string, string> = {
  menu: 'bg-orange-100 text-orange-700',
  cardapio: 'bg-amber-100 text-amber-700',
  arte_avulsa: 'bg-purple-100 text-purple-700',
  logo: 'bg-blue-100 text-blue-700',
  manual: 'bg-green-100 text-green-700',
  outro: 'bg-[var(--color-bg-subtle)] text-[var(--color-text-secondary)]',
}

const STATUS_COLOR: Record<string, string> = {
  producao: 'bg-amber-50 text-amber-700',
  aguardando_aprovacao: 'bg-pink-50 text-pink-700',
  finalizado: 'bg-green-50 text-green-700',
}

const STATUS_LABEL: Record<string, string> = {
  producao: 'A fazer',
  aguardando_aprovacao: 'Em aprovação',
  finalizado: 'Finalizado',
}

function initials(name: string) {
  return (name || '?').split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()
}

export default function MaterialCardMini({ material: m, members, onClick }: MaterialCardMiniProps) {
  const due = m.due_date ? new Date(m.due_date + 'T23:59:59') : null
  const now = new Date()
  const diff = due ? Math.ceil((due.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)) : null
  const dueColor = diff === null ? '' : diff < 0 ? 'text-red-600 bg-red-50' : diff <= 2 ? 'text-amber-700 bg-amber-50' : 'text-[var(--color-text-secondary)] bg-[var(--color-bg-subtle)]'
  const dueLabel = diff === null ? '' : diff < 0 ? ' · atrasado' : diff === 0 ? ' · hoje' : diff === 1 ? ' · amanhã' : ''

  const assignedArr: string[] = Array.isArray(m.assigned_members) && m.assigned_members.length > 0
    ? m.assigned_members
    : m.assigned_to ? [m.assigned_to] : []

  const assignedData = assignedArr
    .map(id => members.find(x => x.id === id))
    .filter(Boolean) as Member[]

  const labels: { text: string; color: string }[] = Array.isArray(m.labels) ? m.labels : []
  const checkTotal = m._checkTotal ?? 0
  const checkDone = m._checkDone ?? 0
  const commentCount = m._comments ?? 0
  const attachCount = m._attachments ?? 0

  return (
    <div
      onClick={onClick}
      className="group bg-[var(--color-bg-card)] border border-[var(--color-border)] rounded-xl p-3 flex flex-col gap-2 hover:shadow-md hover:border-[var(--color-border-hover)] transition-all cursor-pointer"
    >
      {/* Etiquetas coloridas */}
      {labels.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {labels.map((l, i) => (
            <span key={i} className="h-2 w-9 rounded-full flex-shrink-0" style={{ background: l.color }} title={l.text} />
          ))}
        </div>
      )}

      {/* Título */}
      <p className="text-sm font-medium text-[var(--color-text-primary)] leading-snug">{m.title}</p>

      {/* Badges: tipo + status */}
      <div className="flex items-center gap-1.5 flex-wrap">
        <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${MAT_TYPE_COLOR[m.type] || 'bg-[var(--color-bg-subtle)] text-[var(--color-text-secondary)]'}`}>
          {MAT_TYPE_LABEL[m.type] || m.type}
        </span>
        {m.status && (
          <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${STATUS_COLOR[m.status] || 'bg-[var(--color-bg-subtle)] text-[var(--color-text-secondary)]'}`}>
            {STATUS_LABEL[m.status] || m.status}
          </span>
        )}
      </div>

      {/* Rodapé: data + badges + avatares */}
      <div className="flex items-center justify-between mt-0.5">
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
            <span className={`flex items-center gap-1 ${checkDone === checkTotal ? 'text-green-600' : ''}`}>
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
                className="w-6 h-6 rounded-full bg-[var(--color-brand)] border-2 border-white flex items-center justify-center text-[var(--color-brand-fg)] text-[8px] font-bold"
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
  )
}
