'use client'

import { useState, useRef, useEffect } from 'react'
import { Check, X, Plus, Pencil } from 'lucide-react'

// As peças de edição do manual do cliente.
//
// Até aqui, editar o manual era editar JSON cru num textarea — literalmente:
// a tela gerava um rascunho, você corrigia as chaves e as vírgulas à mão, e um
// `JSON.parse` decidia se salvava. Quem não programa não mexia; quem programa
// mexia com medo. Por isso 19 manuais têm o texto completo e as cores vazias:
// ninguém volta num formulário que pode quebrar.
//
// Aqui cada campo tem a forma do que ele é. Texto é texto, lista de palavras é
// etiqueta com um X. Salva no borrão, sem botão de salvar global — o manual é
// consultado muito mais do que editado, e obrigar "editar → salvar → sair"
// transforma corrigir uma palavra em cerimônia.

/** Texto que vira campo ao clicar, e salva ao sair. */
export function TextoEditavel({
  valor,
  aoSalvar,
  placeholder = 'Clique para escrever…',
  linhas = 3,
}: {
  valor: string | null | undefined
  aoSalvar: (v: string) => void | Promise<void>
  placeholder?: string
  linhas?: number
}) {
  const [editando, setEditando] = useState(false)
  const [rascunho, setRascunho] = useState(valor || '')
  const ref = useRef<HTMLTextAreaElement>(null)

  useEffect(() => { if (editando) ref.current?.focus() }, [editando])
  useEffect(() => { if (!editando) setRascunho(valor || '') }, [valor, editando])

  if (!editando) {
    return (
      <button
        onClick={() => setEditando(true)}
        className="group w-full text-left rounded-lg px-3 py-2 -mx-3 hover:bg-[var(--color-bg-subtle)] transition-colors"
      >
        {valor?.trim() ? (
          <p className="text-sm text-[var(--color-text-secondary)] leading-relaxed whitespace-pre-wrap">{valor}</p>
        ) : (
          <p className="text-sm text-[var(--color-text-faint)] italic">{placeholder}</p>
        )}
        <Pencil size={11} className="inline-block ml-1.5 mb-0.5 opacity-0 group-hover:opacity-40 transition-opacity" />
      </button>
    )
  }

  const fechar = async () => {
    setEditando(false)
    if (rascunho.trim() !== (valor || '').trim()) await aoSalvar(rascunho.trim())
  }

  return (
    <textarea
      ref={ref}
      value={rascunho}
      rows={linhas}
      onChange={e => setRascunho(e.target.value)}
      onBlur={fechar}
      // Esc desfaz; Cmd/Ctrl+Enter confirma sem tirar a mão do teclado.
      onKeyDown={e => {
        if (e.key === 'Escape') { setRascunho(valor || ''); setEditando(false) }
        if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); void fechar() }
      }}
      className="w-full text-sm leading-relaxed bg-[var(--color-bg-card)] border border-[var(--color-border-strong)] rounded-lg px-3 py-2 outline-none focus:border-[var(--color-accent)] text-[var(--color-text-primary)] resize-y"
    />
  )
}

