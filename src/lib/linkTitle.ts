// Busca o título real da página (via /api/link-title) pra usar como nome
// curto de um link anexado, em vez da URL inteira. Falha em silêncio —
// quem chama já tem o hostname como fallback.
export async function fetchLinkTitle(url: string): Promise<string | null> {
  try {
    const res = await fetch(`/api/link-title?url=${encodeURIComponent(url)}`)
    const data = await res.json()
    return data.title || null
  } catch {
    return null
  }
}
