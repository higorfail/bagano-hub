'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import { useUser } from '@/lib/UserContext'
import { useToast } from '@/lib/ToastContext'
import { dbError } from '@/lib/dbError'
import { calcularRelatorio, limitesDoMes, ROTULO_TIPO, METRICAS_DO_INSTAGRAM, type NumerosDoMes } from '@/lib/relatorioMensal'
import { Printer } from 'lucide-react'

// O relatório mensal do cliente.
//
// Duas metades, e a divisão é o ponto da tela: O QUE FIZEMOS o hub conta
// sozinho (entrega, aprovação, captação, material — tudo está no banco), COMO
// PERFORMOU só o Instagram sabe e a equipe digita.
//
// Misturar as duas é como número inventado nasce: alguém escreve "12 posts" de
// cabeça, erra, e o cliente — que recebeu os posts — confere. O que é nosso
// vem contado e não tem campo pra editar.
//
// Não há link público. O relatório é uma PÁGINA DE IMPRESSÃO: a equipe manda
// "Salvar como PDF" e envia pelo canal que já usa. Link público significaria
// token, RLS por cabeçalho e uma superfície nova aberta pra fora — e o ganho
// seria pequeno, porque relatório se manda uma vez por mês, não se consulta.

const MESES = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro']

type Cliente = { id: string; name: string; color_hex: string; logo_url: string | null; instagram_url: string | null }

