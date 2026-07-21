import { NextRequest, NextResponse } from 'next/server'

// Faz o download de um arquivo do Drive sem o usuário sair da página (usado no
// botão "Baixar" da página de Publicações). Mesmo truque de key+referrer do
// drive-folder/drive-thumb — a chave é restrita por HTTP referrer, então o
// servidor precisa declarar um referrer que bata com o domínio liberado.
const REFERRER = 'https://bagano-hub.vercel.app/'

export async function GET(req: NextRequest) {
  const id = req.nextUrl.searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'missing id' }, { status: 400 })

  const key = process.env.NEXT_PUBLIC_GOOGLE_API_KEY
  if (!key) return NextResponse.json({ error: 'no api key configured' }, { status: 500 })

  try {
    const metaRes = await fetch(
      `https://www.googleapis.com/drive/v3/files/${id}?fields=name,mimeType,webViewLink&key=${key}`,
      { headers: { Referer: REFERRER } }
    )
    if (!metaRes.ok) return NextResponse.json({ error: 'file not found or not shared' }, { status: 404 })
    const meta = await metaRes.json()

    // Docs/Sheets/Slides nativos não têm bytes pra baixar direto — precisam de
    // /export com um mimeType de destino. Mais simples: avisa o cliente pra
    // abrir no Drive em vez de tentar simular um export aqui.
    if (typeof meta.mimeType === 'string' && meta.mimeType.startsWith('application/vnd.google-apps')) {
      return NextResponse.json({ fallbackUrl: meta.webViewLink || null, reason: 'google-native' }, { status: 415 })
    }

    const fileRes = await fetch(
      `https://www.googleapis.com/drive/v3/files/${id}?alt=media&key=${key}`,
      { headers: { Referer: REFERRER } }
    )
    if (!fileRes.ok || !fileRes.body) {
      return NextResponse.json({ fallbackUrl: meta.webViewLink || null, reason: 'download-failed' }, { status: 502 })
    }

    const filename = (meta.name || 'arquivo').replace(/"/g, '')
    return new NextResponse(fileRes.body, {
      headers: {
        'Content-Type': fileRes.headers.get('content-type') || 'application/octet-stream',
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    })
  } catch {
    return NextResponse.json({ error: 'unexpected error' }, { status: 500 })
  }
}
