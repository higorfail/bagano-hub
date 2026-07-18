// Gera uma sugestão de legenda via Gemini, baseada no briefing/copy do post
// e no tom de voz do manual do cliente. Retorna null em qualquer falha —
// nunca deve travar o fluxo de edição do campo.
export async function generateAiLegenda(opts: {
  title?: string
  post_type?: string
  briefing?: string
  copy?: string
  manual?: any
}): Promise<string | null> {
  if (!opts.briefing?.trim() && !opts.copy?.trim()) return null
  try {
    const res = await fetch('/api/ai-legenda', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(opts),
    })
    if (!res.ok) return null
    const data = await res.json()
    return data.legenda || null
  } catch {
    return null
  }
}
