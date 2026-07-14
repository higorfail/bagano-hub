'use client'

import { useEffect, useState } from 'react'
import { use } from 'react'
import { createClient } from '@/lib/supabase'
import { logActivity } from '@/lib/activity'
import { CheckCircle, MessageSquare, RotateCcw, AlertTriangle } from 'lucide-react'
import IPhoneFeed, { FeedPost } from '@/components/IPhoneFeed'

const MONTHS = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro']

const TYPE_LABELS: Record<string, string> = {
  reels: 'Reels', carrossel: 'Carrossel', post: 'Post',
  story: 'Story', carrossel_stories: 'Carrossel/Stories',
}
const TYPE_EMOJIS: Record<string, string> = {
  reels: '🎬', carrossel: '📸', post: '🖼️', story: '⭕', carrossel_stories: '🔁',
}

function CarouselPreview({ folderId, folderUrl }: { folderId: string; folderUrl: string }) {
  const [items, setItems] = useState<{ id: string; name: string; isVideo: boolean }[]>([])
  const [slide, setSlide]   = useState(0)
  const [ready, setReady]   = useState(false)

  useEffect(() => {
    const key = process.env.NEXT_PUBLIC_GOOGLE_API_KEY
    if (!key) { setReady(true); return }
    fetch(`https://www.googleapis.com/drive/v3/files?q=%27${folderId}%27+in+parents&fields=files(id,name,mimeType)&orderBy=name&key=${key}`)
      .then(r => r.json())
      .then(d => {
        const files: { id: string; name: string; mimeType: string }[] = d.files || []
        // Imagens e vídeos juntos, ordenados pelo nome — carrossel misto (fotos + vídeo)
        // mostra o vídeo no lugar certo em vez de descartar ele da visualização.
        const imgs = files.filter(f => f.mimeType.startsWith('image/')).map(f => ({ id: f.id, name: f.name, isVideo: false }))
        const vids = files.filter(f => f.mimeType.startsWith('video/')).map(f => ({ id: f.id, name: f.name, isVideo: true }))
        setItems([...imgs, ...vids].sort((a, b) => a.name.localeCompare(b.name)))
        setReady(true)
      })
      .catch(() => setReady(true))
  }, [folderId])

  if (!ready) return (
    <div style={{ height: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f5f5f3' }}>
      <div style={{ width: 24, height: 24, border: '3px solid #e5e7eb', borderTopColor: '#374151', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
    </div>
  )

  if (items.length === 0) return (
    <a href={folderUrl} target="_blank" rel="noopener noreferrer"
      style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '14px 0', background: '#f5f5f3', fontSize: 13, fontWeight: 600, color: '#374151', textDecoration: 'none' }}>
      📂 Abrir pasta no Drive
    </a>
  )

  const prev = () => setSlide(s => (s - 1 + items.length) % items.length)
  const next = () => setSlide(s => (s + 1) % items.length)
  const current = items[slide]

  return (
    <div style={{ position: 'relative', background: '#111', userSelect: 'none' }}>
      <div style={{ position: 'relative', paddingTop: '100%', overflow: 'hidden' }}>
        {current.isVideo ? (
          <iframe
            key={current.id}
            src={`https://drive.google.com/file/d/${current.id}/preview`}
            allow="autoplay"
            style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', border: 'none' }}
          />
        ) : (
          <img
            key={current.id}
            src={`https://drive.google.com/thumbnail?id=${current.id}&sz=w800`}
            alt={`Slide ${slide + 1}`}
            style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'contain', display: 'block' }}
          />
        )}
      </div>
      {items.length > 1 && (
        <>
          <button onClick={prev} style={{ position: 'absolute', left: 8, top: '50%', transform: 'translateY(-50%)', width: 32, height: 32, borderRadius: '50%', background: 'rgba(0,0,0,0.5)', border: 'none', color: '#fff', fontSize: 18, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', lineHeight: 1 }}>‹</button>
          <button onClick={next} style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', width: 32, height: 32, borderRadius: '50%', background: 'rgba(0,0,0,0.5)', border: 'none', color: '#fff', fontSize: 18, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', lineHeight: 1 }}>›</button>
          <div style={{ position: 'absolute', bottom: 10, left: 0, right: 0, display: 'flex', justifyContent: 'center', gap: 5 }}>
            {items.map((_, i) => (
              <div key={i} onClick={() => setSlide(i)} style={{ width: i === slide ? 16 : 6, height: 6, borderRadius: 3, background: i === slide ? '#fff' : 'rgba(255,255,255,0.45)', cursor: 'pointer', transition: 'width 0.2s, background 0.2s' }} />
            ))}
          </div>
        </>
      )}
      <a href={folderUrl} target="_blank" rel="noopener noreferrer"
        style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '9px 0', background: '#f5f5f3', borderTop: '1px solid #ebebeb', fontSize: 12, fontWeight: 600, color: '#374151', textDecoration: 'none' }}>
        📂 {slide + 1}/{items.length} · Abrir pasta no Drive
      </a>
    </div>
  )
}

