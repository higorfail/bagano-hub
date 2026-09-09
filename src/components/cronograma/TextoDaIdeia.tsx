'use client'

import { ExternalLink } from 'lucide-react'

// Uma ideia guardada, lida com estrutura.
//
// O que fica GRAVADO é texto livre, e tem que continuar assim: a caixa de
// captura é um campo só, e quem cola do WhatsApp cola do jeito que veio. A
// estrutura é imposta aqui, na LEITURA, e some sozinha quando não existe.
//
// Sem isto, a ideia guardada a partir de um post virava um bloco corrido onde
// título, briefing, legenda e dois endereços de 80 caracteres tinham o mesmo
// peso — e os links, que são a metade recuperável da ideia, não davam nem pra
// clicar.

const RE_URL = /https?:\/\/[^\s<>"')]+/g

/** "instagram.com/DZXLs4cMQ4Y" — o suficiente pra reconhecer, sem esticar. */
function apelido(url: string): string {
  try {
    const u = new URL(url)
    const dominio = u.hostname.replace(/^www\./, '')
    const partes = u.pathname.split('/').filter(Boolean)
    const ultimo = partes[partes.length - 1] || ''
    if (!ultimo) return dominio
    return `${dominio}/${ultimo.length > 16 ? ultimo.slice(0, 16) + '…' : ultimo}`
  } catch {
    return url.slice(0, 30) + '…'
  }
}

/** O rótulo que a linha carrega ("Referências:", "Drive:") vira o nome do botão. */
function rotuloDaLinha(linha: string): string | null {
  const m = linha.match(/^\s*([A-Za-zÀ-ú][A-Za-zÀ-ú\s]{2,20}):\s/)
  return m ? m[1].trim() : null
}

/** Uma linha que é SÓ endereço (com ou sem rótulo na frente). */
function soUmLink(linha: string): boolean {
  const semUrl = linha.replace(RE_URL, '').replace(/^\s*[A-Za-zÀ-ú\s]{2,20}:\s*/, '').trim()
  return RE_URL.test(linha) && !semUrl
}

/** Texto com os endereços clicáveis no meio da frase. */
function comLinks(texto: string) {
  const partes: React.ReactNode[] = []
  let ultimo = 0
  for (const m of texto.matchAll(RE_URL)) {
    const i = m.index ?? 0
    if (i > ultimo) partes.push(texto.slice(ultimo, i))
    partes.push(
      <a key={i} href={m[0]} target="_blank" rel="noopener noreferrer"
        onClick={e => e.stopPropagation()} title={m[0]}
        className="font-medium underline decoration-dotted underline-offset-2"
        style={{ color: 'var(--ds-info-text)' }}>{apelido(m[0])}</a>,
    )
    ultimo = i + m[0].length
  }
  if (ultimo < texto.length) partes.push(texto.slice(ultimo))
  return partes
}

export default function TextoDaIdeia({ texto }: { texto: string }) {
  const linhas = texto.split('\n')

  // O título é a primeira linha com conteúdo QUE NÃO SEJA só um endereço.
  //
  // Ideia colada de uma vez — o caso mais comum na caixa de captura — costuma
  // ser um link solto ou uma frase com link no meio. Pegar a primeira linha
  // sem olhar isso fazia a URL virar título, e o link continuava não clicável.
  const iTitulo = linhas.findIndex(l => l.trim() && !soUmLink(l))
  const titulo = iTitulo >= 0 ? linhas[iTitulo].trim() : ''

  const corpo: string[] = []
  const links: { rotulo: string; url: string }[] = []

  linhas.forEach((linha, i) => {
    if (i === iTitulo) return
    if (!linha.trim()) { corpo.push(linha); return }
    if (soUmLink(linha)) {
      const rot = rotuloDaLinha(linha)
      for (const m of linha.matchAll(RE_URL)) links.push({ rotulo: rot || apelido(m[0]), url: m[0] })
      return
    }
    corpo.push(linha)
  })

  const textoCorpo = corpo.join('\n').replace(/\n{3,}/g, '\n\n').trim()

  return (
    <div className="flex flex-col gap-2">
      {/* O título também passa pelo tratamento de link: uma ideia de uma linha
          só, com endereço no meio, é o formato mais comum de quem cola do
          WhatsApp — e ali o link é o conteúdo. */}
      {titulo && (
        <p className="text-sm font-semibold text-[var(--color-text-primary)] leading-snug">{comLinks(titulo)}</p>
      )}

      {textoCorpo && (
        <p className="text-[13px] text-[var(--color-text-secondary)] leading-relaxed whitespace-pre-wrap">{comLinks(textoCorpo)}</p>
      )}

      {links.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          {links.map((l, i) => (
            <a key={i} href={l.url} target="_blank" rel="noopener noreferrer"
              onClick={e => e.stopPropagation()}
              title={l.url}
              className="inline-flex items-center gap-1.5 max-w-full text-[11px] font-semibold px-2 py-1 rounded-lg border transition-colors
                text-[var(--ds-info-text)] bg-[var(--ds-info-bg)] border-[var(--ds-info-border)] hover:opacity-80">
              <ExternalLink size={10} className="flex-shrink-0" />
              <span className="truncate">{l.rotulo}</span>
              {/* O rótulo diz PRA QUE serve ("Referências"); o apelido diz PRA
                  ONDE vai. Com dois links rotulados igual, só o apelido separa. */}
              {l.rotulo !== apelido(l.url) && (
                <span className="opacity-60 font-normal truncate hidden sm:inline">{apelido(l.url)}</span>
              )}
            </a>
          ))}
        </div>
      )}
    </div>
  )
}
