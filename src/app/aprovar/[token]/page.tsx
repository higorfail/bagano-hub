'use client'

import { useEffect, useState } from 'react'
import { use } from 'react'
import { createClient } from '@/lib/supabase'
import IPhoneFeed, { FeedPost } from '@/components/IPhoneFeed'
import { CheckCircle, MessageSquare, X } from 'lucide-react'

const months = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro']

interface Schedule {
  id: string; title: string; post_type: string; status: string
  drive_url?: string; copy?: string; scheduled_date?: string
  feed_order?: number; approval_comment?: string
}

export default function ApprovalPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params)
  const supabase = createClient()

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [tokenData, setTokenData] = useState<any>(null)
  const [client, setClient] = useState<any>(null)
  const [posts, setPosts] = useState<FeedPost[]>([])
  const [selected, setSelected] = useState<Schedule | null>(null)
  const [comment, setComment] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [toast, setToast] = useState<string | null>(null)

  const initials = (name: string) => name.split(' ').slice(0, 2).map((w: string) => w[0]).join('').toUpperCase()

  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(null), 2500) }

  async function load() {
    setLoading(true)
    const { data: tk } = await supabase.from('approval_tokens').select('*').eq('token', token).eq('active', true).single()
    if (!tk) { setError('Link inválido ou expirado.'); setLoading(false); return }
    setTokenData(tk)
    const { data: cl } = await supabase.from('clients').select('id, name, color_hex, logo_url').eq('id', tk.client_id).single()
    if (!cl) { setError('Cliente não encontrado.'); setLoading(false); return }
    setClient(cl)
    const { data: sc } = await supabase.from('schedules').select('id, title, post_type, status, drive_url, copy, scheduled_date, feed_order, approval_comment').eq('client_id', tk.client_id).order('feed_order', { ascending: true })
    if (sc) {
      setPosts(sc.map(s => ({
        id: s.id, title: s.title || 'Post',
        type: s.post_type === 'reels' ? 'reel' : s.post_type === 'carousel' ? 'carousel' : 'photo',
        status: s.status === 'approved' ? 'approved' : s.status === 'changes_requested' ? 'changes_requested' : 'pending',
        drive_url: s.drive_url, copy: s.copy, scheduled_date: s.scheduled_date, feed_order: s.feed_order,
      })))
    }
    setLoading(false)
  }

  useEffect(() => { load() }, [token])

  async function handleApprove(postId: string) {
    setSubmitting(true)
    await supabase.from('schedules').update({ status: 'approved', approval_comment: null }).eq('id', postId)
    await load(); setSelected(null); showToast('Post aprovado ✓'); setSubmitting(false)
  }

  async function handleRequestChanges(postId: string) {
    if (!comment.trim()) return
    setSubmitting(true)
    await supabase.from('schedules').update({ status: 'changes_requested', approval_comment: comment }).eq('id', postId)
    await load(); setSelected(null); setComment(''); showToast('Alteração solicitada!'); setSubmitting(false)
  }

  const approved = posts.filter(p => p.status === 'approved').length
  const pending = posts.filter(p => p.status === 'pending').length
  const changes = posts.filter(p => p.status === 'changes_requested').length

  if (loading) return <div className="min-h-screen flex items-center justify-center bg-[var(--color-bg-page)]"><div className="w-5 h-5 border-2 border-gray-300 border-t-gray-700 rounded-full animate-spin" /></div>
  if (error) return <div className="min-h-screen flex items-center justify-center bg-[var(--color-bg-page)]"><p className="text-sm text-gray-500">{error}</p></div>

  return (
    <div className="min-h-screen bg-[var(--color-bg-page)]">
      {toast && <div className="fixed top-4 right-4 z-50 bg-gray-900 text-white text-sm px-4 py-2.5 rounded-xl">{toast}</div>}

      <header className="bg-white border-b border-gray-200 sticky top-0 z-30">
        <div className="max-w-2xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            {client?.logo_url
              ? <img src={client.logo_url} alt={client.name} className="w-8 h-8 rounded-lg object-contain" />
              : <div className="w-8 h-8 rounded-lg flex items-center justify-center text-white text-xs font-medium" style={{ background: client?.color_hex }}>{initials(client?.name || '')}</div>
            }
            <div>
              <p className="text-sm font-semibold text-gray-900">{client?.name}</p>
              <p className="text-xs text-gray-400">{months[(tokenData?.month ?? 1) - 1]} {tokenData?.year}</p>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <div className="text-center"><p className="text-sm font-semibold text-green-600">{approved}</p><p className="text-[10px] text-gray-400">aprovados</p></div>
            <div className="text-center"><p className="text-sm font-semibold text-amber-500">{pending}</p><p className="text-[10px] text-gray-400">pendentes</p></div>
            {changes > 0 && <div className="text-center"><p className="text-sm font-semibold text-red-500">{changes}</p><p className="text-[10px] text-gray-400">alterações</p></div>}
          </div>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-6 py-8">
        <div className="bg-white rounded-2xl border border-gray-200 px-5 py-4 mb-6">
          <p className="text-sm text-gray-500">Veja como o feed vai ficar no Instagram. Clique em cada post para aprovar ou pedir alteração.</p>
        </div>
        <IPhoneFeed
          posts={posts}
          clientName={client?.name}
          clientColor={client?.color_hex}
          clientInitials={initials(client?.name || '')}
          readonly={true}
          onPostClick={async post => {
            const { data } = await supabase.from('schedules').select('*').eq('id', post.id).single()
            if (data) setSelected(data)
          }}
        />
      </main>

      {selected && (
        <div className="fixed inset-0 bg-black/40 z-40 flex items-end sm:items-center justify-center p-4" onClick={e => { if (e.target === e.currentTarget) setSelected(null) }}>
          <div className="bg-white rounded-2xl w-full max-w-sm overflow-hidden">
            {selected.drive_url && (
              <div className="aspect-video bg-gray-100 overflow-hidden">
                <img src={`https://drive.google.com/thumbnail?id=${selected.drive_url.match(/[-\w]{25,}/)?.[0]}&sz=w600`} alt={selected.title} className="w-full h-full object-cover" onError={e => { (e.target as HTMLImageElement).style.display = 'none' }} />
              </div>
            )}
            <div className="p-5">
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-semibold text-gray-900 text-sm">{selected.title}</h3>
                <button onClick={() => setSelected(null)} className="text-gray-400 hover:text-gray-600"><X size={16} /></button>
              </div>
              {selected.copy && (
                <div className="bg-gray-50 rounded-xl p-3 mb-4">
                  <p className="text-[10px] text-gray-400 font-medium mb-1 uppercase tracking-wide">Legenda</p>
                  <p className="text-sm text-gray-700 leading-relaxed">{selected.copy}</p>
                </div>
              )}
              {selected.status !== 'approved' && (
                <div className="mb-4">
                  <div className="flex items-center gap-1.5 mb-1.5"><MessageSquare size={12} className="text-gray-400" /><span className="text-xs text-gray-400">Solicitar alteração</span></div>
                  <textarea value={comment} onChange={e => setComment(e.target.value)} placeholder="Descreva o que precisa mudar..." className="w-full bg-gray-50 border border-gray-200 rounded-xl px-3 py-2.5 text-sm text-gray-700 placeholder-gray-400 resize-none outline-none focus:border-gray-400" rows={3} />
                </div>
              )}
              <div className="flex gap-2">
                {comment.trim() ? (
                  <button onClick={() => handleRequestChanges(selected.id)} disabled={submitting} className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl bg-amber-50 text-amber-700 border border-amber-200 text-sm font-medium disabled:opacity-50">
                    <MessageSquare size={14} />Solicitar alteração
                  </button>
                ) : (
                  <button onClick={() => handleApprove(selected.id)} disabled={submitting || selected.status === 'approved'} className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-medium text-white disabled:opacity-50" style={{ background: selected.status === 'approved' ? '#86efac' : client?.color_hex || '#1a1a1a' }}>
                    <CheckCircle size={14} />{selected.status === 'approved' ? 'Já aprovado ✓' : 'Aprovar post'}
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
