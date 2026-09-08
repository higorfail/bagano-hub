'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import { useUser } from '@/lib/UserContext'
import { useToast } from '@/lib/ToastContext'
import { dbError } from '@/lib/dbError'
import { withBase } from '@/lib/base'
import { desdeQuando } from '@/lib/registrarAbertura'
import { Search, Plus, Archive, TrendingUp, X } from 'lucide-react'

// Tendências do nicho.
//
// Duas portas, e as duas importam. A IA busca na web e sugere; a equipe também
// cadastra à mão. Não é redundância: a busca depende da cota de grounding do
// Gemini, que é separada da cota normal e acaba antes — e uma tela cujo único
// caminho depende de um serviço externo é uma tela que um dia abre vazia sem
// explicação. Além disso, quem viu a trend rolando no próprio feed sabe coisa
// que busca nenhuma pega.
//
// A tendência não vira post direto: vira IDEIA, e a ideia vira post. Um caminho
// só pra criar post, e de quebra a origem "tendência" fica registrada no banco
// de ideias — dá pra olhar depois quantas peças saíram daqui.

type Tendencia = {
  id: string
  titulo: string
  descricao: string | null
  gancho: string | null
  categoria: string | null
  fonte: string | null
  exemplos: string[] | null
  imagem_url: string | null
  instagram_url: string | null
  buscado_em: string
  ativa: boolean
}

const CATEGORIAS = [
  { valor: 'formato',  rotulo: 'Formato',  cor: '#6366f1' },
  { valor: 'audio',    rotulo: 'Áudio',    cor: '#ec4899' },
  { valor: 'assunto',  rotulo: 'Assunto',  cor: '#0ea5e9' },
  { valor: 'data',     rotulo: 'Data',     cor: '#f59e0b' },
  { valor: 'estetica', rotulo: 'Estética', cor: '#8b5cf6' },
]
const catDe = (v: string | null) => CATEGORIAS.find(c => c.valor === v) || CATEGORIAS[2]

/** "Veículo · https://…" → ["Veículo", "https://…"]. O nome pra ler, o link pra clicar. */
function partirFonte(fonte: string | null): [string, string] {
  const t = (fonte || '').trim()
  if (!t) return ['', '']
  const link = t.match(/https?:\/\/\S+/)?.[0] || ''
  const nome = t.replace(link, '').replace(/[·\-\s]+$/, '').trim()
  return [nome || link.replace(/^https?:\/\/(www\.)?/, '').split('/')[0], link]
}

/** O código do post, quando o link é de um post (e não de um perfil). */
function codigoDoPost(url: string | null): string | null {
  return url?.match(/instagram\.com\/(?:p|reel)\/([A-Za-z0-9_-]+)/)?.[1] || null
}