export default function RelatorioMensal() {
  const supabase = createClient()
  const { toast } = useToast()
  const { currentMember } = useUser()
  const agora = new Date()
  // Abre no mês PASSADO: relatório se faz sobre mês fechado, e no dia 3 ninguém
  // quer o relatório de três dias.
  const anterior = new Date(agora.getFullYear(), agora.getMonth() - 1, 1)

  const [clientes, setClientes] = useState<Cliente[]>([])
  const [clientId, setClientId] = useState('')
  const [mes, setMes] = useState(anterior.getMonth() + 1)
  const [ano, setAno] = useState(anterior.getFullYear())

  const [numeros, setNumeros] = useState<NumerosDoMes | null>(null)
  const [carregando, setCarregando] = useState(false)
  const [recado, setRecado] = useState('')
  const [proximos, setProximos] = useState('')
  const [metricas, setMetricas] = useState<Record<string, string>>({})
  const [printUrl, setPrintUrl] = useState('')
  const [salvando, setSalvando] = useState(false)

  useEffect(() => {
    supabase.from('clients').select('id, name, color_hex, logo_url, instagram_url')
      .eq('status', 'active').order('name')
      .then(({ data }) => setClientes((data || []) as Cliente[]))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Carrega os números e o que já foi escrito para este cliente+mês.
  useEffect(() => {
    if (!clientId) { setNumeros(null); return }
    let cancelado = false
    setCarregando(true)
    const { inicioDia } = limitesDoMes(mes, ano)
    Promise.all([
      calcularRelatorio(supabase, clientId, mes, ano),
      supabase.from('relatorios').select('*').eq('client_id', clientId).eq('periodo_inicio', inicioDia).maybeSingle(),
    ]).then(([n, { data: salvo }]) => {
      if (cancelado) return
      setNumeros(n)
      setRecado(salvo?.recado || '')
      setProximos(salvo?.proximos_passos || '')
      setMetricas((salvo?.metricas as Record<string, string>) || {})
      setPrintUrl(salvo?.print_url || '')
      setCarregando(false)
    })
    return () => { cancelado = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientId, mes, ano])

  async function salvar() {
    if (!clientId) return
    setSalvando(true)
    const { inicioDia, fimDia } = limitesDoMes(mes, ano)
    // O fim guardado é o último DIA do mês, não o primeiro do seguinte: é o que
    // se lê no relatório ("01/08 a 31/08").
    const ultimo = new Date(new Date(fimDia + 'T12:00:00').getTime() - 86400000).toISOString().slice(0, 10)
    const { error } = await supabase.from('relatorios').upsert({
      client_id: clientId, periodo_inicio: inicioDia, periodo_fim: ultimo,
      recado: recado || null, proximos_passos: proximos || null,
      metricas, print_url: printUrl || null,
      gerado_por: currentMember?.name || null,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'client_id,periodo_inicio' })
    setSalvando(false)
    if (dbError(error, toast, 'salvar relatório')) return
    toast('Relatório salvo')
  }

  const cliente = clientes.find(c => c.id === clientId)
  const campo = 'w-full text-sm rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-card)] px-2.5 py-2 text-[var(--color-text-primary)] placeholder-[var(--color-text-faint)] outline-none focus:border-[var(--color-accent)]'
  const cor = cliente?.color_hex || 'var(--color-accent)'

  return (
    <>
      {/* Impressão: some tudo que é controle e o relatório ocupa a folha.
          Sem isto, "Salvar como PDF" levava junto o menu lateral, os seletores
          e o botão de imprimir — um PDF que ninguém manda pro cliente. */}
      <style>{`
        @media print {
          body { background: #fff !important; }
          .nao-imprime { display: none !important; }
          .folha { box-shadow: none !important; border: none !important; margin: 0 !important; padding: 0 !important; max-width: none !important; }
          .quebra-evitar { break-inside: avoid; }
        }
      `}</style>

      <div className="flex flex-col gap-5 max-w-3xl">
        <div className="nao-imprime flex items-end gap-2 flex-wrap">
          <select value={clientId} onChange={e => setClientId(e.target.value)} className={campo + ' w-auto min-w-[180px]'}>
            <option value="">Escolha o cliente…</option>
            {clientes.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <select value={`${mes}-${ano}`} onChange={e => { const [m, a] = e.target.value.split('-').map(Number); setMes(m); setAno(a) }}
            className={campo + ' w-auto'}>
            {Array.from({ length: 12 }, (_, i) => {
              const d = new Date(agora.getFullYear(), agora.getMonth() - i, 1)
              const m = d.getMonth() + 1, a = d.getFullYear()
              return <option key={`${m}-${a}`} value={`${m}-${a}`}>{MESES[m - 1]} {a}</option>
            })}
          </select>
          {clientId && (
            <>
              <button onClick={salvar} disabled={salvando}
                className="h-[38px] text-sm font-semibold px-3.5 rounded-lg text-white disabled:opacity-50" style={{ background: 'var(--color-accent)' }}>
                {salvando ? 'Salvando…' : 'Salvar'}
              </button>
              <button onClick={() => window.print()}
                className="h-[38px] flex items-center gap-1.5 text-sm font-semibold px-3.5 rounded-lg border border-[var(--color-border)] text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-bg-subtle)] transition-colors">
                <Printer size={13} /> PDF
              </button>
            </>
          )}
        </div>

        {!clientId ? (
          <p className="text-sm text-[var(--color-text-muted)] py-8">Escolha um cliente e um mês.</p>
        ) : carregando || !numeros ? (
          <p className="text-sm text-[var(--color-text-muted)] py-8">Somando o mês…</p>
        ) : (
          <div className="folha bg-[var(--color-bg-card)] border border-[var(--color-border)] rounded-2xl p-6 md:p-8 flex flex-col gap-7">

            {/* Cabeçalho: as duas marcas. A do cliente ganha o tamanho; a
                nossa assina embaixo — o relatório é sobre ele. */}
            <div className="flex items-start justify-between gap-4 pb-5 border-b" style={{ borderColor: cor + '44' }}>
              <div className="flex items-center gap-3 min-w-0">
                {cliente?.logo_url
                  ? <img src={cliente.logo_url} alt={cliente.name} className="w-12 h-12 rounded-xl object-cover flex-shrink-0" />
                  : <div className="w-12 h-12 rounded-xl flex items-center justify-center text-white font-bold flex-shrink-0" style={{ background: cor }}>{cliente?.name?.[0]}</div>}
                <div className="min-w-0">
                  <p className="text-xl font-bold text-[var(--color-text-primary)] leading-tight truncate">{cliente?.name}</p>
                  <p className="text-xs text-[var(--color-text-muted)] mt-0.5">Relatório de {MESES[mes - 1]} de {ano}</p>
                </div>
              </div>
              <div className="text-right flex-shrink-0">
                <p className="text-[10px] font-bold uppercase tracking-widest text-[var(--color-text-faint)]">por</p>
                <p className="text-sm font-bold text-[var(--color-text-primary)]">Bagano</p>
              </div>
            </div>

            {/* O QUE FIZEMOS — contado pelo hub, sem campo pra editar */}
            <section className="quebra-evitar flex flex-col gap-3">
              <h2 className="text-[10px] font-bold uppercase tracking-widest text-[var(--color-text-faint)]">O que entregamos</h2>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <Numero valor={numeros.posts} rotulo="posts no cronograma" cor={cor} />
                <Numero valor={numeros.publicados} rotulo="publicados" cor={cor} />
                <Numero valor={numeros.extras} rotulo="extras entregues" cor={cor} />
                <Numero valor={numeros.captacoes} rotulo="captações" cor={cor} />
              </div>

              {Object.keys(numeros.porTipo).length > 0 && (
                <div className="flex flex-wrap gap-2 mt-1">
                  {Object.entries(numeros.porTipo).map(([t, n]) => (
                    <span key={t} className="text-xs font-medium px-2.5 py-1 rounded-full" style={{ background: cor + '18', color: cor }}>
                      {n}× {ROTULO_TIPO[t] || t}
                    </span>
                  ))}
                </div>
              )}

              {(numeros.aprovacoesDoCliente > 0 || numeros.ajustesPedidos > 0 || numeros.materiais > 0) && (
                <p className="text-xs text-[var(--color-text-muted)] leading-relaxed mt-1">
                  {numeros.aprovacoesDoCliente > 0 && <>{numeros.aprovacoesDoCliente} aprovações registradas no mês. </>}
                  {numeros.ajustesPedidos > 0 && <>{numeros.ajustesPedidos} pedidos de ajuste, todos atendidos antes da publicação. </>}
                  {numeros.materiais > 0 && <>{numeros.materiais} materiais entregues fora do feed. </>}
                </p>
              )}
            </section>

            {/* COMO PERFORMOU — só o Instagram sabe */}
            <section className="quebra-evitar flex flex-col gap-3">
              <h2 className="text-[10px] font-bold uppercase tracking-widest text-[var(--color-text-faint)]">Como performou</h2>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                {METRICAS_DO_INSTAGRAM.map(m => (
                  <div key={m.chave} className="rounded-xl border border-[var(--color-border)] p-3">
                    <input
                      value={metricas[m.chave] || ''}
                      onChange={e => setMetricas(v => ({ ...v, [m.chave]: e.target.value }))}
                      placeholder="—"
                      className="w-full text-xl font-bold bg-transparent outline-none text-[var(--color-text-primary)] placeholder-[var(--color-text-faint)]"
                      style={{ color: metricas[m.chave] ? cor : undefined }}
                    />
                    <p className="text-[11px] text-[var(--color-text-muted)] mt-0.5">{m.rotulo}</p>
                  </div>
                ))}
              </div>
              <div className="nao-imprime">
                <input value={printUrl} onChange={e => setPrintUrl(e.target.value)}
                  placeholder="Link do print do painel do Instagram (opcional)" className={campo} />
              </div>
              {printUrl && (
                <a href={printUrl} target="_blank" rel="noopener noreferrer" className="text-xs underline" style={{ color: cor }}>
                  Print do painel do Instagram
                </a>
              )}
            </section>

            <section className="quebra-evitar flex flex-col gap-2">
              <h2 className="text-[10px] font-bold uppercase tracking-widest text-[var(--color-text-faint)]">Nosso recado</h2>
              <textarea value={recado} onChange={e => setRecado(e.target.value)} rows={4}
                placeholder="O que funcionou, o que aprendemos, o que chamou atenção neste mês…"
                className="w-full text-sm leading-relaxed bg-transparent outline-none resize-y text-[var(--color-text-secondary)] placeholder-[var(--color-text-faint)]" />
            </section>

            <section className="quebra-evitar flex flex-col gap-2">
              <h2 className="text-[10px] font-bold uppercase tracking-widest text-[var(--color-text-faint)]">Próximos passos</h2>
              <textarea value={proximos} onChange={e => setProximos(e.target.value)} rows={4}
                placeholder="O que vem no mês que vem…"
                className="w-full text-sm leading-relaxed bg-transparent outline-none resize-y text-[var(--color-text-secondary)] placeholder-[var(--color-text-faint)]" />
            </section>
          </div>
        )}
      </div>
    </>
  )
}

function Numero({ valor, rotulo, cor }: { valor: number; rotulo: string; cor: string }) {
  return (
    <div className="rounded-xl border border-[var(--color-border)] p-3">
      <p className="text-2xl font-bold leading-none" style={{ color: cor }}>{valor}</p>
      <p className="text-[11px] text-[var(--color-text-muted)] mt-1.5 leading-tight">{rotulo}</p>
    </div>
  )
}
