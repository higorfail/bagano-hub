'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase'
import { useRouter } from 'next/navigation'

export default function Home() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const router = useRouter()
  const supabase = createClient()

  async function handleLogin() {
    setLoading(true)
    setError('')
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) {
      setError('Email ou senha incorretos')
      setLoading(false)
    } else {
      router.push('/dashboard')
    }
  }

  return (
    <div className="min-h-screen bg-[var(--color-bg-input)] flex items-center justify-center">
      <div className="w-full max-w-sm">
        <div className="flex items-center gap-3 mb-8 justify-center">
          <div className="w-9 h-9 rounded-xl bg-[var(--color-text-primary)] flex items-center justify-center">
            <span className="text-white font-semibold text-sm">B</span>
          </div>
          <span className="text-[var(--color-text-primary)] font-semibold text-lg">Bagano Hub</span>
        </div>
        <div className="bg-white rounded-2xl border border-[var(--color-border)] p-8">
          <h1 className="text-[var(--color-text-primary)] font-semibold text-xl mb-1">Entrar</h1>
          <p className="text-[var(--color-text-secondary)] text-sm mb-6">Acesse o sistema da Bagano</p>
          <div className="flex flex-col gap-4">
            <div>
              <label className="text-xs font-medium text-[var(--color-text-secondary)] mb-1.5 block">Email</label>
              <input
                type="email"
                placeholder="seu@email.com"
                value={email}
                onChange={e => setEmail(e.target.value)}
                className="w-full border border-[var(--color-border)] rounded-lg px-3 py-2.5 text-sm text-[var(--color-text-primary)] outline-none focus:border-[var(--color-brand)] transition-colors bg-white"
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
                className="w-full border border-[var(--color-border)] rounded-lg px-3 py-2.5 text-sm text-[var(--color-text-primary)] outline-none focus:border-[var(--color-brand)] transition-colors bg-white"
              />
            </div>
            {error && <p className="text-xs text-red-500">{error}</p>}
            <button
              onClick={handleLogin}
              disabled={loading}
              className="w-full bg-[var(--color-text-primary)] text-white rounded-lg py-2.5 text-sm font-medium mt-1 hover:bg-[#2d2d2a] transition-colors disabled:opacity-50"
            >
              {loading ? 'Entrando...' : 'Entrar'}
            </button>
          </div>
        </div>
        <p className="text-center text-xs text-[var(--color-text-muted)] mt-4">Bagano Marketing Gastronômico</p>
      </div>
    </div>
  )
}