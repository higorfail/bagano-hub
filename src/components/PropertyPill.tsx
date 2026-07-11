'use client'

// Propriedade do card — formato original: sem label visível, o próprio
// controle (select/botão) já é colorido e autoexplicativo pelo valor.
// Fica dentro de um grid de 3 colunas fixas para o encaixe ser
// deterministico (nunca sobra item órfão numa linha sozinha).

export default function PropertyPill({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0" title={label}>
      {children}
    </div>
  )
}

// Select colorido "pill" — usar com style={{ background: color+'18', color, borderColor: color+'44' }}
export const pillSelectCls = 'w-full appearance-none rounded-lg pl-2.5 pr-7 py-1.5 text-xs font-semibold outline-none cursor-pointer border truncate'
