'use client'

// Campo de texto clique-para-editar no padrão do cronograma (PostCard):
// label caps + dica, visual com markdown leve e hover, edição com toolbar
// negrito/itálico/lista, salva ao sair (blur), Esc descarta.

import { useRef, useState } from 'react'
import { Bold, Italic, List } from 'lucide-react'
import { autoGrow } from '@/lib/autoGrow'

// Endereços que viram link. Só http(s) e www — nunca um esquema qualquer:
// o resultado vai pra dentro de dangerouslySetInnerHTML, e aceitar "javascript:"
// aqui seria abrir a porta pra execução de script vindo de um campo de texto.
// Para no primeiro espaço e antes de "<" pra não engolir as tags que o negrito
// e o itálico já colocaram.
const LINK_RE = /\b(https?:\/\/|www\.)[^\s<]+/gi

/** Transforma endereço em link clicável. Roda DEPOIS do escape de HTML — o que
 *  chega aqui já tem "&" virado "&amp;", e é assim mesmo que ele deve entrar no
 *  href (o navegador desfaz na hora de navegar), então query string com & sai
 *  inteira. */
function linkify(s: string) {
  return s.replace(LINK_RE, raw => {
    // Ponto final e parêntese de fechamento quase nunca são do endereço — são
    // da frase em volta ("veja em https://x.com/menu."). Devolve pro texto.
    const m = raw.match(/[.,;:!?)\]]+$/)
    const url = m ? raw.slice(0, -m[0].length) : raw
    const tail = m ? m[0] : ''
    const href = url.toLowerCase().startsWith('www.') ? `https://${url}` : url
    return `<a href="${href}" target="_blank" rel="noopener noreferrer">${url}</a>${tail}`
  })
}

// markdown leve: **negrito**, *itálico*, "- " bullets e link (escapa HTML antes)
export function renderMd(text: string) {
  const esc = text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  const inline = (s: string) => linkify(
    s.replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>').replace(/\*([^*\n]+)\*/g, '<em>$1</em>')
  )
  const blocks: string[] = []
  let buf: string[] = [], items: string[] = []
  const flush = () => { if (buf.length) { blocks.push('<div>' + buf.join('<br/>') + '</div>'); buf = [] } }
  const flushList = () => { if (items.length) { blocks.push('<ul>' + items.join('') + '</ul>'); items = [] } }
  for (const line of esc.split('\n')) {
    const m = line.match(/^\s*[-•]\s+(.*)$/)
    if (m) { flush(); items.push('<li>' + inline(m[1]) + '</li>') }
    else { flushList(); buf.push(inline(line)) }
  }
  flush(); flushList()
  return blocks.join('')
}

type Props = {
  label: string
  hint?: string
  placeholder: string
  value: string
  onCommit: (value: string) => void
  minH?: number
  labelExtra?: React.ReactNode
}

