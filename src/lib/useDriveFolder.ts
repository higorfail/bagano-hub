'use client'

// Lê a pasta do Drive de um recorrente. A estrutura real do time é uma pasta
// por dia da semana, e cada uma com a SEQUÊNCIA de stories daquele dia:
//
//   Stories Executivo/
//     ter/  1.jpg  2.jpg  3.jpg     ← sai tudo junto, nesta ordem
//     qua/  1.jpg  2.jpg
//     qui/  1.jpg  2.jpg  3.jpg
//
// Então a unidade não é "uma arte", é uma sequência — e quem escolhe a
// sequência do dia é o nome da subpasta, não sorteio.
import { useEffect, useState } from 'react'
import { folderIdOf, weekdayOfFolderName, parseISO } from '@/lib/recurrings'

export type DriveFile   = { id: string; name: string; mimeType: string; isVideo: boolean }
export type DriveFolder = { id: string; name: string }

/** Uma postagem completa: a sequência de arquivos que sai junto. Em pasta sem
 *  subpasta, cada arquivo solto é uma sequência de um. */
export type Sequence = {
  id: string
  name: string
  /** 0=dom … 6=sáb quando o nome da subpasta é um dia da semana. */
  weekday: number | null
  files: DriveFile[]
  /** null pra arquivo solto — não tem pasta própria pra abrir. */
  folderUrl: string | null
}

/** Como as sequências deste recorrente são escolhidas.
 *  - `weekday`: tem subpasta por dia da semana; o dia manda.
 *  - `rotation`: tem subpastas (ou arquivos soltos) sem dia definido; entra a
 *    rotação por menos-usada.
 *  - `empty`: nada utilizável na pasta. */
export type SequenceMode = 'weekday' | 'rotation' | 'empty'

type Listing = { files: DriveFile[]; folders: DriveFolder[] }

const FOLDER_MIME = 'application/vnd.google-apps.folder'

// A mesma pasta aparece em várias linhas da lista de hoje (e de novo no modal).
// Sem cache, cada linha refazia a chamada — a tela abria com um enxame de
// requisições idênticas pro mesmo folderId.
const cache = new Map<string, Promise<Listing>>()

function list(folderId: string): Promise<Listing> {
  const hit = cache.get(folderId)
  if (hit) return hit
  const p = fetch(`/api/drive-folder?folderId=${folderId}`)
    .then(r => r.json())
    .then((d): Listing => {
      const raw: { id: string; name: string; mimeType: string }[] = d.files || []
      return {
        files: raw
          .filter(f => f.mimeType.startsWith('image/') || f.mimeType.startsWith('video/'))
          .map(f => ({ ...f, isVideo: f.mimeType.startsWith('video/') })),
        folders: raw.filter(f => f.mimeType === FOLDER_MIME).map(f => ({ id: f.id, name: f.name })),
      }
    })
    .catch((): Listing => ({ files: [], folders: [] }))
  cache.set(folderId, p)
  return p
}

export function invalidateDriveFolder(folderUrl?: string | null) {
  const id = folderIdOf(folderUrl)
  if (id) cache.delete(id)
}

function folderUrlOf(id: string) {
  return `https://drive.google.com/drive/folders/${id}`
}

/**
 * Resolve as sequências de um recorrente.
 *
 * `expand` decide quanto do Drive a gente abre. Na lista de hoje só interessa a
 * sequência do dia — abrir as 7 subpastas de cada recorrente seria uma dezena de
 * chamadas por linha da tela, pra mostrar uma. No modal de edição, aí sim, abre
 * tudo: é onde a pessoa cadastra legenda de cada dia.
 */
export function useDriveSequences(
  folderUrl?: string | null,
  opts: { expand: 'all' | string | null } = { expand: null },
) {
  const folderId = folderIdOf(folderUrl)
  const expand = opts.expand
  const [mode, setMode] = useState<SequenceMode>('empty')
  const [sequences, setSequences] = useState<Sequence[]>([])
  const [loading, setLoading] = useState(!!folderId)

  useEffect(() => {
    if (!folderId) { setSequences([]); setMode('empty'); setLoading(false); return }
    let alive = true
    setLoading(true)

    list(folderId).then(async root => {
      // Subpasta manda: se existe, os arquivos soltos ao lado dela são
      // sobra (capa, referência) e não entram como sequência própria.
      if (root.folders.length) {
        const base: Sequence[] = root.folders.map(f => ({
          id: f.id,
          name: f.name,
          weekday: weekdayOfFolderName(f.name),
          files: [],
          folderUrl: folderUrlOf(f.id),
        }))
        // Só é "por dia da semana" se TODAS as subpastas forem dias. Metade
        // sim, metade não seria uma regra que ninguém consegue prever.
        const isWeekday = base.every(s => s.weekday !== null)
        const wanted = expand === 'all' ? base : base.filter(s => s.id === expand)
        const filled = await Promise.all(wanted.map(async s => ({ ...s, files: (await list(s.id)).files })))
        const byId = Object.fromEntries(filled.map(s => [s.id, s]))
        if (!alive) return
        setMode(isWeekday ? 'weekday' : 'rotation')
        setSequences(base.map(s => byId[s.id] || s))
        setLoading(false)
        return
      }

      // Pasta chata: cada arquivo é uma opção, e a rotação evita repetir.
      if (!alive) return
      setMode(root.files.length ? 'rotation' : 'empty')
      setSequences(root.files.map(f => ({
        id: f.id, name: f.name, weekday: null, files: [f], folderUrl: null,
      })))
      setLoading(false)
    })

    return () => { alive = false }
  }, [folderId, expand])

  return { mode, sequences, loading, folderId }
}

/** A sequência que deve ir ao ar num dia — sem abrir o Drive, só com o que já
 *  está em memória. Serve pra decidir QUAL subpasta expandir antes de buscá-la. */
export function sequenceForDate(
  mode: SequenceMode,
  sequences: Sequence[],
  iso: string,
  lastUsed: Record<string, string>,
): Sequence | null {
  if (!sequences.length) return null

  if (mode === 'weekday') {
    const wd = parseISO(iso).getDay()
    return sequences.find(s => s.weekday === wd) || null
  }

  // Rotação: a que faz mais tempo que não vai ao ar. Não é sorteio — sorteio
  // repete a mesma coisa dois dias seguidos com frequência alta, que é
  // exatamente o que a rotação existe pra evitar.
  const sorted = [...sequences].sort((a, b) => {
    const ua = lastUsed[a.id]
    const ub = lastUsed[b.id]
    if (!ua && !ub) return sequences.indexOf(a) - sequences.indexOf(b)
    if (!ua) return -1
    if (!ub) return 1
    return ua < ub ? -1 : ua > ub ? 1 : 0
  })
  return sorted[0] || null
}
