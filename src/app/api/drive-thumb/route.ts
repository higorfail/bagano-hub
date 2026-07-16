import { NextRequest, NextResponse } from 'next/server'

// Proxeia a miniatura de um arquivo do Drive pelo servidor em vez do navegador
// buscar direto de drive.google.com/thumbnail — evita qualquer bloqueio de terceiros
// (ITP/Private Relay do Safari, extensões de privacidade) impedindo a prévia de
// carregar no navegador de quem acessa o Hub.
export async function GET(req: NextRequest) {
  const id = req.nextUrl.searchParams.get('id')
  const sz = req.nextUrl.searchParams.get('sz') || 'w480'
  if (!id) return new NextResponse(null, { status: 400 })

  try {
    const res = await fetch(`https://drive.google.com/thumbnail?id=${id}&sz=${sz}`)
    if (!res.ok || !res.body) return new NextResponse(null, { status: 404 })
    return new NextResponse(res.body, {
      headers: {
        'Content-Type': res.headers.get('content-type') || 'image/jpeg',
        'Cache-Control': 'public, max-age=3600',
      },
    })
  } catch {
    return new NextResponse(null, { status: 502 })
  }
}
