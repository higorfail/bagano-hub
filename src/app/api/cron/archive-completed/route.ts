import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin as supabase } from '@/lib/supabaseAdmin'


const ARCHIVE_AFTER_DAYS = 7

// Link de aprovação morre quando não há mais o que aprovar.
//
// São 114 links públicos ativos, o mais antigo de 19/06 — cada um uma URL
// permanente pro conteúdo de um cliente, sem login.
//
// A primeira regra que escrevi era por TEMPO, e o ensaio mostrou que o tempo é
// o sinal errado: 62 dos 114 são de julho, e julho ainda tem 13 posts
// esperando resposta do cliente. Aqueles links estão vivos porque o trabalho
// não acabou — matá-los por idade cortaria a conversa no meio.
//
// O sinal certo é o estado: se o cliente já respondeu tudo daquele mês, o
// link cumpriu a função. A idade entra só como teto, pro caso do mês que
// nunca fecha — senão um cronograma abandonado deixa a porta aberta pra
// sempre.
const TOKEN_IDADE_MINIMA_MESES = 1
const TOKEN_TETO_MESES = 6

/** Etapas em que o post ainda espera alguma resposta do cliente. */
const ESPERANDO_CLIENTE = ['aguardando_aprovacao', 'aguardando_aprovacao_crono', 'ajuste']

// Roda 1x/dia (ver vercel.json) e arquiva Extras/Materiais concluídos há mais
// de ARCHIVE_AFTER_DAYS dias, pra eles pararem de ocupar espaço no board sem
// que alguém precise clicar em "Arquivar" um por um.
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET
  if (secret) {
    const auth = req.headers.get('authorization')
    if (auth !== `Bearer ${secret}`) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  const cutoff = new Date(Date.now() - ARCHIVE_AFTER_DAYS * 86400000).toISOString()

  const [{ data: extras, error: extrasError }, { data: materials, error: materialsError }] = await Promise.all([
    supabase.from('extras')
      .update({ archived_at: new Date().toISOString() })
      .eq('status', 'done')
      .is('archived_at', null)
      .lte('completed_at', cutoff)
      .select('id'),
    supabase.from('materials')
      .update({ archived_at: new Date().toISOString() })
      .eq('status', 'finalizado')
      .is('archived_at', null)
      .lte('completed_at', cutoff)
      .select('id'),
  ])

  if (extrasError || materialsError) {
    return NextResponse.json({ error: extrasError?.message || materialsError?.message }, { status: 500 })
  }

  // Desativa link de aprovação de cronograma que já não espera nada.
  //
  // `active = false` e não DELETE: o token é a chave de leitura do histórico
  // de aprovação, e apagar a linha levaria junto o registro de que aquele link
  // existiu. Quem precisar de um link morto gera outro — o hub cria sob
  // demanda.
  const agora = new Date()
  const mesAbs = agora.getFullYear() * 12 + agora.getMonth()   // mês corrente em nº absoluto

  const { data: ativos } = await supabase.from('approval_tokens')
    .select('id, client_id, month, year').eq('active', true)

  // Um pedido só pra tudo: os pendentes por cliente+mês. Perguntar token a
  // token seriam ~114 idas ao banco pra responder a mesma coisa.
  const { data: pendentes } = await supabase.from('schedules')
    .select('client_id, month, year').in('status', ESPERANDO_CLIENTE)
  const temPendencia = new Set(
    (pendentes || []).map(p => `${p.client_id}:${p.year}-${p.month}`))

  const expirar = (ativos || []).filter(t => {
    const idade = mesAbs - (t.year * 12 + (t.month - 1))
    if (idade < TOKEN_IDADE_MINIMA_MESES) return false          // mês corrente nunca
    if (idade >= TOKEN_TETO_MESES) return true                  // teto: mês que nunca fecha
    return !temPendencia.has(`${t.client_id}:${t.year}-${t.month}`)
  }).map(t => t.id)

  let tokensExpirados = 0
  let tokenError: string | undefined
  if (expirar.length) {
    const { data, error } = await supabase.from('approval_tokens')
      .update({ active: false }).in('id', expirar).select('id')
    tokensExpirados = data?.length || 0
    tokenError = error?.message
  }

  return NextResponse.json({
    extrasArchived: extras?.length || 0,
    materialsArchived: materials?.length || 0,
    tokensExpirados,
    ...(tokenError ? { tokenError } : {}),
  })
}
