'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import {
  Play, LayoutGrid, Image, CheckCircle2, Clock,
  AlertCircle, X, ExternalLink, Calendar, FileText,
  ChevronLeft, ChevronRight, Loader2
} from 'lucide-react'

export type PostType = 'photo' | 'reel' | 'carousel'
export type PostStatus = 'approved' | 'pending' | 'changes_requested' | 'draft'

export interface FeedPost {
  id: string
  title: string
  type: PostType
  status: PostStatus
  thumbnail_url?: string
  drive_url?: string        // URL de arquivo individual (legado)
  drive_folder_url?: string // URL da pasta do post (novo)
  copy?: string
  scheduled_date?: string
  feed_order?: number
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
  folderLink?: string
}

interface IPhoneFeedProps {
  posts: FeedPost[]
  clientName?: string
  clientColor?: string
  clientInitials?: string
  clientBio?: string
  followersCount?: number
  followingCount?: number
  onPostClick?: (post: FeedPost) => void
  onReorder?: (posts: FeedPost[]) => void
  readonly?: boolean
}

const STATUS_CONFIG = {
  approved:          { label: 'Aprovado',  color: '#22c55e', icon: CheckCircle2 },
  pending:           { label: 'Pendente',  color: '#f59e0b', icon: Clock        },
  changes_requested: { label: 'Alteração', color: '#ef4444', icon: AlertCircle  },
  draft:             { label: 'Rascunho',  color: '#94a3b8', icon: FileText     },
}

const TYPE_ICON = { photo: Image, reel: Play, carousel: LayoutGrid }

// Extrai o ID de qualquer URL do Google Drive (arquivo ou pasta)
function extractDriveId(url?: string): string | null {
  if (!url) return null
  // pasta: /folders/ID
  const folder = url.match(/\/folders\/([-\w]{25,})/)
  if (folder) return folder[1]
  // arquivo: /file/d/ID ou ?id=ID
  const file = url.match(/[-\w]{25,}/)
  return file ? file[0] : null
}

function driveIdToThumbnail(id: string, size = 400): string {
  return `https://drive.google.com/thumbnail?id=${id}&sz=w${size}`
}

function driveIdToEmbed(id: string): string {
  return `https://drive.google.com/file/d/${id}/preview`
}

// Busca arquivos de uma pasta via API pública do Drive
async function fetchFolderFiles(folderId: string): Promise<DriveFile[]> {
  try {
    const res = await fetch(
      `https://www.googleapis.com/drive/v3/files?q='${folderId}'+in+parents&fields=files(id,name,mimeType,thumbnailLink,webViewLink)&orderBy=name&key=${process.env.NEXT_PUBLIC_GOOGLE_API_KEY}`
    )
    if (!res.ok) return []
    const data = await res.json()
    return data.files || []
  } catch {
    return []
  }
}

// Resolve mídia de um post: tenta pasta primeiro, depois arquivo individual
async function resolveMedia(post: FeedPost): Promise<ResolvedMedia> {
  const folderUrl = post.drive_folder_url
  const fileUrl = post.drive_url

  // Tenta pasta
  if (folderUrl) {
    const folderId = extractDriveId(folderUrl)
    if (folderId) {
      const files = await fetchFolderFiles(folderId)
      if (files.length > 0) {
        const images = files.filter(f => f.mimeType.startsWith('image/'))
        const videos = files.filter(f => f.mimeType.startsWith('video/'))

        if (post.type === 'reel') {
          // Imagem = thumbnail, vídeo = embed
          const thumb = images[0] ? driveIdToThumbnail(images[0].id) : undefined
          const video = videos[0] ? driveIdToEmbed(videos[0].id) : undefined
          return { thumbnailUrl: thumb, videoEmbedUrl: video, folderLink: folderUrl }
        }

        if (post.type === 'carousel') {
          // Todas as imagens ordenadas alfabeticamente, primeira = capa
          const sorted = images.sort((a, b) => a.name.localeCompare(b.name))
          const carouselImages = sorted.map(f => driveIdToThumbnail(f.id, 600))
          return {
            thumbnailUrl: carouselImages[0],
            carouselImages,
            folderLink: folderUrl,
          }
        }

        // Photo
        const thumb = images[0] ? driveIdToThumbnail(images[0].id) : undefined
        return { thumbnailUrl: thumb, folderLink: folderUrl }
      }
    }
  }

  // Fallback: arquivo individual (legado)
  if (fileUrl) {
    const id = extractDriveId(fileUrl)
    if (id) {
      if (post.type === 'reel') {
        return { thumbnailUrl: driveIdToThumbnail(id), videoEmbedUrl: driveIdToEmbed(id) }
      }
      return { thumbnailUrl: driveIdToThumbnail(id) }
    }
  }

  return {}
}

