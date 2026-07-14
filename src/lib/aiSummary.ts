// Gera um resumo curto (1-2 frases) de um texto via Gemini, usado nos cards
// fechados no lugar do texto cru cortado. Retorna null em qualquer falha
// (API não configurada, erro de rede etc.) — nunca deve travar o fluxo de salvar.
export async function generateAiSummary(text: string, title?: string): Promise<string | null> {
  if (!text || !text.trim()) return null
  try {
    const res = await fetch('/api/ai-summary', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ text, title }),
    })
    if (!res.ok) return null
    const data = await res.json()
    return data.summary || null
  } catch {
    return null
  }
}
