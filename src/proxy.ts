import { NextResponse, type NextRequest } from 'next/server'

// Auth desativada temporariamente para testes — reativar depois
export function proxy(_request: NextRequest) {
  return NextResponse.next()
}

export const config = {
  matcher: ['/', '/dashboard/:path*'],
}
