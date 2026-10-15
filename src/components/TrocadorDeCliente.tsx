'use client'

// Trocar de cliente sem passar pela lista.
//
// Antes, ver o mesmo assunto em dois clientes era: voltar pros clientes, achar
// o outro na grade, entrar, e procurar a aba de novo. Quatro passos pra uma
// pergunta só — e na reunião semanal, em que se passa cliente por cliente, isso
// acontece uma vez por cliente.
//
// Duas formas, porque são dois jeitos de usar:
//
//   - O NOME é o botão. Quem quer um cliente específico clica e busca. Não
//     ocupa espaço novo numa tela que já tem catorze abas, e o alvo já está
//     onde o olho está.
//   - As SETAS andam na lista. Quem está fazendo o geralzão da semana só
//     aperta pro lado. A ordem é a mesma da tela de clientes (ativos, por
//     nome), porque é por ela que a reunião anda.
//
// Nos dois casos a ABA fica de pé: sair do Manual do cliente A e cair no
// Manual do cliente B é o ponto; cair no Cronograma seria recomeçar.

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import { caminhoCliente } from '@/lib/clienteSlug'
import { ChevronDown, ChevronLeft, ChevronRight, Search } from 'lucide-react'

type ClienteBasico = { id: string; name: string; slug: string | null; color_hex: string | null; logo_url: string | null }

function iniciais(nome: string) {
  return nome.split(' ').map(p => p[0]).join('').slice(0, 2).toUpperCase()
}

/** Tira acento pra busca: quem digita "piastro" tem que achar "Piastro". */
const normalizar = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

export default function TrocadorDeCliente({
  clienteAtual, aba, compacto = false,
}: {
  clienteAtual: { id: string; name: string }
  aba: string
  compacto?: boolean
}) {
  const router = useRouter()
  const [clientes, setClientes] = useState<ClienteBasico[]>([])
  const [aberto, setAberto] = useState(false)
  const [busca, setBusca] = useState('')
  const caixa = useRef<HTMLDivElement>(null)
  const campoBusca = useRef<HTMLInputElement>(null)

  useEffect(() => {
    let vivo = true
    // Só os ativos: cliente arquivado não entra no rodízio da reunião, e
    // aparecer na seta levaria pra uma tela que ninguém quer abrir.
    createClient().from('clients')
      .select('id, name, slug, color_hex, logo_url').eq('status', 'active').order('name')
      .then(({ data }) => { if (vivo) setClientes((data || []) as ClienteBasico[]) })
    return () => { vivo = false }
  }, [])

  // Fecha ao clicar fora e no Esc — senão o painel fica pendurado por cima do
  // conteúdo quando a pessoa desiste.
  useEffect(() => {
    if (!aberto) return
    const fora = (e: MouseEvent) => { if (caixa.current && !caixa.current.contains(e.target as Node)) setAberto(false) }
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setAberto(false) }
    document.addEventListener('mousedown', fora)
    document.addEventListener('keydown', esc)
    return () => { document.removeEventListener('mousedown', fora); document.removeEventListener('keydown', esc) }
  }, [aberto])

  useEffect(() => { if (aberto) campoBusca.current?.focus() }, [aberto])

  function irPara(c: ClienteBasico) {
    setAberto(false); setBusca('')
    router.push(caminhoCliente(c, aba))
  }

  const indice = clientes.findIndex(c => c.id === clienteAtual.id)
  // O rodízio dá a volta: depois do último vem o primeiro. Numa reunião que
  // anda pela lista inteira, parar no fim só obriga a voltar pra lista.
  const vizinho = (passo: number) => {
    if (indice < 0 || clientes.length < 2) return null
    return clientes[(indice + passo + clientes.length) % clientes.length]
  }
  const anterior = vizinho(-1)
  const proximo = vizinho(1)

  const filtrados = busca.trim()
    ? clientes.filter(c => normalizar(c.name).includes(normalizar(busca.trim())))
    : clientes

  const seta = 'w-7 h-7 rounded-lg flex items-center justify-center text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-bg-subtle)] transition-colors disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-[var(--color-text-muted)] flex-shrink-0'

  return (
    <div className="flex items-center gap-0.5 min-w-0" ref={caixa}>
      <button onClick={() => anterior && irPara(anterior)} disabled={!anterior}
        title={anterior ? `Anterior: ${anterior.name}` : 'Cliente anterior'} className={seta}>
        <ChevronLeft size={16} />
      </button>

      <div className="relative min-w-0">
        <button onClick={() => setAberto(a => !a)} title="Trocar de cliente"
          className="flex items-center gap-1 min-w-0 rounded-lg px-1.5 py-0.5 -mx-1 hover:bg-[var(--color-bg-subtle)] transition-colors group">
          <h1 className={`font-bold text-[var(--color-text-primary)] tracking-tight truncate transition-all duration-200 ${compacto ? 'text-base' : 'text-base md:text-2xl'}`}>
            {clienteAtual.name}
          </h1>
          <ChevronDown size={compacto ? 14 : 16} className="text-[var(--color-text-muted)] group-hover:text-[var(--color-text-primary)] transition-colors flex-shrink-0" />
        </button>

        {aberto && (
          <div className="absolute left-0 top-full mt-1.5 w-72 max-w-[85vw] bg-[var(--color-bg-card)] border border-[var(--color-border)] rounded-2xl shadow-xl z-50 overflow-hidden">
            <div className="flex items-center gap-2 px-3 py-2.5 border-b border-[var(--color-border)]">
              <Search size={14} className="text-[var(--color-text-muted)] flex-shrink-0" />
              <input ref={campoBusca} value={busca} onChange={e => setBusca(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && filtrados[0]) irPara(filtrados[0]) }}
                placeholder="Buscar cliente…"
                className="flex-1 bg-transparent text-sm text-[var(--color-text-primary)] placeholder:text-[var(--color-text-muted)] outline-none min-w-0" />
            </div>
            <div className="max-h-72 overflow-y-auto py-1">
              {filtrados.length === 0 && (
                <p className="px-3 py-4 text-xs text-[var(--color-text-muted)] text-center">Nenhum cliente com esse nome.</p>
              )}
              {filtrados.map(c => {
                const atual = c.id === clienteAtual.id
                return (
                  <button key={c.id} onClick={() => irPara(c)}
                    className={`w-full flex items-center gap-2.5 px-3 py-2 text-left transition-colors ${atual ? 'bg-[var(--color-bg-subtle)]' : 'hover:bg-[var(--color-bg-subtle)]'}`}>
                    {c.logo_url
                      ? <img src={c.logo_url} alt="" className="w-6 h-6 rounded-full object-cover flex-shrink-0" onError={e => { (e.target as HTMLImageElement).style.visibility = 'hidden' }} />
                      : <div className="w-6 h-6 rounded-full flex items-center justify-center text-white text-[9px] font-bold flex-shrink-0" style={{ background: c.color_hex || '#64748b' }}>{iniciais(c.name)}</div>
                    }
                    <span className={`text-sm truncate ${atual ? 'font-semibold text-[var(--color-text-primary)]' : 'text-[var(--color-text-secondary)]'}`}>{c.name}</span>
                  </button>
                )
              })}
            </div>
          </div>
        )}
      </div>

      <button onClick={() => proximo && irPara(proximo)} disabled={!proximo}
        title={proximo ? `Próximo: ${proximo.name}` : 'Próximo cliente'} className={seta}>
        <ChevronRight size={16} />
      </button>
    </div>
  )
}
