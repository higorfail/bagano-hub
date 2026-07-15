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

const URL_BY_TABLE: Record<string, (recordId: string, clientId?: string | null) => string> = {
  schedules: (id, clientId) => `/dashboard/cronograma?post=${id}${clientId ? `&client=${clientId}` : ''}`,
  materials: id => `/dashboard/materiais?post=${id}`,
  extras:    id => `/dashboard/extras?post=${id}`,
}

// Dispara push pros watchers de um card (schedules/materials/extras), sempre que
// logActivity registra algo — ver src/lib/activity.ts. Roda como role anon (sem
// sessão de usuário), então push_subscriptions/card_watchers precisam de GRANT
// pro anon (ver push_subscriptions_setup.sql).
export async function POST(req: NextRequest) {
  if (!vapidPublic || !vapidPrivate) return NextResponse.json({ skipped: 'no vapid keys' })

  const body = await req.json().catch(() => null)
  if (!body?.tableName || !body?.recordId) return NextResponse.json({ skipped: 'invalid body' })

  const { tableName, recordId, clientId, actorId, actorName, description } = body
  const buildUrl = URL_BY_TABLE[tableName]
  if (!buildUrl) return NextResponse.json({ skipped: 'unsupported table' })

  const { data: watchers } = await supabase.from('card_watchers')
    .select('member_id').eq('table_name', tableName).eq('record_id', recordId)
  const memberIds = [...new Set((watchers || []).map((w: any) => w.member_id))].filter(id => id && id !== actorId)
  if (memberIds.length === 0) return NextResponse.json({ sent: 0 })

  const { data: subs } = await supabase.from('push_subscriptions')
    .select('id, member_id, endpoint, p256dh, auth').in('member_id', memberIds)
  if (!subs || subs.length === 0) return NextResponse.json({ sent: 0 })

  const payload = JSON.stringify({
    title: actorName ? `${actorName}` : 'Bagano Hub',
    body: description || 'Atualização num card que você acompanha',
    url: buildUrl(recordId, clientId),
  })

  let sent = 0
  await Promise.all(subs.map(async (sub: any) => {
    try {
      await webpush.sendNotification({ endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } }, payload)
      sent++
    } catch (err: any) {
      if (err?.statusCode === 404 || err?.statusCode === 410) {
        await supabase.from('push_subscriptions').delete().eq('id', sub.id)
      }
    }
  }))

  return NextResponse.json({ sent })
}
