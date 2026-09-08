import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabaseAdmin'

// Registra que o cliente abriu o link — no SERVIDOR.
//
// Estava no navegador, e a parte que evita contar duas vezes nunca funcionou.
// A função consultava o `activity_log` procurando uma abertura recente antes de
// gravar, mas essa consulta roda como `anon`, e `activity_log` só tem política
// de INSERT pra anon — nenhuma de SELECT. A leitura voltava vazia SEMPRE, então
// toda carga de página gravava uma visita nova.
//
// O efeito não era só ruído: em 08/09 li "o cliente abriu 6 vezes em 6 minutos"
// como cliente insistindo num botão quebrado. Eram duas aberturas reais e quatro
// recarregamentos.
//
// Dar SELECT pra anon resolveria a dedupe e abriria o histórico inteiro do
// cliente — comentários internos, nomes da equipe — pra quem tem o link. Foi
// exatamente isso que a política por cabeçalho fechou. Então a conferência vem
// pra cá, onde a chave secreta lê sem expor nada.

/** Recarregar a página não é visita nova. */
const JANELA_MINUTOS = 30

export async function POST(req: NextRequest) {
  const { token } = await req.json().catch(() => ({ token: '' }))
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(token || '')) {
    return NextResponse.json({ ok: false }, { status: 400 })
  }

  // O token é a prova. Sem ele conferido aqui, qualquer um inflaria a visita de
  // qualquer cliente — e "o cliente abriu" é dado que a equipe usa pra cobrar.
  const { data: tk } = await supabaseAdmin
    .from('approval_tokens').select('client_id, active').eq('token', token).maybeSingle()
  if (!tk || !tk.active) return NextResponse.json({ ok: false }, { status: 404 })

  const desde = new Date(Date.now() - JANELA_MINUTOS * 60_000).toISOString()
  const { data: recente } = await supabaseAdmin
    .from('activity_log').select('id')
    .eq('table_name', 'approval_tokens').eq('record_id', token)
    .eq('action', 'link_aberto').gte('created_at', desde).limit(1)
  if (recente?.length) return NextResponse.json({ ok: true, jaContado: true })

  await supabaseAdmin.from('activity_log').insert({
    table_name: 'approval_tokens',
    record_id: token,
    client_id: tk.client_id,
    action: 'link_aberto',
    actor_name: 'Cliente',
    description: 'Cliente abriu o link de aprovação',
  })
  return NextResponse.json({ ok: true, jaContado: false })
}