export default function TendenciasView({ heading }: { heading?: React.ReactNode }) {
  const supabase = createClient()
  const { toast } = useToast()
  const { currentMember } = useUser()
  const [tendencias, setTendencias] = useState<Tendencia[]>([])
  const [carregando, setCarregando] = useState(true)
  const [buscando, setBuscando] = useState(false)
  const [erroBusca, setErroBusca] = useState('')
  const [mostrarArquivadas, setMostrarArquivadas] = useState(false)
  const [novaAberta, setNovaAberta] = useState(false)

  async function carregar() {
    const { data } = await supabase.from('tendencias').select('*').order('buscado_em', { ascending: false }).limit(200)
    setTendencias((data || []) as Tendencia[])
    setCarregando(false)
  }
  useEffect(() => { carregar() /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [])

  async function buscar() {
    setBuscando(true); setErroBusca('')
    // Os @ dos concorrentes cadastrados entram na busca: é a diferença entre
    // "tendências de gastronomia" e "o que os concorrentes DESTES clientes
    // estão fazendo".
    const { data: conc } = await supabase.from('concorrentes').select('instagram').eq('ativo', true).limit(25)
    try {
      const res = await fetch(withBase('/api/ai-tendencias'), {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ concorrentes: (conc || []).map(c => c.instagram).filter(Boolean) }),
      })
      const json = await res.json()
      if (!res.ok || json.error) {
        // Erro em português e com o motivo real. "Erro ao buscar" faria a
        // equipe apertar o botão dez vezes contra uma cota que só reseta
        // amanhã.
        // A rota já devolve o motivo em português. Aqui só se garante que
        // nunca chega um "erro" pelado na tela.
        setErroBusca(json.error || 'Não consegui buscar agora. Dá pra cadastrar à mão enquanto isso.')
        setBuscando(false)
        return
      }
      const novas = (json.tendencias || []).map((t: any) => ({ ...t, buscado_em: json.buscadoEm }))
      if (!novas.length) { setErroBusca('A busca não trouxe nada novo desta vez.'); setBuscando(false); return }
      const { data, error } = await supabase.from('tendencias').insert(novas).select('*')
      if (dbError(error, toast, 'guardar as tendências')) { setBuscando(false); return }
      setTendencias(l => [...((data || []) as Tendencia[]), ...l])
      toast(`${novas.length} tendências novas`)
    } catch {
      setErroBusca('Erro de conexão ao buscar.')
    }
    setBuscando(false)
  }

  async function arquivar(t: Tendencia, ativa: boolean) {
    const antes = tendencias
    setTendencias(l => l.map(x => (x.id === t.id ? { ...x, ativa } : x)))
    const { error } = await supabase.from('tendencias').update({ ativa }).eq('id', t.id)
    if (error) { setTendencias(antes); dbError(error, toast, 'arquivar') }
  }

  async function excluir(t: Tendencia) {
    const antes = tendencias
    setTendencias(l => l.filter(x => x.id !== t.id))
    const { error } = await supabase.from('tendencias').delete().eq('id', t.id)
    if (error) { setTendencias(antes); dbError(error, toast, 'excluir') }
  }

  /** A tendência entra no banco de ideias, de onde vira post. */
  async function virarIdeia(t: Tendencia) {
    const texto = [t.titulo, t.descricao, t.gancho && `Como usar: ${t.gancho}`, t.fonte && `Fonte: ${t.fonte}`]
      .filter(Boolean).join('\n\n')
    const { error } = await supabase.from('ideias').insert({
      texto, origem: 'tendencia',
      autor_id: currentMember?.id || null, autor_nome: currentMember?.name || null,
    })
    if (dbError(error, toast, 'mandar pras ideias')) return
    toast('Foi pro banco de ideias')
  }

  async function adicionar(t: { titulo: string; descricao: string; gancho: string; categoria: string; fonte: string }) {
    const { data, error } = await supabase.from('tendencias').insert({ ...t, exemplos: [] }).select('*').single()
    if (dbError(error, toast, 'guardar tendência')) return
    if (data) setTendencias(l => [data as Tendencia, ...l])
    setNovaAberta(false)
  }

  const visiveis = tendencias.filter(t => t.ativa !== mostrarArquivadas)
  const arquivadas = tendencias.filter(t => !t.ativa).length

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        {heading}
        <div className="flex items-center gap-2 flex-shrink-0">
          <button onClick={() => setNovaAberta(true)}
            className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg border border-[var(--color-border)] text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-bg-subtle)] transition-colors">
            <Plus size={12} /> À mão
          </button>
          <button onClick={buscar} disabled={buscando}
            className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg text-white disabled:opacity-50 transition-opacity"
            style={{ background: 'var(--color-accent)' }}>
            <Search size={12} /> {buscando ? 'Buscando…' : 'Buscar com IA'}
          </button>
        </div>
      </div>

      {erroBusca && (
        <div className="rounded-xl border p-3 text-xs leading-relaxed"
          style={{ borderColor: 'var(--ds-caution-border)', background: 'var(--ds-caution-bg)', color: 'var(--ds-caution-text)' }}>
          {erroBusca}
        </div>
      )}

      {arquivadas > 0 && (
        <button onClick={() => setMostrarArquivadas(v => !v)}
          className="self-start text-[11px] font-medium text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] transition-colors">
          {mostrarArquivadas ? '← Voltar pras ativas' : `Ver ${arquivadas} arquivada${arquivadas > 1 ? 's' : ''}`}
        </button>
      )}

      {carregando ? (
        <p className="text-sm text-[var(--color-text-muted)] py-6">Carregando…</p>
      ) : visiveis.length === 0 ? (
        <div className="flex flex-col items-center gap-2 py-12 text-center">
          <TrendingUp size={22} className="text-[var(--color-text-faint)]" />
          <p className="text-sm text-[var(--color-text-muted)] max-w-xs">
            {mostrarArquivadas ? 'Nada arquivado.' : 'Nenhuma tendência ainda. Busque com a IA ou cadastre a que você viu rolando.'}
          </p>
        </div>
      ) : (
        // Três colunas na largura inteira. Tendência se compara olhando lado a
        // lado — uma coluna de blocos de texto era uma lista de leitura, e
        // ninguém lê lista pra escolher pauta.
        <div className="grid gap-3 [grid-template-columns:repeat(auto-fill,minmax(300px,1fr))] xl:[grid-template-columns:repeat(3,minmax(0,1fr))]">
          {visiveis.map(t => {
            const cat = catDe(t.categoria)
            // A fonte é gravada como "Veículo · https://…" — o nome pra ler, o
            // link pra clicar. Sem separar, o card mostrava a URL crua inteira.
            const [veiculo, link] = partirFonte(t.fonte)
            const post = codigoDoPost(t.instagram_url)
            return (
              <article key={t.id} className="group flex flex-col rounded-2xl border border-[var(--color-border)] bg-[var(--color-bg-card)] overflow-hidden">
                <Capa tendencia={t} cor={cat.cor} />

                <div className="flex flex-col gap-2 p-3.5 flex-1">
                  <div className="flex items-start gap-2">
                    <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-md uppercase tracking-wide flex-shrink-0 mt-0.5"
                      style={{ background: cat.cor + '22', color: cat.cor }}>{cat.rotulo}</span>
                    <h3 className="text-sm font-semibold text-[var(--color-text-primary)] leading-snug flex-1">{t.titulo}</h3>
                  </div>

                  {t.descricao && <p className="text-xs text-[var(--color-text-secondary)] leading-relaxed">{t.descricao}</p>}

                  {t.gancho && (
                    <div className="rounded-xl bg-[var(--color-bg-subtle)] px-2.5 py-2">
                      <p className="text-[10px] font-bold uppercase tracking-wider text-[var(--color-text-faint)] mb-0.5">Como usar</p>
                      <p className="text-xs text-[var(--color-text-secondary)] leading-relaxed">{t.gancho}</p>
                    </div>
                  )}

                  {/* O post do Instagram citado pela matéria, embedado de
                      verdade. O iframe do Instagram não pede login pra post
                      público — testado, devolve 200. */}
                  {post && (
                    <iframe src={`https://www.instagram.com/p/${post}/embed`}
                      title="Post no Instagram" loading="lazy" scrolling="no"
                      className="w-full rounded-xl border border-[var(--color-border)]" style={{ height: 460 }} />
                  )}
                  {!post && t.instagram_url && (
                    <a href={t.instagram_url} target="_blank" rel="noopener noreferrer"
                      className="text-xs font-medium self-start" style={{ color: cat.cor }}>
                      Ver no Instagram
                    </a>
                  )}

                  <div className="flex items-center gap-2 mt-auto pt-2 text-[11px]">
                    {/* A fonte fica visível sempre, não escondida atrás de
                        hover: é ela que separa "li isso" de "a IA achou que
                        existia". */}
                    {link
                      ? <a href={link} target="_blank" rel="noopener noreferrer"
                          className="text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] underline truncate max-w-[60%]" title={link}>
                          {veiculo}
                        </a>
                      : <span className="text-[var(--ds-caution-text)]">sem fonte</span>}
                    <span className="text-[var(--color-text-faint)] truncate">{desdeQuando(t.buscado_em)}</span>

                    <div className="ml-auto flex items-center gap-1 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity flex-shrink-0">
                      {t.ativa && (
                        <button onClick={() => virarIdeia(t)}
                          className="font-semibold px-2 py-1 rounded-lg text-white" style={{ background: 'var(--color-accent)' }}>
                          Virar ideia
                        </button>
                      )}
                      <button onClick={() => arquivar(t, !t.ativa)} aria-label={t.ativa ? 'Arquivar' : 'Desarquivar'}
                        className="p-1 rounded-lg text-[var(--color-text-faint)] hover:text-[var(--color-text-primary)]">
                        <Archive size={12} />
                      </button>
                      <button onClick={() => excluir(t)} aria-label="Excluir"
                        className="p-1 rounded-lg text-[var(--color-text-faint)] hover:text-[var(--ds-error-text)]">
                        <X size={13} />
                      </button>
                    </div>
                  </div>
                </div>
              </article>
            )
          })}
        </div>
      )}

      {novaAberta && <ModalNovaTendencia onFechar={() => setNovaAberta(false)} onSalvar={adicionar} />}
    </div>
  )
}

