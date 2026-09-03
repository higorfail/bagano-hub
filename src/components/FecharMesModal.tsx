'use client'

import { useState } from 'react'
import { X, ArrowRight, CheckCircle, Pause } from 'lucide-react'
import ModalPortal from '@/components/ModalPortal'
import { statusBadge, statusShort } from '@/lib/status'
import { aplicarFechamento, proximoMes, type PostAberto, type Saida } from '@/lib/fecharMes'
import { useToast } from '@/lib/ToastContext'
import { useUser } from '@/lib/UserContext'

const MESES = ['janeiro','fevereiro','março','abril','maio','junho','julho','agosto','setembro','outubro','novembro','dezembro']

// Fechar o mês de um cliente, post a post.
//
// Em lote cego seria mais rápido e erraria: os 29 posts de junho de um cliente
// só estão todos "esperando o cliente", mas dentro disso há os que ele vai
// aprovar e os que morreram. Quem fecha precisa ver o que está decidindo — por
// isso a lista aparece, com um padrão sugerido e não imposto.
export default function FecharMesModal({ clientId, clientName, month, year, posts, onClose, onDone }: {
  clientId: string
  clientName: string
  month: number
  year: number
  posts: PostAberto[]
  onClose: () => void
  onDone: () => void
}) {
  const { toast } = useToast()
  const { currentMember } = useUser()
  const prox = proximoMes(month, year)

  // Padrão "mover": o que sobrou de um mês quase sempre continua valendo — o
  // conteúdo não some porque a folhinha virou. Publicado e manter são exceção,
  // e exceção se marca a mão.
  const [saidas, setSaidas] = useState<Record<string, Saida>>(
    () => Object.fromEntries(posts.map(p => [p.id, 'mover' as Saida])))
  const [salvando, setSalvando] = useState(false)

  const conta = (s: Saida) => Object.values(saidas).filter(x => x === s).length

  async function confirmar() {
    setSalvando(true)
    const r = await aplicarFechamento(clientId, month, year, saidas,
      { id: currentMember?.id, name: currentMember?.name })
    setSalvando(false)
    if (r.erro) { toast('Não deu pra fechar: ' + r.erro); return }
    toast(`${MESES[month - 1]} fechado · ${r.movidos} movidos, ${r.publicados} publicados`)
    onDone()
  }

  const OPCOES: { v: Saida; label: string; Icon: any; cor: string }[] = [
    { v: 'mover',     label: `Vai pra ${MESES[prox.month - 1].slice(0, 3)}`, Icon: ArrowRight,  cor: '#3b82f6' },
    { v: 'publicado', label: 'Já saiu',                                       Icon: CheckCircle, cor: '#22c55e' },
    { v: 'manter',    label: 'Fica aqui',                                     Icon: Pause,       cor: '#6b7280' },
  ]

  return (
    <ModalPortal>
      <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-[70] p-4"
        onClick={e => { if (e.target === e.currentTarget) onClose() }}>
        <div className="bg-[var(--color-bg-card)] rounded-2xl w-full max-w-lg flex flex-col max-h-[88vh] shadow-pop">

          <div className="px-5 py-4 border-b border-[var(--color-border)] flex items-start justify-between gap-3">
            <div>
              <h2 className="text-sm font-semibold text-[var(--color-text-primary)]">
                Fechar {MESES[month - 1]} · {clientName}
              </h2>
              <p className="text-xs text-[var(--color-text-muted)] mt-0.5">
                {posts.length} {posts.length === 1 ? 'post ficou aberto' : 'posts ficaram abertos'}. O que acontece com cada um?
              </p>
            </div>
            <button onClick={onClose}
              className="w-8 h-8 rounded-lg hover:bg-[var(--color-bg-subtle)] flex items-center justify-center text-[var(--color-text-muted)] flex-shrink-0">
              <X size={16} />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-2">
            {posts.map(p => (
              <div key={p.id} className="border border-[var(--color-border)] rounded-xl p-3 flex flex-col gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="text-[10px] font-semibold text-[var(--color-text-faint)] flex-shrink-0">#{p.post_number ?? '—'}</span>
                  <span className="text-xs font-medium text-[var(--color-text-primary)] truncate flex-1">
                    {p.title || 'Sem título'}
                  </span>
                  <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-md flex-shrink-0" style={statusBadge(p.status)}>
                    {statusShort(p.status)}
                  </span>
                </div>
                <div className="flex gap-1.5">
                  {OPCOES.map(({ v, label, Icon, cor }) => {
                    const ativo = saidas[p.id] === v
                    return (
                      <button key={v} onClick={() => setSaidas(s => ({ ...s, [p.id]: v }))}
                        className="flex-1 flex items-center justify-center gap-1 text-[11px] font-semibold py-1.5 rounded-lg border transition-all"
                        style={ativo
                          ? { background: cor + '1a', color: cor, borderColor: cor + '55' }
                          : { color: 'var(--color-text-faint)', borderColor: 'var(--color-border)' }}>
                        <Icon size={11} /> {label}
                      </button>
                    )
                  })}
                </div>
              </div>
            ))}
          </div>

          <div className="px-5 py-4 border-t border-[var(--color-border)] flex items-center justify-between gap-3 bg-[var(--color-bg-alt)] rounded-b-2xl">
            <p className="text-[11px] text-[var(--color-text-muted)]">
              {conta('mover')} vão pra {MESES[prox.month - 1]} · {conta('publicado')} já saíram · {conta('manter')} ficam
            </p>
            <button onClick={confirmar} disabled={salvando}
              className="px-4 py-2 text-sm font-semibold text-[var(--color-brand-fg)] bg-[var(--color-brand)] rounded-lg disabled:opacity-50">
              {salvando ? 'Fechando…' : 'Fechar mês'}
            </button>
          </div>
        </div>
      </div>
    </ModalPortal>
  )
}
