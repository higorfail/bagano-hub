// Último mês/ano que a pessoa estava vendo no Cronograma. Sem isso, sair e
// voltar (pela sidebar, ou abrindo um cliente) jogava sempre no mês atual —
// mesmo quem estava montando o cronograma do mês seguinte. O cliente já era
// lembrado desde antes; só faltava o período.
const LAST_PERIOD_KEY = 'crono-last-period'

export function readLastPeriod(): { m: number; y: number } | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = localStorage.getItem(LAST_PERIOD_KEY)
    if (!raw) return null
    const { m, y } = JSON.parse(raw)
    if (typeof m === 'number' && m >= 1 && m <= 12 && typeof y === 'number' && y > 2000) return { m, y }
  } catch {}
  return null
}

export function saveLastPeriod(m: number, y: number) {
  if (typeof window === 'undefined') return
  try { localStorage.setItem(LAST_PERIOD_KEY, JSON.stringify({ m, y })) } catch {}
}
