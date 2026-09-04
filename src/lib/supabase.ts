import { createBrowserClient } from '@supabase/ssr'

// Toda chamada ao Supabase tem prazo pra responder.
//
// Sem isso, uma requisição que fica pendurada — extensão do navegador
// interceptando, proxy corporativo que aceita a conexão e não responde, rede
// que cai no meio — nunca resolve nem rejeita. E como praticamente toda tela
// do hub faz `setLoading(true)` antes e `setLoading(false)` depois do await,
// a tela fica girando pra sempre, sem erro, sem aviso e sem saída.
//
// Foi o que aconteceu no Chrome de um Windows da equipe: o hub abria, a barra
// lateral carregava, e o conteúdo girava indefinidamente em qualquer página.
// No Edge, do mesmo computador, funcionava.
//
// Com prazo, a requisição vira ERRO — e erro as telas já sabem tratar: elas
// mostram "não foi possível carregar" com botão de tentar de novo.
const TIMEOUT_MS = 20_000

function fetchComPrazo(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  // Respeita um AbortSignal que já venha de fora (o supabase-js usa em alguns
  // pontos) — cancelar por fora continua funcionando.
  const ctrl = new AbortController()
  const externo = init?.signal
  if (externo) {
    if (externo.aborted) ctrl.abort()
    else externo.addEventListener('abort', () => ctrl.abort(), { once: true })
  }
  const timer = setTimeout(() => ctrl.abort(new DOMException('Tempo esgotado', 'TimeoutError')), TIMEOUT_MS)
  return fetch(input, { ...init, signal: ctrl.signal }).finally(() => clearTimeout(timer))
}

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { global: { fetch: fetchComPrazo } }
  )
}

// O cliente da página pública de aprovação — o mesmo de sempre, mas que diz
// em toda requisição QUAL link de aprovação ele está usando.
//
// O problema que isto resolve: a chave que vai no navegador é pública, e as
// políticas do banco liberavam tudo para quem a apresentasse. Não havia como o
// banco distinguir "o cliente do Piastro abrindo o link dele" de "alguém com a
// chave pedindo a tabela inteira" — as duas requisições eram idênticas.
//
// Com o cabeçalho, passam a ser distintas: a política lê `x-approval-token`,
// procura o token na `approval_tokens` e só devolve as linhas do cliente
// daquele token. Sem cabeçalho, ou com token inválido, o resultado é vazio.
//
// Detalhe importante: NÃO mexemos em sessão aqui. A mesma tela serve o cliente
// (deslogado, papel `anon`, sujeito às políticas acima) e a equipe em
// `/aprovar/<token>/equipe` (logada, papel `authenticated`, com as políticas
// de sempre). Manter o comportamento de sessão intacto é o que faz os dois
// casos continuarem funcionando com um cliente só.
export function createApprovalClient(token: string) {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      global: {
        fetch: fetchComPrazo,
        headers: { 'x-approval-token': token },
      },
    }
  )
}
