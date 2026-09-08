// Quando o cliente abriu o link de aprovação.
//
// Até aqui ninguém sabia. Foi por isso que "o HAGO aprovou e o hub não
// contabilizou" custou uma hora de investigação — logs do Supabase, histórico,
// simulação com token real — pra concluir o que uma linha teria dito na hora:
// o cliente nunca abriu.
//
// Muda também a cobrança da Gabi. Hoje é "oi, conseguiu ver?", que é chato de
// mandar e fácil de ignorar. Com o dado é "vi que você abriu ontem, ficou
// alguma dúvida?" — outra conversa.
//
// Guardado no `activity_log`, sem coluna nova: o registro fica pendurado no
// TOKEN (não num post), porque é o link que foi aberto, não uma peça.

import { withBase } from '@/lib/base'

export async function registrarAbertura(
  _db: unknown,
  token: string,
  _clientId?: string | null,
) {
  try {
    // Pelo servidor, não direto no banco.
    //
    // A dedupe morava aqui e nunca funcionou: a consulta que procurava uma
    // abertura recente roda como `anon`, e `activity_log` só tem política de
    // INSERT pra anon — nenhuma de SELECT. Voltava vazia sempre, e toda carga
    // de página virava uma visita nova. Dar SELECT pra anon abriria o histórico
    // inteiro do cliente pra quem tem o link, então a conferência foi pro
    // servidor. Ver src/app/api/aprovacao/abertura/route.ts.
    await fetch(withBase('/api/aprovacao/abertura'), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ token }),
      keepalive: true,
    })
  } catch {
    // Registrar visita nunca pode impedir a aprovação de acontecer.
  }
}

/** "há 2 dias", "há 3 horas", "agora" — ou null se nunca abriu. */
export function desdeQuando(iso: string | null | undefined): string | null {
  if (!iso) return null
  const min = Math.floor((Date.now() - new Date(iso).getTime()) / 60_000)
  if (min < 2) return 'agora'
  if (min < 60) return `há ${min} min`
  const h = Math.floor(min / 60)
  if (h < 24) return `há ${h}h`
  const d = Math.floor(h / 24)
  if (d === 1) return 'ontem'
  if (d < 30) return `há ${d} dias`
  const m = Math.floor(d / 30)
  return m === 1 ? 'há 1 mês' : `há ${m} meses`
}
