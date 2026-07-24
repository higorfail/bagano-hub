import { NextRequest, NextResponse } from 'next/server'

// Busca o <title> de uma página pra usar como nome curto de um link anexado
// (em vez da URL inteira) — roda no servidor pra evitar CORS. Timeout curto e
// limite de bytes pra não travar em página gigante/lenta; falha em silêncio
// (o chamador cai pro hostname como nome).
export async function GET(req: NextRequest) {
  const url = req.nextUrl.searchParams.get('url')
  if (!url) return NextResponse.json({ title: null })

  try {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 4000)
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36' },
      signal: controller.signal,
      cache: 'no-store',
    })
    clearTimeout(timeout)
    if (!res.ok) return NextResponse.json({ title: null })

    const reader = res.body?.getReader()
    if (!reader) return NextResponse.json({ title: null })
    let html = ''
    const decoder = new TextDecoder()
    while (html.length < 20000) {
      const { done, value } = await reader.read()
      if (done) break
      html += decoder.decode(value, { stream: true })
    }
    reader.cancel().catch(() => {})

    const match = html.match(/<title[^>]*>([^<]*)<\/title>/i)
    const title = match?.[1]?.trim().replace(/\s+/g, ' ').slice(0, 120) || null
    return NextResponse.json({ title })
  } catch {
    return NextResponse.json({ title: null })
  }
}
