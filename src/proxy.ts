import { NextResponse, type NextRequest } from 'next/server'

// Checagem otimista: a sessão do Supabase (@supabase/ssr) mora em cookies
// chamados `sb-<ref>-auth-token` (podem vir fatiados em .0/.1). Aqui só olhamos
// a presença do cookie — sem ida ao banco — como recomenda a doc do Proxy.
// Quem forjar um cookie vazio não ganha nada: as tabelas continuam protegidas
// por RLS do lado do Supabase, que valida o token de verdade.
function hasSupabaseSession(req: NextRequest) {
  return req.cookies.getAll().some(
    c => c.name.startsWith('sb-') && c.name.includes('auth-token') && !c.name.includes('code-verifier')
  )
}

// O convite do Supabase cai na raiz carregando o código de troca. Sem esta
// checagem, quem já tem sessão aberta (um sócio clicando no próprio link, ou
// alguém repetindo o convite) seria mandado pro dashboard antes de o código ser
// trocado — e a pessoa nunca chegaria na tela de definir senha.
function isConvite(req: NextRequest) {
  const p = req.nextUrl.searchParams
  return p.has('code') || p.has('token_hash') || p.has('error_description')
}

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl
  const authed = hasSupabaseSession(request)

  // Os destinos saem de `nextUrl.clone()`, e não de `new URL(..., request.url)`.
  //
  // Motivo: `request.url` traz o caminho como veio do navegador, com o basePath
  // dentro — e montar uma URL nova a partir dele DESCARTA esse prefixo. Servido
  // em /hub, o guarda mandava quem não tinha sessão pra `/`, que ali não existe:
  // a pessoa saía do hub e caía num 404, sem tela de login pra onde voltar.
  // `nextUrl` conhece o basePath e o recoloca sozinho.
  //
  // `pathname` já vem SEM o basePath, então as comparações e o `redirect=`
  // continuam valendo sem mudança.

  // Sem sessão no dashboard → login, guardando pra onde a pessoa queria ir.
  if (pathname.startsWith('/dashboard') && !authed) {
    const url = request.nextUrl.clone()
    url.pathname = '/'
    url.search = ''
    url.searchParams.set('redirect', pathname)
    return NextResponse.redirect(url)
  }

  // Já logado abrindo o login → vai direto pro dashboard.
  if (pathname === '/' && authed && !isConvite(request)) {
    const url = request.nextUrl.clone()
    url.pathname = '/dashboard'
    url.search = ''
    return NextResponse.redirect(url)
  }

  return NextResponse.next()
}

// Só a raiz e o dashboard. Fora daqui de propósito:
//   /aprovar/[token] e /aprovar/cliente/[clientId] — o cliente não tem login e
//     nunca vai ter; trancar isso quebraria a aprovação inteira.
//   /auth/definir-senha — quem chega ali está no meio do convite e ainda não
//     terminou de virar usuário.
export const config = {
  matcher: ['/', '/dashboard/:path*'],
}
