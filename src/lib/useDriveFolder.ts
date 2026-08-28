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
import { withBase } from '@/lib/base'

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
  const p = fetch(withBase(`/api/drive-folder?folderId=${folderId}`))
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
  /** Subpastas que não são dia da semana, num esquema por dia da semana. */
  const [ignored, setIgnored] = useState<Sequence[]>([])
  const [loading, setLoading] = useState(!!folderId)

  useEffect(() => {
    if (!folderId) { setSequences([]); setIgnored([]); setMode('empty'); setLoading(false); return }
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
        // Duas subpastas com nome de dia já bastam pra valer o esquema por dia
        // da semana. Antes era preciso que TODAS fossem — e aí uma pasta
        // "Antigas" ou "Referências" no meio derrubava o esquema inteiro em
        // silêncio, jogando tudo na rotação. As que não são dia viram `ignored`
        // e ficam de fora, sem sumir do diagnóstico.
        const withDay = base.filter(s => s.weekday !== null)
        const isWeekday = withDay.length >= 2
        const active = isWeekday ? withDay : base
        const rest   = isWeekday ? base.filter(s => s.weekday === null) : []

        const wanted = expand === 'all' ? active : active.filter(s => s.id === expand)
        const filled = await Promise.all(wanted.map(async s => ({ ...s, files: (await list(s.id)).files })))
        const byId = Object.fromEntries(filled.map(s => [s.id, s]))
        if (!alive) return
        setMode(isWeekday ? 'weekday' : 'rotation')
        setSequences(active.map(s => byId[s.id] || s))
        setIgnored(rest)
        setLoading(false)
        return
      }

      // Pasta chata: cada arquivo é uma opção, e a rotação evita repetir.
      if (!alive) return
      setMode(root.files.length ? 'rotation' : 'empty')
      setSequences(root.files.map(f => ({
        id: f.id, name: f.name, weekday: null, files: [f], folderUrl: null,
      })))
      setIgnored([])
      setLoading(false)
    })

    return () => { alive = false }
  }, [folderId, expand])

  return { mode, sequences, ignored, loading, folderId }
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
  //
  // Nunca usada conta como "infinitamente antiga" e vem antes de qualquer uma
  // já usada. Entre as nunca usadas, quem desempata é O DIA: antes era a ordem
  // da pasta, e enquanto ninguém marcasse nada como postado a sugestão ficava
  // parada na primeira pra sempre — a pasta nunca "virava".
  const never = sequences.filter(s => !lastUsed[s.id])
  if (never.length) {
    const dayIndex = Math.floor(parseISO(iso).getTime() / 86_400_000)
    return never[((dayIndex % never.length) + never.length) % never.length]
  }

  const sorted = [...sequences].sort((a, b) => {
    const ua = lastUsed[a.id]
    const ub = lastUsed[b.id]
    return ua < ub ? -1 : ua > ub ? 1 : sequences.indexOf(a) - sequences.indexOf(b)
  })
  return sorted[0] || null
}