type DriveFileInfo = { id: string; name: string; mimeType: string }
function useFolderFiles(folderId: string) {
  const [files, setFiles] = useState<DriveFileInfo[]>([])
  const [ready, setReady] = useState(false)
  useEffect(() => {
    const key = process.env.NEXT_PUBLIC_GOOGLE_API_KEY
    if (!key) { setReady(true); return }
    fetch(`https://www.googleapis.com/drive/v3/files?q=%27${folderId}%27+in+parents&fields=files(id,name,mimeType)&orderBy=name&key=${key}`)
      .then(r => r.json())
      .then(d => { setFiles(d.files || []); setReady(true) })
      .catch(() => setReady(true))
  }, [folderId])
  return { files, ready }
}
function pickCover(images: DriveFileInfo[]) {
  return images.find(f => /^capa\./i.test(f.name)) ?? images[0]
}
const SPINNER = <div style={{ width: 24, height: 24, border: '3px solid #e5e7eb', borderTopColor: '#374151', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />

function FolderThumb({ folderId, maxHeight = 220 }: { folderId: string; maxHeight?: number }) {
  const { files, ready } = useFolderFiles(folderId)
  if (!ready) return <div style={{ height: maxHeight, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f5f5f3' }}>{SPINNER}</div>
  const img = pickCover(files.filter(f => f.mimeType.startsWith('image/')))
  if (!img) return null
  return (
    <div style={{ background: '#f5f5f3', lineHeight: 0, maxHeight, overflow: 'hidden' }}>
      <img src={`https://drive.google.com/thumbnail?id=${img.id}&sz=w800`} alt=""
        style={{ width: '100%', objectFit: 'cover', display: 'block', maxHeight }}
        onError={e => { (e.target as HTMLImageElement).closest('div')!.style.display = 'none' }} />
    </div>
  )
}

function ReelFolderPreview({ folderId, folderUrl }: { folderId: string; folderUrl: string }) {
  const { files, ready } = useFolderFiles(folderId)
  if (!ready) return <div style={{ height: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#111' }}>{SPINNER}</div>
  const videos = files.filter(f => f.mimeType.startsWith('video/'))
  const video  = videos[0]
  // Mostra só o vídeo — a capa da pasta não entra aqui pra não sobrepor o player.
  return video ? (
    <div style={{ background: '#000', lineHeight: 0, position: 'relative', paddingTop: '177.78%', maxHeight: '80vh', overflow: 'hidden' }}>
      <iframe src={`https://drive.google.com/file/d/${video.id}/preview`} allow="autoplay"
        style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', border: 'none' }} />
    </div>
  ) : (
    <a href={folderUrl} target="_blank" rel="noopener noreferrer"
      style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '12px 0', background: '#f5f5f3', borderTop: '1px solid #ebebeb', fontSize: 13, fontWeight: 600, color: '#374151', textDecoration: 'none' }}>
      🎬 Abrir reel no Drive
    </a>
  )
}

function SheetReelFolderVideo({ folderId, folderUrl }: { folderId: string; folderUrl: string }) {
  const { files, ready } = useFolderFiles(folderId)
  if (!ready) return <div style={{ height: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#111' }}>{SPINNER}</div>
  const video = files.find(f => f.mimeType.startsWith('video/'))
  if (!video) return (
    <a href={folderUrl} target="_blank" rel="noopener noreferrer"
      style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '18px 0', background: '#111', fontSize: 14, fontWeight: 600, color: '#fff', textDecoration: 'none' }}>
      🎬 Assistir reel no Drive
    </a>
  )
  return (
    <div style={{ background: '#000', lineHeight: 0, position: 'relative', paddingTop: '177.78%', maxHeight: '80vh', overflow: 'hidden' }}>
      <iframe src={`https://drive.google.com/file/d/${video.id}/preview`} allow="autoplay"
        style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', border: 'none' }} />
    </div>
  )
}

function initials(name: string) {
  return (name || '?').split(' ').slice(0, 2).map((w: string) => w[0]).join('').toUpperCase()
}
function mapType(t: string): FeedPost['type'] {
  if (t === 'reels') return 'reel'
  if (t === 'carrossel' || t === 'carrossel_stories') return 'carousel'
  if (t === 'story') return 'story'
  return 'photo'
}
function mapStatus(s: Post): FeedPost['status'] {
  if (s.approval_status === 'aprovado') return 'approved'
  if (s.approval_status === 'não aprovado') return 'changes_requested'
  return 'pending'
}

interface Post {
  id: string; title: string; post_type: string; status: string
  drive_url?: string; drive_folder_url?: string; copy?: string; legenda?: string; briefing?: string; scheduled_date?: string
  post_number?: number; approval_comment?: string; approval_status?: string
  funil?: string; campaign_type?: string
}

export default function ApprovalPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params)
  const supabase  = createClient()

  const [loading,      setLoading]      = useState(true)
  const [error,        setError]        = useState<string | null>(null)
  const [tokenData,    setTokenData]    = useState<any>(null)
  const [client,       setClient]       = useState<any>(null)
  const [posts,        setPosts]        = useState<Post[]>([])
  const [extras,       setExtras]       = useState<any[]>([])
  const [submitting,       setSubmitting]       = useState<string | null>(null)
  const [extraSubmitting,  setExtraSubmitting]  = useState<string | null>(null)
  const [toast,        setToast]        = useState<{ msg: string; ok: boolean } | null>(null)
  const [expanded,     setExpanded]     = useState<Set<string>>(new Set())
  const [commenting,   setCommenting]   = useState<Set<string>>(new Set())
  const [comments,     setComments]     = useState<Record<string, string>>({})
  const [extraComments,    setExtraComments]    = useState<Record<string, string>>({})
  const [extraCommenting,  setExtraCommenting]  = useState<Set<string>>(new Set())
  const [approvingAll, setApprovingAll] = useState(false)
  const [tab,          setTab]          = useState<'feed' | 'calendario' | 'posts'>('feed')

  // Feed-tab: selected post for bottom sheet
  const [sheetPost,    setSheetPost]    = useState<Post | null>(null)
  const [sheetComment, setSheetComment] = useState('')

  useEffect(() => {
    if (!client || !tokenData) return
    const label = tokenData.type === 'cronograma' ? 'Aprovação do Cronograma' : 'Aprovação Final'
    document.title = `${label} · ${client.name}`
  }, [client, tokenData])

  // Página pública: força tema claro (não segue o dark mode do dispositivo do cliente)
  useEffect(() => {
    const html = document.documentElement
    const prev = html.getAttribute('data-theme')
    html.setAttribute('data-theme', 'light')
    return () => { if (prev) html.setAttribute('data-theme', prev); else html.removeAttribute('data-theme') }
  }, [])

  const showToast = (msg: string, ok = true) => {
    setToast({ msg, ok }); setTimeout(() => setToast(null), 3500)
  }

  async function load() {
    setLoading(true)
    const { data: tk } = await supabase
      .from('approval_tokens').select('*').eq('token', token).eq('active', true).single()
    if (!tk) { setError('Link inválido ou expirado.'); setLoading(false); return }
    setTokenData(tk)
    const { data: cl } = await supabase
      .from('clients').select('id, name, color_hex, logo_url, instagram_url').eq('id', tk.client_id).single()
    if (!cl) { setError('Cliente não encontrado.'); setLoading(false); return }
    setClient(cl)
    const baseQuery = supabase.from('schedules')
      .select('id, title, post_type, status, drive_url, drive_folder_url, copy, legenda, briefing, scheduled_date, post_number, approval_comment, approval_status, funil, campaign_type')
      .eq('client_id', tk.client_id)
      .eq('month', tk.month)
      .eq('year',  tk.year)
      .order('post_number', { ascending: true })
    const schedulesQuery = tk.type === 'cronograma'
      ? baseQuery.eq('status', 'aguardando_aprovacao_crono')
      : baseQuery.eq('status', 'aguardando_aprovacao')

    const [{ data: sc }, { data: ex }] = await Promise.all([
      schedulesQuery,
      supabase.from('extras')
        .select('id, title, type, description, due_date, needs_client_approval, client_approval_status, client_approval_comment')
        .eq('client_id', tk.client_id)
        .eq('needs_client_approval', true)
        .not('client_approval_status', 'in', '("aprovado","recusado")')
        .order('created_at', { ascending: true }),
    ])
    setPosts(sc || [])
    setExtras(ex || [])
    setLoading(false)
  }

  useEffect(() => { load() }, [token])

  // ── Derived feed posts (keep in sync with posts state) ─────────────────────
  const feedPosts: FeedPost[] = posts.map(p => ({
    id: p.id, title: p.title, type: mapType(p.post_type), status: mapStatus(p),
    drive_url: (p as any).drive_url, drive_folder_url: (p as any).drive_folder_url,
    copy: p.copy, legenda: p.legenda, scheduled_date: p.scheduled_date, post_number: (p as any).post_number,
  }))

  // ── Actions ────────────────────────────────────────────────────────────────
  async function approve(postId: string) {
    setSubmitting(postId)
    await supabase.from('schedules').update({ approval_status: 'aprovado', approval_comment: null, status: 'aprovado' }).eq('id', postId)
    setPosts(prev => prev.map(p => p.id === postId ? { ...p, approval_status: 'aprovado', status: 'aprovado', approval_comment: undefined } : p))
    logActivity({ tableName: 'schedules', recordId: postId, clientId: tokenData?.client_id, action: 'client_approved', actorName: client?.name || 'Cliente', description: `Cliente aprovou o post` })
    setCommenting(s => { const n = new Set(s); n.delete(postId); return n })
    setSheetPost(null); setSheetComment('')
    showToast('Post aprovado! ✓')
    setSubmitting(null)
  }

  async function requestChanges(postId: string, comment: string) {
    const c = comment.trim(); if (!c) return
    setSubmitting(postId)
    await supabase.from('schedules').update({ approval_status: 'não aprovado', approval_comment: c, status: 'ajuste' }).eq('id', postId)
    setPosts(prev => prev.map(p => p.id === postId ? { ...p, approval_status: 'não aprovado', approval_comment: c, status: 'ajuste' } : p))
    logActivity({ tableName: 'schedules', recordId: postId, clientId: tokenData?.client_id, action: 'client_rejected', actorName: client?.name || 'Cliente', description: `Cliente solicitou alterações: "${c}"` })
    setCommenting(s => { const n = new Set(s); n.delete(postId); return n })
    setComments(cc => { const n = { ...cc }; delete n[postId]; return n })
    setSheetPost(null); setSheetComment('')
    showToast('Alteração enviada!', false)
    setSubmitting(null)
  }

  async function undo(postId: string) {
    setSubmitting(postId)
    await supabase.from('schedules').update({ approval_status: null, approval_comment: null, status: 'aguardando_aprovacao' }).eq('id', postId)
    setPosts(prev => prev.map(p => p.id === postId ? { ...p, approval_status: undefined, approval_comment: undefined, status: 'aguardando_aprovacao' } : p))
    setSubmitting(null)
  }

  async function approveAll() {
    const pending = posts.filter(p => p.approval_status !== 'aprovado' && p.approval_status !== 'não aprovado')
    if (!pending.length) return
    setApprovingAll(true)
    await Promise.all([
      ...pending.map(p => supabase.from('schedules').update({ approval_status: 'aprovado', approval_comment: null, status: 'aprovado' }).eq('id', p.id)),
      ...pending.map(p => logActivity({ tableName: 'schedules', recordId: p.id, clientId: tokenData?.client_id, action: 'client_approved', actorName: client?.name || 'Cliente', description: `Cliente aprovou o post` })),
    ])
    setPosts(prev => prev.map(p =>
      pending.find(pp => pp.id === p.id) ? { ...p, approval_status: 'aprovado', status: 'aprovado', approval_comment: undefined } : p
    ))
    showToast(`${pending.length} posts aprovados! 🎉`)
    setApprovingAll(false)
  }

  // ── Cronograma approval actions ────────────────────────────────────────────
  async function approveCrono(postId: string) {
    setSubmitting(postId)
    await supabase.from('schedules').update({ status: 'producao', approval_status: 'aprovado', approval_comment: null }).eq('id', postId)
    setPosts(prev => prev.map(p => p.id === postId ? { ...p, status: 'producao', approval_status: 'aprovado' } : p))
    logActivity({ tableName: 'schedules', recordId: postId, clientId: tokenData?.client_id, action: 'crono_approved', actorName: client?.name || 'Cliente', description: 'Cliente aprovou a estratégia do post' })
    showToast('Post aprovado! ✓')
    setSubmitting(null)
  }

  async function rejectCrono(postId: string, comment: string) {
    const c = comment.trim(); if (!c) return
    setSubmitting(postId)
    await supabase.from('schedules').update({ status: 'estrategia', approval_status: 'não aprovado', approval_comment: c }).eq('id', postId)
    setPosts(prev => prev.map(p => p.id === postId ? { ...p, status: 'estrategia', approval_status: 'não aprovado', approval_comment: c } : p))
    logActivity({ tableName: 'schedules', recordId: postId, clientId: tokenData?.client_id, action: 'crono_rejected', actorName: client?.name || 'Cliente', description: `Cliente pediu ajuste na estratégia: "${c}"` })
    setCommenting(s => { const n = new Set(s); n.delete(postId); return n })
    setComments(cc => { const n = { ...cc }; delete n[postId]; return n })
    showToast('Solicitação enviada!', false)
    setSubmitting(null)
  }

  async function approveAllCrono() {
    const pending = posts.filter(p => p.status === 'aguardando_aprovacao_crono')
    if (!pending.length) return
    setApprovingAll(true)
    await Promise.all([
      ...pending.map(p => supabase.from('schedules').update({ status: 'producao', approval_status: 'aprovado', approval_comment: null }).eq('id', p.id)),
      ...pending.map(p => logActivity({ tableName: 'schedules', recordId: p.id, clientId: tokenData?.client_id, action: 'crono_approved', actorName: client?.name || 'Cliente', description: 'Cliente aprovou a estratégia do post' })),
    ])
    setPosts(prev => prev.map(p => pending.find(pp => pp.id === p.id) ? { ...p, status: 'producao', approval_status: 'aprovado' } : p))
    showToast(`${pending.length} posts aprovados! 🎉`)
    setApprovingAll(false)
  }

  async function approveExtra(extraId: string) {
    setExtraSubmitting(extraId)
    await supabase.from('extras').update({ client_approval_status: 'aprovado', client_approval_comment: null }).eq('id', extraId)
    setExtras(prev => prev.filter(e => e.id !== extraId))
    showToast('Extra aprovado! ✓')
    setExtraSubmitting(null)
  }

  async function rejectExtra(extraId: string, comment: string) {
    const c = comment.trim(); if (!c) return
    setExtraSubmitting(extraId)
    await supabase.from('extras').update({ client_approval_status: 'recusado', client_approval_comment: c }).eq('id', extraId)
    setExtras(prev => prev.filter(e => e.id !== extraId))
    setExtraCommenting(s => { const n = new Set(s); n.delete(extraId); return n })
    setExtraComments(cc => { const n = { ...cc }; delete n[extraId]; return n })
    showToast('Recusa enviada.', false)
    setExtraSubmitting(null)
  }

  // Story callbacks for IPhoneFeed
  async function handleStoryApprove(fp: FeedPost) {
    await approve(fp.id)
  }
  async function handleStoryReject(fp: FeedPost, c: string) {
    await requestChanges(fp.id, c)
  }

  // Stats
  const totalPosts    = posts.length
  const approvedCount = posts.filter(p => p.approval_status === 'aprovado').length
  const changesCount  = posts.filter(p => p.approval_status === 'não aprovado').length
  const pendingCount  = posts.filter(p => !p.approval_status || !['aprovado','não aprovado'].includes(p.approval_status)).length
  const pct           = totalPosts > 0 ? (approvedCount / totalPosts) * 100 : 0
  const allDone       = totalPosts > 0 && approvedCount === totalPosts

  // ── Loading / error ────────────────────────────────────────────────────────
  if (loading) return (
    <div style={{ minHeight: '100dvh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f8f8f6' }}>
      <div style={{ width: 32, height: 32, border: '3px solid #e5e7eb', borderTopColor: '#374151', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
      <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
    </div>
  )
  if (error) return (
    <div style={{ minHeight: '100dvh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12, background: '#f8f8f6', padding: 24 }}>
      <AlertTriangle size={36} color="#ef4444" />
      <p style={{ fontSize: 16, fontWeight: 700, color: '#111', textAlign: 'center', margin: 0 }}>{error}</p>
      <p style={{ fontSize: 13, color: '#9ca3af', textAlign: 'center', margin: 0 }}>Solicite um novo link de aprovação.</p>
    </div>
  )

  const cc = client?.color_hex || '#111111'

  // ── Cronograma approval render ─────────────────────────────────────────────
  if (tokenData?.type === 'cronograma') {
    const cronoPending  = posts.filter(p => p.status === 'aguardando_aprovacao_crono').length
    const cronoApproved = posts.filter(p => p.approval_status === 'aprovado').length
    const allCronoDone  = posts.length > 0 && cronoPending === 0
    const pctCrono      = posts.length > 0 ? (cronoApproved / posts.length) * 100 : 0

    const campaigns  = [...new Set(posts.map(p => p.campaign_type).filter(Boolean))] as string[]
    const byCampaign = campaigns.map(ct => ({ name: ct, posts: posts.filter(p => p.campaign_type === ct) }))
    const noCampaign = posts.filter(p => !p.campaign_type)

    function renderCronoCard(post: Post) {
      const isApproved = post.approval_status === 'aprovado'
      const isChanged  = post.approval_status === 'não aprovado'
      const isComm     = commenting.has(post.id)
      const comment    = comments[post.id] || ''
      const isLoading  = submitting === post.id

      return (
        <div key={post.id} style={{ background: '#fff', borderRadius: 22, border: `1.5px solid ${isApproved ? '#86efac' : isChanged ? '#fcd34d' : '#ebebeb'}`, overflow: 'hidden', boxShadow: isApproved ? '0 2px 12px rgba(34,197,94,0.08)' : '0 1px 4px rgba(0,0,0,0.06)' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 16px', background: isApproved ? '#f0fdf4' : isChanged ? '#fffbeb' : '#fafafa', borderBottom: `1px solid ${isApproved ? '#86efac' : isChanged ? '#fcd34d' : '#ebebeb'}` }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 11, fontWeight: 800, color: '#c4c4c0', letterSpacing: '0.05em' }}>#{String(post.post_number || 1).padStart(2, '0')}</span>
              <span style={{ fontSize: 12, fontWeight: 700, color: '#555', background: '#f0f0ee', padding: '2px 9px', borderRadius: 100 }}>{TYPE_EMOJIS[post.post_type]} {TYPE_LABELS[post.post_type]}</span>
              {post.scheduled_date && <span style={{ fontSize: 11, color: '#9ca3af' }}>{new Date(post.scheduled_date + 'T12:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })}</span>}
              {post.funil && <span style={{ fontSize: 10, fontWeight: 600, color: '#6b7280', background: '#f3f4f6', padding: '1px 7px', borderRadius: 100 }}>{post.funil.split(' ')[0]}</span>}
            </div>
            <span style={{ fontSize: 11, fontWeight: 700, color: isApproved ? '#16a34a' : isChanged ? '#b45309' : '#9ca3af' }}>
              {isApproved ? '✓ Aprovado' : isChanged ? '⚠ Revisar' : '● Pendente'}
            </span>
          </div>

          <div style={{ padding: '16px 18px' }}>
            <h3 style={{ fontSize: 17, fontWeight: 800, color: '#111', margin: '0 0 12px', lineHeight: 1.3, letterSpacing: '-0.02em' }}>{post.title}</h3>

            {post.briefing && (
              <div style={{ marginBottom: 14 }}>
                <p style={{ fontSize: 11, fontWeight: 700, color: '#b0b0b0', margin: '0 0 6px', textTransform: 'uppercase', letterSpacing: '0.07em' }}>Estratégia / Briefing</p>
                <div style={{ background: '#fafaf8', borderRadius: 14, padding: '12px 14px', border: '1px solid #f0f0ec' }}>
                  <p style={{ fontSize: 14, color: '#374151', lineHeight: 1.7, margin: 0, whiteSpace: 'pre-wrap' }}>{post.briefing}</p>
                </div>
              </div>
            )}

            {post.copy && (
              <div style={{ marginBottom: 16 }}>
                <p style={{ fontSize: 11, fontWeight: 700, color: '#b0b0b0', margin: '0 0 6px', textTransform: 'uppercase', letterSpacing: '0.07em' }}>Rascunho de copy</p>
                <div style={{ background: '#f8f6ff', borderRadius: 14, padding: '12px 14px', border: '1px solid #e8e0f9' }}>
                  <p style={{ fontSize: 14, color: '#374151', lineHeight: 1.7, margin: 0, whiteSpace: 'pre-wrap' }}>{post.copy}</p>
                </div>
              </div>
            )}

            {isChanged && post.approval_comment && (
              <div style={{ background: '#fffbeb', border: '1.5px solid #fde68a', borderRadius: 14, padding: '11px 14px', marginBottom: 14 }}>
                <p style={{ fontSize: 10, color: '#92400e', fontWeight: 800, margin: '0 0 4px', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Sua solicitação</p>
                <p style={{ fontSize: 13, color: '#78350f', margin: 0, fontStyle: 'italic', lineHeight: 1.5 }}>"{post.approval_comment}"</p>
              </div>
            )}

            {isComm && (
              <div style={{ marginBottom: 14 }}>
                <p style={{ fontSize: 12, color: '#6b7280', margin: '0 0 8px', fontWeight: 600 }}>O que precisa mudar?</p>
                <textarea autoFocus value={comment}
                  onChange={e => setComments(c => ({ ...c, [post.id]: e.target.value }))}
                  placeholder="Ex: Mudar o foco para o produto B, ajustar a data..."
                  rows={3}
                  style={{ width: '100%', background: '#fff', border: `2px solid ${cc}`, borderRadius: 14, padding: '13px 16px', fontSize: 15, color: '#111', resize: 'none', outline: 'none', boxSizing: 'border-box', lineHeight: 1.5, fontFamily: 'inherit' }}
                />
              </div>
            )}

            {isApproved ? (
              <div style={{ display: 'flex', gap: 10 }}>
                <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '14px 0', borderRadius: 16, background: '#f0fdf4', border: '1.5px solid #86efac', fontSize: 15, fontWeight: 700, color: '#16a34a' }}>
                  <CheckCircle size={17} strokeWidth={2.5} /> Aprovado
                </div>
                <button onClick={() => { supabase.from('schedules').update({ status: 'aguardando_aprovacao_crono', approval_status: null }).eq('id', post.id); setPosts(prev => prev.map(p => p.id === post.id ? { ...p, status: 'aguardando_aprovacao_crono', approval_status: undefined } : p)) }}
                  style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '14px 16px', borderRadius: 16, background: '#fff', border: '1.5px solid #e5e7eb', fontSize: 13, fontWeight: 600, color: '#9ca3af', cursor: 'pointer', flexShrink: 0 }}>
                  <RotateCcw size={13} /> Desfazer
                </button>
              </div>
            ) : isComm ? (
              <div style={{ display: 'flex', gap: 10 }}>
                <button onClick={() => { setCommenting(s => { const n = new Set(s); n.delete(post.id); return n }); setComments(c => { const n = { ...c }; delete n[post.id]; return n }) }}
                  style={{ padding: '14px 18px', borderRadius: 16, background: '#f3f4f6', border: 'none', fontSize: 14, fontWeight: 600, color: '#6b7280', cursor: 'pointer' }}>Cancelar</button>
                <button onClick={() => rejectCrono(post.id, comment)} disabled={!comment.trim() || !!isLoading}
                  style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '14px 0', borderRadius: 16, background: '#fef3c7', border: '1.5px solid #fde68a', fontSize: 14, fontWeight: 700, color: '#92400e', cursor: comment.trim() ? 'pointer' : 'default', opacity: !comment.trim() || isLoading ? 0.5 : 1 }}>
                  <MessageSquare size={15} /> Enviar pedido
                </button>
              </div>
            ) : (
              <div style={{ display: 'flex', gap: 10 }}>
                <button onClick={() => setCommenting(s => { const n = new Set(s); n.add(post.id); return n })}
                  style={{ padding: '14px 18px', borderRadius: 16, background: '#f3f4f6', border: '1.5px solid #ebebeb', fontSize: 14, fontWeight: 600, color: '#374151', cursor: 'pointer', whiteSpace: 'nowrap' }}>✏️ Pedir ajuste</button>
                <button onClick={() => approveCrono(post.id)} disabled={!!isLoading}
                  style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '14px 0', borderRadius: 16, background: cc, border: 'none', fontSize: 15, fontWeight: 800, color: '#fff', cursor: 'pointer', opacity: isLoading ? 0.7 : 1, boxShadow: `0 6px 24px ${cc}44`, letterSpacing: '-0.02em' }}>
                  {isLoading ? '…' : <><CheckCircle size={17} strokeWidth={2.5} /> Aprovar</>}
                </button>
              </div>
            )}
          </div>
        </div>
      )
    }

    return (
      <div style={{ minHeight: '100dvh', background: '#f8f8f6', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif', paddingBottom: cronoPending > 0 && !allCronoDone ? 90 : 32 }}>
        {toast && (
          <div style={{ position: 'fixed', top: 20, left: '50%', transform: 'translateX(-50%)', zIndex: 9999, background: toast.ok ? '#111' : '#d97706', color: '#fff', fontSize: 14, fontWeight: 600, padding: '11px 22px', borderRadius: 100, boxShadow: '0 8px 40px rgba(0,0,0,0.22)', display: 'flex', alignItems: 'center', gap: 8, whiteSpace: 'nowrap' }}>
            {toast.ok ? <CheckCircle size={15} /> : <MessageSquare size={15} />}
            {toast.msg}
          </div>
        )}

        <header style={{ background: '#fff', borderBottom: '1px solid #ebebeb', position: 'sticky', top: 0, zIndex: 30 }}>
          <div style={{ maxWidth: 600, margin: '0 auto', padding: '14px 16px 12px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
              {client?.logo_url
                ? <img src={client.logo_url} alt={client.name} style={{ width: 44, height: 44, borderRadius: 14, objectFit: 'contain', flexShrink: 0, border: '1px solid #f0f0f0' }} />
                : <div style={{ width: 44, height: 44, borderRadius: 14, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 15, fontWeight: 800, background: cc, flexShrink: 0 }}>{initials(client?.name || '')}</div>
              }
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ fontSize: 16, fontWeight: 800, color: '#111', margin: 0, letterSpacing: '-0.02em', lineHeight: 1.2 }}>{client?.name}</p>
                <p style={{ fontSize: 12, color: '#9ca3af', margin: '2px 0 0' }}>Aprovação do Cronograma · {MONTHS[(tokenData?.month ?? 1) - 1]} {tokenData?.year}</p>
              </div>
              <div style={{ textAlign: 'right', flexShrink: 0 }}>
                <p style={{ margin: 0, lineHeight: 1 }}>
                  <span style={{ fontSize: 22, fontWeight: 900, color: allCronoDone ? '#16a34a' : '#111', letterSpacing: '-0.04em' }}>{cronoApproved}</span>
                  <span style={{ fontSize: 13, color: '#d1d5db', fontWeight: 500 }}>/{posts.length}</span>
                </p>
                <p style={{ fontSize: 10, color: '#b0b0b0', margin: '3px 0 0', letterSpacing: '0.02em' }}>APROVADOS</p>
              </div>
            </div>
            <div style={{ height: 4, background: '#f3f3f1', borderRadius: 2, overflow: 'hidden', marginBottom: 10 }}>
              <div style={{ height: '100%', borderRadius: 2, background: allCronoDone ? '#22c55e' : cc, width: `${pctCrono}%`, transition: 'width 0.5s cubic-bezier(0.4,0,0.2,1)' }} />
            </div>
            <p style={{ fontSize: 13, color: '#6b7280', margin: 0, lineHeight: 1.5 }}>
              Revise a <strong style={{ color: '#111' }}>estratégia de cada post</strong>. Após sua aprovação, nossa equipe cria as artes e vídeos.
            </p>
          </div>
        </header>

        <main style={{ maxWidth: 560, margin: '0 auto', padding: '20px 16px 0' }}>
          {posts.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '48px 20px', background: '#fff', borderRadius: 24, border: '1px solid #ebebeb' }}>
              <p style={{ fontSize: 32, marginBottom: 12, lineHeight: 1 }}>📋</p>
              <p style={{ fontSize: 16, fontWeight: 700, color: '#111', margin: '0 0 8px' }}>Nenhum post para revisar</p>
              <p style={{ fontSize: 14, color: '#9ca3af', margin: 0 }}>Todos os posts já foram processados.</p>
            </div>
          ) : allCronoDone ? (
            <div style={{ textAlign: 'center', padding: '32px 20px 28px', background: '#fff', borderRadius: 24, border: '1.5px solid #86efac', boxShadow: '0 2px 16px rgba(34,197,94,0.1)' }}>
              <div style={{ fontSize: 56, marginBottom: 14, lineHeight: 1 }}>🎉</div>
              <h2 style={{ fontSize: 22, fontWeight: 900, color: '#111', margin: '0 0 10px', letterSpacing: '-0.03em' }}>Cronograma aprovado!</h2>
              <p style={{ fontSize: 14, color: '#6b7280', margin: 0, lineHeight: 1.65 }}>
                Obrigado! Nossa equipe já vai para a produção das artes e vídeos.
              </p>
            </div>
          ) : (
            <>
              <div style={{ background: '#fff', borderRadius: 18, padding: '14px 18px', marginBottom: 20, border: '1px solid #ebebeb', display: 'flex', gap: 14, alignItems: 'flex-start' }}>
                <div style={{ width: 40, height: 40, borderRadius: 12, background: cc + '18', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontSize: 20 }}>📋</div>
                <div>
                  <p style={{ fontSize: 14, fontWeight: 700, color: '#111', margin: '0 0 4px', letterSpacing: '-0.01em' }}>Aprove a estratégia</p>
                  <p style={{ fontSize: 13, color: '#6b7280', margin: 0, lineHeight: 1.55 }}>
                    Ainda não há artes — você está aprovando a <strong style={{ color: '#111' }}>ideia e direcionamento</strong> de cada post. Se precisar de ajuste, toque em <strong style={{ color: '#111' }}>Pedir ajuste</strong>.
                  </p>
                </div>
              </div>

              {byCampaign.map(({ name, posts: cposts }) => (
                <div key={name} style={{ marginBottom: 24 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
                    <div style={{ flex: 1, height: 1, background: '#ebebeb' }} />
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, background: cc + '15', border: `1px solid ${cc}33`, borderRadius: 100, padding: '4px 12px' }}>
                      <span style={{ fontSize: 12 }}>📣</span>
                      <p style={{ fontSize: 12, fontWeight: 700, color: cc, margin: 0 }}>Mini campanha: {name}</p>
                      <span style={{ fontSize: 11, color: cc + 'aa', fontWeight: 600 }}>{cposts.length} posts</span>
                    </div>
                    <div style={{ flex: 1, height: 1, background: '#ebebeb' }} />
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>{cposts.map(p => renderCronoCard(p))}</div>
                </div>
              ))}

              {noCampaign.length > 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>{noCampaign.map(p => renderCronoCard(p))}</div>
              )}
            </>
          )}
          <p style={{ textAlign: 'center', fontSize: 11, color: '#d1d5db', marginTop: 28 }}>Powered by Bagano Hub</p>
        </main>

        {cronoPending > 0 && !allCronoDone && (
          <div style={{ position: 'fixed', bottom: 0, left: 0, right: 0, padding: '10px 16px 20px', background: 'rgba(248,248,246,0.95)', backdropFilter: 'blur(16px)', WebkitBackdropFilter: 'blur(16px)', borderTop: '1px solid #ebebeb', zIndex: 20 }}>
            <div style={{ maxWidth: 560, margin: '0 auto' }}>
              <button onClick={approveAllCrono} disabled={approvingAll}
                style={{ width: '100%', padding: '17px 0', borderRadius: 18, background: cc, border: 'none', fontSize: 15, fontWeight: 800, color: '#fff', cursor: 'pointer', opacity: approvingAll ? 0.7 : 1, boxShadow: `0 8px 36px ${cc}55`, letterSpacing: '-0.02em' }}>
                {approvingAll ? 'Aprovando…' : `Aprovar todos os ${cronoPending} posts pendentes`}
              </button>
            </div>
          </div>
        )}
        <style>{`* { -webkit-tap-highlight-color: transparent; box-sizing: border-box; } @keyframes spin { to { transform: rotate(360deg) } }`}</style>
      </div>
    )
  }

  // ── Final approval render ──────────────────────────────────────────────────
  return (
    <div style={{ minHeight: '100dvh', background: '#f8f8f6', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif', paddingBottom: 32 }}>

      {/* Toast */}
      {toast && (
        <div style={{ position: 'fixed', top: 20, left: '50%', transform: 'translateX(-50%)', zIndex: 9999, background: toast.ok ? '#111' : '#d97706', color: '#fff', fontSize: 14, fontWeight: 600, padding: '11px 22px', borderRadius: 100, boxShadow: '0 8px 40px rgba(0,0,0,0.22)', display: 'flex', alignItems: 'center', gap: 8, whiteSpace: 'nowrap', letterSpacing: '-0.01em' }}>
          {toast.ok ? <CheckCircle size={15} /> : <MessageSquare size={15} />}
          {toast.msg}
        </div>
      )}

      {/* ── HEADER ──────────────────────────────────────────────────── */}
      <header style={{ background: '#fff', borderBottom: '1px solid #ebebeb', position: 'sticky', top: 0, zIndex: 30 }}>
        <div style={{ maxWidth: 600, margin: '0 auto', padding: '14px 16px 0' }}>

          {/* Logo + name + counter */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 }}>
            {client?.logo_url
              ? <img src={client.logo_url} alt={client.name} style={{ width: 44, height: 44, borderRadius: 14, objectFit: 'contain', flexShrink: 0, border: '1px solid #f0f0f0' }} />
              : <div style={{ width: 44, height: 44, borderRadius: 14, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 15, fontWeight: 800, background: cc, flexShrink: 0 }}>{initials(client?.name || '')}</div>
            }
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{ fontSize: 16, fontWeight: 800, color: '#111', margin: 0, letterSpacing: '-0.02em', lineHeight: 1.2 }}>{client?.name}</p>
              <p style={{ fontSize: 12, color: '#9ca3af', margin: '2px 0 0' }}>Aprovação Final · {MONTHS[(tokenData?.month ?? 1) - 1]} {tokenData?.year}</p>
            </div>
            <div style={{ textAlign: 'right', flexShrink: 0 }}>
              <p style={{ margin: 0, lineHeight: 1 }}>
                <span style={{ fontSize: 22, fontWeight: 900, color: allDone ? '#16a34a' : '#111', letterSpacing: '-0.04em' }}>{approvedCount}</span>
                <span style={{ fontSize: 13, color: '#d1d5db', fontWeight: 500 }}>/{totalPosts}</span>
              </p>
              <p style={{ fontSize: 10, color: '#b0b0b0', margin: '3px 0 0', letterSpacing: '0.02em' }}>APROVADOS</p>
            </div>
          </div>

          {/* Progress bar */}
          <div style={{ height: 4, background: '#f3f3f1', borderRadius: 2, overflow: 'hidden', marginBottom: 12 }}>
            <div style={{ height: '100%', borderRadius: 2, background: allDone ? '#22c55e' : cc, width: `${pct}%`, transition: 'width 0.5s cubic-bezier(0.4,0,0.2,1)' }} />
          </div>

          {/* Status pills */}
          <div style={{ display: 'flex', gap: 6, marginBottom: 12, overflowX: 'auto' }}>
            {pendingCount > 0 && <span style={{ fontSize: 11, fontWeight: 700, background: '#f3f4f6', color: '#6b7280', padding: '4px 10px', borderRadius: 100, whiteSpace: 'nowrap' }}>{pendingCount} pendente{pendingCount !== 1 ? 's' : ''}</span>}
            {changesCount > 0 && <span style={{ fontSize: 11, fontWeight: 700, background: '#fef3c7', color: '#b45309', padding: '4px 10px', borderRadius: 100, whiteSpace: 'nowrap' }}>⚠ {changesCount} alteração{changesCount !== 1 ? 'ões' : ''}</span>}
            {approvedCount > 0 && <span style={{ fontSize: 11, fontWeight: 700, background: '#f0fdf4', color: '#16a34a', padding: '4px 10px', borderRadius: 100, whiteSpace: 'nowrap' }}>✓ {approvedCount} aprovado{approvedCount !== 1 ? 's' : ''}</span>}
          </div>

          {/* Tab switcher */}
          <div style={{ display: 'flex', gap: 2, background: '#f3f3f1', borderRadius: 14, padding: 3, marginBottom: 0 }}>
            {([
              { key: 'feed',       label: '📱 Feed'        },
              { key: 'calendario', label: '📅 Calendário'  },
              { key: 'posts',      label: '✅ Aprovar'     },
            ] as const).map(t => (
              <button key={t.key} onClick={() => setTab(t.key)}
                style={{
                  flex: 1, padding: '9px 0', borderRadius: 11, border: 'none', cursor: 'pointer',
                  fontSize: 13, fontWeight: tab === t.key ? 700 : 500,
                  background: tab === t.key ? '#fff' : 'transparent',
                  color: tab === t.key ? '#111' : '#9ca3af',
                  boxShadow: tab === t.key ? '0 1px 4px rgba(0,0,0,0.1)' : 'none',
                  transition: 'all 0.2s', letterSpacing: '-0.01em',
                }}>
                {t.label}
              </button>
            ))}
          </div>
        </div>
      </header>

      {/* ── FEED TAB ────────────────────────────────────────────────── */}
      {tab === 'feed' && (
        <div style={{ maxWidth: 600, margin: '0 auto', padding: '24px 16px' }}>

          {/* Tip: posts tab is easier */}
          <button onClick={() => setTab('posts')}
            style={{ width: '100%', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px', borderRadius: 16, background: '#fff', border: '1.5px solid #e5e7eb', cursor: 'pointer', textAlign: 'left' }}>
            <span style={{ fontSize: 22, flexShrink: 0 }}>✅</span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{ fontSize: 13, fontWeight: 700, color: '#111', margin: 0, letterSpacing: '-0.01em' }}>Prefere aprovar mais rápido?</p>
              <p style={{ fontSize: 12, color: '#9ca3af', margin: '2px 0 0' }}>Use a aba <strong style={{ color: '#374151' }}>Aprovar posts</strong> — você vê o texto e aprova um por um, sem precisar navegar pelo feed.</p>
            </div>
            <span style={{ fontSize: 18, color: '#9ca3af', flexShrink: 0 }}>›</span>
          </button>

          {/* Stories tip if any */}
          {posts.some(p => p.post_type === 'story' && p.approval_status !== 'aprovado') && (
            <div style={{ background: 'linear-gradient(135deg,#dc2743,#cc2366,#bc1888)', borderRadius: 18, padding: '14px 18px', marginBottom: 20, display: 'flex', alignItems: 'center', gap: 14, boxShadow: '0 6px 24px rgba(220,39,67,0.25)' }}>
              <div style={{ width: 44, height: 44, borderRadius: '50%', background: 'rgba(255,255,255,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontSize: 22 }}>⭕</div>
              <div>
                <p style={{ fontSize: 14, fontWeight: 800, color: '#fff', margin: '0 0 3px', letterSpacing: '-0.01em' }}>Stories aguardando aprovação</p>
                <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.8)', margin: 0 }}>Toque nos círculos coloridos no topo do feed para aprovar cada story.</p>
              </div>
            </div>
          )}

          {/* iPhone Feed */}
          <div style={{ display: 'flex', justifyContent: 'center' }}>
            <IPhoneFeed
              posts={feedPosts}
              clientName={client?.name}
              clientColor={cc}
              clientInitials={initials(client?.name || '')}
              instagramUrl={client?.instagram_url}
              readonly={true}
              approvalMode={true}
              onStoryApprove={handleStoryApprove}
              onStoryReject={handleStoryReject}
              onPostClick={fp => {
                const raw = posts.find(p => p.id === fp.id)
                if (raw) { setSheetPost(raw); setSheetComment(raw.approval_comment || '') }
              }}
            />
          </div>

          {/* CTA to posts tab */}
          <div style={{ textAlign: 'center', marginTop: 28 }}>
            <button onClick={() => setTab('posts')}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '14px 28px', borderRadius: 18, background: cc, border: 'none', fontSize: 15, fontWeight: 700, color: '#fff', cursor: 'pointer', boxShadow: `0 6px 28px ${cc}44`, letterSpacing: '-0.01em' }}>
              Revisar e aprovar posts →
            </button>
            {pendingCount > 0 && <p style={{ fontSize: 12, color: '#9ca3af', marginTop: 10 }}>{pendingCount} post{pendingCount !== 1 ? 's' : ''} pendente{pendingCount !== 1 ? 's' : ''} de aprovação</p>}
          </div>
        </div>
      )}

      {/* ── POSTS TAB ───────────────────────────────────────────────── */}
      {tab === 'posts' && (
        <main style={{ maxWidth: 560, margin: '0 auto', padding: '20px 16px 0' }}>

          {/* All done */}
          {allDone ? (
            <div>
              <div style={{ textAlign: 'center', padding: '32px 20px 28px', background: '#fff', borderRadius: 24, border: '1.5px solid #86efac', marginBottom: 16, boxShadow: '0 2px 16px rgba(34,197,94,0.1)' }}>
                <div style={{ fontSize: 56, marginBottom: 14, lineHeight: 1 }}>🎉</div>
                <h2 style={{ fontSize: 22, fontWeight: 900, color: '#111', margin: '0 0 10px', letterSpacing: '-0.03em' }}>Tudo aprovado!</h2>
                <p style={{ fontSize: 14, color: '#6b7280', margin: 0, lineHeight: 1.65 }}>
                  Obrigado! Todos os {totalPosts} posts foram aprovados.<br />
                  Entraremos em contato em breve com os próximos passos.
                </p>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {posts.map(p => (
                  <div key={p.id} style={{ background: '#fff', borderRadius: 16, padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 12, border: '1px solid #ebebeb' }}>
                    <span style={{ fontSize: 22, flexShrink: 0 }}>{TYPE_EMOJIS[p.post_type] || '📄'}</span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{ fontSize: 13, fontWeight: 700, color: '#111', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.title}</p>
                      <p style={{ fontSize: 11, color: '#9ca3af', margin: '1px 0 0' }}>{TYPE_LABELS[p.post_type] || p.post_type}</p>
                    </div>
                    <CheckCircle size={18} color="#22c55e" strokeWidth={2.5} style={{ flexShrink: 0 }} />
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <>
              {/* Instruction */}
              <div style={{ background: '#fff', borderRadius: 18, padding: '14px 18px', marginBottom: 16, border: '1px solid #ebebeb', display: 'flex', gap: 14, alignItems: 'flex-start' }}>
                <div style={{ width: 40, height: 40, borderRadius: 12, background: cc + '18', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontSize: 20 }}>👋</div>
                <div>
                  <p style={{ fontSize: 14, fontWeight: 700, color: '#111', margin: '0 0 4px', letterSpacing: '-0.01em' }}>Revise e aprove cada post</p>
                  <p style={{ fontSize: 13, color: '#6b7280', margin: 0, lineHeight: 1.55 }}>
                    Leia o texto e toque em <strong style={{ color: '#111' }}>Aprovar</strong>. Se precisar de ajuste, toque em <strong style={{ color: '#111' }}>Pedir alteração</strong> e descreva o que mudar.
                  </p>
                </div>
              </div>

              {/* Post cards */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                {posts.map((post, idx) => {
                  const isApproved = post.approval_status === 'aprovado'
                  const isChanges  = post.approval_status === 'não aprovado'
                  const isComm     = commenting.has(post.id)
                  const comment    = comments[post.id] || ''
                  const isLoading  = submitting === post.id
                  const isExpanded = expanded.has(post.id)
                  const displayCopy = post.legenda || post.copy || ''
                  const longCopy   = displayCopy.length > 180

                  const isCarrossel = post.post_type === 'carrossel' || post.post_type === 'carrossel_stories'
                  const driveId     = post.drive_url?.match(/[-\w]{25,}/)?.[0]
                  const folderId    = post.drive_folder_url?.match(/\/folders\/([-\w]{25,})/)?.[1]
                  const isVideoPost = post.post_type === 'reels'
                  const thumbUrl    = driveId && !isVideoPost && !isCarrossel ? `https://drive.google.com/thumbnail?id=${driveId}&sz=w800` : null
                  const embedUrl    = driveId && isVideoPost  ? `https://drive.google.com/file/d/${driveId}/preview` : null

                  const cardBorder = isApproved ? '#86efac' : isChanges ? '#fcd34d' : '#ebebeb'
                  const statusBg   = isApproved ? '#f0fdf4' : isChanges ? '#fffbeb' : '#fafafa'
                  const statusClr  = isApproved ? '#16a34a'  : isChanges ? '#b45309' : '#9ca3af'
                  const statusTxt  = isApproved ? '✓ Aprovado' : isChanges ? '⚠ Pediu alteração' : '● Pendente'

                  return (
                    <div key={post.id} style={{ background: '#fff', borderRadius: 22, border: `1.5px solid ${cardBorder}`, overflow: 'hidden', boxShadow: isApproved ? '0 2px 12px rgba(34,197,94,0.08)' : '0 1px 4px rgba(0,0,0,0.06)', transition: 'border-color 0.35s' }}>

                      {/* Status bar */}
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 16px', background: statusBg, borderBottom: `1px solid ${cardBorder}` }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <span style={{ fontSize: 11, fontWeight: 800, color: '#c4c4c0', letterSpacing: '0.05em' }}>#{String(post.post_number || idx + 1).padStart(2, '0')}</span>
                          <span style={{ fontSize: 12, fontWeight: 700, color: '#555', background: '#f0f0ee', padding: '2px 9px', borderRadius: 100 }}>
                            {TYPE_EMOJIS[post.post_type]} {TYPE_LABELS[post.post_type] || post.post_type}
                          </span>
                          {post.scheduled_date && (
                            <span style={{ fontSize: 11, color: '#9ca3af' }}>
                              {new Date(post.scheduled_date + 'T12:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })}
                            </span>
                          )}
                        </div>
                        <span style={{ fontSize: 11, fontWeight: 700, color: statusClr }}>{statusTxt}</span>
                      </div>

                      {/* Drive media */}
                      {embedUrl ? (
                        <div>
                          {folderId && <FolderThumb folderId={folderId} />}
                          <div style={{ background: '#000', lineHeight: 0, position: 'relative', paddingTop: '177.78%', maxHeight: '80vh', overflow: 'hidden' }}>
                            <iframe src={embedUrl} allow="autoplay"
                              style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', border: 'none' }} />
                          </div>
                        </div>
                      ) : isVideoPost && folderId ? (
                        <ReelFolderPreview folderId={folderId} folderUrl={post.drive_folder_url || ''} />
                      ) : isCarrossel && folderId ? (
                        <CarouselPreview folderId={folderId} folderUrl={post.drive_folder_url || ''} />
                      ) : folderId ? (
                        <FolderThumb folderId={folderId} />
                      ) : thumbUrl ? (
                        <div style={{ background: '#f5f5f3', lineHeight: 0, maxHeight: 220, overflow: 'hidden' }}>
                          <img src={thumbUrl} alt={post.title} style={{ width: '100%', objectFit: 'cover', display: 'block', maxHeight: 220 }}
                            onError={e => { (e.target as HTMLImageElement).closest('div')!.style.display = 'none' }} />
                        </div>
                      ) : null}

                      {/* Content */}
                      <div style={{ padding: '16px 18px' }}>
                        <h3 style={{ fontSize: 17, fontWeight: 800, color: '#111', margin: '0 0 12px', lineHeight: 1.3, letterSpacing: '-0.02em' }}>{post.title}</h3>

                        {/* Legenda (texto final do Instagram; se ainda não tiver, cai no rascunho de copy) */}
                        {displayCopy && (
                          <div style={{ marginBottom: 16 }}>
                            <p style={{ fontSize: 11, fontWeight: 700, color: '#b0b0b0', margin: '0 0 6px', textTransform: 'uppercase', letterSpacing: '0.07em' }}>
                              {post.legenda ? 'Legenda' : 'Rascunho de copy'}
                            </p>
                            <div style={{ background: '#fafaf8', borderRadius: 14, padding: '12px 14px', border: '1px solid #f0f0ec' }}>
                              <p style={{ fontSize: 14, color: '#374151', lineHeight: 1.7, margin: 0, whiteSpace: 'pre-wrap', overflow: 'hidden', display: isExpanded ? 'block' : '-webkit-box', WebkitLineClamp: isExpanded ? undefined : 4, WebkitBoxOrient: 'vertical' as any }}>
                                {displayCopy}
                              </p>
                            </div>
                            {longCopy && (
                              <button onClick={() => setExpanded(s => { const n = new Set(s); n.has(post.id) ? n.delete(post.id) : n.add(post.id); return n })}
                                style={{ fontSize: 13, color: cc, fontWeight: 700, background: 'none', border: 'none', padding: '6px 0 0', cursor: 'pointer' }}>
                                {isExpanded ? '▲ Ver menos' : '▼ Ver texto completo'}
                              </button>
                            )}
                          </div>
                        )}

                        {/* Previous change */}
                        {isChanges && post.approval_comment && (
                          <div style={{ background: '#fffbeb', border: '1.5px solid #fde68a', borderRadius: 14, padding: '11px 14px', marginBottom: 14 }}>
                            <p style={{ fontSize: 10, color: '#92400e', fontWeight: 800, margin: '0 0 4px', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Sua solicitação</p>
                            <p style={{ fontSize: 13, color: '#78350f', margin: 0, fontStyle: 'italic', lineHeight: 1.5 }}>"{post.approval_comment}"</p>
                          </div>
                        )}

                        {/* Comment input */}
                        {isComm && (
                          <div style={{ marginBottom: 14 }}>
                            <p style={{ fontSize: 12, color: '#6b7280', margin: '0 0 8px', fontWeight: 600 }}>O que precisa mudar?</p>
                            <textarea autoFocus value={comment}
                              onChange={e => setComments(c => ({ ...c, [post.id]: e.target.value }))}
                              placeholder="Ex: Trocar a imagem, ajustar o texto na linha 2..."
                              rows={3}
                              style={{ width: '100%', background: '#fff', border: `2px solid ${cc}`, borderRadius: 14, padding: '13px 16px', fontSize: 15, color: '#111', resize: 'none', outline: 'none', boxSizing: 'border-box', lineHeight: 1.5, fontFamily: 'inherit' }}
                            />
                          </div>
                        )}

                        {/* Actions */}
                        {isApproved ? (
                          <div style={{ display: 'flex', gap: 10 }}>
                            <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '14px 0', borderRadius: 16, background: '#f0fdf4', border: '1.5px solid #86efac', fontSize: 15, fontWeight: 700, color: '#16a34a' }}>
                              <CheckCircle size={17} strokeWidth={2.5} /> Aprovado
                            </div>
                            <button onClick={() => undo(post.id)} disabled={!!isLoading}
                              style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '14px 16px', borderRadius: 16, background: '#fff', border: '1.5px solid #e5e7eb', fontSize: 13, fontWeight: 600, color: '#9ca3af', cursor: 'pointer', flexShrink: 0 }}>
                              <RotateCcw size={13} /> Desfazer
                            </button>
                          </div>
                        ) : isComm ? (
                          <div style={{ display: 'flex', gap: 10 }}>
                            <button onClick={() => { setCommenting(s => { const n = new Set(s); n.delete(post.id); return n }); setComments(c => { const n = { ...c }; delete n[post.id]; return n }) }}
                              style={{ padding: '14px 18px', borderRadius: 16, background: '#f3f4f6', border: 'none', fontSize: 14, fontWeight: 600, color: '#6b7280', cursor: 'pointer' }}>
                              Cancelar
                            </button>
                            <button onClick={() => requestChanges(post.id, comment)} disabled={!comment.trim() || !!isLoading}
                              style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '14px 0', borderRadius: 16, background: '#fef3c7', border: '1.5px solid #fde68a', fontSize: 14, fontWeight: 700, color: '#92400e', cursor: comment.trim() ? 'pointer' : 'default', opacity: !comment.trim() || isLoading ? 0.5 : 1 }}>
                              <MessageSquare size={15} /> Enviar alteração
                            </button>
                          </div>
                        ) : (
                          <div style={{ display: 'flex', gap: 10 }}>
                            <button onClick={() => setCommenting(s => { const n = new Set(s); n.add(post.id); return n })}
                              style={{ padding: '14px 18px', borderRadius: 16, background: '#f3f4f6', border: '1.5px solid #ebebeb', fontSize: 14, fontWeight: 600, color: '#374151', cursor: 'pointer', whiteSpace: 'nowrap' }}>
                              ✏️ Pedir alteração
                            </button>
                            <button onClick={() => approve(post.id)} disabled={!!isLoading}
                              style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '14px 0', borderRadius: 16, background: cc, border: 'none', fontSize: 15, fontWeight: 800, color: '#fff', cursor: 'pointer', opacity: isLoading ? 0.7 : 1, boxShadow: `0 6px 24px ${cc}44`, letterSpacing: '-0.02em', transition: 'opacity 0.15s' }}>
                              {isLoading ? '…' : <><CheckCircle size={17} strokeWidth={2.5} /> Aprovar</>}
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>

              {/* Extras pendentes de aprovação */}
              {extras.length > 0 && (
                <div style={{ marginTop: 28 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
                    <div style={{ flex: 1, height: 1, background: '#ebebeb' }} />
                    <p style={{ fontSize: 12, fontWeight: 700, color: '#9ca3af', letterSpacing: '0.06em', textTransform: 'uppercase', margin: 0, whiteSpace: 'nowrap' }}>
                      📋 {extras.length} extra{extras.length !== 1 ? 's' : ''} para aprovar
                    </p>
                    <div style={{ flex: 1, height: 1, background: '#ebebeb' }} />
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                    {extras.map(extra => {
                      const isCommenting = extraCommenting.has(extra.id)
                      const comment = extraComments[extra.id] || ''
                      const isLoading = extraSubmitting === extra.id
                      const TYPE_EXTRA: Record<string, string> = { todo: '✅ Tarefa', note: '📝 Nota', reminder: '🔔 Lembrete' }
                      return (
                        <div key={extra.id} style={{ background: '#fff', borderRadius: 20, border: '1.5px solid #ebebeb', overflow: 'hidden', boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }}>
                          <div style={{ padding: '14px 18px' }}>
                            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, marginBottom: 8 }}>
                              <div>
                                <span style={{ fontSize: 11, fontWeight: 700, color: '#9ca3af', background: '#f3f4f6', padding: '2px 8px', borderRadius: 100 }}>{TYPE_EXTRA[extra.type] || extra.type}</span>
                              </div>
                              {extra.due_date && (
                                <span style={{ fontSize: 11, color: '#9ca3af', flexShrink: 0 }}>
                                  {new Date(extra.due_date + 'T12:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })}
                                </span>
                              )}
                            </div>
                            <h3 style={{ fontSize: 16, fontWeight: 800, color: '#111', margin: '0 0 8px', letterSpacing: '-0.02em', lineHeight: 1.3 }}>{extra.title}</h3>
                            {extra.description && (
                              <p style={{ fontSize: 13, color: '#6b7280', margin: '0 0 14px', lineHeight: 1.6 }}>{extra.description}</p>
                            )}
                            {isCommenting && (
                              <div style={{ marginBottom: 12 }}>
                                <p style={{ fontSize: 12, color: '#6b7280', margin: '0 0 6px', fontWeight: 600 }}>Por que está recusando?</p>
                                <textarea autoFocus value={comment}
                                  onChange={e => setExtraComments(c => ({ ...c, [extra.id]: e.target.value }))}
                                  placeholder="Descreva o motivo..."
                                  rows={2}
                                  style={{ width: '100%', background: '#fff', border: `2px solid ${cc}`, borderRadius: 12, padding: '10px 14px', fontSize: 14, color: '#111', resize: 'none', outline: 'none', boxSizing: 'border-box', lineHeight: 1.5, fontFamily: 'inherit' }}
                                />
                              </div>
                            )}
                            {isCommenting ? (
                              <div style={{ display: 'flex', gap: 8 }}>
                                <button onClick={() => { setExtraCommenting(s => { const n = new Set(s); n.delete(extra.id); return n }); setExtraComments(c => { const n = { ...c }; delete n[extra.id]; return n }) }}
                                  style={{ padding: '12px 16px', borderRadius: 14, background: '#f3f4f6', border: 'none', fontSize: 13, fontWeight: 600, color: '#6b7280', cursor: 'pointer' }}>
                                  Cancelar
                                </button>
                                <button onClick={() => rejectExtra(extra.id, comment)} disabled={!comment.trim() || !!isLoading}
                                  style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '12px 0', borderRadius: 14, background: '#fef3c7', border: '1.5px solid #fde68a', fontSize: 13, fontWeight: 700, color: '#92400e', cursor: comment.trim() ? 'pointer' : 'default', opacity: !comment.trim() || isLoading ? 0.5 : 1 }}>
                                  <MessageSquare size={13} /> Recusar
                                </button>
                              </div>
                            ) : (
                              <div style={{ display: 'flex', gap: 8 }}>
                                <button onClick={() => setExtraCommenting(s => { const n = new Set(s); n.add(extra.id); return n })}
                                  style={{ padding: '12px 16px', borderRadius: 14, background: '#f3f4f6', border: '1.5px solid #ebebeb', fontSize: 13, fontWeight: 600, color: '#374151', cursor: 'pointer', whiteSpace: 'nowrap' }}>
                                  ✗ Recusar
                                </button>
                                <button onClick={() => approveExtra(extra.id)} disabled={!!isLoading}
                                  style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '12px 0', borderRadius: 14, background: cc, border: 'none', fontSize: 14, fontWeight: 800, color: '#fff', cursor: 'pointer', opacity: isLoading ? 0.7 : 1, boxShadow: `0 4px 16px ${cc}44`, letterSpacing: '-0.01em' }}>
                                  {isLoading ? '…' : <><CheckCircle size={15} strokeWidth={2.5} /> Aprovar</>}
                                </button>
                              </div>
                            )}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}

              <p style={{ textAlign: 'center', fontSize: 11, color: '#d1d5db', marginTop: 28 }}>Powered by Bagano Hub</p>
            </>
          )}
        </main>
      )}


      {/* ── CALENDÁRIO TAB ────────────────────────────────────────────── */}
      {tab === 'calendario' && (() => {
        const DAYS_SHORT = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb']
        const calYear  = tokenData?.year  || new Date().getFullYear()
        const calMonth = tokenData?.month || new Date().getMonth() + 1
        const mm = String(calMonth).padStart(2, '0')

        const postsByDate: Record<string, Post[]> = {}
        posts.forEach(p => {
          if (p.scheduled_date) {
            if (!postsByDate[p.scheduled_date]) postsByDate[p.scheduled_date] = []
            postsByDate[p.scheduled_date].push(p)
          }
        })
        const postsWithoutDate = posts.filter(p => !p.scheduled_date)

        const firstDay    = new Date(calYear, calMonth - 1, 1).getDay()
        const daysInMonth = new Date(calYear, calMonth, 0).getDate()
        const cells: (number | null)[] = [
          ...Array(firstDay).fill(null),
          ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
        ]

        const today = new Date()

        return (
          <div style={{ maxWidth: 600, margin: '0 auto', padding: '20px 16px' }}>

            {/* Month header */}
            <div style={{ textAlign: 'center', marginBottom: 14 }}>
              <p style={{ fontSize: 18, fontWeight: 800, color: '#111', margin: 0, letterSpacing: '-0.02em' }}>
                {MONTHS[calMonth - 1]} {calYear}
              </p>
              <p style={{ fontSize: 12, color: '#9ca3af', margin: '3px 0 0' }}>
                {posts.filter(p => p.scheduled_date).length} posts agendados no mês
              </p>
            </div>

            {/* Legend */}
            <div style={{ display: 'flex', gap: 14, justifyContent: 'center', marginBottom: 14 }}>
              {[['#22c55e','Aprovado'],['#f59e0b','Revisar'],['#d1d5db','Pendente']].map(([color, label]) => (
                <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                  <div style={{ width: 8, height: 8, borderRadius: 2, background: color }} />
                  <span style={{ fontSize: 11, color: '#6b7280' }}>{label}</span>
                </div>
              ))}
            </div>

            {/* Calendar grid */}
            <div style={{ background: '#fff', borderRadius: 20, border: '1px solid #ebebeb', overflow: 'hidden', boxShadow: '0 1px 4px rgba(0,0,0,0.06)', marginBottom: 20 }}>
              {/* Day headers */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', borderBottom: '1px solid #f0f0f0', background: '#fafaf8' }}>
                {DAYS_SHORT.map(d => (
                  <div key={d} style={{ textAlign: 'center', padding: '8px 0', fontSize: 10, fontWeight: 800, color: '#b0b0b0', letterSpacing: '0.04em', textTransform: 'uppercase' }}>{d}</div>
                ))}
              </div>

              {/* Day cells */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)' }}>
                {cells.map((day, i) => {
                  if (!day) return (
                    <div key={i} style={{ minHeight: 64, borderRight: i % 7 !== 6 ? '1px solid #f5f5f5' : 'none', borderBottom: '1px solid #f5f5f5', background: '#fafaf8' }} />
                  )
                  const dateStr  = `${calYear}-${mm}-${String(day).padStart(2, '0')}`
                  const dayPosts = postsByDate[dateStr] || []
                  const hasPosts = dayPosts.length > 0
                  const isToday  = today.getFullYear() === calYear && today.getMonth() + 1 === calMonth && today.getDate() === day

                  return (
                    <div key={i} style={{ minHeight: 64, padding: '5px 4px', borderRight: i % 7 !== 6 ? '1px solid #f0f0f0' : 'none', borderBottom: '1px solid #f0f0f0', background: hasPosts ? '#fefefe' : '#fff' }}>
                      <div style={{ fontSize: 11, fontWeight: isToday ? 800 : hasPosts ? 600 : 400, color: isToday ? '#fff' : hasPosts ? '#374151' : '#c4c4c0', width: 20, height: 20, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: isToday ? cc : 'transparent', marginBottom: 3 }}>
                        {day}
                      </div>
                      {dayPosts.slice(0, 2).map(p => {
                        const isApproved = p.approval_status === 'aprovado'
                        const isChanges  = p.approval_status === 'não aprovado'
                        const dotColor   = isApproved ? '#22c55e' : isChanges ? '#f59e0b' : '#d1d5db'
                        return (
                          <button key={p.id}
                            onClick={() => { setSheetPost(p); setSheetComment(p.approval_comment || '') }}
                            style={{ display: 'block', width: '100%', marginBottom: 2, background: isApproved ? '#f0fdf4' : isChanges ? '#fffbeb' : '#f3f4f6', border: `1px solid ${isApproved ? '#86efac' : isChanges ? '#fde68a' : '#e5e7eb'}`, borderRadius: 4, padding: '2px 4px', cursor: 'pointer', textAlign: 'left' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                              <div style={{ width: 5, height: 5, borderRadius: '50%', background: dotColor, flexShrink: 0 }} />
                              <span style={{ fontSize: 9, fontWeight: 600, color: '#374151', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', lineHeight: 1.4, maxWidth: '100%' }}>
                                {TYPE_EMOJIS[p.post_type]} {p.title}
                              </span>
                            </div>
                          </button>
                        )
                      })}
                      {dayPosts.length > 2 && (
                        <p style={{ fontSize: 9, color: '#9ca3af', margin: '1px 0 0', paddingLeft: 3 }}>+{dayPosts.length - 2}</p>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>

            {/* Posts sem data */}
            {postsWithoutDate.length > 0 && (
              <div>
                <p style={{ fontSize: 11, fontWeight: 700, color: '#9ca3af', letterSpacing: '0.06em', textTransform: 'uppercase', margin: '0 0 10px', textAlign: 'center' }}>
                  Sem data definida · {postsWithoutDate.length} post{postsWithoutDate.length !== 1 ? 's' : ''}
                </p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {postsWithoutDate.map(p => {
                    const isApproved = p.approval_status === 'aprovado'
                    const isChanges  = p.approval_status === 'não aprovado'
                    return (
                      <button key={p.id}
                        onClick={() => { setSheetPost(p); setSheetComment(p.approval_comment || '') }}
                        style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 12, background: '#fff', borderRadius: 14, border: `1.5px solid ${isApproved ? '#86efac' : isChanges ? '#fde68a' : '#ebebeb'}`, padding: '12px 14px', cursor: 'pointer', textAlign: 'left', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
                        <span style={{ fontSize: 20, flexShrink: 0 }}>{TYPE_EMOJIS[p.post_type] || '📄'}</span>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <p style={{ fontSize: 13, fontWeight: 700, color: '#111', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.title}</p>
                          <p style={{ fontSize: 11, color: '#9ca3af', margin: '1px 0 0' }}>{TYPE_LABELS[p.post_type]}</p>
                        </div>
                        <span style={{ fontSize: 11, fontWeight: 700, color: isApproved ? '#16a34a' : isChanges ? '#b45309' : '#9ca3af', flexShrink: 0 }}>
                          {isApproved ? '✓ Aprovado' : isChanges ? '⚠ Revisar' : '● Pendente'}
                        </span>
                      </button>
                    )
                  })}
                </div>
              </div>
            )}

            <p style={{ textAlign: 'center', fontSize: 11, color: '#d1d5db', marginTop: 28 }}>Powered by Bagano Hub</p>
          </div>
        )
      })()}

      {/* ── FEED TAB: post approval bottom sheet ────────────────────── */}
      {(tab === 'feed' || tab === 'calendario') && sheetPost && (() => {
        const isApproved      = sheetPost.approval_status === 'aprovado'
        const isChanges       = sheetPost.approval_status === 'não aprovado'
        const isLoading       = submitting === sheetPost.id
        const driveId         = sheetPost.drive_url?.match(/[-\w]{25,}/)?.[0]
        const sheetFolder     = sheetPost.drive_folder_url?.match(/\/folders\/([-\w]{25,})/)?.[1]
        const thumbUrl        = driveId ? `https://drive.google.com/thumbnail?id=${driveId}&sz=w600` : null
        const isSheetReel     = sheetPost.post_type === 'reels'
        const isSheetCarrossel = sheetPost.post_type === 'carrossel' || sheetPost.post_type === 'carrossel_stories'
        const closeSheet      = () => { setSheetPost(null); setSheetComment('') }

        return (
          <div onClick={e => { if (e.target === e.currentTarget) closeSheet() }}
            style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.72)', zIndex: 50, display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
            <div style={{ background: '#fff', borderRadius: '24px 24px 0 0', width: '100%', maxWidth: 480, maxHeight: '92dvh', display: 'flex', flexDirection: 'column' }}>

              {/* Fixed header — always visible */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 16px 12px', borderBottom: '1px solid #f0f0f0', flexShrink: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                  <span style={{ fontSize: 13, fontWeight: 700, color: '#555', background: '#f0f0ee', padding: '3px 10px', borderRadius: 100, flexShrink: 0 }}>
                    {TYPE_EMOJIS[sheetPost.post_type]} {TYPE_LABELS[sheetPost.post_type] || sheetPost.post_type}
                  </span>
                  {isApproved && <span style={{ fontSize: 12, fontWeight: 700, color: '#16a34a', flexShrink: 0 }}>✓ Aprovado</span>}
                  {isChanges  && <span style={{ fontSize: 12, fontWeight: 700, color: '#b45309', flexShrink: 0 }}>⚠ Alteração pedida</span>}
                </div>
                <button onClick={closeSheet}
                  style={{ width: 36, height: 36, borderRadius: '50%', background: '#f3f4f6', border: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0, color: '#374151', fontSize: 20, fontWeight: 400 }}>×</button>
              </div>

              {/* Scrollable body */}
              <div style={{ overflowY: 'auto', flex: 1 }}>

                {/* Media */}
                {isSheetCarrossel && sheetFolder ? (
                  <CarouselPreview folderId={sheetFolder} folderUrl={sheetPost.drive_folder_url || ''} />
                ) : isSheetReel && sheetFolder ? (
                  /* Reel from folder: only video, cover is for the feed only */
                  <SheetReelFolderVideo folderId={sheetFolder} folderUrl={sheetPost.drive_folder_url || ''} />
                ) : isSheetReel && driveId ? (
                  <div style={{ background: '#000', lineHeight: 0, position: 'relative', paddingTop: '177.78%', maxHeight: '80vh', overflow: 'hidden' }}>
                    <iframe src={`https://drive.google.com/file/d/${driveId}/preview`} allow="autoplay"
                      style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', border: 'none' }} />
                  </div>
                ) : sheetFolder ? (
                  <FolderThumb folderId={sheetFolder} maxHeight={300} />
                ) : thumbUrl ? (
                  <div style={{ background: '#f5f5f3', maxHeight: 300, overflow: 'hidden' }}>
                    <img src={thumbUrl} alt={sheetPost.title} style={{ width: '100%', objectFit: 'cover', display: 'block', maxHeight: 300 }}
                      onError={e => { (e.target as HTMLImageElement).closest('div')!.style.display = 'none' }} />
                  </div>
                ) : null}

                <div style={{ padding: '16px 20px 20px' }}>
                  <h3 style={{ fontSize: 17, fontWeight: 800, color: '#111', margin: '0 0 14px', letterSpacing: '-0.02em', lineHeight: 1.2 }}>{sheetPost.title}</h3>

                  {/* Legenda (texto final do Instagram; se ainda não tiver, cai no rascunho de copy) */}
                  {(sheetPost.legenda || sheetPost.copy) && (
                    <div style={{ background: '#fafaf8', borderRadius: 14, padding: '12px 14px', marginBottom: 14, border: '1px solid #f0f0ec' }}>
                      <p style={{ fontSize: 10, fontWeight: 700, color: '#b0b0b0', margin: '0 0 6px', textTransform: 'uppercase', letterSpacing: '0.07em' }}>
                        {sheetPost.legenda ? 'Legenda' : 'Rascunho de copy'}
                      </p>
                      <p style={{ fontSize: 14, color: '#374151', lineHeight: 1.7, margin: 0, whiteSpace: 'pre-wrap' }}>{sheetPost.legenda || sheetPost.copy}</p>
                    </div>
                  )}

                  {/* Previous change */}
                  {isChanges && sheetPost.approval_comment && (
                    <div style={{ background: '#fffbeb', border: '1.5px solid #fde68a', borderRadius: 14, padding: '11px 14px', marginBottom: 14 }}>
                      <p style={{ fontSize: 10, color: '#92400e', fontWeight: 800, margin: '0 0 4px', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Sua solicitação anterior</p>
                      <p style={{ fontSize: 13, color: '#78350f', margin: 0, fontStyle: 'italic' }}>"{sheetPost.approval_comment}"</p>
                    </div>
                  )}

                  {/* Comment */}
                  {!isApproved && (
                    <div style={{ marginBottom: 14 }}>
                      <p style={{ fontSize: 12, color: '#6b7280', margin: '0 0 8px', fontWeight: 600 }}>Pedir alteração (opcional)</p>
                      <textarea value={sheetComment} onChange={e => setSheetComment(e.target.value)}
                        placeholder="Descreva o que precisa mudar..."
                        rows={3}
                        style={{ width: '100%', background: '#f9fafb', border: `2px solid ${sheetComment ? cc : '#e5e7eb'}`, borderRadius: 14, padding: '13px 16px', fontSize: 14, color: '#111', resize: 'none', outline: 'none', boxSizing: 'border-box', lineHeight: 1.5, fontFamily: 'inherit', transition: 'border-color 0.2s' }}
                        onFocus={e => { e.target.style.borderColor = cc }}
                        onBlur={e => { e.target.style.borderColor = sheetComment ? cc : '#e5e7eb' }}
                      />
                    </div>
                  )}

                  {/* Actions */}
                  {isApproved ? (
                    <div style={{ display: 'flex', gap: 10 }}>
                      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '14px 0', borderRadius: 16, background: '#f0fdf4', border: '1.5px solid #86efac', fontSize: 15, fontWeight: 700, color: '#16a34a' }}>
                        <CheckCircle size={17} strokeWidth={2.5} /> Aprovado
                      </div>
                      <button onClick={() => undo(sheetPost.id)} disabled={!!isLoading}
                        style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '14px 16px', borderRadius: 16, background: '#fff', border: '1.5px solid #e5e7eb', fontSize: 13, fontWeight: 600, color: '#9ca3af', cursor: 'pointer' }}>
                        <RotateCcw size={13} /> Desfazer
                      </button>
                    </div>
                  ) : sheetComment.trim() ? (
                    <div style={{ display: 'flex', gap: 10 }}>
                      <button onClick={() => setSheetComment('')}
                        style={{ padding: '14px 18px', borderRadius: 16, background: '#f3f4f6', border: 'none', fontSize: 14, fontWeight: 600, color: '#6b7280', cursor: 'pointer' }}>
                        Cancelar
                      </button>
                      <button onClick={() => requestChanges(sheetPost.id, sheetComment)} disabled={!!isLoading}
                        style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '14px 0', borderRadius: 16, background: '#fef3c7', border: '1.5px solid #fde68a', fontSize: 14, fontWeight: 700, color: '#92400e', cursor: 'pointer', opacity: isLoading ? 0.5 : 1 }}>
                        <MessageSquare size={15} /> Enviar alteração
                      </button>
                    </div>
                  ) : (
                    <button onClick={() => approve(sheetPost.id)} disabled={!!isLoading}
                      style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '16px 0', borderRadius: 16, background: cc, border: 'none', fontSize: 15, fontWeight: 800, color: '#fff', cursor: 'pointer', opacity: isLoading ? 0.7 : 1, boxShadow: `0 6px 24px ${cc}44`, letterSpacing: '-0.02em' }}>
                      {isLoading ? '…' : <><CheckCircle size={17} strokeWidth={2.5} /> Aprovar este post</>}
                    </button>
                  )}

                  {/* Nudge to posts tab */}
                  <button onClick={() => { closeSheet(); setTab('posts') }}
                    style={{ width: '100%', marginTop: 12, padding: '12px 0', borderRadius: 14, background: 'transparent', border: '1.5px solid #e5e7eb', fontSize: 13, fontWeight: 600, color: '#6b7280', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                    ✅ Ver todos os posts para aprovar
                  </button>
                </div>
              </div>
            </div>
          </div>
        )
      })()}

      <style>{`
        * { -webkit-tap-highlight-color: transparent; box-sizing: border-box; }
        @keyframes spin { to { transform: rotate(360deg) } }
      `}</style>
    </div>
  )
}
