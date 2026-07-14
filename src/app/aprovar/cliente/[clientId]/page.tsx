'use client'

import { useEffect, useState } from 'react'
import { use } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'

// Link fixo por cliente — sempre aponta pro token de aprovação mais recente.
// Gera um token novo (mês/ano atual, tipo "final") se ainda não existir nenhum,
// assim quem guarda essa URL sempre cai na aprovação vigente, sem precisar
// pedir um link novo toda hora.
export default function ClientApprovalRedirect({ params }: { params: Promise<{ clientId: string }> }) {
  const { clientId } = use(params)
  const router = useRouter()
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const supabase = createClient()
    ;(async () => {
      const { data: existing } = await supabase.from('approval_tokens')
        .select('token')
        .eq('client_id', clientId)
        .eq('active', true)
        .order('year', { ascending: false })
        .order('month', { ascending: false })
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()

      if (existing?.token) {
        router.replace(`/aprovar/${existing.token}`)
        return
      }

      const now = new Date()
      const { data: created, error: insErr } = await supabase.from('approval_tokens')
        .insert({ client_id: clientId, month: now.getMonth() + 1, year: now.getFullYear(), type: 'final' })
        .select('token').single()

      if (insErr || !created) { setError('Não foi possível gerar o link de aprovação para este cliente.'); return }
      router.replace(`/aprovar/${created.token}`)
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
