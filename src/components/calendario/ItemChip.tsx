'use client'

import { Camera, PenLine, CalendarDays, FileText, Ban } from 'lucide-react'
import type { CalItem } from '@/lib/calendarItems'

// A tarja de um item, igual em todas as visões.
//
// Antes cada trecho da tela desenhava a sua — foi assim que a mesma captação
// aparecia roxa preenchida no mês e de outro jeito em qualquer outro lugar. Com
// quatro visões isso seria quatro vezes o mesmo desenho, discordando entre si.

const ICONE: Record<string, any> = {
  captacao: Camera, criacao: PenLine, evento: CalendarDays,
  google: CalendarDays, post: FileText, bloqueio: Ban,
}

export default function ItemChip({ item, compacto, onClick, style, className = '' }: {
  item: CalItem
  /** No celular a célula tem ~50px: em vez do título, as iniciais. */
  compacto?: boolean
  onClick?: () => void
  style?: React.CSSProperties
  className?: string
}) {
  // Quem está no evento cabe no passar-o-mouse, não no chip: o chip tem uma
  // linha e o nome do compromisso já a ocupa. Mas saber que a Gee aceitou e a
  // Yasmim recusou é o que evita a pergunta "quem vai nessa?".
  const descricao = (i: typeof item) => [
    `${rotulo(i.kind)}: ${i.title}`,
    i.pessoas?.length ? `Com: ${i.pessoas.join(', ')}` : null,
  ].filter(Boolean).join('\n')

  const Icon = ICONE[item.kind] || CalendarDays
  // O que veio do Google não é do hub: fica tracejado e sem preenchimento, e
  // abre lá em vez de fingir que edita aqui.
  // "De fora" é sobre QUEM MANDA no evento, não sobre o tipo: o que tem `href`
  // vive no Google e é lá que se edita. Criação nascida no hub não tem href e
  // continua sólida; a que veio do Google entra tracejada, como as outras.
  const deFora = !!item.href || item.kind === 'bloqueio'
  const cor = item.color

  const conteudo = (
    <>
      <Icon size={9} className="flex-shrink-0" />
      {/* A etiqueta lida do título ("Confra", "Coworking") vem ANTES do texto:
          o título do Google costuma ser longo e cortar no truncate, e o tipo é
          justamente o que se quer saber de relance. No compacto some — ali só
          cabe a inicial. */}
      {!compacto && item.etiqueta && (
        <span className="flex-shrink-0 text-[8px] font-bold uppercase tracking-wide px-1 py-px rounded"
          style={{ background: cor + '33' }}>{item.etiqueta}</span>
      )}
      <span className="truncate">
        {item.startTime ? item.startTime + ' ' : ''}
        {compacto ? iniciais(item.clientName || item.title) : item.title}
      </span>
    </>
  )

  const estilo: React.CSSProperties = deFora
    ? { background: 'transparent', color: 'var(--color-text-muted)', borderColor: 'var(--color-border)', ...style }
    : { background: cor + '22', color: cor, borderColor: cor + '44', ...style }

  const base = `rounded-md px-1.5 py-0.5 text-[10px] font-medium truncate border flex items-center gap-1 w-full text-left ${deFora ? 'border-dashed' : ''} ${className}`

  if (item.href) {
    return (
      <a href={item.href} target="_blank" rel="noopener noreferrer"
        className={base} style={estilo} title={descricao(item)}>
        {conteudo}
      </a>
    )
  }
  return (
    <button onClick={onClick} className={base} style={estilo}
      title={descricao(item)}>
      {conteudo}
    </button>
  )
}

function iniciais(n: string) {
  return (n || '?').split(' ').filter(Boolean).map(w => w[0]).join('').slice(0, 2).toUpperCase()
}

export function rotulo(k: CalItem['kind']) {
  return { post: 'Post', captacao: 'Captação', criacao: 'Criação',
           evento: 'Evento', google: 'Google Agenda', bloqueio: 'Fora' }[k] || ''
}
