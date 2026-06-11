'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import { Search, Users, FileText, Package, X } from 'lucide-react'

type Result = {
  type: 'cliente' | 'post' | 'material'
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

      const [clientsRes, postsRes, materialsRes] = await Promise.all([
        supabase.from('clients').select('id, name, color_hex').ilike('name', `%${q}%`).limit(5),
        supabase.from('schedules').select('id, title, client_id, clients(name)').ilike('title', `%${q}%`).limit(5),
        supabase.from('materials').select('id, title, client_id, clients(name)').ilike('title', `%${q}%`).limit(5),
      ])

      const out: Result[] = []
      clientsRes.data?.forEach((c: any) => out.push({
        type: 'cliente', id: c.id, title: c.name, subtitle: 'Cliente',
        href: `/dashboard/clientes/${c.id}`, color: c.color_hex,
      }))
      postsRes.data?.forEach((p: any) => out.push({
        type: 'post', id: p.id, title: p.title || 'Post sem título',
        subtitle: p.clients?.name || 'Post', href: `/dashboard/clientes/${p.client_id}`,
      }))
      materialsRes.data?.forEach((m: any) => out.push({
        type: 'material', id: m.id, title: m.title,
        subtitle: m.clients?.name || 'Material', href: `/dashboard/clientes/${m.client_id}`,
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
  }

  return (
    <>
      {/* Gatilho na topbar */}
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-2 px-3 py-1.5 rounded-xl border border-[#EBEAE5] bg-white hover:border-[#D4D1CB] transition-all text-sm text-[#A8A59E] min-w-[200px]"
      >
        <Search size={14} />
        <span className="flex-1 text-left">Buscar...</span>
        <kbd className="text-[10px] bg-[#F2F0EB] px-1.5 py-0.5 rounded font-mono text-[#6B6963]">⌘K</kbd>
      </button>

      {/* Modal */}
      {open && (
        <div
          className="fixed inset-0 bg-black/30 z-[100] flex items-start justify-center pt-[15vh] px-4"
          onClick={e => { if (e.target === e.currentTarget) setOpen(false) }}
        >
          <div className="bg-white rounded-2xl w-full max-w-xl overflow-hidden border border-[#EBEAE5]">
            <div className="flex items-center gap-3 px-4 py-3 border-b border-[#EBEAE5]">
              <Search size={18} className="text-[#A8A59E] flex-shrink-0" />
              <input
                ref={inputRef}
                value={query}
                onChange={e => setQuery(e.target.value)}
                onKeyDown={onKeyDown}
                placeholder="Buscar clientes, posts, materiais..."
                className="flex-1 outline-none text-sm text-[#1A1916] placeholder-[#A8A59E]"
              />
              <button onClick={() => setOpen(false)} className="text-[#A8A59E] hover:text-[#1A1916]">
                <X size={16} />
              </button>
            </div>

            <div className="max-h-80 overflow-y-auto">
              {!query.trim() ? (
                <div className="px-4 py-8 text-center text-sm text-[#A8A59E]">
                  Digite para buscar em todo o sistema
                </div>
              ) : loading ? (
                <div className="px-4 py-8 text-center text-sm text-[#A8A59E]">Buscando...</div>
              ) : results.length === 0 ? (
                <div className="px-4 py-8 text-center text-sm text-[#A8A59E]">Nenhum resultado para "{query}"</div>
              ) : (
                <div className="py-2">
                  {results.map((r, i) => {
                    const Icon = icons[r.type]
                    return (
                      <button
                        key={`${r.type}-${r.id}`}
                        onClick={() => go(r)}
                        onMouseEnter={() => setSelectedIdx(i)}
                        className={`w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors ${i === selectedIdx ? 'bg-[#F2F0EB]' : ''}`}
                      >
                        {r.color ? (
                          <div className="w-8 h-8 rounded-lg flex items-center justify-center text-white text-[10px] font-semibold flex-shrink-0" style={{ background: r.color }}>
                            {r.title.slice(0, 2).toUpperCase()}
                          </div>
                        ) : (
                          <div className="w-8 h-8 rounded-lg bg-[#F2F0EB] flex items-center justify-center flex-shrink-0">
                            <Icon size={15} className="text-[#6B6963]" />
                          </div>
                        )}
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-[#1A1916] truncate">{r.title}</p>
                          <p className="text-xs text-[#A8A59E]">{r.subtitle}</p>
                        </div>
                      </button>
                    )
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  )
}