// Componente de thumbnail com lazy loading
function PostThumb({ post, onClick, dragging, dragOver }: {
  post: FeedPost
  onClick: () => void
  dragging: boolean
  dragOver: boolean
}) {
  const [thumbUrl, setThumbUrl] = useState<string | undefined>(undefined)
  const [loaded, setLoaded] = useState(false)
  const TypeIcon = TYPE_ICON[post.type]
  const status = STATUS_CONFIG[post.status]

  useEffect(() => {
    // Resolve thumbnail rapidamente sem buscar a pasta inteira
    const url = post.drive_folder_url || post.drive_url
    const id = extractDriveId(url)
    if (id) setThumbUrl(driveIdToThumbnail(id, 300))
  }, [post.drive_folder_url, post.drive_url])

  return (
    <div
      onClick={onClick}
      draggable
      style={{
        aspectRatio: '1/1',
        position: 'relative',
        overflow: 'hidden',
        background: '#e8e8e8',
        cursor: 'pointer',
        opacity: dragging ? 0.25 : 1,
        outline: dragOver ? '2px solid #3b82f6' : 'none',
        outlineOffset: -2,
        transition: 'opacity 0.1s',
      }}
    >
      {thumbUrl ? (
        <>
          {!loaded && (
            <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#e8e8e8' }}>
              <div style={{ width: 16, height: 16, border: '2px solid #ddd', borderTopColor: '#aaa', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
            </div>
          )}
          <img
            src={thumbUrl}
            alt={post.title}
            loading="lazy"
            onLoad={() => setLoaded(true)}
            style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block', opacity: loaded ? 1 : 0, transition: 'opacity 0.2s' }}
          />
        </>
      ) : (
        <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <TypeIcon size={14} color="#bbb" />
        </div>
      )}
      <TypeIcon size={11} color="white" style={{ position: 'absolute', top: 5, right: 5, filter: 'drop-shadow(0 1px 2px rgba(0,0,0,0.5))' }} />
      <div style={{ position: 'absolute', bottom: 5, left: 5, width: 6, height: 6, borderRadius: '50%', background: status.color, border: '1.5px solid rgba(255,255,255,0.9)' }} />
    </div>
  )
}

// Painel lateral do post selecionado
function PostPanel({ post, onClose, clientColor }: {
  post: FeedPost
  onClose: () => void
  clientColor: string
}) {
  const [media, setMedia] = useState<ResolvedMedia | null>(null)
  const [loading, setLoading] = useState(true)
  const [slide, setSlide] = useState(0)
  const StatusIcon = STATUS_CONFIG[post.status].icon

  useEffect(() => {
    setLoading(true)
    setSlide(0)
    resolveMedia(post).then(m => {
      setMedia(m)
      setLoading(false)
    })
  }, [post.id])

  const slides = media?.carouselImages || (media?.thumbnailUrl ? [media.thumbnailUrl] : [])
  const isCarousel = post.type === 'carousel' && slides.length > 1
  const isReel = post.type === 'reel'

  return (
    <div style={{ width: 300, flexShrink: 0, background: 'white', border: '0.5px solid #e5e7eb', borderRadius: 16, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 14px', borderBottom: '0.5px solid #f3f4f6' }}>
        <div>
          <span style={{ fontSize: 13, fontWeight: 600, color: '#111' }}>{post.title}</span>
          <span style={{ fontSize: 11, color: '#9ca3af', marginLeft: 8, textTransform: 'capitalize' }}>{post.type}</span>
        </div>
        <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9ca3af', padding: 2 }}>
          <X size={15} />
        </button>
      </div>

      {/* Mídia */}
      <div style={{ aspectRatio: '4/5', background: '#f3f4f6', position: 'relative', overflow: 'hidden', flexShrink: 0 }}>
        {loading ? (
          <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Loader2 size={20} color="#ccc" style={{ animation: 'spin 1s linear infinite' }} />
          </div>
        ) : isReel && media?.videoEmbedUrl ? (
          // Vídeo embed
          <iframe
            src={media.videoEmbedUrl}
            style={{ width: '100%', height: '100%', border: 'none' }}
            allow="autoplay"
            allowFullScreen
          />
        ) : slides.length > 0 ? (
          // Imagem ou carrossel
          <>
            <img
              src={slides[slide]}
              alt={post.title}
              style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
            />
            {isCarousel && (
              <>
                {/* Indicadores */}
                <div style={{ position: 'absolute', bottom: 8, left: 0, right: 0, display: 'flex', justifyContent: 'center', gap: 4 }}>
                  {slides.map((_, i) => (
                    <div key={i} onClick={() => setSlide(i)} style={{ width: i === slide ? 16 : 5, height: 5, borderRadius: 3, background: i === slide ? 'white' : 'rgba(255,255,255,0.5)', cursor: 'pointer', transition: 'width 0.2s' }} />
                  ))}
                </div>
                {/* Setas */}
                {slide > 0 && (
                  <button onClick={() => setSlide(s => s - 1)} style={{ position: 'absolute', left: 8, top: '50%', transform: 'translateY(-50%)', background: 'rgba(0,0,0,0.35)', border: 'none', borderRadius: '50%', width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
                    <ChevronLeft size={16} color="white" />
                  </button>
                )}
                {slide < slides.length - 1 && (
                  <button onClick={() => setSlide(s => s + 1)} style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', background: 'rgba(0,0,0,0.35)', border: 'none', borderRadius: '50%', width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
                    <ChevronRight size={16} color="white" />
                  </button>
                )}
                <div style={{ position: 'absolute', top: 8, right: 8, background: 'rgba(0,0,0,0.45)', borderRadius: 12, padding: '2px 8px', fontSize: 11, color: 'white' }}>
                  {slide + 1}/{slides.length}
                </div>
              </>
            )}
            {/* Ícone play overlay no reel sem vídeo ainda */}
            {isReel && !media?.videoEmbedUrl && (
              <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.2)' }}>
                <div style={{ width: 44, height: 44, borderRadius: '50%', background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Play size={20} color="white" fill="white" style={{ marginLeft: 2 }} />
                </div>
              </div>
            )}
          </>
        ) : (
          <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Image size={24} color="#ccc" />
          </div>
        )}
      </div>

      {/* Infos */}
      <div style={{ padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 10, overflowY: 'auto' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '3px 9px', borderRadius: 999, background: STATUS_CONFIG[post.status].color, color: 'white', fontSize: 11, fontWeight: 500 }}>
            <StatusIcon size={11} />{STATUS_CONFIG[post.status].label}
          </div>
        </div>

        {post.scheduled_date && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: '#6b7280' }}>
            <Calendar size={13} color="#9ca3af" />
            {new Date(post.scheduled_date).toLocaleDateString('pt-BR', { day: 'numeric', month: 'long' })}
          </div>
        )}

        {post.copy && (
          <div style={{ background: '#f9fafb', borderRadius: 10, padding: '10px 12px' }}>
            <p style={{ fontSize: 10, color: '#9ca3af', fontWeight: 500, marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Legenda</p>
            <p style={{ fontSize: 12, color: '#374151', lineHeight: 1.6, margin: 0 }}>{post.copy}</p>
          </div>
        )}

        {(media?.folderLink || post.drive_url) && (
          <a
            href={media?.folderLink || post.drive_url}
            target="_blank"
            rel="noopener noreferrer"
            style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#3b82f6', textDecoration: 'none' }}
          >
            <ExternalLink size={13} />
            Abrir pasta no Drive
          </a>
        )}
      </div>
    </div>
  )
}

export default function IPhoneFeed({
  posts: initialPosts,
  clientName = 'Cliente',
  clientColor = '#1a1a1a',
  clientInitials = 'CL',
  clientBio,
  followersCount,
  followingCount,
  onPostClick,
  onReorder,
  readonly = false,
}: IPhoneFeedProps) {
  const [posts, setPosts] = useState<FeedPost[]>(
    [...initialPosts].sort((a, b) => (a.feed_order ?? 999) - (b.feed_order ?? 999))
  )
  const [selectedPost, setSelectedPost] = useState<FeedPost | null>(null)
  const [dragging, setDragging] = useState<string | null>(null)
  const [dragOver, setDragOver] = useState<string | null>(null)
  const dragSrcId = useRef<string | null>(null)

  // Sincroniza se posts externos mudam
  useEffect(() => {
    setPosts([...initialPosts].sort((a, b) => (a.feed_order ?? 999) - (b.feed_order ?? 999)))
  }, [initialPosts])

  const handleDragStart = useCallback((id: string) => {
    if (readonly) return
    dragSrcId.current = id
    setDragging(id)
  }, [readonly])

  const handleDrop = useCallback((targetId: string) => {
    const srcId = dragSrcId.current
    if (!srcId || srcId === targetId) return
    setPosts(prev => {
      const newPosts = [...prev]
      const srcIdx = newPosts.findIndex(p => p.id === srcId)
      const tgtIdx = newPosts.findIndex(p => p.id === targetId)
      const [moved] = newPosts.splice(srcIdx, 1)
      newPosts.splice(tgtIdx, 0, moved)
      const reordered = newPosts.map((p, i) => ({ ...p, feed_order: i }))
      onReorder?.(reordered)
      return reordered
    })
    setDragging(null)
    setDragOver(null)
  }, [onReorder])

  return (
    <>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      <div style={{ display: 'flex', gap: 24, alignItems: 'flex-start' }}>
        {/* iPhone */}
        <div style={{ flexShrink: 0 }}>
          <div style={{
            width: 290,
            border: '1.5px solid #EBEAE5',
            borderRadius: 46,
            overflow: 'hidden',
            background: '#fff',
            display: 'flex',
            flexDirection: 'column',
            boxShadow: '0 0 0 6px #f5f5f3, 0 0 0 7px #e8e8e4',
          }}>
            {/* Notch */}
            <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 10, paddingBottom: 2 }}>
              <div style={{ width: 80, height: 20, background: '#111', borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5 }}>
                <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#222' }} />
                <div style={{ width: 20, height: 8, borderRadius: 4, background: '#222' }} />
              </div>
            </div>

            {/* Instagram header */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 16px 6px' }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: '#111' }}>{clientName.toLowerCase().replace(/\s+/g, '.')}</span>
              <div style={{ display: 'flex', gap: 12 }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#111" strokeWidth="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#111" strokeWidth="2"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></svg>
              </div>
            </div>

            {/* Profile */}
            <div style={{ padding: '0 16px 12px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 6 }}>
                <div style={{ width: 48, height: 48, borderRadius: '50%', flexShrink: 0, background: clientColor, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 600, color: 'white' }}>{clientInitials}</div>
                <div style={{ display: 'flex', flex: 1 }}>
                  {[{ num: posts.length, label: 'posts' }, { num: followersCount ?? '—', label: 'seguid.' }, { num: followingCount ?? '—', label: 'seguindo' }].map(({ num, label }) => (
                    <div key={label} style={{ flex: 1, textAlign: 'center' }}>
                      <span style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#111' }}>{num}</span>
                      <span style={{ display: 'block', fontSize: 9, color: '#888' }}>{label}</span>
                    </div>
                  ))}
                </div>
              </div>
              <div style={{ fontSize: 10, fontWeight: 700, color: '#111', marginBottom: 1 }}>{clientName}</div>
              {clientBio && <div style={{ fontSize: 9, color: '#555', lineHeight: 1.4 }}>{clientBio}</div>}

              {/* Botão seguir */}
              <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
                <div style={{ flex: 1, background: clientColor, borderRadius: 6, padding: '4px 0', textAlign: 'center', fontSize: 10, fontWeight: 600, color: 'white' }}>Seguir</div>
                <div style={{ flex: 1, background: '#f0f0f0', borderRadius: 6, padding: '4px 0', textAlign: 'center', fontSize: 10, fontWeight: 500, color: '#111' }}>Mensagem</div>
              </div>
            </div>

            <div style={{ height: '0.5px', background: '#efefef', flexShrink: 0 }} />

            {/* Grid de posts */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 2, background: '#e0e0e0' }}>
              {posts.map(post => (
                <PostThumb
                  key={post.id}
                  post={post}
                  onClick={() => { setSelectedPost(post); onPostClick?.(post) }}
                  dragging={dragging === post.id}
                  dragOver={dragOver === post.id && dragging !== post.id}
                />
              ))}
              {/* Células vazias para completar 12 */}
              {Array.from({ length: Math.max(0, 12 - posts.length) }).map((_, i) => (
                <div key={`empty-${i}`} style={{ aspectRatio: '1/1', background: '#f5f5f5' }} />
              ))}
            </div>

            {/* Home indicator */}
            <div style={{ display: 'flex', justifyContent: 'center', padding: '10px 0 8px' }}>
              <div style={{ width: 80, height: 4, background: '#111', borderRadius: 2, opacity: 0.2 }} />
            </div>
          </div>
          {!readonly && <p style={{ fontSize: 11, color: '#aaa', textAlign: 'center', marginTop: 8 }}>arraste para reordenar</p>}
        </div>

        {/* Painel do post selecionado */}
        {selectedPost && (
          <PostPanel
            post={selectedPost}
            onClose={() => setSelectedPost(null)}
            clientColor={clientColor}
          />
        )}
      </div>
    </>
  )
}