/** Lista de palavras como etiquetas: some com o X, entra pelo campo. */
export function Etiquetas({
  itens,
  aoSalvar,
  cor = 'neutra',
  placeholder = 'Adicionar…',
}: {
  itens: string[] | null | undefined
  aoSalvar: (v: string[]) => void | Promise<void>
  cor?: 'boa' | 'ruim' | 'neutra'
  placeholder?: string
}) {
  const lista = itens || []
  const [novo, setNovo] = useState('')

  const estilo = cor === 'boa'
    ? { background: 'var(--ds-success-bg)', color: 'var(--ds-success-text)' }
    : cor === 'ruim'
    ? { background: 'var(--ds-error-bg)', color: 'var(--ds-error-text)' }
    : { background: 'var(--color-bg-subtle)', color: 'var(--color-text-secondary)' }

  const adicionar = async () => {
    const v = novo.trim()
    if (!v) return
    // Repetida não entra: a lista alimenta o prompt da IA, e palavra
    // duplicada só ocupa espaço lá dentro.
    if (lista.some(x => x.toLowerCase() === v.toLowerCase())) { setNovo(''); return }
    setNovo('')
    await aoSalvar([...lista, v])
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {lista.map((w, i) => (
        <span key={`${w}-${i}`} className="group inline-flex items-center gap-1 text-xs font-medium pl-2.5 pr-1.5 py-1 rounded-full" style={estilo}>
          {w}
          <button
            onClick={() => aoSalvar(lista.filter((_, k) => k !== i))}
            aria-label={`Remover ${w}`}
            className="opacity-30 group-hover:opacity-100 transition-opacity hover:scale-110"
          >
            <X size={11} />
          </button>
        </span>
      ))}
      <span className="inline-flex items-center gap-1">
        <input
          value={novo}
          onChange={e => setNovo(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); void adicionar() } }}
          onBlur={adicionar}
          placeholder={placeholder}
          className="text-xs bg-transparent border border-dashed border-[var(--color-border)] rounded-full px-2.5 py-1 outline-none focus:border-[var(--color-accent)] text-[var(--color-text-primary)] placeholder-[var(--color-text-faint)] w-32"
        />
      </span>
    </div>
  )
}

/** Lista de cards com campos — personas, pilares, séries. */
export function CardsEditaveis<T extends Record<string, string>>({
  itens,
  campos,
  aoSalvar,
  rotuloNovo = 'Adicionar',
}: {
  itens: T[] | null | undefined
  /** Ordem e rótulo de cada campo do card. O primeiro é o título. */
  campos: { chave: keyof T & string; rotulo: string; linhas?: number }[]
  aoSalvar: (v: T[]) => void | Promise<void>
  rotuloNovo?: string
}) {
  const lista = itens || []

  const mudar = async (i: number, chave: string, valor: string) => {
    const copia = lista.map((x, k) => (k === i ? { ...x, [chave]: valor } : x))
    await aoSalvar(copia as T[])
  }

  return (
    <div className="flex flex-col gap-2.5">
      {lista.map((item, i) => (
        <div key={i} className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-card)] p-3.5 relative group">
          <button
            onClick={() => aoSalvar(lista.filter((_, k) => k !== i) as T[])}
            aria-label="Remover"
            className="absolute top-2.5 right-2.5 opacity-0 group-hover:opacity-40 hover:!opacity-100 transition-opacity"
          >
            <X size={13} className="text-[var(--color-text-muted)]" />
          </button>
          {campos.map(({ chave, rotulo, linhas }, k) => (
            <div key={chave} className={k > 0 ? 'mt-2' : ''}>
              <p className="text-[10px] font-bold uppercase tracking-wider text-[var(--color-text-faint)] mb-0.5">{rotulo}</p>
              <TextoEditavel
                valor={item[chave]}
                linhas={linhas || 2}
                placeholder={`Sem ${rotulo.toLowerCase()}`}
                aoSalvar={v => mudar(i, chave, v)}
              />
            </div>
          ))}
        </div>
      ))}
      <button
        onClick={() => aoSalvar([...lista, Object.fromEntries(campos.map(c => [c.chave, ''])) as T] as T[])}
        className="inline-flex items-center gap-1.5 self-start text-xs font-medium text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] border border-dashed border-[var(--color-border)] rounded-lg px-3 py-1.5 transition-colors"
      >
        <Plus size={12} /> {rotuloNovo}
      </button>
    </div>
  )
}

/** Aviso curto de "salvo" — o suficiente pra saber que foi. */
export function Salvo({ visivel }: { visivel: boolean }) {
  if (!visivel) return null
  return (
    <span className="inline-flex items-center gap-1 text-[11px] font-medium" style={{ color: 'var(--ds-success-text)' }}>
      <Check size={11} /> salvo
    </span>
  )
}
