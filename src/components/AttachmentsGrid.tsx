'use client'

// Grade compacta de anexos/arquivos — usada em Cronograma, Extras e Materiais.
// Cada item é um quadradinho pequeno (preview real pra imagem, ícone pros
// demais tipos) + nome curto embaixo, em vez da lista antiga (ícone genérico
// + nome da URL inteira numa linha).

import { File, FileText, Trash2, ExternalLink } from 'lucide-react'
import { hostOf, formatBytes } from '@/lib/url'

export type UploadItem = { id: string; filename: string; file_url: string; file_size?: number | null; mime_type?: string | null }
export type LinkItem = { id: string; url: string; title?: string | null }

const TILE = 56 // px — pequeno de propósito, é só uma prévia

function isImage(mime?: string | null, url?: string) {
  if (mime) return mime.startsWith('image/')
  return /\.(png|jpe?g|webp|gif|avif)(\?|$)/i.test(url || '')
}

function UploadTile({ item, onRemove }: { item: UploadItem; onRemove: () => void }) {
  const img = isImage(item.mime_type, item.file_url)
  const Icon = item.mime_type === 'application/pdf' ? FileText : File
  return (
    <div className="group flex flex-col items-center gap-1" style={{ width: TILE + 16 }}>
      <div className="relative rounded-lg overflow-hidden border border-[var(--color-border)] bg-[var(--color-bg-alt)] flex items-center justify-center" style={{ width: TILE, height: TILE }}>
        {img ? (
          <img src={item.file_url} alt="" className="w-full h-full object-cover"
            onError={e => { const el = e.currentTarget; el.style.display = 'none' }} />
        ) : (
          <Icon size={20} className="text-[var(--color-text-muted)]" />
        )}
        {/* Cantos opostos (não lado a lado) — de propósito, pra não ter como clicar
            em excluir por engano tentando abrir, ou vice-versa. */}
        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/25 transition-colors opacity-0 group-hover:opacity-100">
          <a href={item.file_url} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()} title="Abrir"
            className="absolute top-1 left-1 w-6 h-6 rounded-md bg-white shadow-sm flex items-center justify-center text-[#111]"><ExternalLink size={11} /></a>
          <button onClick={e => { e.stopPropagation(); onRemove() }} title="Excluir"
            className="absolute top-1 right-1 w-6 h-6 rounded-md bg-white shadow-sm flex items-center justify-center text-[var(--ds-error-text)]"><Trash2 size={11} /></button>
        </div>
      </div>
      <span title={item.filename} className="text-[10px] text-[var(--color-text-muted)] text-center truncate w-full leading-tight">{item.filename}</span>
      {!!item.file_size && <span className="text-[9px] text-[var(--color-text-faint)] leading-tight">{formatBytes(item.file_size)}</span>}
    </div>
  )
}

function LinkTile({ item, onRemove }: { item: LinkItem; onRemove: () => void }) {
  const label = item.title?.trim() || hostOf(item.url)
  return (
    <div className="group flex flex-col items-center gap-1" style={{ width: TILE + 16 }}>
      <div className="relative rounded-lg overflow-hidden border border-[var(--color-border)] bg-[var(--color-bg-alt)] flex items-center justify-center" style={{ width: TILE, height: TILE }}>
        <img src={`https://www.google.com/s2/favicons?domain=${hostOf(item.url)}&sz=64`} alt="" className="w-6 h-6" />
        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/25 transition-colors opacity-0 group-hover:opacity-100">
          <a href={item.url} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()} title="Abrir"
            className="absolute top-1 left-1 w-6 h-6 rounded-md bg-white shadow-sm flex items-center justify-center text-[#111]"><ExternalLink size={11} /></a>
          <button onClick={e => { e.stopPropagation(); onRemove() }} title="Excluir"
            className="absolute top-1 right-1 w-6 h-6 rounded-md bg-white shadow-sm flex items-center justify-center text-[var(--ds-error-text)]"><Trash2 size={11} /></button>
        </div>
      </div>
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
