import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

// O guarda de login do hub mora no proxy, e o proxy só cobre `/` e
// `/dashboard/*` — rota de API fica de fora. Enquanto `/api/calendar` só
// escrevia, isso já era folgado; passando a LER a agenda da Bagano, viraria
// uma porta aberta: quem soubesse o endereço leria a agenda inteira sem login.
//
// Aqui a sessão é conferida de verdade (ida ao Supabase Auth pra validar o
// token), não pela mera presença do cookie como faz o proxy. Rota de API não
// tem RLS por trás pra segurar o estrago se o cookie for forjado — o que
// responde é a chave da conta de serviço do Google, que ignora quem perguntou.
export async function usuarioLogado() {
  const jar = await cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => jar.getAll(),
        // Rota de API não renova sessão; só lê. Sem este no-op o cliente
        // reclama de não conseguir gravar cookie.
        setAll: () => {},
      },
    },
  )
  const { data } = await supabase.auth.getUser()
  return data.user ?? null
}

/**
 * A chamada tem direito de estar aqui?
 *
 * Duas credenciais valem, porque duas telas legítimas chamam estas rotas:
 * o hub (pessoa logada) e a página pública de aprovação (cliente sem conta,
 * que prova quem é pelo `x-approval-token`, o mesmo cabeçalho que as políticas
 * do banco conferem).
 *
 * Por que passou a existir: onze rotas de API não tinham guarda nenhuma.
 * `/api/push/notify` aceitava qualquer requisição da internet — dava pra
 * disparar notificação no celular da equipe inteira, com o texto que quisesse.
 * As oito rotas de IA rodavam o Gemini com a nossa chave pra quem pedisse:
 * cota queimada, e prompt escolhido por estranho.
 */
export async function chamadaAutorizada(req: Request): Promise<boolean> {
  if (await usuarioLogado()) return true

  const token = req.headers.get('x-approval-token')
  if (!token) return false

  // Import tardio: `supabaseAdmin` é `server-only` e falha alto se alguém
  // arrastar este arquivo pro navegador sem querer.
  const { supabaseAdmin } = await import('./supabaseAdmin')
  const { data } = await supabaseAdmin
    .from('approval_tokens').select('token').eq('token', token).eq('active', true).maybeSingle()
  return !!data
}
