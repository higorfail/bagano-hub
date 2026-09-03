'use client'

import { useEffect, useState, useMemo } from 'react'
import { createClient } from '@/lib/supabase'
import { fromActiveClients } from '@/lib/activeClients'
import { statusShort } from '@/lib/status'
import { useDriveThumbnail } from '@/lib/useDriveThumbnail'
import { ABERTO } from '@/lib/fecharMes'
import FecharMesModal from '@/components/FecharMesModal'
import PostCard from '@/components/PostCard'
import { CalendarClock, ImageOff } from 'lucide-react'

const MESES = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro']

type Post = {
  id: string; client_id: string; title: string | null; status: string
  post_number: number | null; post_type: string | null
  drive_url: string | null; drive_folder_url: string | null
  month: number; year: number
}
type Cliente = { id: string; name: string; color_hex: string }

// A página do encalhe.
//
// O widget do Início diz QUANTO; aqui se vê O QUÊ. E ver importa: os 29 posts
// de junho do Satō estão todos em "esperando o cliente", mas título não conta
// se aquilo ainda vale — a arte conta. Decidir por lista de texto é decidir no
// escuro, e no escuro a saída fácil é adiar de novo.
export default function FecharMesPage() {
  useEffect(() => { document.title = 'Fechar mês · Bagano Hub' }, [])
  const [posts, setPosts] = useState<Post[]>([])
  const [clientes, setClientes] = useState<Cliente[]>([])
  const [loading, setLoading] = useState(true)
  const [fechando, setFechando] = useState<{ clientId: string; month: number; year: number; posts: Post[] } | null>(null)
  const [abrindo, setAbrindo] = useState<Post | null>(null)

  // Recarregar é um CONTADOR, não uma chamada.
  //
  // A busca mora dentro do efeito porque é o único jeito de o lint enxergar
  // que os setState acontecem depois do await, e não no corpo do efeito. Quem
  // precisa recarregar (o modal ao fechar o mês, o card ao salvar) só empurra
  // a versão — o efeito reage.
  const [versao, setVersao] = useState(0)
  const recarregar = () => setVersao(v => v + 1)

  useEffect(() => {
    let vivo = true
    ;(async () => {
      const supabase = createClient()
      const [{ data: sc }, { data: cl }] = await Promise.all([
        supabase.from('schedules')
          .select('id, client_id, title, status, post_number, post_type, drive_url, drive_folder_url, month, year')
          .in('status', ABERTO).order('post_number'),
        supabase.from('clients').select('id, name, color_hex').eq('status', 'active').order('name'),
      ])
      if (!vivo) return
      const ativos = new Set((cl || []).map(c => c.id))
      setClientes(cl || [])
      setPosts(fromActiveClients(sc as Post[], ativos))
      setLoading(false)
    })()
    return () => { vivo = false }
  }, [versao])

  const grupos = useMemo(() => {
    const agora = new Date()
    const mesAtual = agora.getFullYear() * 12 + agora.getMonth()
    const por = new Map<string, { clientId: string; month: number; year: number; posts: Post[] }>()
    for (const p of posts) {
      // Mês corrente não é encalhe, é o trabalho de agora.
      if (p.year * 12 + (p.month - 1) >= mesAtual) continue
      const k = `${p.client_id}:${p.year}-${p.month}`
      if (!por.has(k)) por.set(k, { clientId: p.client_id, month: p.month, year: p.year, posts: [] })
      por.get(k)!.posts.push(p)
    }
    return [...por.values()].sort((a, b) =>
      (a.year * 12 + a.month) - (b.year * 12 + b.month) || b.posts.length - a.posts.length)
  }, [posts])

  const nome = (id: string) => clientes.find(c => c.id === id)
  const total = grupos.reduce((s, g) => s + g.posts.length, 0)

  return (
    <div className="p-4 md:p-6 flex flex-col gap-4 h-full overflow-auto page-content">
      <div>
        <h1 className="text-xl md:text-2xl font-bold text-[var(--color-text-primary)] tracking-tight">Fechar mês</h1>
        <p className="text-[var(--color-text-muted)] text-sm mt-0.5">
          {loading ? 'Carregando…'
            : total === 0 ? 'Nenhum mês passado com post em aberto. Tudo fechado.'
            : `${total} ${total === 1 ? 'post ficou' : 'posts ficaram'} para trás em ${grupos.length} ${grupos.length === 1 ? 'mês' : 'meses'}.`}
        </p>
      </div>

      {!loading && total === 0 && (
        <div className="bg-[var(--color-bg-card)] border border-[var(--color-border)] rounded-2xl py-16 text-center">
          <CalendarClock size={28} className="mx-auto text-[var(--color-text-faint)] mb-3" />
          <p className="text-sm font-semibold text-[var(--color-text-primary)]">Nada encalhado</p>
          <p className="text-xs text-[var(--color-text-muted)] mt-1">Todo mês anterior está fechado.</p>
        </div>
      )}

      {/* Uma linha por mês, não uma galeria.
          A versão anterior dava 5 prévias enormes por cliente e cortava o
          resto — 63 posts em 7 meses viravam uma rolagem de imagens sem ação
          nenhuma à vista. Aqui a linha é a unidade: quem é, quantos, e o que
          fazer. A prévia entra pequena, só pra dar a cara do mês, e o detalhe
          mora no modal, onde a decisão acontece. */}
      <div className="bg-[var(--color-bg-card)] border border-[var(--color-border)] rounded-2xl divide-y divide-[var(--color-border)] overflow-hidden">
        {grupos.map(g => {
          const c = nome(g.clientId)
          return (
            <div key={`${g.clientId}-${g.year}-${g.month}`} className="flex items-center gap-3 px-3 py-2.5">
              <div className="w-1 h-8 rounded-full flex-shrink-0" style={{ background: c?.color_hex || '#94a3b8' }} />

              <div className="min-w-0 w-40 sm:w-52 flex-shrink-0">
                <p className="text-[13px] font-semibold text-[var(--color-text-primary)] truncate">{c?.name || 'Cliente'}</p>
                <p className="text-[11px] text-[var(--color-text-muted)]">
                  {MESES[g.month - 1].slice(0, 3)} {g.year} · {g.posts.length} {g.posts.length === 1 ? 'post' : 'posts'}
                </p>
              </div>

              {/* Fila de miniaturas: dá pra reconhecer o mês de relance sem
                  transformar a tela em mural. O "+N" diz que há mais, em vez
                  de deixar a fila cortada no meio fingindo que acabou. */}
              <div className="flex items-center gap-1 flex-1 min-w-0 overflow-hidden">
                {g.posts.slice(0, 8).map(p => (
                  <Previa key={p.id} post={p} onAbrir={() => setAbrindo(p)} />
                ))}
                {g.posts.length > 8 && (
                  <span className="text-[11px] text-[var(--color-text-faint)] pl-1 flex-shrink-0">
                    +{g.posts.length - 8}
                  </span>
                )}
              </div>

              <div className="flex items-center gap-1.5 flex-shrink-0">
                {/* Os status resumidos: um mês inteiro em "Ag. cliente" é uma
                    conversa com o cliente; um misturado é trabalho nosso. A
                    decisão muda, então o dado aparece antes de decidir. */}
                <span className="hidden md:inline text-[10px] text-[var(--color-text-faint)] mr-1">
                  {resumoStatus(g.posts)}
                </span>
                <button onClick={() => setFechando(g)}
                  className="px-3 py-1.5 text-xs font-semibold rounded-lg border border-[var(--color-border)] text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-subtle)] transition-colors">
                  Resolver
                </button>
              </div>
            </div>
          )
        })}
      </div>

      {fechando && (
        <FecharMesModal
          clientId={fechando.clientId}
          clientName={nome(fechando.clientId)?.name || 'Cliente'}
          clientColor={nome(fechando.clientId)?.color_hex}
          month={fechando.month} year={fechando.year} posts={fechando.posts}
          onClose={() => setFechando(null)}
          onDone={() => { setFechando(null); recarregar() }}
        />
      )}

      {abrindo && (
        <PostCard
          postId={abrindo.id}
          clientId={abrindo.client_id}
          clientName={nome(abrindo.client_id)?.name || 'Cliente'}
          clientColor={nome(abrindo.client_id)?.color_hex || '#94a3b8'}
          month={abrindo.month} year={abrindo.year}
          onClose={() => setAbrindo(null)}
          onSaved={() => { setAbrindo(null); recarregar() }}
        />
      )}
    </div>
  )
}

