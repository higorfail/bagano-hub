'use client'

import { useEffect, useState } from 'react'

// Preview de uma pasta do Google Drive: busca a 1ª imagem (ou "capa.*");
// se não houver nenhuma foto de capa na pasta, usa o frame de um vídeo como fallback.
export function FolderThumbnail({ folderUrl }: { folderUrl: string }) {
  const [thumbUrl, setThumbUrl] = useState<string | null>(null)
  const [isVideoThumb, setIsVideoThumb] = useState(false)
  const [visible, setVisible] = useState(false)
  useEffect(() => {
    const folderId = folderUrl.match(/\/folders\/([-\w]{25,})/)?.[1]
    if (!folderId) return
    const key = process.env.NEXT_PUBLIC_GOOGLE_API_KEY
    if (!key) return
    fetch(`https://www.googleapis.com/drive/v3/files?q=%27${folderId}%27+in+parents&fields=files(id,name,mimeType)&orderBy=name&key=${key}`)
      .then(r => r.json())
      .then(d => {
        const files: { id: string; name: string; mimeType: string }[] = d.files || []
        const images = files.filter(f => f.mimeType.startsWith('image/'))
        const cover = images.find(f => /^capa\./i.test(f.name)) ?? images[0]
        if (cover) { setThumbUrl(`https://drive.google.com/thumbnail?id=${cover.id}&sz=w600`); setIsVideoThumb(false); return }
        const video = files.find(f => f.mimeType.startsWith('video/'))
        if (video) { setThumbUrl(`https://drive.google.com/thumbnail?id=${video.id}&sz=w600`); setIsVideoThumb(true) }
      })
      .catch(() => {})
  }, [folderUrl])
  if (!thumbUrl) return null
  return (
    <a href={folderUrl} target="_blank" rel="noopener noreferrer"
      onClick={e => e.stopPropagation()}
      className="relative block rounded-xl overflow-hidden mb-2 bg-[var(--color-bg-alt)]"
      style={{ height: visible ? (isVideoThumb ? 180 : 140) : 0 }}>
      <img src={thumbUrl} alt="preview" className="w-full h-full object-cover"
        onLoad={() => setVisible(true)} onError={() => {}} />
      {isVideoThumb && visible && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/30 pointer-events-none">
          <div className="w-12 h-12 rounded-full bg-white/90 flex items-center justify-center shadow-lg">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="#111" className="ml-1"><polygon points="5,3 19,12 5,21" /></svg>
          </div>
        </div>
      )}
    </a>
  )
}

// Preview de um arquivo do Google Drive (imagem ou vídeo).
export function DriveThumbnail({ driveUrl, isVideo }: { driveUrl: string; isVideo: boolean }) {
  const [visible, setVisible] = useState(false)
  const driveId = driveUrl.match(/[-\w]{25,}/)?.[0]
  const thumbUrl = driveId ? `https://drive.google.com/thumbnail?id=${driveId}&sz=w600` : null
  if (!thumbUrl) return null
  return (
    <a href={driveUrl} target="_blank" rel="noopener noreferrer"
      onClick={e => e.stopPropagation()}
      className="relative block rounded-xl overflow-hidden mb-2 bg-[var(--color-bg-alt)]"
      style={{ height: visible ? (isVideo ? 180 : 140) : 0 }}>
      <img src={thumbUrl} alt="preview" className="w-full h-full object-cover"
        onLoad={() => setVisible(true)} onError={() => {}} />
      {isVideo && visible && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/30 pointer-events-none">
          <div className="w-12 h-12 rounded-full bg-white/90 flex items-center justify-center shadow-lg">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="#111" className="ml-1"><polygon points="5,3 19,12 5,21" /></svg>
          </div>
        </div>
      )}
    </a>
  )
}
