'use client'

import { useState, useRef } from 'react'
import { Play, LayoutGrid, Image, CheckCircle2, Clock, AlertCircle, X, ExternalLink, Calendar, FileText } from 'lucide-react'

export type PostType = 'photo' | 'reel' | 'carousel'
export type PostStatus = 'approved' | 'pending' | 'changes_requested' | 'draft'

export interface FeedPost {
  id: string
  title: string
  type: PostType
  status: PostStatus
  thumbnail_url?: string
  drive_url?: string
  copy?: string
  scheduled_date?: string
  feed_order?: number
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

function driveUrlToThumbnail(url?: string): string | undefined {
  if (!url) return undefined
  const match = url.match(/[-\w]{25,}/)
  if (!match) return undefined
  return `https://drive.google.com/thumbnail?id=${match[0]}&sz=w300`
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

  const handleDragStart = (id: string) => {
    if (readonly) return
    dragSrcId.current = id
    setDragging(id)
  }

  const handleDrop = (targetId: string) => {
    const srcId = dragSrcId.current
    if (!srcId || srcId === targetId) return
    const newPosts = [...posts]
    const srcIdx = newPosts.findIndex(p => p.id === srcId)
    const tgtIdx = newPosts.findIndex(p => p.id === targetId)
    const [moved] = newPosts.splice(srcIdx, 1)
    newPosts.splice(tgtIdx, 0, moved)
    const reordered = newPosts.map((p, i) => ({ ...p, feed_order: i }))
    setPosts(reordered)
    onReorder?.(reordered)
    setDragging(null)
    setDragOver(null)
  }

  const StatusIcon = selectedPost ? STATUS_CONFIG[selectedPost.status].icon : null

  return (
    <div className="flex gap-6 items-start">
      <div className="flex-shrink-0">
        <div style={{ width: 290, border: '1.5px solid #d4d4d4', borderRadius: 46, overflow: 'hidden', background: '#fff', display: 'flex', flexDirection: 'column' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '18px 18px 8px' }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: '#111' }}>{clientName.toLowerCase().replace(/\s+/g, '.')}</span>
            <div style={{ display: 'flex', gap: 14 }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#111" strokeWidth="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#111" strokeWidth="2"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></svg>
            </div>
          </div>
          <div style={{ padding: '4px 18px 14px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 8 }}>
              <div style={{ width: 52, height: 52, borderRadius: '50%', flexShrink: 0, background: clientColor, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, fontWeight: 500, color: 'white' }}>{clientInitials}</div>
              <div style={{ display: 'flex', flex: 1 }}>
                {[{ num: posts.length, label: 'posts' }, { num: followersCount ?? '—', label: 'seguidores' }, { num: followingCount ?? '—', label: 'seguindo' }].map(({ num, label }) => (
                  <div key={label} style={{ flex: 1, textAlign: 'center' }}>
                    <span style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#111' }}>{num}</span>
                    <span style={{ display: 'block', fontSize: 10, color: '#888' }}>{label}</span>
                  </div>
                ))}
              </div>
            </div>
            <div style={{ fontSize: 11, fontWeight: 600, color: '#111', marginBottom: 2 }}>{clientName}</div>
            {clientBio && <div style={{ fontSize: 10, color: '#555', lineHeight: 1.4 }}>{clientBio}</div>}
          </div>
          <div style={{ height: '0.5px', background: '#efefef', flexShrink: 0 }} />
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 2, background: '#e0e0e0' }}>
            {posts.map(post => {
              const TypeIcon = TYPE_ICON[post.type]
              const status = STATUS_CONFIG[post.status]
              const thumb = driveUrlToThumbnail(post.thumbnail_url || post.drive_url)
              return (
                <div
                  key={post.id}
                  draggable={!readonly}
                  onClick={() => { setSelectedPost(post); onPostClick?.(post) }}
                  onDragStart={() => handleDragStart(post.id)}
                  onDragEnd={() => { setDragging(null); setDragOver(null) }}
                  onDragOver={e => { e.preventDefault(); setDragOver(post.id) }}
                  onDrop={() => handleDrop(post.id)}
                  style={{ aspectRatio: '4/5', position: 'relative', overflow: 'hidden', background: '#e8e8e8', cursor: readonly ? 'pointer' : 'grab', opacity: dragging === post.id ? 0.25 : 1, outline: dragOver === post.id && dragging !== post.id ? '2px solid #3b82f6' : 'none', outlineOffset: -2, transition: 'opacity 0.1s' }}
                >
                  {thumb ? <img src={thumb} alt={post.title} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} /> : <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><TypeIcon size={14} color="#bbb" /></div>}
                  <TypeIcon size={11} color="white" style={{ position: 'absolute', top: 6, right: 6, filter: 'drop-shadow(0 1px 2px rgba(0,0,0,0.4))' }} />
                  <div style={{ position: 'absolute', bottom: 6, left: 6, width: 6, height: 6, borderRadius: '50%', background: status.color, border: '1.5px solid rgba(255,255,255,0.9)' }} />
                </div>
              )
            })}
          </div>
        </div>
        {!readonly && <p style={{ fontSize: 11, color: '#aaa', textAlign: 'center', marginTop: 10 }}>arraste para reordenar</p>}
      </div>

      {selectedPost && (
        <div style={{ width: 320, flexShrink: 0, background: 'white', border: '1px solid #e5e7eb', borderRadius: 16, overflow: 'hidden' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', borderBottom: '1px solid #f3f4f6' }}>
            <span style={{ fontSize: 14, fontWeight: 600, color: '#111' }}>{selectedPost.title}</span>
            <button onClick={() => setSelectedPost(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9ca3af', padding: 0 }}><X size={16} /></button>
          </div>
          {(selectedPost.thumbnail_url || selectedPost.drive_url) && (
            <div style={{ aspectRatio: '4/5', background: '#f3f4f6', overflow: 'hidden' }}>
              <img src={driveUrlToThumbnail(selectedPost.thumbnail_url || selectedPost.drive_url)} alt={selectedPost.title} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            </div>
          )}
          <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
            {StatusIcon && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '4px 10px', borderRadius: 999, background: STATUS_CONFIG[selectedPost.status].color, color: 'white', fontSize: 12, fontWeight: 500 }}>
                  <StatusIcon size={12} />{STATUS_CONFIG[selectedPost.status].label}
                </div>
                <span style={{ fontSize: 12, color: '#9ca3af', textTransform: 'capitalize' }}>{selectedPost.type}</span>
              </div>
            )}
            {selectedPost.scheduled_date && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: '#6b7280' }}>
                <Calendar size={14} color="#9ca3af" />
                {new Date(selectedPost.scheduled_date).toLocaleDateString('pt-BR', { day: 'numeric', month: 'long' })}
              </div>
            )}
            {selectedPost.copy && (
              <div style={{ background: '#f9fafb', borderRadius: 12, padding: 12 }}>
                <p style={{ fontSize: 10, color: '#9ca3af', fontWeight: 500, marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Legenda</p>
                <p style={{ fontSize: 13, color: '#374151', lineHeight: 1.6, margin: 0 }}>{selectedPost.copy}</p>
              </div>
            )}
            {selectedPost.drive_url && (
              <a href={selectedPost.drive_url} target="_blank" rel="noopener noreferrer" style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: '#3b82f6', textDecoration: 'none' }}>
                <ExternalLink size={14} />Abrir no Drive
              </a>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
