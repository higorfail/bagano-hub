'use client'

// Lista as artes de uma pasta do Drive. É o banco de variações de um recorrente:
// quem joga uma arte nova na pasta já vê ela virar opção no hub, sem precisar
// reeditar nada aqui — por isso o recorrente aponta pra PASTA, não pra arquivos
// avulsos.
import { useEffect, useState } from 'react'
import { folderIdOf } from '@/lib/recurrings'

export type DriveFile = { id: string; name: string; mimeType: string; isVideo: boolean }

// A mesma pasta aparece em várias linhas da lista de hoje (e de novo ao abrir o
// modal). Sem cache, cada linha refazia a chamada — a tela abria com um enxame
// de requisições idênticas pro mesmo folderId.
const cache = new Map<string, DriveFile[]>()

export function useDriveFolder(folderUrl?: string | null) {
  const folderId = folderIdOf(folderUrl)
  const [files, setFiles] = useState<DriveFile[]>(() => (folderId && cache.get(folderId)) || [])
  const [loading, setLoading] = useState(!!folderId && !cache.has(folderId || ''))

  useEffect(() => {
    if (!folderId) { setFiles([]); setLoading(false); return }
    const cached = cache.get(folderId)
    if (cached) { setFiles(cached); setLoading(false); return }

    let alive = true
    setLoading(true)
    fetch(`/api/drive-folder?folderId=${folderId}`)
      .then(r => r.json())
      .then(d => {
        const raw: { id: string; name: string; mimeType: string }[] = d.files || []
        // Só o que dá pra postar. Subpasta, PDF e planilha que estejam na mesma
        // pasta não são variação de story — apareceriam como opção em branco.
        const usable = raw
          .filter(f => f.mimeType.startsWith('image/') || f.mimeType.startsWith('video/'))
          .map(f => ({ ...f, isVideo: f.mimeType.startsWith('video/') }))
        cache.set(folderId, usable)
        if (alive) { setFiles(usable); setLoading(false) }
      })
      .catch(() => { if (alive) { setFiles([]); setLoading(false) } })
    return () => { alive = false }
  }, [folderId])

  return { files, loading, folderId }
}

/** Esvazia o cache de uma pasta — usado depois de salvar o recorrente, pra quem
 *  acabou de trocar a pasta não continuar vendo as artes da anterior. */
export function invalidateDriveFolder(folderUrl?: string | null) {
  const id = folderIdOf(folderUrl)
  if (id) cache.delete(id)
}
