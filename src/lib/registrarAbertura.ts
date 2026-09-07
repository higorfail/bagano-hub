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

/** Não registra duas vezes na mesma janela — recarregar a página não é visita nova. */
const JANELA_MINUTOS = 30

export async function registrarAbertura(
  db: { from: (t: string) => any },
  token: string,
  clientId: string | null | undefined,
) {
  try {
    const desde = new Date(Date.now() - JANELA_MINUTOS * 60_000).toISOString()
    const { data: recente } = await db.from('activity_log')
      .select('id')
      .eq('table_name', 'approval_tokens')
      .eq('record_id', token)
      .eq('action', 'link_aberto')
      .gte('created_at', desde)
      .limit(1)
    if (recente?.length) return

    await db.from('activity_log').insert({
      table_name: 'approval_tokens',
      record_id: token,
      client_id: clientId || null,
      action: 'link_aberto',
      actor_name: 'Cliente',
      description: 'Cliente abriu o link de aprovação',
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
