'use client'

import { useEffect, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase'
import { renderWithMentions } from '@/lib/useMentions'
import { desdeQuando } from '@/lib/registrarAbertura'

// Os comentários do post, num balão — como o da planilha do Google.
//
// A lista já mostrava "💬 3", e o número não abria nada: pra LER os três
// comentários era preciso abrir o card. Numa tabela de montar pauta, isso é o
// contrário do que se quer — o comentário costuma ser justamente a instrução
// sobre aquela linha ("@Higor tem vários vídeos de preparo, dá pra mesclar").
//
// Carrega ao ABRIR, não junto com a lista: são 30 posts por mês e quase nenhum
// balão é aberto. A lista já paga uma consulta pra contar; buscar o texto de
// todos custaria caro por algo que quase ninguém lê.

type Comentario = { id: string; body: string; author_name: string | null; created_at: string }

export default function BalaoComentarios({ postId, quantos }: { postId: string; quantos: number }) {
  const [aberto, setAberto] = useState(false)
  const [itens, setItens] = useState<Comentario[] | null>(null)
  const caixaRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!aberto || itens) return
    createClient()
      .from('schedule_comments')
      .select('id, body, author_name, created_at')
      .eq('schedule_id', postId)
      .order('created_at', { ascending: true })
      .then(({ data }) => setItens((data || []) as Comentario[]))
  }, [aberto, itens, postId])

  // Fecha ao clicar fora. Sem isso o balão fica aberto enquanto a pessoa mexe
  // em outra linha, tapando justamente a linha de baixo.
  useEffect(() => {
    if (!aberto) return
    const fora = (e: MouseEvent) => {
      if (caixaRef.current && !caixaRef.current.contains(e.target as Node)) setAberto(false)
    }
    document.addEventListener('mousedown', fora)
    return () => document.removeEventListener('mousedown', fora)
  }, [aberto])

  return (
    <span className="relative inline-block" ref={caixaRef}>
      <button
        onClick={e => { e.stopPropagation(); setAberto(v => !v) }}
        title={`${quantos} comentário${quantos !== 1 ? 's' : ''} — clique para ler`}
        className={`text-[11px] px-1.5 py-0.5 rounded transition-colors ${
          aberto
            ? 'bg-[var(--color-accent)] text-white'
            : 'text-[var(--color-text-muted)] hover:bg-[var(--color-bg-subtle)] hover:text-[var(--color-text-primary)]'}`}>
        💬 {quantos}
      </button>

      {aberto && (
        <div
          onClick={e => e.stopPropagation()}
          className="absolute left-0 top-full mt-1 z-30 w-[320px] max-h-[300px] overflow-y-auto rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-card)] shadow-pop p-2.5 flex flex-col gap-2 text-left">
          {itens === null ? (
            <p className="text-[11px] text-[var(--color-text-muted)]">Carregando…</p>
          ) : itens.length === 0 ? (
            <p className="text-[11px] text-[var(--color-text-muted)]">Nenhum comentário.</p>
          ) : itens.map(c => (
            <div key={c.id} className="flex flex-col gap-0.5">
              <div className="flex items-baseline gap-1.5">
                <span className="text-[11px] font-bold text-[var(--color-text-primary)]">{c.author_name || 'Alguém'}</span>
                <span className="text-[10px] text-[var(--color-text-faint)]">{desdeQuando(c.created_at)}</span>
              </div>
              {/* Menção pintada, como no card: "@Higor" aqui é uma pessoa, e ler
                  isso como texto cru perde metade do sentido do recado. */}
              <p className="text-[12px] leading-snug text-[var(--color-text-secondary)] whitespace-pre-wrap break-words">
                {renderWithMentions(c.body)}
              </p>
            </div>
          ))}
        </div>
      )}
    </span>
  )
}
