'use client'

// Pill de propriedade — padrão do design system (tendência Linear/Notion):
// label embutido à esquerda + valor à direita, dentro de um grid de colunas
// fixas para o encaixe ser sempre deterministico (nunca sobra item órfão).

export default function PropertyPill({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div title={label}
      className="flex items-center justify-between gap-2 rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-card)] pl-2.5 pr-1 h-8 min-w-0">
      <span className="text-[10px] font-semibold uppercase tracking-wide text-[var(--color-text-faint)] flex-shrink-0">{label}</span>
      <div className="min-w-0 flex items-center justify-end flex-1">{children}</div>
    </div>
  )
}

// Select transparente para usar dentro do PropertyPill
export const pillSelectCls = 'appearance-none bg-transparent pr-5 pl-1 py-0.5 text-xs font-semibold outline-none cursor-pointer text-right max-w-full truncate'
