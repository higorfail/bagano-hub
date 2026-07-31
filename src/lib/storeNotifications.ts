import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * Grava notificações na caixa de entrada.
 *
 * Existe porque os dois cron (resumo de aprovação e cobrança de atraso)
 * mandavam push DIRETO, sem passar pela rota /api/push/notify que é quem
 * grava. Resultado: essas notificações chegavam no telefone e não existiam
 * na linha do tempo — que foi exatamente o "recebi no telefone mas não fica
 * salvo" relatado.
 *
 * Regra que fica valendo: TODO envio de push passa por aqui antes. Se um dia
 * aparecer um terceiro remetente, ele grava pelo mesmo caminho.
 */
export async function storeNotifications(
  supabase: SupabaseClient,
  rows: {
    memberIds: string[]
    cardTable?: string | null
    cardId?: string | null
    clientId?: string | null
    kind: string
    title?: string | null
    body: string
    url?: string | null
    actorName?: string | null
  }
) {
  const { memberIds, cardTable, cardId, clientId, kind, title, body, url, actorName } = rows
  if (!memberIds.length) return

  const payload = memberIds.map(member_id => ({
    member_id,
    card_table: cardTable || null,
    // Aviso em lote não tem card único (o resumo fala de vários posts), e
    // sem card_id cada linha vira seu próprio bloco na lista em vez de todas
    // se fundirem numa só — ver groupByCard.
    card_id: cardId || null,
    client_id: clientId || null,
    kind,
    actor_name: actorName || null,
    title: title || null,
    body,
    url: url || null,
  }))

  const { error } = await supabase.from('hub_notifications').insert(payload)
  // Nunca derruba o cron por causa disso, mas também nunca some calado: foi o
  // silêncio que fez esse problema demorar pra aparecer.
  if (error) console.error('storeNotifications: falha ao gravar', error)
}
