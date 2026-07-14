'use client'

import { useEffect, useState } from 'react'

type DriveFile = { id: string; name: string; mimeType: string }

// Preview de uma pasta do Google Drive: mostra várias imagens lado a lado (até 6),
// com "capa.*" em primeiro se existir. Sem nenhuma foto na pasta, cai pro frame de um vídeo.
export function FolderThumbnail({ folderUrl }: { folderUrl: string }) {
  const [images, setImages] = useState<DriveFile[]>([])
  const [video, setVideo] = useState<DriveFile | null>(null)

  useEffect(() => {
    const folderId = folderUrl.match(/\/folders\/([-\w]{25,})/)?.[1]
    if (!folderId) return
    const key = process.env.NEXT_PUBLIC_GOOGLE_API_KEY
    if (!key) return
    fetch(`https://www.googleapis.com/drive/v3/files?q=%27${folderId}%27+in+parents&fields=files(id,name,mimeType)&orderBy=name&key=${key}`)
      .then(r => r.json())
      .then(d => {
        const files: DriveFile[] = d.files || []
        const imgs = files.filter(f => f.mimeType.startsWith('image/'))
        if (imgs.length > 0) {
          const cover = imgs.find(f => /^capa\./i.test(f.name))
          setImages(cover ? [cover, ...imgs.filter(f => f.id !== cover.id)] : imgs)
          return
        }
        const vid = files.find(f => f.mimeType.startsWith('video/'))
        if (vid) setVideo(vid)
      })
      .catch(() => {})
  }, [folderUrl])

  const items = images.length > 0 ? images : video ? [video] : []
  if (items.length === 0) return null
  const isVideo = images.length === 0 && !!video
  const MAX = 6
  const shown = items.slice(0, MAX)
  const extra = items.length - shown.length

  return (
    <a href={folderUrl} target="_blank" rel="noopener noreferrer"
      onClick={e => e.stopPropagation()}
      className="flex flex-wrap gap-2 mb-2">
      {shown.map(item => (
        <div key={item.id} className="relative w-[110px] aspect-[4/5] flex-shrink-0 rounded-lg overflow-hidden bg-[var(--color-bg-alt)]">
          <img src={`https://drive.google.com/thumbnail?id=${item.id}&sz=w400`} alt="" className="w-full h-full object-cover" />
          {isVideo && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/30 pointer-events-none">
              <div className="w-9 h-9 rounded-full bg-white/90 flex items-center justify-center shadow-lg">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="#111" className="ml-0.5"><polygon points="5,3 19,12 5,21" /></svg>
              </div>
            </div>
          )}
        </div>
      ))}
      {extra > 0 && (
        <div className="w-[110px] aspect-[4/5] flex-shrink-0 rounded-lg flex items-center justify-center text-sm font-semibold"
          style={{ background: 'var(--color-bg-alt)', color: 'var(--color-text-muted)' }}>
          +{extra}
        </div>
      )}
    </a>
  )
}

// Preview de um arquivo do Google Drive (imagem ou vídeo) — caixa única 4:5.
export function DriveThumbnail({ driveUrl, isVideo }: { driveUrl: string; isVideo: boolean }) {
  const driveId = driveUrl.match(/[-\w]{25,}/)?.[0]
  const thumbUrl = driveId ? `https://drive.google.com/thumbnail?id=${driveId}&sz=w600` : null
  if (!thumbUrl) return null
  return (
    <a href={driveUrl} target="_blank" rel="noopener noreferrer"
      onClick={e => e.stopPropagation()}
      className="relative block w-[140px] aspect-[4/5] rounded-xl overflow-hidden mb-2 bg-[var(--color-bg-alt)]">
      <img src={thumbUrl} alt="preview" className="w-full h-full object-cover" />
      {isVideo && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/30 pointer-events-none">
          <div className="w-12 h-12 rounded-full bg-white/90 flex items-center justify-center shadow-lg">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="#111" className="ml-1"><polygon points="5,3 19,12 5,21" /></svg>
          </div>
        </div>
      )}
    </a>
  )
}
