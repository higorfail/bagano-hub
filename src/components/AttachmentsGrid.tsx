'use client'

// Grade compacta de anexos/arquivos — usada em Cronograma, Extras e Materiais.
// Cada item é um quadradinho pequeno (preview real pra imagem, ícone pros
// demais tipos) + nome curto embaixo, em vez da lista antiga (ícone genérico
// + nome da URL inteira numa linha).

import { File, FileText, Trash2 } from 'lucide-react'
import { hostOf, formatBytes } from '@/lib/url'

export type UploadItem = { id: string; filename: string; file_url: string; file_size?: number | null; mime_type?: string | null }
export type LinkItem = { id: string; url: string; title?: string | null }

const TILE = 70 // px — +25% do tamanho original (56), ainda pequeno de propósito

function isImage(mime?: string | null, url?: string) {
  if (mime) return mime.startsWith('image/')
  return /\.(png|jpe?g|webp|gif|avif)(\?|$)/i.test(url || '')
}

// Botão de excluir pequeno no canto inferior direito — clicar na miniatura em
// si já abre o arquivo (é a própria imagem/ícone que é o link), sem precisar
// de um botão "abrir" por cima competindo com o de excluir.
function DeleteCorner({ onRemove }: { onRemove: () => void }) {
  return (
    <button onClick={e => { e.preventDefault(); e.stopPropagation(); onRemove() }} title="Excluir"
      className="absolute top-0.5 right-0.5 w-5 h-5 rounded-md bg-white shadow-sm flex items-center justify-center text-[var(--ds-error-text)] opacity-0 group-hover:opacity-100 transition-opacity">
      <Trash2 size={10} />
    </button>
  )
}

function UploadTile({ item, onRemove }: { item: UploadItem; onRemove: () => void }) {
  const img = isImage(item.mime_type, item.file_url)
  const Icon = item.mime_type === 'application/pdf' ? FileText : File
  return (
    <div className="group flex flex-col items-center gap-1" style={{ width: TILE + 16 }}>
      <a href={item.file_url} target="_blank" rel="noopener noreferrer"
        className="relative rounded-lg overflow-hidden border border-[var(--color-border)] bg-[var(--color-bg-alt)] flex items-center justify-center block hover:opacity-90 transition-opacity"
        style={{ width: TILE, height: TILE }}>
        {img ? (
          <img src={item.file_url} alt="" className="w-full h-full object-cover"
            onError={e => { const el = e.currentTarget; el.style.display = 'none' }} />
        ) : (
          <Icon size={24} className="text-[var(--color-text-muted)]" />
        )}
        <DeleteCorner onRemove={onRemove} />
      </a>
      <span title={item.filename} className="text-[10px] text-[var(--color-text-muted)] text-center truncate w-full leading-tight">{item.filename}</span>
      {!!item.file_size && <span className="text-[9px] text-[var(--color-text-faint)] leading-tight">{formatBytes(item.file_size)}</span>}
    </div>
  )
}

function LinkTile({ item, onRemove }: { item: LinkItem; onRemove: () => void }) {
  const label = item.title?.trim() || hostOf(item.url)
  return (
    <div className="group flex flex-col items-center gap-1" style={{ width: TILE + 16 }}>
      <a href={item.url} target="_blank" rel="noopener noreferrer"
        className="relative rounded-lg overflow-hidden border border-[var(--color-border)] bg-[var(--color-bg-alt)] flex items-center justify-center block hover:opacity-90 transition-opacity"
        style={{ width: TILE, height: TILE }}>
        <img src={`https://www.google.com/s2/favicons?domain=${hostOf(item.url)}&sz=64`} alt="" className="w-7 h-7" />
        <DeleteCorner onRemove={onRemove} />
      </a>
      <span title={item.url} className="text-[10px] text-[var(--color-text-muted)] text-center truncate w-full leading-tight">{label}</span>
    </div>
  )
}

export default function AttachmentsGrid({ uploads, links, onRemoveUpload, onRemoveLink }: {
  uploads: UploadItem[]
  links: LinkItem[]
  onRemoveUpload: (item: UploadItem) => void
  onRemoveLink: (item: LinkItem) => void
}) {
  if (uploads.length === 0 && links.length === 0) return null
  return (
    <div className="flex flex-wrap gap-3 mb-3">
      {uploads.map(u => <UploadTile key={u.id} item={u} onRemove={() => onRemoveUpload(u)} />)}
      {links.map(l => <LinkTile key={l.id} item={l} onRemove={() => onRemoveLink(l)} />)}
    </div>
  )
}
