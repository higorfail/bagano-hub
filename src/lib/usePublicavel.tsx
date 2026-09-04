'use client'

import { useEffect, useState } from 'react'
import { withBase } from './base'
import { verificarPublicacao, seloPublicacao, type Problema, type Arquivo } from './publicavel'

// Lê a pasta do Drive e diz se o post subiria no Instagram.
//
// Roda na tela onde se agenda, e não na hora de publicar, de propósito: o
// problema tem conserto — reexportar em JPG — e conserto só acontece enquanto
// alguém ainda está olhando o post. Descobrir na hora de subir é descobrir
// tarde.
//
// Mesma chamada que a prévia já faz (/api/drive-folder, com cache de 60s), então
// não é ida a mais ao Drive na prática.
export function usePublicavel(driveFolderUrl?: string | null, postType?: string | null) {
  const [problemas, setProblemas] = useState<Problema[] | null>(null)

  useEffect(() => {
    const folderId = driveFolderUrl?.match(/\/folders\/([-\w]{25,})/)?.[1]
    let vivo = true
    // O `return` sem setState quando não há pasta: chamar setState no corpo do
    // efeito é render em cascata, e o estado já nasce null.
    if (!folderId) return
    fetch(withBase(`/api/drive-folder?folderId=${folderId}`))
      .then(r => r.json())
      .then(d => { if (vivo) setProblemas(verificarPublicacao(d.files || [], postType)) })
      .catch(() => { /* sem resposta do Drive não vira alarme falso */ })
    return () => { vivo = false }
  }, [driveFolderUrl, postType])

  return problemas ? seloPublicacao(problemas) : null
}

/**
 * O mesmo teste, para uma lista inteira.
 *
 * Sobe do card pra página por dois motivos. Um: cada card fazia a própria
 * chamada, e ninguém tinha o TOTAL — dá pra ver um post com problema, não
 * "dezoito posts com problema", que é a informação acionável. Dois: com o
 * resultado na página, ele vira filtro.
 *
 * As pastas repetidas são pedidas uma vez só. Vários posts do mesmo cliente
 * costumam apontar pra mesma pasta, e sem isso seriam dezenas de chamadas
 * iguais.
 */
export function usePublicavelEmLote(
  itens: { id: string; driveFolderUrl?: string | null; postType?: string | null }[],
) {
  const [porItem, setPorItem] = useState<Record<string, ReturnType<typeof seloPublicacao>>>({})

  const chave = itens.map(i => `${i.id}:${i.driveFolderUrl || ''}`).join('|')

  useEffect(() => {
    let vivo = true
    ;(async () => {
      const pastas = new Map<string, Arquivo[]>()
      const ids = [...new Set(itens.map(i => i.driveFolderUrl?.match(/\/folders\/([-\w]{25,})/)?.[1]).filter(Boolean))] as string[]

      // De 6 em 6: o Drive responde rápido, mas 60 chamadas de uma vez fazem o
      // navegador enfileirar e a tela ficar sem resposta.
      for (let i = 0; i < ids.length; i += 6) {
        if (!vivo) return
        const lote = ids.slice(i, i + 6)
        const res = await Promise.all(lote.map(fid =>
          fetch(withBase(`/api/drive-folder?folderId=${fid}`))
            .then(r => r.json()).then(d => [fid, d.files || []] as const)
            .catch(() => [fid, []] as const)))
        for (const [fid, files] of res) pastas.set(fid, files)
      }
      if (!vivo) return

      const out: Record<string, ReturnType<typeof seloPublicacao>> = {}
      for (const it of itens) {
        const fid = it.driveFolderUrl?.match(/\/folders\/([-\w]{25,})/)?.[1]
        if (!fid || !pastas.has(fid)) continue
        out[it.id] = seloPublicacao(verificarPublicacao(pastas.get(fid)!, it.postType))
      }
      setPorItem(out)
    })()
    return () => { vivo = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chave])

  return porItem
}