export default function EditableField({ label, hint, placeholder, value, onCommit, minH = 60, labelExtra }: Props) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')
  const discardRef = useRef(false)
  const taRef = useRef<HTMLTextAreaElement>(null)

  function startEdit() { setDraft(value); discardRef.current = false; setEditing(true) }
  // Não entra em modo de edição se o clique foi pra soltar uma seleção de texto
  // (copiar) nem se foi num link — clicar num link é abrir o link. Sem isso o
  // campo virava textarea por baixo da aba que acabou de abrir.
  function handleDisplayClick(e: React.MouseEvent<HTMLElement>) {
    if ((e.target as HTMLElement).closest('a')) return
    const sel = window.getSelection()
    if (sel && sel.toString().length > 0) return
    startEdit()
  }
  function commit() {
    if (discardRef.current) { discardRef.current = false; setEditing(false); return }
    setEditing(false)
    if (draft !== value) onCommit(draft)
  }
  function discard() { discardRef.current = true; setEditing(false) }

  // envolve a seleção com um marcador (** ou *)
  function wrapSelection(marker: string) {
    const ta = taRef.current; if (!ta) return
    const { selectionStart: s, selectionEnd: e } = ta
    const next = draft.slice(0, s) + marker + draft.slice(s, e) + marker + draft.slice(e)
    setDraft(next)
    requestAnimationFrame(() => { ta.focus(); ta.setSelectionRange(s + marker.length, e + marker.length) })
  }
  function toggleBullet() {
    const ta = taRef.current; if (!ta) return
    const pos = ta.selectionStart
    const lineStart = draft.lastIndexOf('\n', pos - 1) + 1
    const line = draft.slice(lineStart).split('\n')[0]
    const has = /^\s*[-•]\s/.test(line)
    const nextLine = has ? line.replace(/^\s*[-•]\s/, '') : `- ${line}`
    const next = draft.slice(0, lineStart) + nextLine + draft.slice(lineStart + line.length)
    setDraft(next)
    requestAnimationFrame(() => ta.focus())
  }

  return (
    <div>
      <div className="flex items-baseline gap-2 mb-1.5">
        <span className="text-xs font-bold text-[var(--color-text-secondary)] uppercase tracking-wider">{label}</span>
        {hint && <span className="text-[10px] text-[var(--color-text-faint)]">{hint}</span>}
        {labelExtra}
      </div>
      {editing ? (
        <div>
          <div className="flex items-center gap-1 mb-1.5">
            <button onMouseDown={e => { e.preventDefault(); wrapSelection('**') }} title="Negrito"
              className="w-6 h-6 rounded-md flex items-center justify-center text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-subtle)] transition-colors"><Bold size={13} /></button>
            <button onMouseDown={e => { e.preventDefault(); wrapSelection('*') }} title="Itálico"
              className="w-6 h-6 rounded-md flex items-center justify-center text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-subtle)] transition-colors"><Italic size={13} /></button>
            <button onMouseDown={e => { e.preventDefault(); toggleBullet() }} title="Lista (bullet)"
              className="w-6 h-6 rounded-md flex items-center justify-center text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-subtle)] transition-colors"><List size={14} /></button>
            <span className="text-[10px] text-[var(--color-text-faint)] ml-1">**negrito** · *itálico* · - lista</span>
          </div>
          <textarea ref={el => { taRef.current = el; if (el) autoGrow(el, 9999) }} autoFocus value={draft}
            onChange={e => { setDraft(e.target.value); autoGrow(e.currentTarget, 9999) }}
            onBlur={commit} onKeyDown={e => { if (e.key === 'Escape') { e.preventDefault(); discard() } }}
            placeholder={placeholder}
            className="w-full bg-[var(--color-bg-card)] border border-[var(--color-accent)] rounded-lg px-3 py-2 text-sm text-[var(--color-text-primary)] outline-none resize-none leading-relaxed"
            style={{ minHeight: minH }} />
          <div className="flex items-center gap-2 mt-1.5">
            <button onMouseDown={e => { e.preventDefault(); commit() }}
              className="text-xs font-semibold px-3 py-1 rounded-lg text-white" style={{ background: 'var(--color-accent)' }}>Salvar</button>
            <button onMouseDown={e => { e.preventDefault(); discard() }}
              className="text-xs px-3 py-1 rounded-lg text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-subtle)] transition-colors">Descartar</button>
            <span className="text-[10px] text-[var(--color-text-faint)]">salva ao sair · Esc descarta</span>
          </div>
        </div>
      ) : (
        <div onClick={handleDisplayClick}
          className="cursor-text text-sm text-[var(--color-text-primary)] leading-relaxed rounded-lg hover:bg-[var(--color-bg-subtle)] -mx-2 px-2 py-1.5 transition-colors md-content"
          style={{ minHeight: minH }}>
          {value
            ? <div dangerouslySetInnerHTML={{ __html: renderMd(value) }} />
            : <span className="text-[var(--color-text-faint)]">{placeholder}</span>}
        </div>
      )}
    </div>
  )
}
