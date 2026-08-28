// Onde o hub mora dentro do domínio.
//
// Servido em `baganomkt.com/hub`, o Next precisa de `basePath` — e o basePath
// resolve sozinho `<Link>`, o router e o next/image, mas NÃO resolve:
//   · chamada de fetch para /api — 31 delas, em 20 arquivos
//   · arquivo estático referenciado por string ('/sw.js', '/icons/...')
//   · start_url e ícones do manifest
// Todos esses continuam batendo na raiz do domínio e dariam 404, sem aviso
// nenhum em tempo de compilação.
//
// Fica numa variável, e não fixo no código, porque a decisão entre raiz e
// subcaminho é de infraestrutura e pode mudar: com isto aqui, mudar de
// `baganomkt.com/hub` pra `hub.baganomkt.com` é apagar uma variável de
// ambiente, não reescrever 40 lugares.
export const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH || ''

/** Prefixa um caminho absoluto do app com o basePath. `/api/x` → `/hub/api/x` */
export function withBase(path: string): string {
  if (!BASE_PATH) return path
  if (!path.startsWith('/')) return path
  // Já prefixado (pode acontecer em caminho montado por partes) — não duplica.
  if (path === BASE_PATH || path.startsWith(BASE_PATH + '/')) return path
  return BASE_PATH + path
}

/** Endereço público do hub, usado em metadata e no Referer das APIs do Google. */
export const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL || 'https://bagano-hub.vercel.app'
