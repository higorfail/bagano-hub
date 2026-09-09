import { createClient } from '@/lib/supabase'
import { novoCodigo } from '@/lib/linkAprovacao'

// Token "geral" — mesmo padrão get-or-create do copyTypeApprovalLink
// (CronogramaTab.tsx), mas atemporal: chaveia só por client_id, sem mês/ano,
// já que a visão unificada (crono + final + extras pendentes) não é presa a
// um mês específico. Guarda o mês/ano atual só por completude do schema —
// igual o tipo 'extras' já faz — a busca e a query de dados ignoram esse
// valor.
// O `db` opcional existe pro servidor: a rota /api/aprovacao/link passa o
// cliente de servidor, porque criar token é gravar em `approval_tokens` — e o
// navegador deslogado não pode mais fazer isso.
/**
 * O link de um MÊS (cronograma ou conteúdo final), reaproveitando o que existe.
 *
 * Duas regras que estavam faltando nas três cópias desta busca espalhadas pelo
 * hub — Cronograma (dois botões) e a fila de Cronogramas:
 *
 * 1. `active = true`. Sem isso, gerar o link de um mês que já teve token
 *    desativado devolve o token MORTO, e o cliente recebe "Link inválido ou
 *    expirado". Medido em 08/09: 38 combinações de cliente+mês+tipo nesse
 *    estado, em 19 clientes, todas de julho e agosto.
 *
 * 2. `order + limit` no lugar de `maybeSingle`. Duplicata do mesmo mês existe
 *    de verdade — Mundo Selvagem Garden tem 17 tokens de `final` 7/2026 — e
 *    `maybeSingle` estoura com dois, derrubando o botão em vez de dar o link.
 *    O mesmo já tinha sido consertado em `getOrCreateExtrasApprovalToken`, com
 *    comentário e tudo; as cópias do mês nunca receberam.
 *
 * Reaproveita o MAIS ANTIGO: se um link já foi mandado pro cliente, é esse que
 * está no WhatsApp dele.
 */
export async function getOrCreateMonthToken(
  clientId: string,
  type: 'cronograma' | 'final',
  month: number,
  year: number,
  db?: any,
): Promise<string | null> {
  const supabase = db || createClient()
  const { data: existing } = await supabase.from('approval_tokens').select('token')
    .eq('client_id', clientId).eq('type', type).eq('month', month).eq('year', year).eq('active', true)
    .order('created_at', { ascending: true }).limit(1)
  if (existing?.[0]?.token) return existing[0].token

  const { data } = await supabase.from('approval_tokens')
    .insert({ client_id: clientId, month, year, type, code: novoCodigo() })
    .select('token').single()
  return data?.token || null
}

export async function getOrCreateGeneralApprovalToken(clientId: string, db?: any): Promise<string | null> {
  const supabase = db || createClient()
  // order + limit, não maybeSingle: dois tokens `geral` ativos derrubariam o
  // link fixo do cliente em vez de devolver um deles.
  const { data: existing } = await supabase.from('approval_tokens').select('token')
    .eq('client_id', clientId).eq('type', 'geral').eq('active', true)
    .order('created_at', { ascending: true }).limit(1)
  if (existing?.[0]?.token) return existing[0].token

  const now = new Date()
  const { data } = await supabase.from('approval_tokens')
    .insert({ client_id: clientId, month: now.getMonth() + 1, year: now.getFullYear(), type: 'geral', code: novoCodigo() })
    .select('token').single()
  return data?.token || null
}

// Token de EXTRAS — também atemporal, pelo mesmo motivo do 'geral': a tela de
// aprovação de extras busca por `client_approval_status = 'aguardando'` e
// ignora mês/ano completamente.
//
// Mesmo assim, os dois lugares que copiavam esse link procuravam por
// client + MÊS DE HOJE. O link antigo continuava valendo (token não expira),
// mas todo mês nascia um token novo pro mesmo cliente, e você deixava de saber
// qual link o cliente tem na mão — impossível revogar o certo. Aqui a chave é
// só o cliente; o mês vai no insert por completude do schema e ninguém lê.
/**
 * Manda pro cliente os extras que estão em "Feito".
 *
 * Mesma ideia do cronograma, onde gerar o link é o que move os posts pra
 * aprovação: a coluna "Com o cliente" passa a refletir um FATO — o link saiu —
 * em vez de depender de alguém lembrar de arrastar. Arrastar continua
 * funcionando pra quem mandou por fora e quer marcar na mão.
 *
 * Devolve quantos foram, ou lança se o banco recusar — quem chama precisa
 * saber, porque um link enviado com o extra parado em "Feito" abre uma página
 * vazia pro cliente.
 */
export async function sendFeitoExtrasToClient(clientId: string): Promise<number> {
  const supabase = createClient()
  const { data, error } = await supabase.from('extras')
    // `client_approval_comment` NÃO é limpo aqui. Limpar matava em silêncio o
    // destaque "🟡 Ajustado — revisar" na página do cliente: aquele estado
    // exige status 'aguardando' E o comentário preenchido, e esta função
    // gravava os dois em contradição, então a condição nunca era verdadeira.
    // Efeito prático: o extra que o cliente tinha pedido pra mudar voltava
    // pra ele parecendo um pendente qualquer, sem nenhum sinal de que era
    // justamente aquele. O que o cliente pediu é dele — quem responde de novo
    // é o `client_approval_status`, não o texto.
    .update({ status: 'aguardando_aprovacao', client_approval_status: 'aguardando', completed_at: null })
    .eq('client_id', clientId).eq('status', 'feito').is('archived_at', null)
    .select('id')
  if (error) throw new Error(error.message)
  return (data || []).length
}

export async function getOrCreateExtrasApprovalToken(clientId: string): Promise<string | null> {
  const supabase = createClient()
  // order + limit em vez de maybeSingle: já podem existir tokens antigos, um
  // por mês, do comportamento anterior. maybeSingle estouraria com dois.
  const { data: existing } = await supabase.from('approval_tokens').select('token')
    .eq('client_id', clientId).eq('type', 'extras').eq('active', true)
    .order('created_at', { ascending: true }).limit(1)
  if (existing?.[0]?.token) return existing[0].token

  const now = new Date()
  const { data } = await supabase.from('approval_tokens')
    .insert({ client_id: clientId, month: now.getMonth() + 1, year: now.getFullYear(), type: 'extras', code: novoCodigo() })
    .select('token').single()
  return data?.token || null
}
