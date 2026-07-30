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

// O favicon genérico (google.com/s2/favicons) devolve um "G" cinza pro Drive
// em vez do triângulo colorido de verdade — logo oficial embutido aqui pra
// nunca depender de um serviço de terceiro pra isso.
function DriveIcon() {
  return (
    <svg viewBox="0 0 87.3 78" className="w-7 h-7">
      <path d="m6.6 66.85 3.85 6.65c.8 1.4 1.95 2.5 3.3 3.3l13.75-23.8h-27.5c0 1.55.4 3.1 1.2 4.5z" fill="#0066da" />
      <path d="m43.65 25-13.75-23.8c-1.35.8-2.5 1.9-3.3 3.3l-25.4 44a9.06 9.06 0 0 0 -1.2 4.5h27.5z" fill="#00ac47" />
      <path d="m73.55 76.8c1.35-.8 2.5-1.9 3.3-3.3l1.6-2.75 7.65-13.25c.8-1.4 1.2-2.95 1.2-4.5h-27.502l5.852 11.5z" fill="#ea4335" />
      <path d="m43.65 25 13.75-23.8c-1.35-.8-2.9-1.2-4.5-1.2h-18.5c-1.6 0-3.15.45-4.5 1.2z" fill="#00832d" />
      <path d="m59.8 53h-32.3l-13.75 23.8c1.35.8 2.9 1.2 4.5 1.2h50.8c1.6 0 3.15-.45 4.5-1.2z" fill="#2684fc" />
      <path d="m73.4 26.5-12.7-22c-.8-1.4-1.95-2.5-3.3-3.3l-13.75 23.8 16.15 28h27.45c0-1.55-.4-3.1-1.2-4.5z" fill="#ffba00" />
    </svg>
  )
}

function isDriveHost(host: string) { return host === 'drive.google.com' || host === 'docs.google.com' }

// Drive quase nunca devolve um <title> usável pro fetchLinkTitle (arquivo sem
// compartilhamento público cai numa tela de login, cujo título não diz nada) —
// melhor um rótulo genérico mas certo ("Pasta do Drive"/"Arquivo do Drive")
// do que a URL truncada.
function fallbackLabel(url: string, host: string) {
  if (isDriveHost(host)) return /\/folders\//.test(url) ? 'Pasta do Drive' : 'Arquivo do Drive'
  return hostOf(url)
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
        className="relative rounded-lg overflow-hidden border border-[var(--color-border)] bg-[var(--color-bg-subtle)] flex items-center justify-center block hover:opacity-90 transition-opacity"
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
  const host = hostOf(item.url)
  const label = item.title?.trim() || fallbackLabel(item.url, host)
  return (
    <div className="group flex flex-col items-center gap-1" style={{ width: TILE + 16 }}>
      <a href={item.url} target="_blank" rel="noopener noreferrer"
        className="relative rounded-lg overflow-hidden border border-[var(--color-border)] bg-[var(--color-bg-subtle)] flex items-center justify-center block hover:opacity-90 transition-opacity"
        style={{ width: TILE, height: TILE }}>
        {isDriveHost(host) ? <DriveIcon /> : <img src={`https://www.google.com/s2/favicons?domain=${host}&sz=64`} alt="" className="w-7 h-7" />}
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
