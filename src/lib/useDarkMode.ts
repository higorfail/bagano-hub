'use client'
import { useEffect, useState } from 'react'

export function useDarkMode() {
  const [isDark, setIsDark] = useState(false)

  useEffect(() => {
    const check = () => {
      const t = document.documentElement.getAttribute('data-theme')
      if (t === 'dark')  { setIsDark(true);  return }
      if (t === 'light') { setIsDark(false); return }
      setIsDark(window.matchMedia('(prefers-color-scheme: dark)').matches)
    }
    check()
    const obs = new MutationObserver(check)
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] })
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    mq.addEventListener('change', check)
    return () => { obs.disconnect(); mq.removeEventListener('change', check) }
  }, [])

  return isDark
}
