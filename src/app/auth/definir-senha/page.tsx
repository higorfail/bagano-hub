'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import LogoWordmark from '@/components/logos/LogoWordmark'
import Button from '@/components/ui/Button'

export default function DefinirSenha() {
  const [password, setPassword]   = useState('')
  const [confirm,  setConfirm]    = useState('')
  const [loading,  setLoading]    = useState(false)
  const [error,    setError]      = useState('')
  const [checking, setChecking]   = useState(true)
  const router   = useRouter()
  const supabase = createClient()

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (!data.session) router.replace('/')
      else setChecking(false)
    })
  }, [])

  async function handleUpdate() {
    if (password.length < 6) { setError('A senha deve ter pelo menos 6 caracteres.'); return }
    if (password !== confirm)  { setError('As senhas não coincidem.'); return }
    setLoading(true)
    const { error } = await supabase.auth.updateUser({ password })
    if (error) { setError(error.message); setLoading(false) }
    else router.push('/dashboard')
  }

  if (checking) return null

  return (
    <div className="min-h-screen bg-[var(--color-bg-input)] flex items-center justify-center">
      <div className="w-full max-w-sm">
        <div className="flex justify-center mb-8">
          <LogoWordmark width={180} className="text-[var(--color-logo)]" />
        </div>
        <div className="bg-[var(--color-bg-card)] rounded-2xl border border-[var(--color-border)] p-8 shadow-card">
          <h1 className="text-[var(--color-text-primary)] font-bold text-xl mb-1 tracking-tight">Definir senha</h1>
          <p className="text-[var(--color-text-secondary)] text-sm mb-6">Crie uma senha para acessar o hub</p>
          <div className="flex flex-col gap-4">
            <div>
              <label className="text-xs font-medium text-[var(--color-text-secondary)] mb-1.5 block">Nova senha</label>
              <input
                autoFocus
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={e => setPassword(e.target.value)}
                className="w-full border border-[var(--color-border)] rounded-xl px-3 py-2.5 text-sm text-[var(--color-text-primary)] outline-none focus:border-[var(--color-accent)] transition-colors bg-[var(--color-bg-input)]"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-[var(--color-text-secondary)] mb-1.5 block">Confirmar senha</label>
              <input
                type="password"
                placeholder="••••••••"
                value={confirm}
                onChange={e => setConfirm(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleUpdate()}
                className="w-full border border-[var(--color-border)] rounded-xl px-3 py-2.5 text-sm text-[var(--color-text-primary)] outline-none focus:border-[var(--color-accent)] transition-colors bg-[var(--color-bg-input)]"
              />
            </div>
            {error && <p className="text-xs" style={{ color: 'var(--ds-error-text)' }}>{error}</p>}
            <Button variant="dark" size="lg" fullWidth onClick={handleUpdate} disabled={loading || !password || !confirm} className="mt-1">
              {loading ? 'Salvando...' : 'Entrar no hub'}
            </Button>
          </div>
        </div>
        <p className="text-center text-xs text-[var(--color-text-muted)] mt-4">Bagano Marketing Gastronômico</p>
      </div>
    </div>
  )
}
