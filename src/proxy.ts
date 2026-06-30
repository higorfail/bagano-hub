import { NextResponse, type NextRequest } from 'next/server'

// Checagem otimista: a sessão do Supabase (@supabase/ssr) é guardada em cookies
// chamados `sb-<ref>-auth-token` (podem vir fatiados em .0/.1). Aqui só verificamos
// a presença do cookie — sem ida ao banco — como recomenda a doc do Proxy (Next 16).
function hasSupabaseSession(req: NextRequest) {
  return req.cookies.getAll().some(
    c => c.name.startsWith('sb-') && c.name.includes('auth-token') && !c.name.includes('code-verifier')
  )
}

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl
  const authed = hasSupabaseSession(request)

  // Protege o dashboard: sem sessão → manda pro login (raiz)
  if (pathname.startsWith('/dashboard') && !authed) {
    const url = new URL('/', request.url)
    url.searchParams.set('redirect', pathname)
    return NextResponse.redirect(url)
  }

  // Já logado abrindo o login → vai direto pro dashboard
  if (pathname === '/' && authed) {
    return NextResponse.redirect(new URL('/dashboard', request.url))
  }

  return NextResponse.next()
}

// Só roda no login e no dashboard — /aprovar/[token] (cliente externo) continua público
export const config = {
  matcher: ['/', '/dashboard/:path*'],
}
