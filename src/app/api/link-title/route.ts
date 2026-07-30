import { NextRequest, NextResponse } from 'next/server'

// Busca o nome real de um link anexado, pra usar como rótulo curto em vez da
// URL inteira. Drive é um caso à parte: ler o <title> da página de visualização
// quase nunca funciva de verdade — arquivo sem "qualquer pessoa com o link" cai
// numa tela de login cujo título não diz nada sobre o conteúdo. Em vez disso,
// busca o nome direto na API do Drive (mesma chave usada em /api/drive-folder),
// que funciona sempre que o arquivo estiver com esse tipo de compartilhamento —
// o mesmo requisito que o resto do Hub já depende pra mostrar prévia/miniatura.
function driveFileId(url: string): string | null {
  const folderMatch = url.match(/\/folders\/([-\w]{25,})/)
  if (folderMatch) return folderMatch[1]
  const idMatch = url.match(/[-\w]{25,}/)
  return idMatch ? idMatch[0] : null
}

async function driveTitle(url: string): Promise<string | null> {
  const fileId = driveFileId(url)
  const key = process.env.NEXT_PUBLIC_GOOGLE_API_KEY
  if (!fileId || !key) return null
  try {
    const res = await fetch(
      `https://www.googleapis.com/drive/v3/files/${fileId}?fields=name&key=${key}`,
      { headers: { Referer: 'https://bagano-hub.vercel.app/' } }
    )
    if (!res.ok) return null
    const data = await res.json()
    return data.name || null
  } catch {
    return null
  }
}

async function htmlTitle(url: string): Promise<string | null> {
  try {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 4000)
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36' },
      signal: controller.signal,
      cache: 'no-store',
    })
    clearTimeout(timeout)
    if (!res.ok) return null

    const reader = res.body?.getReader()
    if (!reader) return null
    let html = ''
    const decoder = new TextDecoder()
    while (html.length < 20000) {
      const { done, value } = await reader.read()
      if (done) break
      html += decoder.decode(value, { stream: true })
    }
    reader.cancel().catch(() => {})

    const match = html.match(/<title[^>]*>([^<]*)<\/title>/i)
    let title = match?.[1]?.trim().replace(/\s+/g, ' ').slice(0, 120) || null
    // Tela de login/genérica não diz nada sobre o conteúdo real — melhor
    // deixar null (o chamador tem um fallback melhor) do que mostrar isso.
    if (title && /^(sign in|log in|fazer login|entrar)\b/i.test(title)) title = null
    if (title === 'Google Drive' || title === 'Instagram') title = null
    return title
  } catch {
    return null
  }
}

export async function GET(req: NextRequest) {
  const url = req.nextUrl.searchParams.get('url')
  if (!url) return NextResponse.json({ title: null })

  const host = (() => { try { return new URL(url).hostname } catch { return '' } })()
  const isDrive = host === 'drive.google.com' || host === 'docs.google.com'

  const title = isDrive ? await driveTitle(url) : await htmlTitle(url)
  return NextResponse.json({ title })
}
