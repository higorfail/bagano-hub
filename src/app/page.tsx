'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import LogoWordmark from '@/components/logos/LogoWordmark'
import Button from '@/components/ui/Button'

export default function Home() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const router = useRouter()
  const supabase = createClient()

  useEffect(() => {
    const code = new URLSearchParams(window.location.search).get('code')
    if (!code) return
    setLoading(true)
    supabase.auth.exchangeCodeForSession(code).then(({ error }) => {
      if (!error) router.push('/auth/definir-senha')
      else { setError('Link inválido ou expirado.'); setLoading(false) }
    })
  }, [])

  async function handleLogin() {
    setLoading(true)
    setError('')
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) {
      setError('Email ou senha incorretos')
      setLoading(false)
    } else {
      const redirect = new URLSearchParams(window.location.search).get('redirect') || '/dashboard'
      router.push(redirect)
    }
  }

  return (
    <div className="min-h-screen bg-[var(--color-bg-input)] flex items-center justify-center">
      <div className="w-full max-w-sm">
        <div className="flex justify-center mb-8">
          <LogoWordmark width={180} className="text-[var(--color-logo)]" />
        </div>
        <div className="bg-[var(--color-bg-card)] rounded-2xl border border-[var(--color-border)] p-8 shadow-card">
          <h1 className="text-[var(--color-text-primary)] font-bold text-xl mb-1 tracking-tight">Entrar</h1>
          <p className="text-[var(--color-text-secondary)] text-sm mb-6">Acesse o sistema da Bagano</p>
          <div className="flex flex-col gap-4">
            <div>
              <label className="text-xs font-medium text-[var(--color-text-secondary)] mb-1.5 block">Email</label>
              <input
                type="email"
                placeholder="seu@email.com"
                value={email}
                onChange={e => setEmail(e.target.value)}
                className="w-full border border-[var(--color-border)] rounded-xl px-3 py-2.5 text-sm text-[var(--color-text-primary)] outline-none focus:border-[var(--color-accent)] transition-colors bg-[var(--color-bg-input)]"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-[var(--color-text-secondary)] mb-1.5 block">Senha</label>
              <input
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={e => setPassword(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleLogin()}
                className="w-full border border-[var(--color-border)] rounded-xl px-3 py-2.5 text-sm text-[var(--color-text-primary)] outline-none focus:border-[var(--color-accent)] transition-colors bg-[var(--color-bg-input)]"
              />
            </div>
            {error && <p className="text-xs" style={{ color: 'var(--ds-error-text)' }}>{error}</p>}
            <Button variant="dark" size="lg" fullWidth onClick={handleLogin} disabled={loading} className="mt-1">
              {loading ? 'Entrando...' : 'Entrar'}
            </Button>
          </div>
        </div>
        <p className="text-center text-xs text-[var(--color-text-muted)] mt-4">Bagano Marketing Gastronômico</p>
      </div>
    </div>
  )
}