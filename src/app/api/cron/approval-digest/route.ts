import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import webpush from 'web-push'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

const vapidPublic = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
const vapidPrivate = process.env.VAPID_PRIVATE_KEY
if (vapidPublic && vapidPrivate) {
  webpush.setVapidDetails('mailto:contato@bagano.com.br', vapidPublic, vapidPrivate)
}

const QUIET_MINUTES = 5

// Manda UM resumo por cliente ("Terras Altas aprovou 10 conteúdos, pediu
// ajuste em 2") em vez de um push por post — só quando fica pelo menos
// QUIET_MINUTES sem nenhuma nova ação de aprovação daquele cliente (ver
// queueApprovalDigest em src/lib/approvalDigest.ts, chamado de dentro de
// AprovarClient.tsx). Seguro de chamar com frequência: se não tiver nada
// "quieto" o suficiente ainda, não faz nada.
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET
  if (secret) {
    const auth = req.headers.get('authorization')
    if (auth !== `Bearer ${secret}`) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }
  if (!vapidPublic || !vapidPrivate) return NextResponse.json({ skipped: 'no vapid keys' })

  const cutoff = new Date(Date.now() - QUIET_MINUTES * 60 * 1000).toISOString()
  const { data: due } = await supabase.from('approval_digest_queue')
    .select('client_id, approved_count, rejected_count, clients(name)')
    .lte('last_action_at', cutoff)

  const pending = (due || []).filter((r: any) => r.approved_count > 0 || r.rejected_count > 0)
  if (pending.length === 0) return NextResponse.json({ sent: 0, digests: 0 })

  let sent = 0
  for (const row of pending as any[]) {
    const clientName = row.clients?.name || 'Cliente'
    const parts: string[] = []
    if (row.approved_count > 0) parts.push(`aprovou ${row.approved_count} conteúdo${row.approved_count !== 1 ? 's' : ''}`)
    if (row.rejected_count > 0) parts.push(`pediu ajuste em ${row.rejected_count} conteúdo${row.rejected_count !== 1 ? 's' : ''}`)
    const body = `${clientName} ${parts.join(', ')}.`

    const { data: team } = await supabase.from('client_team').select('member_id').eq('client_id', row.client_id)
    const memberIds = [...new Set((team || []).map((t: any) => t.member_id))]

    if (memberIds.length > 0) {
      const { data: subs } = await supabase.from('push_subscriptions')
        .select('id, endpoint, p256dh, auth').in('member_id', memberIds)
      const payload = JSON.stringify({ title: '📋 Resumo de aprovação', body, url: '/dashboard/cronograma' })
      await Promise.all((subs || []).map(async (sub: any) => {
        try {
          await webpush.sendNotification({ endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } }, payload)
          sent++
        } catch (err: any) {
          if (err?.statusCode === 404 || err?.statusCode === 410) {
            await supabase.from('push_subscriptions').delete().eq('id', sub.id)
          } else {
            console.error('approval-digest: falha ao enviar', { statusCode: err?.statusCode, body: err?.body })
          }
        }
      }))
    }

    await supabase.from('approval_digest_queue').delete().eq('client_id', row.client_id)
  }

  return NextResponse.json({ sent, digests: pending.length })
}