/**
 * A capa do card: a foto da matéria, ou um visual desenhado no lugar dela.
 *
 * A maioria das tendências BOAS não tem foto, e isso não é falha de código —
 * é onde elas moram. Medido em quatro rodadas: as matérias com foto vêm dos
 * feeds de lifestyle e quase nunca são tendência; as que são tendência de
 * verdade vêm da busca em toda a imprensa, que não entrega imagem.
 *
 * Forçar o modelo a preferir matéria com foto foi testado e piorou o conteúdo.
 * Então o card sem foto ganha uma capa própria — faixa na cor da categoria com
 * o título grande — em vez de um buraco. A grade fica com a mesma altura de
 * cima a baixo, e nada finge ser foto que não é.
 */
function Capa({ tendencia, cor }: { tendencia: Tendencia; cor: string }) {
  const [quebrou, setQuebrou] = useState(false)
  if (tendencia.imagem_url && !quebrou) {
    return (
      <div className="aspect-[16/9] bg-[var(--color-bg-subtle)] overflow-hidden">
        <img src={tendencia.imagem_url} alt="" loading="lazy"
          className="w-full h-full object-cover"
          onError={() => setQuebrou(true)} />
      </div>
    )
  }
  return (
    <div className="aspect-[16/9] flex items-end p-3.5 relative overflow-hidden"
      style={{ background: `linear-gradient(135deg, ${cor}22, ${cor}0a)` }}>
      {/* Marca d'água grande atrás do título: dá peso visual sem inventar
          imagem. Cortada pelo overflow de propósito. */}
      <span aria-hidden className="absolute -right-2 -top-6 text-[110px] font-black leading-none select-none"
        style={{ color: cor, opacity: 0.13 }}>#</span>
      <p className="relative text-base font-bold leading-tight text-[var(--color-text-primary)] line-clamp-3">
        {tendencia.titulo}
      </p>
    </div>
  )
}

