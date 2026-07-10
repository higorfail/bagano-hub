'use client'

// Renderiza modais direto no <body> via portal — garante que o overlay
// fixed cubra a tela inteira (sidebar + topbar), sem ser preso por
// ancestrais com transform/filter (containing block de position:fixed).

import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'

export default function ModalPortal({ children }: { children: React.ReactNode }) {
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])
  if (!mounted) return null
  return createPortal(children, document.body)
}
