'use client'

import { ExternalLink } from 'lucide-react'

// Os links das referências, curtos e clicáveis.
//
// `reference_notes` é texto livre onde a equipe cola endereço do Drive, do
// Instagram, do Pinterest. Na célula isso saía cru: uma URL de 180 caracteres
// esticava a coluna e não dava pra clicar — pra abrir a referência era preciso
// entrar no card, que é justamente o que a lista deveria evitar.
//
// Aqui cada endereço vira uma pastilha com o DOMÍNIO e um pedaço do caminho,
// suficiente pra reconhecer ("drive.google.com/…", "instagram.com/…") sem
// ocupar a linha inteira. O que não é link continua texto.

/** Quebra o texto em pedaços: o que é endereço e o que não é. */
function pedacos(texto: string): { tipo: 'link' | 'texto'; valor: string }[] {
  const partes: { tipo: 'link' | 'texto'; valor: string }[] = []
  const re = /https?:\/\/[^\s<>"')]+/g
  let ultimo = 0
  for (const m of texto.matchAll(re)) {
    const i = m.index ?? 0
    if (i > ultimo) partes.push({ tipo: 'texto', valor: texto.slice(ultimo, i) })
    partes.push({ tipo: 'link', valor: m[0] })
    ultimo = i + m[0].length
  }
  if (ultimo < texto.length) partes.push({ tipo: 'texto', valor: texto.slice(ultimo) })
  return partes
}

/** "https://drive.google.com/drive/folders/1aB2c…" → "drive.google.com/1aB2c…" */
function apelido(url: string): string {
  try {
    const u = new URL(url)
    const dominio = u.hostname.replace(/^www\./, '')
    // Um pedaço do caminho distingue dois links do mesmo site — duas pastas do
    // Drive, dois posts do Instagram. Mais que isso volta a esticar a coluna.
    const trecho = u.pathname.split('/').filter(Boolean).slice(-1)[0] || ''
    if (!trecho) return dominio
    return `${dominio}/${trecho.length > 12 ? trecho.slice(0, 12) + '…' : trecho}`
  } catch {
    return url.length > 28 ? url.slice(0, 28) + '…' : url
  }
}

export default function LinksCurtos({ texto }: { texto: string }) {
  const partes = pedacos(texto)
  if (!partes.length) return null
  return (
    <span className="inline-flex flex-wrap items-center gap-1">
      {partes.map((p, i) =>
        p.tipo === 'link' ? (
          <a
            key={i}
            href={p.valor}
            target="_blank"
            rel="noopener noreferrer"
            // Para de propagar: a célula em volta entra em edição no clique, e
            // abrir o link não pode abrir o editor junto.
            onClick={e => e.stopPropagation()}
            title={p.valor}
            className="inline-flex items-center gap-1 max-w-full text-[11px] font-medium px-1.5 py-0.5 rounded border transition-colors
              text-[var(--ds-info-text)] bg-[var(--ds-info-bg)] border-[var(--ds-info-border)] hover:opacity-80"
          >
            <ExternalLink size={9} className="flex-shrink-0" />
            <span className="truncate">{apelido(p.valor)}</span>
          </a>
        ) : (
          p.valor.trim() ? <span key={i} className="text-[11px] text-[var(--color-text-muted)]">{p.valor.trim()}</span> : null
        ),
      )}
    </span>
  )
}
