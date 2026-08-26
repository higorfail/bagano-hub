import type { SupabaseClient } from '@supabase/supabase-js'

// Cliente desativado tem que sumir do hub inteiro, não só da lista de clientes.
//
// Desativar mudava só a tabela `clients`. Todo o conteúdo continuava no banco e
// as telas o carregavam sem perguntar de quem era: o cronograma do Mundo
// Selvagem seguia contando como pendência, aparecendo como atrasado e — pior —
// o cron ainda mandava "⚠️ Publicação atrasada" no celular de quem estava
// marcado, semanas depois do cliente ter saído.
//
// A causa é sempre a mesma forma: a tela pede `clients` com status ativo (e
// isso todas fazem), mas pede `schedules`/`extras`/`materials` sem recorte
// nenhum. Como o conteúdo é buscado por pessoa ou por data, e não por cliente,
// o filtro de cliente simplesmente não estava no caminho.
//
// Então o recorte mora aqui, num lugar só, em vez de cada tela lembrar.

/** Ids dos clientes que ainda estão ativos. */
export async function activeClientIds(supabase: SupabaseClient): Promise<Set<string>> {
  const { data } = await supabase.from('clients').select('id').eq('status', 'active')
  return new Set((data || []).map(c => c.id as string))
}

/**
 * Tira do meio o que pertence a cliente desativado.
 *
 * Quem não tem cliente FICA. Tarefa pessoal é o caso real disso hoje (18 no
 * banco), e um extra interno sem cliente também deve continuar aparecendo —
 * sumir sem dono seria trocar um vazamento por um sumiço.
 */
export function fromActiveClients<T extends { client_id?: string | null }>(
  rows: T[] | null | undefined,
  ativos: Set<string>,
): T[] {
  return (rows || []).filter(r => !r.client_id || ativos.has(r.client_id))
}
