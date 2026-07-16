'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import {
  Play, LayoutGrid, Image, CheckCircle2, Clock,
  AlertCircle, X, ExternalLink, Calendar, FileText,
  ChevronLeft, ChevronRight, Loader2, Check, MessageSquare
} from 'lucide-react'

export type PostType = 'photo' | 'reel' | 'carousel' | 'story'
export type PostStatus = 'approved' | 'pending' | 'changes_requested' | 'draft'

export interface FeedPost {
  id: string
  title: string
  type: PostType
  status: PostStatus
  thumbnail_url?: string
  drive_url?: string
  drive_folder_url?: string
  copy?: string
  legenda?: string
  scheduled_date?: string
  post_number?: number
}

// Ordem estilo Instagram: mais recente primeiro (topo). Posts com data usam a
// data (mais nova na frente); sem data, caem pro nº do post (mais alto = mais recente).
// Datados sempre vêm antes dos sem data, já que ganhar uma data normalmente
// significa que o post está mais adiantado no fluxo.
function compareFeedPosts(a: FeedPost, b: FeedPost): number {
  if (a.scheduled_date && b.scheduled_date) {
    return new Date(b.scheduled_date).getTime() - new Date(a.scheduled_date).getTime()
  }
  if (a.scheduled_date && !b.scheduled_date) return -1
  if (!a.scheduled_date && b.scheduled_date) return 1
  return (b.post_number ?? 0) - (a.post_number ?? 0)
}

interface DriveFile {
  id: string
  name: string
  mimeType: string
  thumbnailLink?: string
  webViewLink?: string
}

interface ResolvedMedia {
  thumbnailUrl?: string
  videoEmbedUrl?: string
  carouselImages?: string[]
  // Slots paralelos ao carouselImages — true quando aquele slide é vídeo,
  // e a URL de embed pra tocar ele inline (iframe do Drive).
  carouselIsVideo?: boolean[]
  carouselVideoEmbeds?: (string | undefined)[]
  folderLink?: string
}

export interface IPhoneFeedProps {
  posts: FeedPost[]
  clientName?: string
  clientColor?: string
  clientInitials?: string
  clientBio?: string
  followersCount?: number
  followingCount?: number
  instagramUrl?: string
  logoUrl?: string | null
  onPostClick?: (post: FeedPost) => void
  onReorder?: (posts: FeedPost[]) => void
  readonly?: boolean
  // Approval mode
  approvalMode?: boolean
  onStoryApprove?: (post: FeedPost) => Promise<void>
  onStoryReject?: (post: FeedPost, comment: string) => Promise<void>
  // Streaming nativo do vídeo (<video> em vez do iframe /preview do Drive) — ligar
  // só no link público de aprovação (aprovar/[token]), onde o iOS/Safari do cliente
  // precisa disso pra não ficar com o player preto. No hub interno deixa off pra
  // não gastar a cota de download (alt=media) do Drive à toa.
  nativeVideo?: boolean
}

const STATUS_CONFIG = {
  approved:          { label: 'Aprovado',  color: '#22c55e', icon: CheckCircle2 },
  pending:           { label: 'Pendente',  color: '#f59e0b', icon: Clock        },
  changes_requested: { label: 'Alteração', color: '#ef4444', icon: AlertCircle  },
  draft:             { label: 'Rascunho',  color: '#94a3b8', icon: FileText     },
}

// Ring color per status in approval mode
const STORY_RING: Record<PostStatus, string> = {
  pending:           'linear-gradient(45deg,#f09433 0%,#e6683c 25%,#dc2743 50%,#cc2366 75%,#bc1888 100%)',
  approved:          '#22c55e',
  changes_requested: '#ef4444',
  draft:             '#c7c7c7',
}

const TYPE_ICON = { photo: Image, reel: Play, carousel: LayoutGrid, story: Image }

function extractDriveId(url?: string): string | null {
  if (!url) return null
  const folder = url.match(/\/folders\/([-\w]{25,})/)
  if (folder) return folder[1]
  const file = url.match(/[-\w]{25,}/)
  return file ? file[0] : null
}
function driveIdToThumbnail(id: string, size = 400) {
  return `https://drive.google.com/thumbnail?id=${id}&sz=w${size}`
}
// No link público de aprovação (iOS/Safari do cliente) usamos streaming direto da
// API do Drive numa <video> nativa: o iframe /preview depende de cookie de sessão,
// que o Safari/iOS bloqueia (ITP) e deixa o player todo preto. A API com key não
// depende de cookie e funciona com playsInline no iOS.
// No hub interno (uso majoritariamente desktop da equipe) mantemos o iframe /preview
// normal do Drive, pra não gastar a cota de download (alt=media) sem necessidade.
function driveIdToEmbed(id: string, native: boolean) {
  return native
    ? `https://www.googleapis.com/drive/v3/files/${id}?alt=media&key=${process.env.NEXT_PUBLIC_GOOGLE_API_KEY}`
    : `https://drive.google.com/file/d/${id}/preview`
}

