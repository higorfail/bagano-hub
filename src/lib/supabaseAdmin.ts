import { createClient } from '@supabase/supabase-js'

// O cliente do servidor — o único que usa a chave secreta.
//
// Por que existe: até aqui, TODA rota de servidor usava a mesma chave que vai
// no navegador (`NEXT_PUBLIC_SUPABASE_ANON_KEY`). Chave `NEXT_PUBLIC_` é
// pública por definição: ela é embutida no pacote JavaScript que o navegador
// baixa. Qualquer pessoa com um link de aprovação — ou seja, qualquer um dos
// clientes — consegue lê-la, e com ela falar com o banco direto, sem passar
// pelo hub.
//
// Enquanto as políticas do banco liberam tudo para o papel `anon`, essa chave
// dá poder total. O aperto das políticas é o outro lado desta correção; este
// arquivo é o lado que garante que, quando as políticas apertarem, os crons
// continuem funcionando — porque a chave secreta não passa pela RLS.
//
// Regra: NUNCA importar isto de um componente de cliente. É `server-only`, e o
// build quebra se alguém tentar — de propósito.
import 'server-only'

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const chave = process.env.SUPABASE_SECRET_KEY

// Falha alto, na hora, e não em silêncio.
//
// Sem isto, esquecer a variável na Vercel produziria um cliente inválido que
// só falha na primeira consulta — dentro de um cron, cujo erro ninguém vê. O
// cron "roda", não faz nada, e ninguém descobre por semanas.
if (!url) throw new Error('NEXT_PUBLIC_SUPABASE_URL ausente')
if (!chave) throw new Error('SUPABASE_SECRET_KEY ausente — as rotas de servidor não funcionam sem ela')

export const supabaseAdmin = createClient(url, chave, {
  // Servidor não tem sessão de usuário nem lugar pra guardar token. Sem isto o
  // supabase-js tenta persistir e renovar sessão à toa.
  auth: { persistSession: false, autoRefreshToken: false },
})
