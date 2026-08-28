'use client'

import { useEffect } from 'react'
import { withBase } from '@/lib/base'

// Registra o service worker cedo (não pede permissão — isso só acontece quando
// o usuário clica em "Ativar notificações", ver src/lib/push.ts).
export default function PushSwRegister() {
  useEffect(() => {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register(withBase('/sw.js')).catch(() => {})
    }
  }, [])
  return null
}
