// Toda conversa com o Drive passa por aqui, e insiste antes de desistir.
//
// O Google limita por taxa e responde **403** quando estoura — não 429, o que
// engana: parece permissão negada, e cada rota tratava como um erro definitivo
// diferente. Medido em 2026-09-05, com 16 pedidos de trecho em paralelo num
// vídeo de 136 MB: 3 voltaram 403. A Vercel avisou como "5xx spike", de 0
// falhas em 24h para 74 em 5 minutos.
//
// O estrago era pior nas rotas silenciosas: `drive-thumb` virava 404 (a arte
// sumia do card sem aviso), `drive-folder` devolvia lista vazia (card em
// branco). O cliente abria a aprovação e via buraco, sem nada explicando.
//
// Limite de taxa é passageiro por definição — esperar 250 ms e repetir resolve
// quase sempre. É o que o próprio Google recomenda.
const TENTATIVAS = 3
const ESPERA_INICIAL = 250

// 403 do Drive é ambíguo: pode ser limite de taxa (vale insistir) ou chave
// recusada / arquivo não compartilhado (insistir só atrasa a resposta ruim).
// Quem separa os dois é o motivo dentro do corpo.
const PASSAGEIRO = /rateLimit|quotaExceeded|userRateLimitExceeded|backendError|internalError/i

export async function buscarNoDrive(url: string, init: RequestInit = {}): Promise<Response> {
  let espera = ESPERA_INICIAL

  for (let n = 1; ; n++) {
    const res = await fetch(url, init)
    if (res.ok || res.status === 206) return res
    if (n >= TENTATIVAS) return res
    if (res.status !== 403 && res.status !== 429 && res.status < 500) return res

    // `clone()` porque o corpo original tem que continuar intacto pra quem
    // chamou, no caso de a gente desistir e devolver esta resposta.
    let motivo = '(sem corpo)'
    try { motivo = (await res.clone().text()).slice(0, 300) } catch {}

    if (res.status === 403 && !PASSAGEIRO.test(motivo)) {
      console.error(`[drive] 403 definitivo em ${url.split('?')[0]}: ${motivo}`)
      return res
    }

    console.warn(`[drive] ${res.status} passageiro, tentativa ${n}/${TENTATIVAS}: ${motivo.slice(0, 120)}`)
    // Jitter pra várias funções que estouraram juntas não voltarem juntas.
    await new Promise(r => setTimeout(r, espera + Math.random() * 200))
    espera *= 2
  }
}

// Limite de taxa não é "deu erro", é "tenta daqui a pouco" — e a diferença
// importa: com 503 + Retry-After o player do navegador volta sozinho; com 502
// ele desiste e deixa o quadro preto.
export function ehLimiteDeTaxa(status: number) {
  return status === 403 || status === 429
}
