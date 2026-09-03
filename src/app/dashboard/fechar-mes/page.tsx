'use client'

import { useEffect, useState, useMemo } from 'react'
import { createClient } from '@/lib/supabase'
import { fromActiveClients } from '@/lib/activeClients'
import { statusBadge, statusShort } from '@/lib/status'
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

      {grupos.map(g => {
        const c = nome(g.clientId)
        return (
          <div key={`${g.clientId}-${g.year}-${g.month}`}
            className="bg-[var(--color-bg-card)] border border-[var(--color-border)] rounded-2xl overflow-hidden">
            <div className="px-4 py-3 flex items-center gap-3 border-b border-[var(--color-border)]">
              <div className="w-1.5 h-9 rounded-full flex-shrink-0" style={{ background: c?.color_hex || '#94a3b8' }} />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-bold text-[var(--color-text-primary)] truncate">{c?.name || 'Cliente'}</p>
                <p className="text-[11px] text-[var(--color-text-muted)]">
                  {MESES[g.month - 1]} {g.year} · {g.posts.length} {g.posts.length === 1 ? 'post aberto' : 'posts abertos'}
                </p>
              </div>
              <button onClick={() => setFechando(g)}
                className="px-3 py-1.5 text-xs font-semibold rounded-xl bg-[var(--color-brand)] text-[var(--color-brand-fg)] flex-shrink-0">
                Fechar mês
              </button>
            </div>
            <div className="p-3 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2.5">
              {g.posts.map(p => <Previa key={p.id} post={p} onAbrir={() => setAbrindo(p)} />)}
            </div>
          </div>
        )
      })}

      {fechando && (
        <FecharMesModal
          clientId={fechando.clientId}
          clientName={nome(fechando.clientId)?.name || 'Cliente'}
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
  const ehVideo = post.post_type === 'reels'
  const { thumbUrl } = useDriveThumbnail(post.drive_url, post.drive_folder_url, ehVideo)
  const [quebrou, setQuebrou] = useState(false)

  return (
    <button onClick={onAbrir}
      className="text-left rounded-xl border border-[var(--color-border)] overflow-hidden hover:border-[var(--color-border-hover)] transition-colors">
      <div className="aspect-square bg-[var(--color-bg-subtle)] flex items-center justify-center overflow-hidden">
        {thumbUrl && !quebrou
          // eslint-disable-next-line @next/next/no-img-element
          ? <img src={thumbUrl} alt="" className="w-full h-full object-cover" onError={() => setQuebrou(true)} />
          : <ImageOff size={18} className="text-[var(--color-text-faint)]" />}
      </div>
      <div className="p-2 flex flex-col gap-1">
        <p className="text-[11px] font-medium text-[var(--color-text-primary)] truncate">
          <span className="text-[var(--color-text-faint)]">#{post.post_number ?? '—'}</span> {post.title || 'Sem título'}
        </p>
        <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded-md self-start" style={statusBadge(post.status)}>
          {statusShort(post.status)}
        </span>
      </div>
    </button>
  )
}
