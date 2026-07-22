import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

const ARCHIVE_AFTER_DAYS = 7

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

  return NextResponse.json({ extrasArchived: extras?.length || 0, materialsArchived: materials?.length || 0 })
}
