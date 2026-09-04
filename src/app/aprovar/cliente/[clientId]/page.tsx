'use client'

import { useEffect, useState } from 'react'
import { use } from 'react'
import { useRouter } from 'next/navigation'
import { withBase } from '@/lib/base'

// Link fixo por cliente — sempre aponta pro token "geral" (tudo pendente:
// crono + final + extras, numa página só), buscando ou criando se ainda não
// existir. Determinístico: quem guarda essa URL sempre cai na mesma visão
// unificada, em vez do antigo comportamento de "pega o token mais recente de
// qualquer tipo" (podia cair em crono ou final dependendo do que foi criado
// por último).
export default function ClientApprovalRedirect({ params }: { params: Promise<{ clientId: string }> }) {
  const { clientId } = use(params)
  const router = useRouter()
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    (async () => {
      // O servidor resolve e cria o token; o navegador só pergunta. Ver
      // src/app/api/aprovacao/link/route.ts — criar token deixou de ser algo
      // que o navegador deslogado pode fazer.
      const r = await fetch(withBase(`/api/aprovacao/link?clientId=${encodeURIComponent(clientId)}`))
      if (!r.ok) { setError('Não foi possível gerar o link de aprovação para este cliente.'); return }
      const { path } = await r.json()
      if (!path) { setError('Não foi possível gerar o link de aprovação para este cliente.'); return }
      // Manda pro endereço legível, não pro antigo: quem chega por aqui é
      // redirecionado, e é essa URL que fica na barra do cliente depois.
      router.replace(path)
    })()
  }, [clientId, router])

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f5f5f3', fontFamily: 'system-ui, sans-serif' }}>
      {error ? (
        <p style={{ color: '#991b1b', fontSize: 14, fontWeight: 600 }}>{error}</p>
      ) : (
        <div style={{ width: 28, height: 28, border: '3px solid #e5e7eb', borderTopColor: '#374151', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
      )}
      <style>{'@keyframes spin { to { transform: rotate(360deg) } }'}</style>
    </div>
  )
}