// A prévia real do post, não o título. Um post de junho com a arte pronta e um
// que nunca saiu do papel se parecem MUITO numa lista de texto — e são decisões
// opostas.
function Previa({ post, onAbrir }: { post: Post; onAbrir: () => void }) {
  const { thumbUrl } = useDriveThumbnail(post.drive_url, post.drive_folder_url, post.post_type === 'reels')
  const [quebrou, setQuebrou] = useState(false)
  return (
    <button onClick={onAbrir} title={`#${post.post_number ?? '—'} ${post.title || 'Sem título'}`}
      className="w-9 h-9 rounded-md overflow-hidden bg-[var(--color-bg-subtle)] border border-[var(--color-border)] flex items-center justify-center flex-shrink-0 hover:border-[var(--color-border-hover)] transition-colors">
      {thumbUrl && !quebrou
        // eslint-disable-next-line @next/next/no-img-element
        ? <img src={thumbUrl} alt="" className="w-full h-full object-cover" onError={() => setQuebrou(true)} />
        : <ImageOff size={12} className="text-[var(--color-text-faint)]" />}
    </button>
  )
}

/** "29 ag. cliente" ou "6 ag. crono · 4 produção" — o que o mês está esperando. */
function resumoStatus(posts: Post[]): string {
  const c = new Map<string, number>()
  for (const p of posts) c.set(p.status, (c.get(p.status) || 0) + 1)
  return [...c.entries()]
    .sort((a, b) => b[1] - a[1]).slice(0, 2)
    .map(([st, n]) => `${n} ${statusShort(st).toLowerCase()}`)
    .join(' · ')
}
