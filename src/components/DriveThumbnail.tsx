'use client'

import { useEffect, useState } from 'react'
import { Folder, FileText, File as FileIcon } from 'lucide-react'

type DriveFile = { id: string; name: string; mimeType: string }

type GalleryItem = DriveFile & { isVideo: boolean }
type OtherItem = DriveFile & { kind: 'folder' | 'pdf' | 'other' }

const FOLDER_MIME = 'application/vnd.google-apps.folder'

function kindOf(mimeType: string): OtherItem['kind'] {
  if (mimeType === FOLDER_MIME) return 'folder'
  if (mimeType === 'application/pdf') return 'pdf'
  return 'other'
}

function OtherFileChip({ item }: { item: OtherItem }) {
  const Icon = item.kind === 'folder' ? Folder : item.kind === 'pdf' ? FileText : FileIcon
  const href = item.kind === 'folder' ? `https://drive.google.com/drive/folders/${item.id}` : `https://drive.google.com/file/d/${item.id}/view`
  const isFolder = item.kind === 'folder'
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()}
      title={isFolder ? `Pasta dentro da pasta principal: ${item.name}` : item.name}
      className="w-[110px] aspect-[4/5] flex-shrink-0 rounded-lg flex flex-col items-center justify-center gap-2 px-2 text-center border"
      style={isFolder
        ? { background: 'var(--ds-warn-bg)', borderColor: 'var(--ds-warn-border)', color: 'var(--ds-warn-text)' }
        : { background: 'var(--color-bg-alt)', borderColor: 'transparent', color: 'var(--color-text-secondary)' }}>
      <Icon size={36} strokeWidth={1.5} className="flex-shrink-0" />
      <span className="text-sm font-semibold leading-snug line-clamp-2 break-words">{item.name}</span>
      {isFolder && <span className="text-[9px] font-bold uppercase tracking-wide opacity-80">pasta extra</span>}
    </a>
  )
}

// Preview de uma pasta do Google Drive: mostra imagens E vídeos lado a lado (até 6),
// com "capa.*" em primeiro se existir. Vídeo aparece com ícone de play — clicar abre
// o arquivo específico no Drive pra assistir. Qualquer outra coisa que não seja
// imagem/vídeo (pasta, PDF, doc etc.) aparece como chip abaixo — sem isso, ficava
// invisível mesmo quando tinha mais conteúdo lá dentro (ex: uma subpasta "Stories").
export function FolderThumbnail({ folderUrl }: { folderUrl: string }) {
  const [items, setItems] = useState<GalleryItem[]>([])
  const [others, setOthers] = useState<OtherItem[]>([])

  useEffect(() => {
    const folderId = folderUrl.match(/\/folders\/([-\w]{25,})/)?.[1]
    if (!folderId) return
    fetch(`/api/drive-folder?folderId=${folderId}`)
      .then(r => r.json())
      .then(d => {
        const files: DriveFile[] = d.files || []
        const imgs = files.filter(f => f.mimeType.startsWith('image/'))
        const vids = files.filter(f => f.mimeType.startsWith('video/'))
        const cover = imgs.find(f => /^capa\./i.test(f.name))
        const orderedImgs = cover ? [cover, ...imgs.filter(f => f.id !== cover.id)] : imgs
        setItems([...orderedImgs.map(f => ({ ...f, isVideo: false })), ...vids.map(f => ({ ...f, isVideo: true }))])
        setOthers(
          files
            .filter(f => !f.mimeType.startsWith('image/') && !f.mimeType.startsWith('video/'))
            .map(f => ({ ...f, kind: kindOf(f.mimeType) }))
        )
      })
      .catch(() => {})
  }, [folderUrl])

  if (items.length === 0 && others.length === 0) return null
  const MAX = 6
  const visible = items.slice(0, MAX)
  const extra = items.length - visible.length
  const hasSubfolder = others.some(o => o.kind === 'folder')

  return (
    <div className="flex flex-col gap-2 mb-2">
      {hasSubfolder && (
        <p className="text-[11px] font-medium flex items-center gap-1.5" style={{ color: 'var(--ds-warn-text)' }}>
          <Folder size={12} className="flex-shrink-0" />
          Tem pasta dentro dessa pasta — abra "Abrir pasta no Drive" acima pra ver tudo, não só o que está nas pastas abaixo.
        </p>
      )}
      {items.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {visible.map(item => (
            <a key={item.id} href={`https://drive.google.com/file/d/${item.id}/view`} target="_blank" rel="noopener noreferrer"
              onClick={e => e.stopPropagation()}
              className="relative w-[110px] aspect-[4/5] flex-shrink-0 rounded-lg overflow-hidden bg-[var(--color-bg-alt)] block">
              <img src={`/api/drive-thumb?id=${item.id}&sz=w400`} alt="" className="w-full h-full object-cover" style={{ height: '100%' }} />
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
      )}
      {others.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {others.map(item => <OtherFileChip key={item.id} item={item} />)}
        </div>
      )}
    </div>
  )
}

// Preview de um arquivo do Google Drive (imagem ou vídeo) — caixa única 4:5.
export function DriveThumbnail({ driveUrl, isVideo }: { driveUrl: string; isVideo: boolean }) {
  const driveId = driveUrl.match(/[-\w]{25,}/)?.[0]
  const thumbUrl = driveId ? `/api/drive-thumb?id=${driveId}&sz=w600` : null
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
