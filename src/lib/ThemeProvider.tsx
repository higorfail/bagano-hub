'use client'

import { createContext, useContext, useEffect, useState } from 'react'

type ThemeMode = 'auto' | 'light' | 'dark'

const ThemeContext = createContext<{
  mode: ThemeMode
  setMode: (m: ThemeMode) => void
}>({ mode: 'auto', setMode: () => {} })

export function useTheme() { return useContext(ThemeContext) }

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [mode, setModeState] = useState<ThemeMode>('auto')

  useEffect(() => {
    const saved = localStorage.getItem('bagano-theme') as ThemeMode | null
    if (saved === 'light' || saved === 'dark' || saved === 'auto') {
      setModeState(saved)
      applyTheme(saved)
    }
    // "Auto" segue o sistema — se o SO mudar de tema com o app aberto, a cor da barra acompanha
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const onChange = () => { if ((localStorage.getItem('bagano-theme') as ThemeMode | null) !== 'light' && (localStorage.getItem('bagano-theme') as ThemeMode | null) !== 'dark') applyTheme('auto') }
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])

  function setMode(m: ThemeMode) {
    setModeState(m)
    localStorage.setItem('bagano-theme', m)
    applyTheme(m)
  }

  return (
    <ThemeContext.Provider value={{ mode, setMode }}>
      {children}
    </ThemeContext.Provider>
  )
}

function applyTheme(mode: ThemeMode) {
  const html = document.documentElement
  if (mode === 'dark')  html.setAttribute('data-theme', 'dark')
  else if (mode === 'light') html.setAttribute('data-theme', 'light')
  else html.removeAttribute('data-theme')

  const isDark = mode === 'dark' || (mode === 'auto' && window.matchMedia('(prefers-color-scheme: dark)').matches)
  const meta = document.getElementById('theme-color-meta')
  meta?.setAttribute('content', isDark ? '#1C1A18' : '#F9F8F5')
}