// <video> do Drive (modo nativo, ver comentário acima) com fallback: se o
// streaming falhar (cota de download do arquivo, arquivo grande demais, etc.)
// cai pra um link "assistir no Drive". Em modo não-nativo (hub) usa o iframe
// /preview normal do Drive.
function DriveVideo({ src, native, folderUrl, style }: { src: string; native: boolean; folderUrl?: string; style: React.CSSProperties }) {
  const [failed, setFailed] = useState(false)
  if (!native) return <iframe src={src} allow="autoplay" style={{ ...style, border: 'none' }} />
  if (failed) return (
    <a href={folderUrl || '#'} target="_blank" rel="noopener noreferrer"
      style={{ ...style, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, background: '#111', fontSize: 14, fontWeight: 600, color: '#fff', textDecoration: 'none' }}>
      🎬 Assistir no Drive
    </a>
  )
  return <video src={src} controls playsInline onError={() => setFailed(true)} style={style} />
}
function pickCover(files: DriveFile[]): DriveFile | undefined {
  const images = files.filter(f => f.mimeType.startsWith('image/'))
  return images.find(f => /^capa\./i.test(f.name)) ?? images[0]
}
// Sem foto de capa, cai pra 1ª página de um PDF; sem PDF, cai pro frame de um vídeo.
function pickCoverOrVideo(files: DriveFile[]): { file?: DriveFile; isVideo: boolean } {
  const cover = pickCover(files)
  if (cover) return { file: cover, isVideo: false }
  const pdf = files.find(f => f.mimeType === 'application/pdf')
  if (pdf) return { file: pdf, isVideo: false }
  const video = files.find(f => f.mimeType.startsWith('video/'))
  return { file: video, isVideo: true }
}

async function fetchFolderFiles(folderId: string): Promise<DriveFile[]> {
  try {
    const res = await fetch(`/api/drive-folder?folderId=${folderId}`)
    if (!res.ok) return []
    return (await res.json()).files || []
  } catch { return [] }
}

async function resolveMedia(post: FeedPost, nativeVideo: boolean): Promise<ResolvedMedia> {
  const folderUrl = post.drive_folder_url
  const fileUrl   = post.drive_url

  if (folderUrl) {
    const folderId = extractDriveId(folderUrl)
    if (folderId) {
      const files = await fetchFolderFiles(folderId)
      if (files.length > 0) {
        const cover = pickCover(files)
        const pdf = files.find(f => f.mimeType === 'application/pdf')
        const videos = files.filter(f => f.mimeType.startsWith('video/'))
        const nonImageFallback = (size?: number) => pdf ? driveIdToThumbnail(pdf.id, size) : videos[0] ? driveIdToThumbnail(videos[0].id, size) : undefined
        if (post.type === 'reel') {
          const thumb = cover ? driveIdToThumbnail(cover.id) : nonImageFallback()
          return { thumbnailUrl: thumb, videoEmbedUrl: videos[0] ? driveIdToEmbed(videos[0].id, nativeVideo) : undefined, folderLink: folderUrl }
        }
        if (post.type === 'carousel' || post.type === 'story') {
          const images = files.filter(f => f.mimeType.startsWith('image/'))
          // Imagens e vídeos juntos, na ordem do nome do arquivo — carrossel misto
          // (ex: 4 fotos + 1 vídeo) mostra o vídeo no lugar certo, não descarta ele.
          const slideFiles = [...images, ...videos].sort((a, b) => a.name.localeCompare(b.name))
          const urls = slideFiles.map(f => driveIdToThumbnail(f.id, 600))
          const isVideoFlags = slideFiles.map(f => f.mimeType.startsWith('video/'))
          const videoEmbeds = slideFiles.map(f => f.mimeType.startsWith('video/') ? driveIdToEmbed(f.id, nativeVideo) : undefined)
          const fallback = urls[0] ?? nonImageFallback(600)
          return {
            thumbnailUrl: cover ? driveIdToThumbnail(cover.id, 600) : fallback,
            carouselImages: urls.length > 0 ? urls : fallback ? [fallback] : [],
            carouselIsVideo: urls.length > 0 ? isVideoFlags : fallback ? [false] : [],
            carouselVideoEmbeds: urls.length > 0 ? videoEmbeds : fallback ? [undefined] : [],
            folderLink: folderUrl,
          }
        }
        const photoThumb = cover ? driveIdToThumbnail(cover.id) : nonImageFallback()
        return { thumbnailUrl: photoThumb, folderLink: folderUrl }
      }
    }
  }
  if (fileUrl) {
    const id = extractDriveId(fileUrl)
    if (id) {
      if (post.type === 'reel') return { thumbnailUrl: driveIdToThumbnail(id), videoEmbedUrl: driveIdToEmbed(id, nativeVideo) }
      return { thumbnailUrl: driveIdToThumbnail(id) }
    }
  }
  return {}
}