function ModalNovaTendencia({ onFechar, onSalvar }: {
  onFechar: () => void
  onSalvar: (t: { titulo: string; descricao: string; gancho: string; categoria: string; fonte: string }) => Promise<void>
}) {
  const [titulo, setTitulo] = useState('')
  const [descricao, setDescricao] = useState('')
  const [gancho, setGancho] = useState('')
  const [categoria, setCategoria] = useState('assunto')
  const [fonte, setFonte] = useState('')
  const [salvando, setSalvando] = useState(false)
  const campo = 'w-full text-sm rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-card)] px-2.5 py-2 text-[var(--color-text-primary)] placeholder-[var(--color-text-faint)] outline-none focus:border-[var(--color-accent)]'

  return (
    <div className="fixed inset-0 bg-black/40 z-[80] flex items-center justify-center p-4"
      onClick={e => { if (e.target === e.currentTarget) onFechar() }}>
      <div className="bg-[var(--color-bg-card)] rounded-2xl w-full max-w-md shadow-pop flex flex-col">
        <div className="p-4 border-b border-[var(--color-border)] flex items-center justify-between">
          <p className="text-sm font-semibold text-[var(--color-text-primary)]">Tendência que você viu</p>
          <button onClick={onFechar} aria-label="Fechar" className="text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]"><X size={15} /></button>
        </div>
        <div className="p-4 flex flex-col gap-2.5">
          <input value={titulo} onChange={e => setTitulo(e.target.value)} placeholder="O nome da tendência" className={campo} autoFocus />
          <textarea value={descricao} onChange={e => setDescricao(e.target.value)} placeholder="O que é" rows={2} className={campo + ' resize-y'} />
          <textarea value={gancho} onChange={e => setGancho(e.target.value)} placeholder="Como um restaurante usa isso" rows={2} className={campo + ' resize-y'} />
          <div className="flex gap-2">
            <select value={categoria} onChange={e => setCategoria(e.target.value)} className={campo}>
              {CATEGORIAS.map(c => <option key={c.valor} value={c.valor}>{c.rotulo}</option>)}
            </select>
            <input value={fonte} onChange={e => setFonte(e.target.value)} placeholder="Onde você viu (link, @)" className={campo} />
          </div>
        </div>
        <div className="p-4 border-t border-[var(--color-border)] flex justify-end gap-2">
          <button onClick={onFechar} className="text-sm px-3.5 py-1.5 rounded-lg text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]">Cancelar</button>
          <button disabled={!titulo.trim() || salvando}
            onClick={async () => { setSalvando(true); await onSalvar({ titulo: titulo.trim(), descricao, gancho, categoria, fonte }); setSalvando(false) }}
            className="text-sm font-semibold px-3.5 py-1.5 rounded-lg text-white disabled:opacity-40" style={{ background: 'var(--color-accent)' }}>
            {salvando ? 'Salvando…' : 'Guardar'}
          </button>
        </div>
      </div>
    </div>
  )
}
