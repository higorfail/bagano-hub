import { createClient } from './supabase'

// Quem faz o quê já está no hub: cada cliente tem editor, designer,
// estrategista e social media definidos em `client_team`. O que faltava era
// USAR isso na hora de criar o card — 76% dos posts abertos não tinham
// ninguém marcado, e como observador de card vem de atribuição, a maior parte
// do cronograma simplesmente não gerava notificação.
//
// Vídeo é do editor; o resto é do designer. Não incluímos a social media aqui
// de propósito: ela entra no fim do fluxo (agendar e publicar), e marcá-la em
// todo card desde a criação encheria a caixa dela de aviso de trabalho que
// ainda nem começou — a rota de push já avisa ela quando o post fica pronto.
const FUNCAO_POR_TIPO: Record<string, 'videos' | 'posts'> = {
  reels:             'videos',
  carrossel:         'posts',
  post:              'posts',
  story:             'posts',
  carrossel_stories: 'posts',
  post_story:        'posts',
}

/**
 * Quem deve ser marcado num card novo, a partir do cliente e do tipo.
 * Devolve lista vazia quando o cliente não tem aquela função definida — nesse
 * caso o card nasce sem dono, como antes, em vez de marcar alguém errado.
 */
export async function autoAssignFor(
  clientId: string | null | undefined,
  postType: string | null | undefined,
): Promise<string[]> {
  if (!clientId) return []
  const funcao = FUNCAO_POR_TIPO[postType || ''] || 'posts'
  try {
    const { data } = await createClient()
      .from('client_team')
      .select('member_id')
      .eq('client_id', clientId)
      .eq('funcao', funcao)
    return (data || []).map((r: any) => r.member_id).filter(Boolean)
  } catch {
    // Nunca impedir a criação do card por causa disso: sem dono é ruim,
    // não conseguir criar o post é pior.
    return []
  }
}
