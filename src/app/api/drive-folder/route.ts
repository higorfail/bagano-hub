import { NextRequest, NextResponse } from 'next/server'
import { SITE_URL } from '@/lib/base'

// Lista os arquivos de uma pasta do Google Drive (usado pra achar a "capa.*"/prévia
// de posts sem arquivo direto). Roda no servidor em vez do navegador do usuário —
// a chamada direta do cliente pra googleapis.com quebra em alguns navegadores (Safari
// com "Impedir rastreamento entre sites"/iCloud Private Relay altera o referrer e a
// chave da API, restrita por domínio, é recusada).
//
// A chave é restrita por HTTP referrer no Google Cloud Console — o servidor não manda
// esse header sozinho (referrer vazio = bloqueado), então precisamos declarar um
// referrer manualmente que bata com o domínio liberado na chave.
export async function GET(req: NextRequest) {
  const folderId = req.nextUrl.searchParams.get('folderId')
  if (!folderId) return NextResponse.json({ files: [] })

  const key = process.env.NEXT_PUBLIC_GOOGLE_API_KEY
  if (!key) return NextResponse.json({ files: [] })

  try {
    const res = await fetch(
      `https://www.googleapis.com/drive/v3/files?q=%27${folderId}%27+in+parents&fields=files(id,name,mimeType,thumbnailLink,webViewLink)&orderBy=name&key=${key}`,
      { headers: { Referer: `${SITE_URL.replace(/\/$/, '')}/` } }
    )
    if (!res.ok) return NextResponse.json({ files: [] })
    const data = await res.json()
    // Prazo curto de propósito, ao contrário das outras rotas do Drive: isto é
    // uma LISTAGEM, e ela muda no instante em que alguém sobe um arquivo na
    // pasta. Guardar por uma hora esconderia material novo da equipe — trocaria
    // banda por confusão. Um minuto já corta a repetição (a listagem é pedida a
    // cada card de carrossel que aparece na tela), e o `stale-while-revalidate`
    // faz a atualização acontecer em segundo plano, sem ninguém esperar.
    return NextResponse.json({ files: data.files || [] }, {
      headers: { 'Cache-Control': 'public, max-age=60, stale-while-revalidate=300' },
    })
  } catch {
    return NextResponse.json({ files: [] })
  }
}
