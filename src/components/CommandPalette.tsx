'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import { Search, Users, FileText, Package, X, LayoutList } from 'lucide-react'

const STATUS_LABEL: Record<string,string> = {
  producao: 'Produção', revisao_interna: 'Revisão', aguardando_aprovacao: 'Com cliente',
  aprovado: 'Aprovado', agendado: 'Agendado', publicado: 'Publicado',
}
const TYPE_LABEL: Record<string,string> = {
  reels: 'Reels', carrossel: 'Carrossel', post: 'Post', story: 'Story', carrossel_stories: 'Carrossel/Stories',
}
const MONTHS = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez']

type Result = {
  type: 'cliente' | 'post' | 'material' | 'extra'
  id: string
  title: string
  subtitle: string
  href: string
  color?: string
}

export default function CommandPalette() {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<Result[]>([])
  const [loading, setLoading] = useState(false)
  const [selectedIdx, setSelectedIdx] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)

  // Atalho Cmd+K / Ctrl+K
  useEffect(() => {
    function handler(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        setOpen(v => !v)
      }
      if (e.key === 'Escape') setOpen(false)
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 50)
    else { setQuery(''); setResults([]); setSelectedIdx(0) }
  }, [open])

  // Busca conforme digita
  useEffect(() => {
    if (!query.trim()) { setResults([]); return }
    setLoading(true)
    const timeout = setTimeout(async () => {
      const supabase = createClient()
      const q = query.trim()

      const [clientsRes, postsRes, materialsRes, extrasRes] = await Promise.all([
        supabase.from('clients').select('id, name, color_hex').ilike('name', `%${q}%`).limit(5),
        supabase.from('schedules').select('id, title, copy, post_type, status, client_id, month, year, clients(name, color_hex)').or(`title.ilike.%${q}%,copy.ilike.%${q}%`).limit(6),
        supabase.from('materials').select('id, title, client_id, clients(name)').ilike('title', `%${q}%`).limit(4),
        supabase.from('extras').select('id, title, type, status, client_id, clients(name)').or(`title.ilike.%${q}%,description.ilike.%${q}%`).limit(4),
      ])

      const out: Result[] = []
      clientsRes.data?.forEach((c: any) => out.push({
        type: 'cliente', id: c.id, title: c.name, subtitle: 'Cliente',
        href: `/dashboard/clientes/${c.id}`, color: c.color_hex,
      }))
      postsRes.data?.forEach((p: any) => {
        const parts = [p.clients?.name, TYPE_LABEL[p.post_type] || p.post_type, STATUS_LABEL[p.status] || p.status, `${MONTHS[(p.month||1)-1]} ${p.year}`].filter(Boolean)
        out.push({ type: 'post', id: p.id, title: p.title || 'Post sem título', subtitle: parts.join(' · '), href: `/dashboard/cronograma?client=${p.client_id}` })
      })
      materialsRes.data?.forEach((m: any) => out.push({
        type: 'material', id: m.id, title: m.title,
        subtitle: m.clients?.name || 'Material', href: `/dashboard/materiais`,
      }))
      extrasRes.data?.forEach((e: any) => out.push({
        type: 'extra', id: e.id, title: e.title,
        subtitle: [e.clients?.name, e.type].filter(Boolean).join(' · '),
        href: `/dashboard/extras`,
      }))

      setResults(out)
      setSelectedIdx(0)
      setLoading(false)
    }, 200)

    return () => clearTimeout(timeout)
  }, [query])

  function go(r: Result) {
    router.push(r.href)
    setOpen(false)
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'ArrowDown') { e.preventDefault(); setSelectedIdx(i => Math.min(i + 1, results.length - 1)) }
    if (e.key === 'ArrowUp') { e.preventDefault(); setSelectedIdx(i => Math.max(i - 1, 0)) }
    if (e.key === 'Enter' && results[selectedIdx]) { e.preventDefault(); go(results[selectedIdx]) }
  }

  const icons = {
    cliente: Users,
    post: FileText,
    material: Package,
    extra: LayoutList,
  }

  return (
    <>
      {/* Gatilho na topbar */}
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-2 px-3 py-1.5 rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-card)] hover:border-[var(--color-border-hover)] transition-all text-sm text-[var(--color-text-muted)] min-w-[200px]"
      >
        <Search size={14} />
        <span className="flex-1 text-left">Buscar...</span>
        <kbd className="text-[10px] bg-[var(--color-bg-subtle)] px-1.5 py-0.5 rounded font-mono text-[var(--color-text-secondary)]">⌘K</kbd>
      </button>

      {/* Modal */}
      {open && (
        <div
          className="fixed inset-0 bg-black/30 z-[100] flex items-start justify-center pt-[15vh] px-4"
          onClick={e => { if (e.target === e.currentTarget) setOpen(false) }}
        >
          <div className="bg-[var(--color-bg-card)] rounded-2xl w-full max-w-xl overflow-hidden border border-[var(--color-border)]">
            <div className="flex items-center gap-3 px-4 py-3 border-b border-[var(--color-border)]">
              <Search size={18} className="text-[var(--color-text-muted)] flex-shrink-0" />
              <input
                ref={inputRef}
                value={query}
                onChange={e => setQuery(e.target.value)}
                onKeyDown={onKeyDown}
                placeholder="Buscar clientes, posts, materiais..."
                className="flex-1 outline-none text-sm text-[var(--color-text-primary)] placeholder-[var(--color-text-muted)]"
              />
              <button onClick={() => setOpen(false)} className="text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]">
                <X size={16} />
              </button>
            </div>

            <div className="max-h-80 overflow-y-auto">
              {!query.trim() ? (
                <div className="px-4 py-8 text-center text-sm text-[var(--color-text-muted)]">
                  Digite para buscar em todo o sistema
                </div>
              ) : loading ? (
                <div className="px-4 py-8 text-center text-sm text-[var(--color-text-muted)]">Buscando...</div>
              ) : results.length === 0 ? (
                <div className="px-4 py-8 text-center text-sm text-[var(--color-text-muted)]">Nenhum resultado para "{query}"</div>
              ) : (() => {
                const GROUP_LABEL: Record<string,string> = { cliente: 'Clientes', post: 'Posts', material: 'Materiais', extra: 'Extras' }
                const GROUP_ORDER: Result['type'][] = ['cliente', 'post', 'material', 'extra']
                const grouped = GROUP_ORDER.map(t => ({ type: t, items: results.filter(r => r.type === t) })).filter(g => g.items.length > 0)
                let idx = -1
                return (
                  <div className="py-2">
                    {grouped.map(group => (
                      <div key={group.type}>
                        <p className="px-4 pt-3 pb-1 text-[10px] font-bold uppercase tracking-widest text-[var(--color-text-muted)]">{GROUP_LABEL[group.type]}</p>
                        {group.items.map(r => {
                          idx++
                          const myIdx = idx
                          const Icon = icons[r.type]
                          return (
                            <button
                              key={`${r.type}-${r.id}`}
                              onClick={() => go(r)}
                              onMouseEnter={() => setSelectedIdx(myIdx)}
                              className={`w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors ${myIdx === selectedIdx ? 'bg-[var(--color-bg-subtle)]' : ''}`}
                            >
                              {r.color ? (
                                <div className="w-8 h-8 rounded-lg flex items-center justify-center text-white text-[10px] font-semibold flex-shrink-0" style={{ background: r.color }}>
                                  {r.title.slice(0, 2).toUpperCase()}
                                </div>
                              ) : (
                                <div className="w-8 h-8 rounded-lg bg-[var(--color-bg-subtle)] flex items-center justify-center flex-shrink-0">
                                  <Icon size={15} className="text-[var(--color-text-secondary)]" />
                                </div>
                              )}
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-medium text-[var(--color-text-primary)] truncate">{r.title}</p>
                                <p className="text-xs text-[var(--color-text-muted)] truncate">{r.subtitle}</p>
                              </div>
                            </button>
                          )
                        })}
                      </div>
                    ))}
                  </div>
                )
              })()}
            </div>
          </div>
        </div>
      )}
    </>
  )
}
