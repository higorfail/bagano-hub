'use client'

// Propriedade do card — label pequeno em cima (arejado, como o crono original)
// + controle em caixa uniforme embaixo. Usado dentro de um grid de 3 colunas
// fixas para o encaixe ser deterministico (nunca sobra item órfão).

export default function PropertyPill({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1 min-w-0" title={label}>
      <span className="text-[10px] font-bold text-[var(--color-text-muted)] uppercase tracking-wider">{label}</span>
      <div className="flex items-center gap-1.5 rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-card)] px-2 h-8 min-w-0">
        {children}
      </div>
    </div>
  )
}

// Select transparente para usar dentro do PropertyPill
export const pillSelectCls = 'appearance-none bg-transparent pr-5 pl-0.5 py-0.5 text-xs font-semibold outline-none cursor-pointer max-w-full truncate flex-1 text-left'
