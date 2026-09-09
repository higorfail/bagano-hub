'use client'

import { useRef, useState } from 'react'
import { autoGrow } from '@/lib/autoGrow'

// Célula de texto editável da tabela do cronograma.
//
// Segue o mesmo contrato do EditableField que os cards usam — clique entra em
// edição, sair salva, Esc descarta, e clicar pra soltar uma seleção de texto
// NÃO entra em edição (senão copiar um trecho abriria o editor). O que muda é
// o peso: o EditableField traz rótulo, barra de formatação e botões, que numa
// célula de tabela ocupariam mais espaço que o próprio texto.
//
// `stopPropagation` no clique é o que impede a linha de abrir o card por cima
// da edição — a linha tem três gestos (abrir pelo título, arrastar pela alça,
// editar pela célula) e eles não podem se atropelar.
type Props = {
  value: string
  placeholder?: string
  onCommit: (value: string) => void
  /** Falso no celular: lá o toque abre o card, editar em célula estreita é pior. */
  editable?: boolean
  /**
   * 0 = sem corte, e é o padrão da tabela do cronograma.
   *
   * Cortava em 5 linhas com reticências. Só que quem monta pauta lê a descrição
   * inteira pra decidir — e ter que abrir o card pra ver o fim do próprio texto
   * que acabou de escrever é o oposto do que uma planilha faz. Linha alta é o
   * preço, e é mais barato que texto escondido.
   */
  clampLines?: number
}

// Marca as células navegáveis por Tab. Ficam no DOM em vez de num contexto de
// React porque a ordem que interessa é a ORDEM DA TELA — esquerda pra direita,
// linha por linha — e é exatamente essa que `querySelectorAll` devolve. Um
// registro central teria que reproduzi-la à mão e sair de sincronia na primeira
// coluna que alguém escondesse (a Legenda já liga e desliga).
const MARCA_CELULA = 'data-celula-lista'

export default function ListCell({ value, placeholder = '—', onCommit, editable = true, clampLines = 5 }: Props) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')
  const discardRef = useRef(false)
  const caixaRef = useRef<HTMLDivElement>(null)

  /**
   * Tab vai pra próxima célula e JÁ ABRE pra escrever.
   *
   * É o gesto que fazia a planilha ser planilha: montar uma pauta é preencher
   * campo após campo, e ter que mirar o mouse em cada célula é o que torna a
   * tabela do hub mais lenta que o Google Sheets — mesmo tendo as mesmas
   * colunas.
   *
   * O clique é disparado no quadro seguinte: salvar aqui provoca re-render, e
   * clicar antes dele acertaria um elemento que vai deixar de existir.
   */
  function irPara(direcao: 1 | -1) {
    const todas = Array.from(document.querySelectorAll<HTMLElement>(`[${MARCA_CELULA}]`))
    const eu = caixaRef.current
    const i = eu ? todas.indexOf(eu) : -1
    const alvo = todas[i + direcao]
    if (!alvo) return
    requestAnimationFrame(() => alvo.click())
  }

  function start(e: React.MouseEvent) {
    e.stopPropagation()
    if (!editable) return
    const sel = window.getSelection()
    if (sel && sel.toString().length > 0) return
    setDraft(value)
    discardRef.current = false
    setEditing(true)
  }

  function commit() {
    if (discardRef.current) { discardRef.current = false; setEditing(false); return }
    setEditing(false)
    if (draft !== value) onCommit(draft)
  }

  if (editing) {
    return (
      <textarea
        autoFocus
        value={draft}
        onClick={e => e.stopPropagation()}
        onChange={e => { setDraft(e.target.value); autoGrow(e.currentTarget, 9999) }}
        onBlur={commit}
        // Enter continua quebrando linha (briefing é texto corrido). Quem quer
        // fechar sem tirar a mão do teclado usa Cmd/Ctrl+Enter.
        onKeyDown={e => {
          if (e.key === 'Escape') { e.preventDefault(); discardRef.current = true; setEditing(false) }
          if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); e.currentTarget.blur() }
          // Tab salva e abre a próxima; Shift+Tab volta. O navegador moveria o
          // foco pro próximo elemento focável, que numa linha de tabela é um
          // botão qualquer — e a edição morreria no meio.
          if (e.key === 'Tab') {
            e.preventDefault()
            const dir = e.shiftKey ? -1 : 1
            commit()
            irPara(dir)
          }
        }}
        ref={el => { if (el) autoGrow(el, 9999) }}
        className="w-full bg-[var(--color-bg-card)] border border-[var(--color-accent)] rounded-md px-1.5 py-1 text-[12px] leading-snug text-[var(--color-text-primary)] outline-none resize-none"
        style={{ minHeight: 40 }}
      />
    )
  }

  return (
    <div
      ref={caixaRef}
      // A marca fica na célula em REPOUSO, não na que está aberta: quando o Tab
      // procura a próxima, a atual acabou de virar textarea e sairia da lista.
      {...{ [MARCA_CELULA]: editable ? '' : undefined }}
      onClick={start}
      className={`text-[12px] leading-snug rounded-md -mx-1 px-1 py-0.5 transition-colors whitespace-pre-wrap break-words
        ${editable ? 'cursor-text hover:bg-[var(--color-bg-subtle)]' : ''}
        ${value ? 'text-[var(--color-text-secondary)]' : 'text-[var(--color-text-faint)]'}`}
      style={value && clampLines > 0
        ? { display: '-webkit-box', WebkitLineClamp: clampLines, WebkitBoxOrient: 'vertical', overflow: 'hidden' }
        : undefined}
    >
      {value || placeholder}
    </div>
  )
}
