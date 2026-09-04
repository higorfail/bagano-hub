'use client'

import { useEffect, useState } from 'react'
import { withBase } from './base'
import { verificarPublicacao, seloPublicacao, type Problema } from './publicavel'

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
