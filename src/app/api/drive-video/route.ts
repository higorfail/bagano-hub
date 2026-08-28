import { NextRequest, NextResponse } from 'next/server'
import { SITE_URL } from '@/lib/base'

// Serve o vídeo do Drive PELO NOSSO SERVIDOR, em vez de o <video> chamar o
// googleapis direto do navegador.
//
// Por que: a chave da API é restrita por referrer no Google Cloud. Do navegador,
// quem manda o referrer é o navegador — e o Safari/iOS com "Impedir rastreamento
// entre sites" (ou o Private Relay) corta esse cabeçalho. Sem referrer a chave é
// recusada: medido, 403 sem referrer e 200 com. O vídeo então caía no iframe
// /preview do Drive, que no iOS fica preto porque depende de cookie de sessão
// que o ITP também bloqueia — as duas saídas fechadas, e o cliente via um quadro
// morto no meio do carrossel.
//
// Aqui o referrer é declarado pelo servidor, igual drive-thumb e drive-download
// já fazem. É o mesmo truque, só que pra vídeo.
const REFERRER = `${SITE_URL.replace(/\/$/, '')}/`

export async function GET(req: NextRequest) {
  const id = req.nextUrl.searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'missing id' }, { status: 400 })

  const key = process.env.NEXT_PUBLIC_GOOGLE_API_KEY
  if (!key) return NextResponse.json({ error: 'no api key configured' }, { status: 500 })

  // Range repassado tal como veio. É o que faz o player conseguir avançar no
  // vídeo: sem isso o navegador não tem como pedir "do minuto 2 em diante" e
  // ou baixa tudo de novo a cada toque na barra, ou desabilita o arrasto.
  const range = req.headers.get('range')
  const headers: Record<string, string> = { Referer: REFERRER }
  if (range) headers.Range = range

  try {
    const res = await fetch(
      `https://www.googleapis.com/drive/v3/files/${id}?alt=media&key=${key}`,
      { headers },
    )
    if (!res.ok && res.status !== 206) {
      return NextResponse.json({ error: 'upstream', status: res.status }, { status: 502 })
    }

    const out = new Headers()
    for (const h of ['content-type', 'content-length', 'content-range', 'accept-ranges']) {
      const v = res.headers.get(h)
      if (v) out.set(h, v)
    }
    // Accept-Ranges precisa existir mesmo quando o Google não devolve, senão
    // alguns players nem tentam pedir trecho.
    if (!out.has('accept-ranges')) out.set('accept-ranges', 'bytes')
    // O conteúdo do Drive não muda de endereço; deixar o navegador guardar
    // evita repetir a mesma chamada (e gastar cota) a cada reprodução.
    out.set('cache-control', 'public, max-age=3600')

    return new NextResponse(res.body, { status: res.status, headers: out })
  } catch {
    return NextResponse.json({ error: 'unexpected error' }, { status: 500 })
  }
}
