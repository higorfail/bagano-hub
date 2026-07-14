'use client'

import { useEffect, useState } from 'react'

type DriveFile = { id: string; name: string; mimeType: string }

type GalleryItem = DriveFile & { isVideo: boolean }

// Preview de uma pasta do Google Drive: mostra imagens E vídeos lado a lado (até 6),
// com "capa.*" em primeiro se existir. Vídeo aparece com ícone de play — clicar abre
// o arquivo específico no Drive pra assistir. Sem nada disso, cai pra 1ª página de um PDF.
export function FolderThumbnail({ folderUrl }: { folderUrl: string }) {
  const [items, setItems] = useState<GalleryItem[]>([])
  const [pdf, setPdf] = useState<DriveFile | null>(null)

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
        const vids = files.filter(f => f.mimeType.startsWith('video/'))
        if (imgs.length > 0 || vids.length > 0) {
          const cover = imgs.find(f => /^capa\./i.test(f.name))
          const orderedImgs = cover ? [cover, ...imgs.filter(f => f.id !== cover.id)] : imgs
          setItems([...orderedImgs.map(f => ({ ...f, isVideo: false })), ...vids.map(f => ({ ...f, isVideo: true }))])
          return
        }
        const doc = files.find(f => f.mimeType === 'application/pdf')
        if (doc) setPdf(doc)
      })
      .catch(() => {})
  }, [folderUrl])

  const shown = items.length > 0 ? items : pdf ? [{ ...pdf, isVideo: false }] : []
  if (shown.length === 0) return null
  const MAX = 6
  const visible = shown.slice(0, MAX)
  const extra = shown.length - visible.length

  return (
    <div className="flex flex-wrap gap-2 mb-2">
      {visible.map(item => (
        <a key={item.id} href={`https://drive.google.com/file/d/${item.id}/view`} target="_blank" rel="noopener noreferrer"
          onClick={e => e.stopPropagation()}
          className="relative w-[110px] aspect-[4/5] flex-shrink-0 rounded-lg overflow-hidden bg-[var(--color-bg-alt)] block">
          <img src={`https://drive.google.com/thumbnail?id=${item.id}&sz=w400`} alt="" className="w-full h-full object-cover" style={{ height: '100%' }} />
          {item.isVideo && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/30 pointer-events-none">
              <div className="w-9 h-9 rounded-full bg-white/90 flex items-center justify-center shadow-lg">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="#111" className="ml-0.5"><polygon points="5,3 19,12 5,21" /></svg>
              </div>
            </div>
          )}
        </a>
      ))}
      {extra > 0 && (
        <a href={folderUrl} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()}
          className="w-[110px] aspect-[4/5] flex-shrink-0 rounded-lg flex items-center justify-center text-sm font-semibold"
          style={{ background: 'var(--color-bg-alt)', color: 'var(--color-text-muted)' }}>
          +{extra}
        </a>
      )}
    </div>
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
      <img src={thumbUrl} alt="preview" className="w-full h-full object-cover" style={{ height: '100%' }} />
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