// ── Story Circle ──────────────────────────────────────────────────────────────
function StoryCircle({ post, clientColor, clientInitials, avatarUrl, seen, approvalMode, onClick }: {
  post: FeedPost
  clientColor: string
  clientInitials: string
  avatarUrl: string | null
  seen: boolean
  approvalMode?: boolean
  onClick: () => void
}) {
  const [thumbUrl, setThumbUrl] = useState<string | undefined>()
  useEffect(() => {
    async function load() {
      if (post.drive_folder_url) {
        const folderId = extractDriveId(post.drive_folder_url)
        if (folderId) {
          const files = await fetchFolderFiles(folderId)
          const { file } = pickCoverOrVideo(files)
          if (file) { setThumbUrl(driveIdToThumbnail(file.id, 200)); return }
        }
      }
      const id = extractDriveId(post.drive_url)
      if (id) setThumbUrl(driveIdToThumbnail(id, 200))
    }
    load()
  }, [post.drive_folder_url, post.drive_url])

  const ring = approvalMode
    ? STORY_RING[post.status]
    : seen ? '#c7c7c7' : STORY_RING.pending

  const isPending = post.status === 'pending'

  return (
    <div onClick={onClick} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, cursor: 'pointer', flexShrink: 0, width: 52 }}>
      <div style={{
        width: 52, height: 52, borderRadius: '50%',
        background: ring, padding: 2.5,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        // Pulse only for pending stories in approval mode
        animation: approvalMode && isPending ? 'storyPulse 2s ease-in-out infinite' : 'none',
      }}>
        <div style={{ width: '100%', height: '100%', borderRadius: '50%', border: '2.5px solid white', overflow: 'hidden', background: clientColor, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          {avatarUrl
            ? <img src={avatarUrl} style={{ width: '100%', height: '100%', objectFit: 'cover' }} onError={e => { (e.currentTarget as HTMLImageElement).style.display = 'none' }} />
            : thumbUrl
              ? <img src={thumbUrl} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              : <span style={{ fontSize: 11, fontWeight: 700, color: 'white' }}>{clientInitials}</span>
          }
        </div>
      </div>
      <div style={{ width: 5, height: 5, borderRadius: '50%', background: STATUS_CONFIG[post.status].color }} />
    </div>
  )
}

