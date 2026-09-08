'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import { useToast } from '@/lib/ToastContext'
import { dbError } from '@/lib/dbError'
import { ChevronDown, ChevronRight, X, Plus } from 'lucide-react'

// Quem são os concorrentes de cada cliente.
//
// Serve pra duas coisas, uma que já funciona e outra que ainda não:
//
//   HOJE: os @ entram na busca de tendências. É a diferença entre "tendências
//   de gastronomia" e "o nicho DESTES clientes" — sushi de Vitória não tem o
//   mesmo concorrente que pizzaria de bairro.
//
//   AINDA NÃO: ler o que esses perfis postaram e o que engajou. Isso depende da
//   Business Discovery API da Meta, que exige conta Business, página no
//   Facebook e App Review aprovado. As colunas `ultima_leitura` e `dados` já
//   existem esperando por isso.
//
// A lista não vale nada vazia, então a tela é o mais barata possível de
// preencher: um campo, cola o @, enter.

type Concorrente = { id: string; client_id: string; instagram: string; nome: string | null; ativo: boolean }
type Cliente = { id: string; name: string; color_hex: string }

/** Aceita "@x", "x", ou a URL do perfil — todo mundo cola de um jeito. */
function arrobaLimpa(bruto: string): string {
  const t = bruto.trim()
  const daUrl = t.match(/instagram\.com\/([A-Za-z0-9._]+)/)?.[1]
  return (daUrl || t.replace(/^@/, '')).replace(/[^A-Za-z0-9._]/g, '').slice(0, 60)
}

export default function ConcorrentesPainel({ clientId }: { clientId?: string }) {
  const supabase = createClient()
  const { toast } = useToast()
  const [lista, setLista] = useState<Concorrente[]>([])
  const [clientes, setClientes] = useState<Cliente[]>([])
  const [aberto, setAberto] = useState(!!clientId)
  const [carregado, setCarregado] = useState(false)
  const [rascunho, setRascunho] = useState<Record<string, string>>({})

  useEffect(() => {
    if (!aberto || carregado) return
    const q = supabase.from('concorrentes').select('id, client_id, instagram, nome, ativo').order('instagram')
    Promise.all([
      clientId ? q.eq('client_id', clientId) : q,
      supabase.from('clients').select('id, name, color_hex').eq('status', 'active').order('name'),
    ]).then(([{ data: cs }, { data: cl }]) => {
      setLista((cs || []) as Concorrente[])
      setClientes((cl || []) as Cliente[])
      setCarregado(true)
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aberto, carregado, clientId])

  async function adicionar(cid: string) {
    const arroba = arrobaLimpa(rascunho[cid] || '')
    if (!arroba) return
    // Repetido não entra: a lista alimenta um prompt, e @ duplicado só ocupa
    // espaço lá dentro.
    if (lista.some(c => c.client_id === cid && c.instagram.toLowerCase() === arroba.toLowerCase())) {
      setRascunho(r => ({ ...r, [cid]: '' })); return
    }
    setRascunho(r => ({ ...r, [cid]: '' }))
    const { data, error } = await supabase.from('concorrentes')
      .insert({ client_id: cid, instagram: arroba }).select('id, client_id, instagram, nome, ativo').single()
    if (dbError(error, toast, 'guardar concorrente')) return
    if (data) setLista(l => [...l, data as Concorrente])
  }

  async function remover(c: Concorrente) {
    const antes = lista
    setLista(l => l.filter(x => x.id !== c.id))
    const { error } = await supabase.from('concorrentes').delete().eq('id', c.id)
    if (error) { setLista(antes); dbError(error, toast, 'remover') }
  }

  const doCliente = (cid: string) => lista.filter(c => c.client_id === cid)
  // Na tela geral, cliente sem concorrente fica no fim: quem abre isso vem
  // conferir o que já tem, não passar por 21 listas vazias.
  const ordenados = clientId
    ? clientes.filter(c => c.id === clientId)
    : [...clientes].sort((a, b) => doCliente(b.id).length - doCliente(a.id).length || a.name.localeCompare(b.name))

  const campo = 'text-xs bg-transparent border border-dashed border-[var(--color-border)] rounded-lg px-2.5 py-1 outline-none focus:border-[var(--color-accent)] text-[var(--color-text-primary)] placeholder-[var(--color-text-faint)] w-36'

  return (
    <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-bg-card)]">
      {!clientId && (
        <button onClick={() => setAberto(v => !v)}
          className="w-full flex items-center gap-2 px-3.5 py-3 text-left hover:bg-[var(--color-bg-subtle)] transition-colors rounded-2xl">
          {aberto ? <ChevronDown size={13} className="text-[var(--color-text-muted)]" /> : <ChevronRight size={13} className="text-[var(--color-text-muted)]" />}
          <span className="text-sm font-semibold text-[var(--color-text-primary)]">Concorrentes</span>
          <span className="text-xs text-[var(--color-text-muted)]">
            {carregado ? `${lista.length} perfis` : 'entram na busca de tendências'}
          </span>
        </button>
      )}

      {aberto && (
        <div className={`flex flex-col gap-3 px-3.5 pb-3.5 ${clientId ? 'pt-3.5' : ''}`}>
          {!carregado ? (
            <p className="text-xs text-[var(--color-text-muted)]">Carregando…</p>
          ) : (
            <>
              {ordenados.map(cl => (
                <div key={cl.id} className="flex items-start gap-3">
                  <span className="text-xs font-medium text-[var(--color-text-secondary)] w-36 flex-shrink-0 truncate pt-1" title={cl.name}>{cl.name}</span>
                  <div className="flex flex-wrap items-center gap-1.5 flex-1">
                    {doCliente(cl.id).map(c => (
                      <span key={c.id} className="group inline-flex items-center gap-1 text-[11px] font-medium pl-2 pr-1 py-0.5 rounded-full bg-[var(--color-bg-subtle)] text-[var(--color-text-secondary)]">
                        @{c.instagram}
                        <button onClick={() => remover(c)} aria-label={`Remover @${c.instagram}`}
                          className="opacity-30 group-hover:opacity-100 transition-opacity">
                          <X size={10} />
                        </button>
                      </span>
                    ))}
                    <input
                      value={rascunho[cl.id] || ''}
                      onChange={e => setRascunho(r => ({ ...r, [cl.id]: e.target.value }))}
                      onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); void adicionar(cl.id) } }}
                      onBlur={() => adicionar(cl.id)}
                      placeholder="@concorrente"
                      className={campo}
                    />
                  </div>
                </div>
              ))}
              <p className="text-[11px] text-[var(--color-text-faint)] leading-relaxed border-t border-[var(--color-border)] pt-2.5">
                Os @ entram na busca de tendências como contexto do nicho. Ler o que esses
                perfis postaram depende da API da Meta, que exige App Review aprovado — ainda não dá.
              </p>
            </>
          )}
        </div>
      )}
    </div>
  )
}
