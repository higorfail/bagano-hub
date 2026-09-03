import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

const ARCHIVE_AFTER_DAYS = 7

// Link de aprovação de mês passado não deveria abrir mais.
//
// São 114 links públicos ativos, o mais antigo de 19/06 — cada um uma URL
// permanente pro conteúdo de um cliente, sem login. O de junho não protege
// nada: aquele cronograma acabou. Mantê-lo vivo é superfície aberta em troca
// de zero utilidade.
//
// Dois meses cheios de folga porque cronograma atrasa: o de agosto só é
// desativado em novembro. Quem precisar de um link morto gera outro — o hub
// cria sob demanda.
const TOKEN_EXPIRA_APOS_MESES = 2

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

  // Desativa link de aprovação de cronograma velho. `active = false` e não
  // DELETE: o token é a chave de leitura do histórico de aprovação, e apagar
  // a linha levaria junto o registro de que aquele link existiu.
  const agora = new Date()
  let limite = agora.getMonth() + 1 - TOKEN_EXPIRA_APOS_MESES
  let anoLimite = agora.getFullYear()
  while (limite <= 0) { limite += 12; anoLimite -= 1 }

  const { data: tokens, error: tokenError } = await supabase.from('approval_tokens')
    .update({ active: false })
    .eq('active', true)
    // Ano anterior sai inteiro; no ano corrente, só o que é anterior ao limite.
    .or(`year.lt.${anoLimite},and(year.eq.${anoLimite},month.lt.${limite})`)
    .select('id')

  return NextResponse.json({
    extrasArchived: extras?.length || 0,
    materialsArchived: materials?.length || 0,
    tokensExpirados: tokens?.length || 0,
    ...(tokenError ? { tokenError: tokenError.message } : {}),
  })
}
