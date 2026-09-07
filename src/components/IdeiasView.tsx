'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import { useUser } from '@/lib/UserContext'
import { useToast } from '@/lib/ToastContext'
import { dbError } from '@/lib/dbError'
import { logActivity } from '@/lib/activity'
import { ensureWatching } from '@/lib/watch'
import { numerosNoDestino } from '@/lib/numeroNoDestino'
import { desdeQuando } from '@/lib/registrarAbertura'
import { Lightbulb, Trash2, X } from 'lucide-react'

// O banco de ideias.
//
// A ideia crua entra DO JEITO QUE VEIO. Um print no grupo, uma frase do cliente
// no WhatsApp, um "vi isso e lembrei de vocês" — hoje isso morre no grupo ou
// vira um card de Extras sem briefing, que ninguém sabe se é pra fazer.
//
// Por isso a caixa de cima é UM campo e mais nada obrigatório: cliente é
// opcional (ideia boa às vezes ainda não tem dono), título não existe, tipo não
// existe. Pedir estrutura na hora da captura é como o banco de ideias morre:
// quem teve a ideia está no meio de outra coisa, e um formulário de seis campos
// faz a ideia voltar pro grupo do WhatsApp.
//
// A estrutura entra depois, uma vez só, quando a ideia vira post — e aí o texto
// cru vira o briefing, que é exatamente onde ele serve.

type Ideia = {
  id: string
  client_id: string | null
  texto: string
  origem: string
  autor_nome: string | null
  status: string
  post_id: string | null
  created_at: string
}
type Cliente = { id: string; name: string; color_hex: string }

// Quem teve a ideia importa pra saber com quem conversar sobre ela — não é
// crédito, é caminho de volta.
const ORIGENS: { valor: string; rotulo: string; cor: string }[] = [
  { valor: 'nossa',     rotulo: 'Nossa',     cor: '#6366f1' },
  { valor: 'cliente',   rotulo: 'Do cliente', cor: '#ec4899' },
  { valor: 'tendencia', rotulo: 'Tendência',  cor: '#f59e0b' },
]
const origemDe = (v: string) => ORIGENS.find(o => o.valor === v) || ORIGENS[0]

const FILTROS = [
  { valor: 'aberta',     rotulo: 'Abertas' },
  { valor: 'usada',      rotulo: 'Viraram post' },
  { valor: 'descartada', rotulo: 'Descartadas' },
]

const MESES = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro']
const TIPOS = [
  { valor: 'post',              rotulo: 'Post' },
  { valor: 'carrossel',         rotulo: 'Carrossel' },
  { valor: 'reels',             rotulo: 'Reels' },
  { valor: 'story',             rotulo: 'Story' },
  { valor: 'carrossel_stories', rotulo: 'Carrossel/Stories' },
]

