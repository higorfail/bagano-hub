'use client'

// Grade compacta de anexos/arquivos — usada em Cronograma, Extras e Materiais.
// Cada item é um quadradinho pequeno (preview real pra imagem, ícone pros
// demais tipos) + nome curto embaixo, em vez da lista antiga (ícone genérico
// + nome da URL inteira numa linha).

import { useId } from 'react'
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
// em vez do logo de verdade — logo oficial (redesign 2026, triângulo
// arredondado com gradiente) embutido aqui pra nunca depender de um serviço
// de terceiro. IDs de máscara/gradiente sufixados com useId() — sem isso,
// duas miniaturas de Drive na mesma página colidiam no mesmo id de <mask>/
// <linearGradient> (namespace global do DOM), e a segunda "roubava" o
// gradiente da primeira.
function DriveIcon() {
  const uid = useId()
  const m = `drv-mask-${uid}`, g1 = `drv-g1-${uid}`, g2 = `drv-g2-${uid}`, g3 = `drv-g3-${uid}`
  return (
    <svg viewBox="0 0 800 741.3696" className="w-7 h-7">
      <mask id={m} width="168" height="154" x="12" y="18" maskUnits="userSpaceOnUse">
        <path fill="#fff" d="M63.09 37c14.626-25.333 51.193-25.334 65.819 0l45.033 78c14.626 25.334-3.657 57.001-32.91 57.001H50.967c-29.253 0-47.536-31.667-32.91-57.001Z" />
      </mask>
      <g mask={`url(#${m})`} transform="matrix(4.8140532,0,0,4.8140532,-62.146701,-86.652356)">
        <path fill={`url(#${g1})`} d="M206.905 172.02h-91.888l-19.015-32.934 45.944-79.578Z" />
        <path fill={`url(#${g2})`} d="M-14.919 172.006 50.04 59.494v.002L31.032 92.422h38.02L115 172.004l-129.918.001Z" />
        <path fill={`url(#${g3})`} d="M96.007-20.085 141.954 59.5l-19.011 32.928H31.048Z" />
      </g>
      <defs>
        <linearGradient id={g1} x1="193.6" x2="103.09" y1="165.6" y2="111.21" gradientUnits="userSpaceOnUse">
          <stop offset=".09" stopColor="#ffe921" />
          <stop offset="1" stopColor="#fec700" />
        </linearGradient>
        <linearGradient id={g2} x1="114.4" x2="15.53" y1="181.61" y2="121.8" gradientUnits="userSpaceOnUse">
          <stop offset=".15" stopColor="#a9a8ff" />
          <stop offset=".33" stopColor="#6d97ff" />
          <stop offset=".48" stopColor="#3186ff" />
        </linearGradient>
        <linearGradient id={g3} x1="128.88" x2="28.7" y1="37.88" y2="84.64" gradientUnits="userSpaceOnUse">
          <stop offset=".55" stopColor="#0ebc5f" />
          <stop offset=".85" stopColor="#78c9ff" />
        </linearGradient>
      </defs>
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
