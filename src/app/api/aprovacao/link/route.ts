import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { getOrCreateGeneralApprovalToken } from '@/lib/approvalLinks'
import { linkPublico } from '@/lib/linkAprovacao'

// Resolve /aprovar/cliente/<id> no servidor.
//
// Antes isto acontecia no navegador do cliente, o que obrigava o papel `anon` a
// poder GRAVAR em `approval_tokens` — e quem pode gravar ali cunha link de
// aprovação pra qualquer cliente. Agora o navegador só pergunta; quem cria o
// token é o servidor, com a chave secreta.
//
// Não exige login de propósito: o dono do link é o cliente, que não tem conta.
// A porta continua sendo o UUID do cliente, como já era — quem não o tem, não
// chega aqui.
export async function GET(req: NextRequest) {
  const clientId = req.nextUrl.searchParams.get('clientId') || ''

  // Só UUID. Sem isto, o parâmetro entra cru na consulta e qualquer coisa vira
  // uma tentativa de busca.
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(clientId)) {
    return NextResponse.json({ error: 'cliente inválido' }, { status: 400 })
  }

  // Cliente desativado não ganha link novo — senão o "link fixo por cliente"
  // ressuscita quem saiu da agência.
  const { data: cli } = await supabaseAdmin
    .from('clients').select('id, status').eq('id', clientId).maybeSingle()
  if (!cli || cli.status !== 'active') {
    return NextResponse.json({ error: 'cliente não encontrado' }, { status: 404 })
  }

  const token = await getOrCreateGeneralApprovalToken(clientId, supabaseAdmin)
  if (!token) return NextResponse.json({ error: 'não foi possível gerar o link' }, { status: 500 })

  return NextResponse.json({ path: await linkPublico(supabaseAdmin, token) })
}