export default function IdeiasView({ clientId, heading }: { clientId?: string; heading?: React.ReactNode }) {
  const supabase = createClient()
  const { toast } = useToast()
  const { currentMember } = useUser()
  const [ideias, setIdeias] = useState<Ideia[]>([])
  const [clientes, setClientes] = useState<Cliente[]>([])
  const [carregando, setCarregando] = useState(true)
  const [filtro, setFiltro] = useState('aberta')

  // Captura
  const [texto, setTexto] = useState('')
  const [paraCliente, setParaCliente] = useState(clientId || '')
  const [origem, setOrigem] = useState('nossa')
  const [salvando, setSalvando] = useState(false)

  // "Virar post" — o único momento em que a ideia precisa de estrutura.
  const [virando, setVirando] = useState<Ideia | null>(null)

  async function carregar() {
    const agora = new Date()
    const q = supabase.from('ideias').select('*').order('created_at', { ascending: false })
    const [{ data: ids }, { data: cs }] = await Promise.all([
      clientId ? q.eq('client_id', clientId) : q,
      supabase.from('clients').select('id, name, color_hex').eq('status', 'active').order('name'),
    ])
    setIdeias(ids || [])
    setClientes(cs || [])
    setCarregando(false)
  }
  useEffect(() => { carregar() /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [clientId])

  async function capturar() {
    const t = texto.trim()
    if (!t || salvando) return
    setSalvando(true)
    const { data, error } = await supabase.from('ideias').insert({
      texto: t,
      client_id: (clientId || paraCliente) || null,
      origem,
      autor_id: currentMember?.id || null,
      autor_nome: currentMember?.name || null,
    }).select('*').single()
    setSalvando(false)
    if (dbError(error, toast, 'guardar ideia')) return
    // Limpa só o texto: cliente e origem costumam se repetir em sequência —
    // quem está descarregando o grupo do WhatsApp joga cinco ideias do mesmo
    // cliente uma atrás da outra.
    setTexto('')
    if (data) setIdeias(l => [data as Ideia, ...l])
  }

  async function mudarStatus(ideia: Ideia, status: string) {
    const antes = ideias
    setIdeias(l => l.map(i => (i.id === ideia.id ? { ...i, status } : i)))
    const { error } = await supabase.from('ideias').update({ status, updated_at: new Date().toISOString() }).eq('id', ideia.id)
    if (error) { setIdeias(antes); dbError(error, toast, 'mudar a ideia') }
  }

  async function excluir(ideia: Ideia) {
    const antes = ideias
    setIdeias(l => l.filter(i => i.id !== ideia.id))
    const { error } = await supabase.from('ideias').delete().eq('id', ideia.id)
    if (error) { setIdeias(antes); dbError(error, toast, 'excluir ideia') }
  }

  /**
   * A ideia vira post de verdade.
   *
   * O texto cru vai pro BRIEFING, não pro título: ele é o contexto de por que
   * a peça existe, e é isso que quem for produzir precisa ler. O título é curto
   * porque é o que aparece no cronograma.
   *
   * A ideia não é apagada — fica marcada como "virou post", apontando pro post.
   * Apagar perderia de onde a peça veio, que é metade do valor de ter um banco.
   */
  async function virarPost(ideia: Ideia, dados: { clientId: string; titulo: string; tipo: string; mes: number; ano: number }) {
    const [numero] = await numerosNoDestino(supabase, dados.clientId, dados.mes, dados.ano)
    const { data, error } = await supabase.from('schedules').insert({
      client_id: dados.clientId, month: dados.mes, year: dados.ano, post_number: numero,
      title: dados.titulo, post_type: dados.tipo, status: 'estrategia',
      reference_notes: ideia.texto,
    }).select('id').single()
    if (dbError(error, toast, 'criar o post')) return
    if (!data) return
    await ensureWatching('schedules', data.id, [currentMember?.id])
    await logActivity({
      tableName: 'schedules', recordId: data.id, clientId: dados.clientId, action: 'created',
      actorName: currentMember?.name, actorId: currentMember?.id,
      description: `${currentMember?.name || 'Alguém'} transformou uma ideia em "${dados.titulo}"`,
    })
    await supabase.from('ideias').update({ status: 'usada', post_id: data.id, client_id: dados.clientId, updated_at: new Date().toISOString() }).eq('id', ideia.id)
    setIdeias(l => l.map(i => (i.id === ideia.id ? { ...i, status: 'usada', post_id: data.id, client_id: dados.clientId } : i)))
    setVirando(null)
    toast(`Virou o post #${numero} de ${MESES[dados.mes - 1]}`)
  }

  const visiveis = ideias.filter(i => i.status === filtro)
  const clienteDe = (id: string | null) => clientes.find(c => c.id === id)
  const contar = (s: string) => ideias.filter(i => i.status === s).length

  return (
    <div className="flex flex-col gap-5 max-w-3xl">
      {heading}

      {/* Captura — um campo, e mais nada obrigatório. */}
      <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-bg-card)] p-3.5 flex flex-col gap-2.5">
        <textarea
          value={texto}
          onChange={e => setTexto(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); void capturar() } }}
          placeholder="Cole a ideia do jeito que ela veio…"
          rows={3}
          className="w-full bg-transparent text-sm leading-relaxed outline-none resize-y text-[var(--color-text-primary)] placeholder-[var(--color-text-faint)]"
        />
        <div className="flex items-center gap-2 flex-wrap">
          {!clientId && (
            <select value={paraCliente} onChange={e => setParaCliente(e.target.value)}
              className="h-8 text-xs rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-card)] px-2 text-[var(--color-text-secondary)] outline-none">
              <option value="">Sem cliente ainda</option>
              {clientes.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          )}
          <div className="flex items-center gap-1">
            {ORIGENS.map(o => (
              <button key={o.valor} onClick={() => setOrigem(o.valor)}
                className="text-[11px] font-semibold px-2 py-1 rounded-lg transition-colors"
                style={origem === o.valor
                  ? { background: o.cor + '22', color: o.cor }
                  : { color: 'var(--color-text-muted)' }}>
                {o.rotulo}
              </button>
            ))}
          </div>
          <button onClick={capturar} disabled={!texto.trim() || salvando}
            className="ml-auto text-xs font-semibold px-3.5 py-1.5 rounded-lg text-white disabled:opacity-40 transition-opacity"
            style={{ background: 'var(--color-accent)' }}>
            {salvando ? 'Guardando…' : 'Guardar'}
          </button>
        </div>
      </div>

      {/* Filtros */}
      <div className="flex items-center gap-1">
        {FILTROS.map(f => (
          <button key={f.valor} onClick={() => setFiltro(f.valor)}
            className={`text-xs font-semibold px-2.5 py-1 rounded-lg transition-colors ${
              filtro === f.valor
                ? 'bg-[var(--color-text-primary)] text-[var(--color-bg-page)]'
                : 'text-[var(--color-text-muted)] hover:bg-[var(--color-bg-subtle)]'}`}>
            {f.rotulo} {contar(f.valor) > 0 && <span className="opacity-60">{contar(f.valor)}</span>}
          </button>
        ))}
      </div>

      {carregando ? (
        <p className="text-sm text-[var(--color-text-muted)] py-6">Carregando…</p>
      ) : visiveis.length === 0 ? (
        <div className="flex flex-col items-center gap-2 py-12 text-center">
          <Lightbulb size={22} className="text-[var(--color-text-faint)]" />
          <p className="text-sm text-[var(--color-text-muted)]">
            {filtro === 'aberta' ? 'Nenhuma ideia guardada ainda.' : 'Nada aqui.'}
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {visiveis.map(ideia => {
            const org = origemDe(ideia.origem)
            const cli = clienteDe(ideia.client_id)
            return (
              <div key={ideia.id} className="group rounded-2xl border border-[var(--color-border)] bg-[var(--color-bg-card)] p-3.5 flex flex-col gap-2.5">
                <p className="text-sm text-[var(--color-text-primary)] leading-relaxed whitespace-pre-wrap">{ideia.texto}</p>

                <div className="flex items-center gap-2 flex-wrap text-[11px]">
                  <span className="font-semibold px-1.5 py-0.5 rounded-md" style={{ background: org.cor + '22', color: org.cor }}>{org.rotulo}</span>
                  {cli && (
                    <span className="font-medium px-1.5 py-0.5 rounded-md" style={{ background: (cli.color_hex || '#888') + '22', color: cli.color_hex || 'var(--color-text-muted)' }}>{cli.name}</span>
                  )}
                  <span className="text-[var(--color-text-faint)]">
                    {ideia.autor_nome ? `${ideia.autor_nome} · ` : ''}{desdeQuando(ideia.created_at)}
                  </span>

                  <div className="ml-auto flex items-center gap-1.5 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
                    {ideia.status === 'aberta' && (
                      <>
                        <button onClick={() => setVirando(ideia)}
                          className="font-semibold px-2 py-1 rounded-lg text-white" style={{ background: 'var(--color-accent)' }}>
                          Virar post
                        </button>
                        <button onClick={() => mudarStatus(ideia, 'descartada')}
                          className="font-medium px-2 py-1 rounded-lg text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-bg-subtle)]">
                          Descartar
                        </button>
                      </>
                    )}
                    {ideia.status !== 'aberta' && ideia.status !== 'usada' && (
                      <button onClick={() => mudarStatus(ideia, 'aberta')}
                        className="font-medium px-2 py-1 rounded-lg text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-bg-subtle)]">
                        Reabrir
                      </button>
                    )}
                    <button onClick={() => excluir(ideia)} aria-label="Excluir ideia"
                      className="p-1 rounded-lg text-[var(--color-text-faint)] hover:text-[var(--ds-error-text)]">
                      <Trash2 size={12} />
                    </button>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {virando && (
        <ModalVirarPost
          ideia={virando}
          clientes={clientes}
          clienteFixo={clientId}
          onFechar={() => setVirando(null)}
          onConfirmar={dados => virarPost(virando, dados)}
        />
      )}
    </div>
  )
}

/** O único formulário do banco de ideias — e ele só aparece na saída. */
function ModalVirarPost({ ideia, clientes, clienteFixo, onFechar, onConfirmar }: {
  ideia: Ideia
  clientes: Cliente[]
  clienteFixo?: string
  onFechar: () => void
  onConfirmar: (d: { clientId: string; titulo: string; tipo: string; mes: number; ano: number }) => Promise<void>
}) {
  const agora = new Date()
  const [cliente, setCliente] = useState(clienteFixo || ideia.client_id || '')
  // O título já vem sugerido da primeira linha da ideia: quem chegou até aqui
  // já sabe o que quer, e reescrever do zero o que está escrito acima é atrito.
  const [titulo, setTitulo] = useState(ideia.texto.split('\n')[0].slice(0, 60))
  const [tipo, setTipo] = useState('post')
  const [mes, setMes] = useState(agora.getMonth() + 1)
  const [ano, setAno] = useState(agora.getFullYear())
  const [criando, setCriando] = useState(false)

  const podeIr = !!cliente && !!titulo.trim() && !criando
  const rotulo = 'w-full h-9 text-sm rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-card)] px-2.5 text-[var(--color-text-primary)] outline-none focus:border-[var(--color-accent)]'

  return (
    <div className="fixed inset-0 bg-black/40 z-[80] flex items-center justify-center p-4"
      onClick={e => { if (e.target === e.currentTarget) onFechar() }}>
      <div className="bg-[var(--color-bg-card)] rounded-2xl w-full max-w-md shadow-pop flex flex-col">
        <div className="p-4 border-b border-[var(--color-border)] flex items-center justify-between">
          <p className="text-sm font-semibold text-[var(--color-text-primary)]">Virar post</p>
          <button onClick={onFechar} aria-label="Fechar" className="text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]"><X size={15} /></button>
        </div>

        <div className="p-4 flex flex-col gap-3">
          <div className="rounded-xl bg-[var(--color-bg-subtle)] p-2.5">
            <p className="text-xs text-[var(--color-text-secondary)] leading-relaxed whitespace-pre-wrap line-clamp-4">{ideia.texto}</p>
            <p className="text-[10px] text-[var(--color-text-faint)] mt-1.5">Vai inteiro pras referências do post.</p>
          </div>

          {!clienteFixo && (
            <select value={cliente} onChange={e => setCliente(e.target.value)} className={rotulo}>
              <option value="">Escolha o cliente…</option>
              {clientes.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          )}
          <input value={titulo} onChange={e => setTitulo(e.target.value)} placeholder="Título do post" className={rotulo} />
          <div className="flex gap-2">
            <select value={tipo} onChange={e => setTipo(e.target.value)} className={rotulo}>
              {TIPOS.map(t => <option key={t.valor} value={t.valor}>{t.rotulo}</option>)}
            </select>
            <select value={`${mes}-${ano}`} onChange={e => { const [m, a] = e.target.value.split('-').map(Number); setMes(m); setAno(a) }} className={rotulo}>
              {/* Este mês e os três seguintes: ideia guardada é pra frente. */}
              {[0, 1, 2, 3].map(d => {
                const dt = new Date(agora.getFullYear(), agora.getMonth() + d, 1)
                const m = dt.getMonth() + 1, a = dt.getFullYear()
                return <option key={`${m}-${a}`} value={`${m}-${a}`}>{MESES[m - 1]} {a}</option>
              })}
            </select>
          </div>
        </div>

        <div className="p-4 border-t border-[var(--color-border)] flex justify-end gap-2">
          <button onClick={onFechar} className="text-sm px-3.5 py-1.5 rounded-lg text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]">Cancelar</button>
          <button disabled={!podeIr}
            onClick={async () => { setCriando(true); await onConfirmar({ clientId: cliente, titulo: titulo.trim(), tipo, mes, ano }); setCriando(false) }}
            className="text-sm font-semibold px-3.5 py-1.5 rounded-lg text-white disabled:opacity-40"
            style={{ background: 'var(--color-accent)' }}>
            {criando ? 'Criando…' : 'Criar post'}
          </button>
        </div>
      </div>
    </div>
  )
}
