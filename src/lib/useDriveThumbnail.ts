'use client'

// Resolve uma prévia (imagem/vídeo) do conteúdo do Drive — mesma lógica do
// PostMiniCard (capa da pasta ou arquivo único), reaproveitada aqui pra
// mostrar prévia nos cards/popover da página de Publicações.
import { useEffect, useState } from 'react'

export function useDriveThumbnail(driveUrl?: string | null, driveFolderUrl?: string | null, isVideoType = false) {
  const [thumbUrl, setThumbUrl] = useState<string | null>(() => {
    const id = driveUrl?.match(/[-\w]{25,}/)?.[0]
    return id ? `/api/drive-thumb?id=${id}&sz=w480` : null
  })
  const [isVideo, setIsVideo] = useState(isVideoType)

  useEffect(() => {
    if (!driveFolderUrl) return
    const folderId = driveFolderUrl.match(/\/folders\/([-\w]{25,})/)?.[1]
    if (!folderId) return
    fetch(`/api/drive-folder?folderId=${folderId}`)
      .then(r => r.json())
      .then(d => {
        const files: { id: string; name: string; mimeType: string }[] = d.files || []
        const images = files.filter(f => f.mimeType.startsWith('image/'))
        const cover = images.find(f => /^capa\./i.test(f.name)) ?? images[0]
        if (cover) { setThumbUrl(`/api/drive-thumb?id=${cover.id}&sz=w480`); setIsVideo(false); return }
        const pdf = files.find(f => f.mimeType === 'application/pdf')
        if (pdf) { setThumbUrl(`/api/drive-thumb?id=${pdf.id}&sz=w480`); setIsVideo(false); return }
        const video = files.find(f => f.mimeType.startsWith('video/'))
        if (video) { setThumbUrl(`/api/drive-thumb?id=${video.id}&sz=w480`); setIsVideo(true) }
      })
      .catch(() => {})
  }, [driveFolderUrl])

  return { thumbUrl, isVideo }
}
