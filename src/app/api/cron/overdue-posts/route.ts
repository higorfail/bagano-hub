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

// Roda 1x/dia (ver vercel.json) e avisa quem acompanha um post/extra "Agendado"
// cuja data já passou e ainda não foi marcado como Publicado — sem isso, um
// post atrasado só aparece se alguém abrir a página de Publicações por conta
// própria. Notifica watchers do card e, se não houver nenhum, os responsáveis
// atribuídos (assigned_members) como fallback.
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET
  if (secret) {
    const auth = req.headers.get('authorization')
    if (auth !== `Bearer ${secret}`) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }
  if (!vapidPublic || !vapidPrivate) return NextResponse.json({ skipped: 'no vapid keys' })

  const todayISO = new Date().toISOString().slice(0, 10)

  const [{ data: overdueSchedules }, { data: overdueExtras }] = await Promise.all([
    supabase.from('schedules').select('id, title, client_id, scheduled_date').eq('status', 'agendado').lt('scheduled_date', todayISO),
    supabase.from('extras').select('id, title, client_id, due_date, assigned_members, assigned_member_id').neq('status', 'done').not('due_date', 'is', null).lt('due_date', todayISO),
  ])

  const items = [
    ...(overdueSchedules || []).map(s => ({ table: 'schedules' as const, id: s.id, title: s.title, clientId: s.client_id, date: s.scheduled_date, fallbackMembers: [] as string[] })),
    ...(overdueExtras || []).map(e => ({
      table: 'extras' as const, id: e.id, title: e.title, clientId: e.client_id, date: e.due_date,
      fallbackMembers: e.assigned_members?.length ? e.assigned_members : e.assigned_member_id ? [e.assigned_member_id] : [],
    })),
  ]
  if (items.length === 0) return NextResponse.json({ sent: 0, overdue: 0 })

  let sent = 0
  for (const item of items) {
    const { data: watchers } = await supabase.from('card_watchers')
      .select('member_id').eq('table_name', item.table).eq('record_id', item.id)
    let memberIds = [...new Set((watchers || []).map(w => w.member_id))].filter(Boolean) as string[]
    if (memberIds.length === 0) memberIds = item.fallbackMembers
    if (memberIds.length === 0) continue

    const { data: subs } = await supabase.from('push_subscriptions')
      .select('id, endpoint, p256dh, auth').in('member_id', memberIds)
    if (!subs || subs.length === 0) continue

    const daysLate = Math.max(1, Math.round((Date.now() - new Date(item.date + 'T00:00:00').getTime()) / 86400000))
    const payload = JSON.stringify({
      title: '⚠️ Publicação atrasada',
      body: `"${item.title}" devia ter sido publicado há ${daysLate} dia${daysLate === 1 ? '' : 's'}.`,
      url: '/dashboard/social',
    })

    await Promise.all(subs.map(async sub => {
      try {
        await webpush.sendNotification({ endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } }, payload)
        sent++
      } catch (err: any) {
        if (err?.statusCode === 404 || err?.statusCode === 410) {
          await supabase.from('push_subscriptions').delete().eq('id', sub.id)
        }
      }
    }))
  }

  return NextResponse.json({ sent, overdue: items.length })
}