// ── Story Viewer ──────────────────────────────────────────────────────────────
function StoryViewer({ post, onClose, clientColor, clientInitials, clientName, avatarUrl, onSeen, approvalMode, onApprove, onReject, nativeVideo }: {
  post: FeedPost
  onClose: () => void
  clientColor: string
  clientInitials: string
  clientName: string
  avatarUrl: string | null
  onSeen: (id: string) => void
  approvalMode?: boolean
  onApprove?: (post: FeedPost) => Promise<void>
  onReject?: (post: FeedPost, comment: string) => Promise<void>
  nativeVideo: boolean
}) {
  const [media, setMedia]       = useState<ResolvedMedia | null>(null)
  const [slide, setSlide]       = useState(0)
  const [progress, setProgress] = useState(0)
  const [loading, setLoading]   = useState(true)
  const [paused, setPaused]     = useState(false)
  const [showReject, setShowReject] = useState(false)
  const [comment, setComment]   = useState('')
  const [submitting, setSubmitting] = useState(false)
  const DURATION = 5000

  useEffect(() => {
    setLoading(true); setSlide(0); setShowReject(false); setComment('')
    resolveMedia(post, nativeVideo).then(m => { setMedia(m); setLoading(false) })
    onSeen(post.id)
  }, [post.id])

  const slides = media?.carouselImages || (media?.thumbnailUrl ? [media.thumbnailUrl] : [])
  const isVideoSlide = media?.carouselIsVideo?.[slide] || false
  const videoEmbedUrl = media?.carouselVideoEmbeds?.[slide]

  // Auto-advance — desabilitado em modo aprovação, e pausado num slide de vídeo
  // (o cliente precisa de tempo pra assistir, não 5s fixos como numa foto)
  useEffect(() => {
    if (loading || slides.length === 0 || paused || approvalMode || isVideoSlide) return
    setProgress(0)
    const TICK = 50
    const step = (100 / DURATION) * TICK
    const iv = setInterval(() => setProgress(p => Math.min(p + step, 100)), TICK)
    const to = setTimeout(() => {
      if (slide < slides.length - 1) setSlide(s => s + 1); else onClose()
    }, DURATION)
    return () => { clearInterval(iv); clearTimeout(to) }
  }, [slide, loading, slides.length, paused, approvalMode, isVideoSlide])

  // In approval mode track progress manually (no auto-close)
  useEffect(() => {
    if (!approvalMode || loading || slides.length === 0) return
    setProgress(0)
  }, [slide, approvalMode, loading, slides.length])

  const goNext = () => { if (slide < slides.length - 1) setSlide(s => s + 1); else if (!approvalMode) onClose() }
  const goPrev = () => { if (slide > 0) setSlide(s => s - 1) }

  const handleApprove = async () => {
    if (!onApprove) return
    setSubmitting(true)
    await onApprove(post)
    setSubmitting(false)
    onClose()
  }

  const handleReject = async () => {
    if (!onReject || !comment.trim()) return
    setSubmitting(true)
    await onReject(post, comment)
    setSubmitting(false)
    onClose()
  }

  const StatusIcon = STATUS_CONFIG[post.status].icon
  const isApproved = post.status === 'approved'
  const isRejected = post.status === 'changes_requested'

  return (
    <div
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.88)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', backdropFilter: 'blur(6px)' }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div
        style={{ position: 'relative', width: 340, height: Math.round(340 * 16 / 9), maxHeight: '92vh', borderRadius: 22, overflow: 'hidden', background: '#0a0a0a', boxShadow: '0 40px 100px rgba(0,0,0,0.7)' }}
        onMouseDown={() => setPaused(true)}
        onMouseUp={() => setPaused(false)}
        onTouchStart={() => setPaused(true)}
        onTouchEnd={() => setPaused(false)}
      >
        {/* Progress bars */}
        <div style={{ position: 'absolute', top: 12, left: 12, right: 12, display: 'flex', gap: 3, zIndex: 20 }}>
          {(slides.length > 0 ? slides : [null]).map((_, i) => (
            <div key={i} style={{ flex: 1, height: 2.5, background: 'rgba(255,255,255,0.3)', borderRadius: 2, overflow: 'hidden' }}>
              <div style={{ height: '100%', borderRadius: 2, background: 'white', width: i < slide ? '100%' : i === slide ? (approvalMode ? '100%' : `${progress}%`) : '0%' }} />
            </div>
          ))}
        </div>

        {/* Header */}
        <div style={{ position: 'absolute', top: 26, left: 12, right: 12, display: 'flex', alignItems: 'center', gap: 8, zIndex: 20 }}>
          <div style={{ width: 30, height: 30, borderRadius: '50%', border: '1.5px solid rgba(255,255,255,0.8)', background: clientColor, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 700, color: 'white', overflow: 'hidden', flexShrink: 0 }}>
            {avatarUrl ? <img src={avatarUrl} style={{ width: '100%', height: '100%', objectFit: 'cover' }} onError={e => { (e.currentTarget as HTMLImageElement).style.display = 'none' }} /> : clientInitials}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: 'white' }}>{clientName}</span>
            {post.scheduled_date && (
              <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.55)', marginLeft: 6 }}>
                {new Date(post.scheduled_date + 'T12:00:00').toLocaleDateString('pt-BR', { day: 'numeric', month: 'short' })}
              </span>
            )}
          </div>
          <button onClick={e => { e.stopPropagation(); onClose() }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'white', padding: 4, display: 'flex' }}>
            <X size={20} />
          </button>
        </div>

        {/* Image */}
        {loading ? (
          <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Loader2 size={28} color="white" style={{ animation: 'spin 1s linear infinite' }} />
          </div>
        ) : slides.length > 0 && isVideoSlide && videoEmbedUrl ? (
          <DriveVideo src={videoEmbedUrl} native={nativeVideo} folderUrl={media?.folderLink || post.drive_url}
            style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'contain', background: '#000' }} />
        ) : slides.length > 0 ? (
          <img src={slides[slide]} alt={post.title} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />
        ) : (
          <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12, background: '#1a1a1a' }}>
            <Image size={40} color="rgba(255,255,255,0.2)" />
            <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.4)' }}>Sem mídia — cole o link no Drive</span>
          </div>
        )}

        {/* Tap zones — em slide de vídeo ficam só nas bordas, pra não bloquear os
            controles do player do Drive no meio da tela */}
        {isVideoSlide ? (
          <div style={{ position: 'absolute', inset: 0, display: 'flex', zIndex: 10, pointerEvents: loading ? 'none' : 'auto' }}>
            <div style={{ width: '18%' }} onClick={e => { e.stopPropagation(); goPrev() }} />
            <div style={{ flex: 1 }} />
            <div style={{ width: '18%' }} onClick={e => { e.stopPropagation(); goNext() }} />
          </div>
        ) : (
          <div style={{ position: 'absolute', inset: 0, display: 'flex', zIndex: 10, pointerEvents: loading ? 'none' : 'auto' }}>
            <div style={{ flex: 1 }} onClick={e => { e.stopPropagation(); goPrev() }} />
            <div style={{ flex: 1 }} onClick={e => { e.stopPropagation(); goNext() }} />
          </div>
        )}

        {/* Bottom: info + approval UI */}
        <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, zIndex: 20, pointerEvents: 'none' }}>
          {/* Gradient + info */}
          <div style={{ padding: approvalMode ? '40px 16px 10px' : '40px 16px 20px', background: 'linear-gradient(to top, rgba(0,0,0,0.85) 0%, transparent 100%)', pointerEvents: 'none' }}>
            <p style={{ fontSize: 13, fontWeight: 700, color: 'white', margin: '0 0 2px' }}>{post.title}</p>
            {(post.legenda || post.copy) && !approvalMode && (
              <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.7)', margin: '0 0 6px', overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' as const }}>{post.legenda || post.copy}</p>
            )}
            {!approvalMode && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 5, pointerEvents: 'auto' }}>
                <StatusIcon size={12} color={STATUS_CONFIG[post.status].color} />
                <span style={{ fontSize: 11, fontWeight: 500, color: 'rgba(255,255,255,0.85)' }}>{STATUS_CONFIG[post.status].label}</span>
                {slides.length > 1 && <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)', marginLeft: 4 }}>{slide + 1}/{slides.length}</span>}
                {(media?.folderLink || post.drive_url) && (
                  <a href={media?.folderLink || post.drive_url} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()}
                    style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, color: 'rgba(255,255,255,0.6)', textDecoration: 'none' }}>
                    <ExternalLink size={11} /> Drive
                  </a>
                )}
              </div>
            )}
          </div>

          {/* Approval actions */}
          {approvalMode && (
            <div style={{ padding: '0 12px 16px', pointerEvents: 'auto' }}>
              {/* Legenda snippet */}
              {(post.legenda || post.copy) && (
                <div style={{ background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(8px)', borderRadius: 10, padding: '8px 12px', marginBottom: 10 }}>
                  <p style={{ fontSize: 10, color: 'rgba(255,255,255,0.5)', margin: '0 0 3px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{post.legenda ? 'Legenda' : 'Rascunho de copy'}</p>
                  <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.85)', margin: 0, lineHeight: 1.5, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical' as const }}>{post.legenda || post.copy}</p>
                </div>
              )}

              {showReject ? (
                /* Rejection form */
                <div style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(12px)', borderRadius: 14, padding: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <textarea
                    autoFocus
                    value={comment}
                    onChange={e => setComment(e.target.value)}
                    placeholder="O que precisa mudar neste story?"
                    onClick={e => e.stopPropagation()}
                    style={{ width: '100%', background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.2)', borderRadius: 10, padding: '10px 12px', fontSize: 12, color: 'white', resize: 'none', outline: 'none', boxSizing: 'border-box', lineHeight: 1.5 }}
                    rows={3}
                  />
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button onClick={e => { e.stopPropagation(); setShowReject(false); setComment('') }}
                      style={{ flex: 1, background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.2)', borderRadius: 10, padding: '10px 0', fontSize: 12, color: 'rgba(255,255,255,0.8)', cursor: 'pointer', fontWeight: 500 }}>
                      Cancelar
                    </button>
                    <button
                      onClick={e => { e.stopPropagation(); handleReject() }}
                      disabled={!comment.trim() || submitting}
                      style={{ flex: 2, background: comment.trim() ? '#f59e0b' : 'rgba(245,158,11,0.3)', border: 'none', borderRadius: 10, padding: '10px 0', fontSize: 12, color: 'white', cursor: comment.trim() ? 'pointer' : 'default', fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, transition: 'background 0.2s' }}>
                      {submitting ? <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> : <><MessageSquare size={14} /> Solicitar alteração</>}
                    </button>
                  </div>
                </div>
              ) : isApproved ? (
                /* Already approved state */
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <div style={{ background: 'rgba(34,197,94,0.2)', border: '1px solid rgba(34,197,94,0.4)', borderRadius: 14, padding: '12px 16px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                    <Check size={16} color="#4ade80" />
                    <span style={{ fontSize: 13, fontWeight: 700, color: '#4ade80' }}>Story aprovado</span>
                  </div>
                  <button onClick={e => { e.stopPropagation(); setShowReject(true) }}
                    style={{ background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.15)', borderRadius: 14, padding: '10px 0', fontSize: 12, color: 'rgba(255,255,255,0.6)', cursor: 'pointer', fontWeight: 500 }}>
                    Pedir alteração
                  </button>
                </div>
              ) : isRejected ? (
                /* Changes requested state */
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <div style={{ background: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 14, padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 8 }}>
                    <AlertCircle size={14} color="#f87171" />
                    <span style={{ fontSize: 11, fontWeight: 600, color: '#f87171' }}>Alteração solicitada</span>
                  </div>
                  <button onClick={e => { e.stopPropagation(); handleApprove() }} disabled={submitting}
                    style={{ background: 'rgba(34,197,94,0.85)', border: 'none', borderRadius: 14, padding: '12px 0', fontSize: 13, color: 'white', cursor: 'pointer', fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                    {submitting ? <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> : <><Check size={16} /> Aprovar assim mesmo</>}
                  </button>
                </div>
              ) : (
                /* Default: pending */
                <div style={{ display: 'flex', gap: 8 }}>
                  <button onClick={e => { e.stopPropagation(); setShowReject(true) }}
                    style={{ flex: 1, background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(8px)', border: '1px solid rgba(255,255,255,0.2)', borderRadius: 14, padding: '13px 0', fontSize: 12, color: 'rgba(255,255,255,0.85)', cursor: 'pointer', fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                    <MessageSquare size={14} /> Pedir alteração
                  </button>
                  <button onClick={e => { e.stopPropagation(); handleApprove() }} disabled={submitting}
                    style={{ flex: 1, background: 'rgba(34,197,94,0.9)', border: 'none', borderRadius: 14, padding: '13px 0', fontSize: 12, color: 'white', cursor: 'pointer', fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, boxShadow: '0 4px 20px rgba(34,197,94,0.35)' }}>
                    {submitting ? <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> : <><Check size={14} /> Aprovar</>}
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Post thumbnail (grid) ─────────────────────────────────────────────────────
function PostThumb({ post, onClick, dragging, dragOver }: {
  post: FeedPost; onClick: () => void; dragging: boolean; dragOver: boolean
}) {
  const [thumbUrl, setThumbUrl] = useState<string | undefined>()
  const [loaded, setLoaded] = useState(false)
  const TypeIcon = TYPE_ICON[post.type]
  const status = STATUS_CONFIG[post.status]

  useEffect(() => {
    async function load() {
      if (post.drive_folder_url) {
        const folderId = extractDriveId(post.drive_folder_url)
        if (folderId) {
          const files = await fetchFolderFiles(folderId)
          const { file } = pickCoverOrVideo(files)
          if (file) { setThumbUrl(driveIdToThumbnail(file.id, 300)); return }
        }
      }
      const id = extractDriveId(post.drive_url)
      if (id) setThumbUrl(driveIdToThumbnail(id, 300))
    }
    load()
  }, [post.drive_folder_url, post.drive_url])

  return (
    <div onClick={onClick} draggable style={{ aspectRatio: '4/5', position: 'relative', overflow: 'hidden', background: '#e8e8e8', cursor: 'pointer', opacity: dragging ? 0.25 : 1, outline: dragOver ? '2px solid #3b82f6' : 'none', outlineOffset: -2, transition: 'opacity 0.1s' }}>
      {thumbUrl ? (
        <>
          {!loaded && <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#e8e8e8' }}><div style={{ width: 16, height: 16, border: '2px solid #ddd', borderTopColor: '#aaa', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} /></div>}
          <img src={thumbUrl} alt={post.title} loading="lazy" onLoad={() => setLoaded(true)} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block', opacity: loaded ? 1 : 0, transition: 'opacity 0.2s' }} />
        </>
      ) : (
        <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><TypeIcon size={14} color="#bbb" /></div>
      )}
      <TypeIcon size={11} color="white" style={{ position: 'absolute', top: 5, right: 5, filter: 'drop-shadow(0 1px 2px rgba(0,0,0,0.5))' }} />
      <div style={{ position: 'absolute', bottom: 5, left: 5, width: 6, height: 6, borderRadius: '50%', background: status.color, border: '1.5px solid rgba(255,255,255,0.9)' }} />
    </div>
  )
}

// ── Post panel (side detail) ──────────────────────────────────────────────────
function PostPanel({ post, onClose, nativeVideo }: { post: FeedPost; onClose: () => void; nativeVideo: boolean }) {
  const [media, setMedia]   = useState<ResolvedMedia | null>(null)
  const [loading, setLoading] = useState(true)
  const [slide, setSlide]   = useState(0)
  const StatusIcon = STATUS_CONFIG[post.status].icon

  useEffect(() => {
    setLoading(true); setSlide(0)
    resolveMedia(post, nativeVideo).then(m => { setMedia(m); setLoading(false) })
  }, [post.id])

  const slides    = media?.carouselImages || (media?.thumbnailUrl ? [media.thumbnailUrl] : [])
  const isCarousel = post.type === 'carousel' && slides.length > 1
  const isReel     = post.type === 'reel'
  const isVideoSlide = media?.carouselIsVideo?.[slide] || false
  const videoEmbedUrl = media?.carouselVideoEmbeds?.[slide]

  return (
    <div style={{ width: 300, flexShrink: 0, background: 'var(--color-bg-card)', border: '0.5px solid var(--color-border)', borderRadius: 16, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 14px', borderBottom: '0.5px solid var(--color-border)' }}>
        <div>
          <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-text-primary)' }}>{post.title}</span>
          <span style={{ fontSize: 11, color: 'var(--color-text-muted)', marginLeft: 8, textTransform: 'capitalize' }}>{post.type}</span>
        </div>
        <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-text-muted)', padding: 2 }}><X size={15} /></button>
      </div>

      <div style={{ aspectRatio: post.type === 'story' ? '9/16' : '4/5', background: 'var(--color-bg-subtle)', position: 'relative', overflow: 'hidden', flexShrink: 0 }}>
        {loading ? (
          <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Loader2 size={20} color="#ccc" style={{ animation: 'spin 1s linear infinite' }} /></div>
        ) : isReel && media?.videoEmbedUrl ? (
          <DriveVideo src={media.videoEmbedUrl} native={nativeVideo} folderUrl={media?.folderLink || post.drive_url}
            style={{ width: '100%', height: '100%', objectFit: 'contain', background: '#000' }} />
        ) : slides.length > 0 ? (
          <>
            {isVideoSlide && videoEmbedUrl ? (
              <DriveVideo src={videoEmbedUrl} native={nativeVideo} folderUrl={media?.folderLink || post.drive_url}
                style={{ width: '100%', height: '100%', objectFit: 'contain', background: '#000' }} />
            ) : (
              <img src={slides[slide]} alt={post.title} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
            )}
            {isCarousel && (
              <>
                <div style={{ position: 'absolute', bottom: 8, left: 0, right: 0, display: 'flex', justifyContent: 'center', gap: 4 }}>
                  {slides.map((_, i) => <div key={i} onClick={() => setSlide(i)} style={{ width: i === slide ? 16 : 5, height: 5, borderRadius: 3, background: i === slide ? 'white' : 'rgba(255,255,255,0.5)', cursor: 'pointer', transition: 'width 0.2s' }} />)}
                </div>
                {slide > 0 && <button onClick={() => setSlide(s => s - 1)} style={{ position: 'absolute', left: 8, top: '50%', transform: 'translateY(-50%)', background: 'rgba(0,0,0,0.35)', border: 'none', borderRadius: '50%', width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}><ChevronLeft size={16} color="white" /></button>}
                {slide < slides.length - 1 && <button onClick={() => setSlide(s => s + 1)} style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', background: 'rgba(0,0,0,0.35)', border: 'none', borderRadius: '50%', width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}><ChevronRight size={16} color="white" /></button>}
                <div style={{ position: 'absolute', top: 8, right: 8, background: 'rgba(0,0,0,0.45)', borderRadius: 12, padding: '2px 8px', fontSize: 11, color: 'white' }}>{slide + 1}/{slides.length}</div>
              </>
            )}
            {isReel && !media?.videoEmbedUrl && (
              <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.2)' }}>
                <div style={{ width: 44, height: 44, borderRadius: '50%', background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Play size={20} color="white" fill="white" style={{ marginLeft: 2 }} /></div>
              </div>
            )}
          </>
        ) : (
          <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Image size={24} color="#ccc" /></div>
        )}
      </div>

      <div style={{ padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 10, overflowY: 'auto' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '3px 9px', borderRadius: 999, background: STATUS_CONFIG[post.status].color, color: 'white', fontSize: 11, fontWeight: 500 }}>
            <StatusIcon size={11} />{STATUS_CONFIG[post.status].label}
          </div>
        </div>
        {post.scheduled_date && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: 'var(--color-text-secondary)' }}>
            <Calendar size={13} color="var(--color-text-muted)" />
            {new Date(post.scheduled_date + 'T12:00:00').toLocaleDateString('pt-BR', { day: 'numeric', month: 'long' })}
          </div>
        )}
        {(post.legenda || post.copy) && (
          <div style={{ background: 'var(--color-bg-subtle)', borderRadius: 10, padding: '10px 12px' }}>
            <p style={{ fontSize: 10, color: 'var(--color-text-muted)', fontWeight: 500, marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{post.legenda ? 'Legenda' : 'Rascunho de copy'}</p>
            <p style={{ fontSize: 12, color: 'var(--color-text-primary)', lineHeight: 1.6, margin: 0 }}>{post.legenda || post.copy}</p>
          </div>
        )}
        {(media?.folderLink || post.drive_url) && (
          <a href={media?.folderLink || post.drive_url} target="_blank" rel="noopener noreferrer" style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--ds-info-text)', textDecoration: 'none' }}>
            <ExternalLink size={13} />Abrir pasta no Drive
          </a>
        )}
      </div>
    </div>
  )
}

// ── Main IPhoneFeed ───────────────────────────────────────────────────────────
export default function IPhoneFeed({
  posts: initialPosts,
  clientName = 'Cliente',
  clientColor = '#1a1a1a',
  clientInitials = 'CL',
  clientBio,
  followersCount,
  followingCount,
  instagramUrl,
  logoUrl,
  onPostClick,
  onReorder,
  readonly = false,
  approvalMode = false,
  onStoryApprove,
  onStoryReject,
  nativeVideo = false,
}: IPhoneFeedProps) {
  const igUsername = instagramUrl
    ? instagramUrl.replace(/https?:\/\/(www\.)?instagram\.com\/?/, '').replace(/\/$/, '')
    : null
  const avatarUrl = logoUrl || (igUsername ? `https://unavatar.io/instagram/${igUsername}` : null)

  const [posts, setPosts]             = useState<FeedPost[]>([...initialPosts].sort(compareFeedPosts))
  const [selectedPost, setSelectedPost] = useState<FeedPost | null>(null)
  const [activeStory, setActiveStory]   = useState<FeedPost | null>(null)
  const [seenStories, setSeenStories]   = useState<Set<string>>(new Set())
  const [dragging, setDragging]         = useState<string | null>(null)
  const [dragOver, setDragOver]         = useState<string | null>(null)
  const dragSrcId = useRef<string | null>(null)

  useEffect(() => {
    setPosts([...initialPosts].sort(compareFeedPosts))
  }, [initialPosts])

  const handleDrop = useCallback((targetId: string) => {
    const srcId = dragSrcId.current
    if (!srcId || srcId === targetId) return
    setPosts(prev => {
      const arr = [...prev]
      const si = arr.findIndex(p => p.id === srcId)
      const ti = arr.findIndex(p => p.id === targetId)
      const [moved] = arr.splice(si, 1)
      arr.splice(ti, 0, moved)
      // Topo da lista (índice 0) é o mais recente → maior nº de post
      const reordered = arr.map((p, i) => ({ ...p, post_number: arr.length - i }))
      onReorder?.(reordered)
      return reordered
    })
    setDragging(null); setDragOver(null)
  }, [onReorder])

  const storyPosts = posts.filter(p => p.type === 'story')
  const gridPosts  = posts.filter(p => p.type !== 'story')
  const markSeen   = (id: string) => setSeenStories(s => new Set(s).add(id))

  const handleStoryApprove = async (post: FeedPost) => {
    await onStoryApprove?.(post)
    setPosts(prev => prev.map(p => p.id === post.id ? { ...p, status: 'approved' } : p))
  }
  const handleStoryReject = async (post: FeedPost, comment: string) => {
    await onStoryReject?.(post, comment)
    setPosts(prev => prev.map(p => p.id === post.id ? { ...p, status: 'changes_requested' } : p))
  }

  return (
    <>
      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes storyPulse {
          0%, 100% { box-shadow: 0 0 0 0 rgba(220,39,67,0.5); }
          50% { box-shadow: 0 0 0 6px rgba(220,39,67,0); }
        }
      `}</style>
      <div style={{ display: 'flex', gap: 24, alignItems: 'flex-start' }}>

        {/* iPhone */}
        <div style={{ flexShrink: 0 }}>
          <div style={{ width: 290, border: '1.5px solid var(--color-border)', borderRadius: 46, overflow: 'hidden', background: 'var(--color-bg-card)', display: 'flex', flexDirection: 'column', boxShadow: '0 0 0 6px var(--color-bg-subtle), 0 0 0 7px var(--color-border)' }}>

            {/* Notch */}
            <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 10, paddingBottom: 2 }}>
              <div style={{ width: 80, height: 20, background: 'var(--color-text-primary)', borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5, opacity: 0.9 }}>
                <div style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--color-bg-card)' }} />
                <div style={{ width: 20, height: 8, borderRadius: 4, background: 'var(--color-bg-card)' }} />
              </div>
            </div>

            {/* IG header */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 16px 6px' }}>
              {instagramUrl
                ? <a href={instagramUrl} target="_blank" rel="noopener noreferrer" style={{ fontSize: 12, fontWeight: 700, color: 'var(--color-text-primary)', textDecoration: 'none' }}>{igUsername}</a>
                : <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--color-text-primary)' }}>{clientName.toLowerCase().replace(/\s+/g, '.')}</span>
              }
              <div style={{ display: 'flex', gap: 12 }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--color-text-primary)" strokeWidth="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--color-text-primary)" strokeWidth="2"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></svg>
              </div>
            </div>

            {/* Profile */}
            <div style={{ padding: '0 16px 12px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 6 }}>
                {(() => {
                  const avatarStyle: React.CSSProperties = { flexShrink: 0, borderRadius: '50%', overflow: 'hidden', width: 48, height: 48, background: clientColor, display: 'flex', alignItems: 'center', justifyContent: 'center' }
                  const inner = avatarUrl
                    ? <img src={avatarUrl} alt={igUsername || clientName} width={48} height={48} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                        onError={e => { const el = e.currentTarget; el.style.display = 'none'; const p = el.parentElement; if (p) { p.style.display = 'flex'; p.style.alignItems = 'center'; p.style.justifyContent = 'center'; p.innerHTML = `<span style="font-size:13px;font-weight:600;color:white">${clientInitials}</span>` } }} />
                    : <span style={{ fontSize: 13, fontWeight: 600, color: 'white' }}>{clientInitials}</span>
                  return instagramUrl
                    ? <a href={instagramUrl} target="_blank" rel="noopener noreferrer" style={{ ...avatarStyle, textDecoration: 'none' }}>{inner}</a>
                    : <div style={avatarStyle}>{inner}</div>
                })()}
                <div style={{ display: 'flex', flex: 1 }}>
                  {[{ num: gridPosts.length, label: 'posts' }, { num: followersCount ?? '—', label: 'seguid.' }, { num: followingCount ?? '—', label: 'seguindo' }].map(({ num, label }) => (
                    <div key={label} style={{ flex: 1, textAlign: 'center' }}>
                      <span style={{ display: 'block', fontSize: 12, fontWeight: 700, color: 'var(--color-text-primary)' }}>{typeof num === 'number' ? num.toLocaleString('pt-BR') : num}</span>
                      <span style={{ display: 'block', fontSize: 9, color: 'var(--color-text-muted)' }}>{label}</span>
                    </div>
                  ))}
                </div>
              </div>
              <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--color-text-primary)', marginBottom: 1 }}>{igUsername ? `@${igUsername}` : clientName}</div>
              {clientBio && <div style={{ fontSize: 9, color: 'var(--color-text-muted)', lineHeight: 1.4 }}>{clientBio}</div>}
              <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
                {instagramUrl
                  ? <a href={instagramUrl} target="_blank" rel="noopener noreferrer" style={{ flex: 1, background: clientColor, borderRadius: 6, padding: '4px 0', textAlign: 'center', fontSize: 10, fontWeight: 600, color: 'white', textDecoration: 'none', display: 'block' }}>Seguir</a>
                  : <div style={{ flex: 1, background: clientColor, borderRadius: 6, padding: '4px 0', textAlign: 'center', fontSize: 10, fontWeight: 600, color: 'white' }}>Seguir</div>
                }
                <div style={{ flex: 1, background: 'var(--color-bg-subtle)', borderRadius: 6, padding: '4px 0', textAlign: 'center', fontSize: 10, fontWeight: 500, color: 'var(--color-text-primary)' }}>Mensagem</div>
              </div>
            </div>

            {/* Stories tray */}
            {storyPosts.length > 0 && (
              <>
                <div style={{ height: '0.5px', background: 'var(--color-border)' }} />
                <div style={{ display: 'flex', gap: 10, padding: '10px 12px', overflowX: 'auto', scrollbarWidth: 'none' }}>
                  {storyPosts.map(post => (
                    <StoryCircle key={post.id} post={post} clientColor={clientColor} clientInitials={clientInitials} avatarUrl={avatarUrl}
                      seen={seenStories.has(post.id)} approvalMode={approvalMode} onClick={() => setActiveStory(post)} />
                  ))}
                </div>
              </>
            )}

            <div style={{ height: '0.5px', background: 'var(--color-border)', flexShrink: 0 }} />

            {/* Grid */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 2, background: 'var(--color-border)' }}>
              {gridPosts.map(post => (
                <PostThumb key={post.id} post={post}
                  onClick={() => { if (!onPostClick) setSelectedPost(post); onPostClick?.(post) }}
                  dragging={dragging === post.id}
                  dragOver={dragOver === post.id && dragging !== post.id}
                />
              ))}
              {Array.from({ length: Math.max(0, 12 - gridPosts.length) }).map((_, i) => (
                <div key={`empty-${i}`} style={{ aspectRatio: '4/5', background: 'var(--color-bg-subtle)' }} />
              ))}
            </div>

            <div style={{ display: 'flex', justifyContent: 'center', padding: '10px 0 8px' }}>
              <div style={{ width: 80, height: 4, background: 'var(--color-text-primary)', borderRadius: 2, opacity: 0.2 }} />
            </div>
          </div>
          {!readonly && <p style={{ fontSize: 11, color: 'var(--color-text-muted)', textAlign: 'center', marginTop: 8 }}>arraste para reordenar</p>}
        </div>

        {/* Post side panel */}
        {selectedPost && !activeStory && (
          <PostPanel post={selectedPost} onClose={() => setSelectedPost(null)} nativeVideo={nativeVideo} />
        )}
      </div>

      {/* Story viewer */}
      {activeStory && (
        <StoryViewer
          post={activeStory}
          onClose={() => setActiveStory(null)}
          clientColor={clientColor}
          clientInitials={clientInitials}
          clientName={clientName}
          avatarUrl={avatarUrl}
          onSeen={markSeen}
          approvalMode={approvalMode}
          onApprove={handleStoryApprove}
          onReject={handleStoryReject}
          nativeVideo={nativeVideo}
        />
      )}
    </>
  )
}
