import { NextRequest, NextResponse } from 'next/server'

// Extrai o @username de uma URL/handle do Instagram
function parseUsername(input: string): string | null {
  if (!input) return null
  let s = input.trim()
  s = s.replace(/^@/, '')
  const m = s.match(/instagram\.com\/([^/?#]+)/i)
  if (m) return m[1]
  // sem "instagram.com" — assume que já é o handle
  if (/^[A-Za-z0-9._]+$/.test(s)) return s
  return null
}

export async function POST(req: NextRequest) {
  const { instagram_url } = await req.json()
  const username = parseUsername(instagram_url || '')
  if (!username) {
    return NextResponse.json({ error: 'Informe uma URL ou @ do Instagram válido' }, { status: 400 })
  }

  try {
    // Endpoint público do perfil web do Instagram
    const infoRes = await fetch(
      `https://www.instagram.com/api/v1/users/web_profile_info/?username=${encodeURIComponent(username)}`,
      {
        headers: {
          'x-ig-app-id': '936619743392459',
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36',
          Accept: '*/*',
        },
        // evita cache do Next em requisição dinâmica
        cache: 'no-store',
      }
    )

    if (!infoRes.ok) {
      return NextResponse.json(
        { error: `Instagram recusou a requisição (${infoRes.status}). Faça o upload manual.` },
        { status: 502 }
      )
    }

    const info = await infoRes.json()
    const user = info?.data?.user
    const picUrl: string | undefined = user?.profile_pic_url_hd || user?.profile_pic_url
    if (!picUrl) {
      return NextResponse.json({ error: 'Perfil não encontrado ou privado' }, { status: 404 })
    }

    // Baixa os bytes da imagem (servidor não sofre bloqueio de hotlinking/CORS)
    const imgRes = await fetch(picUrl, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36',
      },
      cache: 'no-store',
    })
    if (!imgRes.ok) {
      return NextResponse.json({ error: 'Não foi possível baixar a foto do perfil' }, { status: 502 })
    }

    const contentType = imgRes.headers.get('content-type') || 'image/jpeg'
    const buf = Buffer.from(await imgRes.arrayBuffer())
    const dataUrl = `data:${contentType};base64,${buf.toString('base64')}`

    return NextResponse.json({
      dataUrl,
      contentType,
      followers: user?.edge_followed_by?.count ?? null,
      following: user?.edge_follow?.count ?? null,
    })
  } catch {
    return NextResponse.json({ error: 'Erro ao consultar o Instagram' }, { status: 500 })
  }
}
