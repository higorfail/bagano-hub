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

const BR_TZ = 'America/Sao_Paulo'
const brDateFormatter = new Intl.DateTimeFormat('en-CA', { timeZone: BR_TZ, year: 'numeric', month: '2-digit', day: '2-digit' })
function todayBrasiliaISO() { return brDateFormatter.format(new Date()) }
function addDaysISO(iso: string, days: number) {
  const d = new Date(iso + 'T12:00:00')
  d.setDate(d.getDate() + days)
  return d.toISOString().slice(0, 10)
}

type Stage = 'overdue' | 'dueday' | '2d'
type Reminder = { table: 'schedules' | 'extras'; id: string; title: string; date: string; stage: Stage; fallbackMembers: string[] }

// Roda de hora em hora (ver vercel.json) e avisa quem acompanha um post/extra
// em 3 momentos: 2 dias antes da data marcada, no próprio dia, e quando já
// passou da data sem ter sido publicado — sem isso, esses avisos só
// aparecem se alguém abrir a página de Publicações por conta própria.
// Cada estágio notifica no máximo 1x por dia por card (ver `alreadySentToday`),
// mesmo rodando de hora em hora.
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET
  if (secret) {
    const auth = req.headers.get('authorization')
    if (auth !== `Bearer ${secret}`) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }
  if (!vapidPublic || !vapidPrivate) return NextResponse.json({ skipped: 'no vapid keys' })

  const todayISO = todayBrasiliaISO()
  const in2DaysISO = addDaysISO(todayISO, 2)

  const [{ data: schedulesData }, { data: extrasData }] = await Promise.all([
    // "Atrasado" agora vale pra qualquer coisa não publicada com data vencida,
    // não só Agendado — um post parado em Aprovado com data vencida também
    // conta (mesmo critério de isOverdue em src/lib/socialItems.ts).
    supabase.from('schedules').select('id, title, client_id, scheduled_date, status')
      .in('status', ['aprovado', 'agendado'])
      .not('scheduled_date', 'is', null)
      .lte('scheduled_date', in2DaysISO),
    supabase.from('extras').select('id, title, client_id, due_date, status, assigned_members, assigned_member_id')
      .neq('status', 'done')
      .not('due_date', 'is', null)
      .lte('due_date', in2DaysISO),
  ])

  function stageFor(dateISO: string): Stage | null {
    if (dateISO < todayISO) return 'overdue'
    if (dateISO === todayISO) return 'dueday'
    if (dateISO === in2DaysISO) return '2d'
    return null
  }

  const reminders: Reminder[] = []
  for (const s of schedulesData || []) {
    const stage = stageFor(s.scheduled_date)
    if (stage) reminders.push({ table: 'schedules', id: s.id, title: s.title, date: s.scheduled_date, stage, fallbackMembers: [] })
  }
  for (const e of extrasData || []) {
    const stage = stageFor(e.due_date)
    if (stage) reminders.push({
      table: 'extras', id: e.id, title: e.title, date: e.due_date, stage,
      fallbackMembers: e.assigned_members?.length ? e.assigned_members : e.assigned_member_id ? [e.assigned_member_id] : [],
    })
  }
  if (reminders.length === 0) return NextResponse.json({ sent: 0, reminders: 0 })

  // Dedupe: não manda o mesmo estágio 2x no mesmo dia pro mesmo card, mesmo
  // rodando de hora em hora — olha os últimos 20h de activity_log em vez de
  // comparar por data de calendário (evita risco de fuso na borda do dia).
  const since = new Date(Date.now() - 20 * 3600 * 1000).toISOString()
  const { data: recentLogs } = await supabase.from('activity_log')
    .select('table_name, record_id, field')
    .eq('action', 'reminder_sent')
    .gte('created_at', since)
  const alreadySent = new Set((recentLogs || []).map(l => `${l.table_name}:${l.record_id}:${l.field}`))

  const MESSAGES: Record<Stage, (title: string, days: number) => { title: string; body: string }> = {
    '2d': (title) => ({ title: '📅 Publicação chegando', body: `"${title}" está marcado pra daqui a 2 dias.` }),
    dueday: (title) => ({ title: '🔔 Publica hoje', body: `"${title}" está marcado pra hoje.` }),
    overdue: (title, days) => ({ title: '⚠️ Publicação atrasada', body: `"${title}" devia ter sido publicado há ${days} dia${days === 1 ? '' : 's'}.` }),
  }

  let sent = 0
  for (const item of reminders) {
    const key = `${item.table}:${item.id}:${item.stage}`
    if (alreadySent.has(key)) continue

    const { data: watchers } = await supabase.from('card_watchers')
      .select('member_id').eq('table_name', item.table).eq('record_id', item.id)
    let memberIds = [...new Set((watchers || []).map(w => w.member_id))].filter(Boolean) as string[]
    if (memberIds.length === 0) memberIds = item.fallbackMembers
    if (memberIds.length === 0) continue

    const { data: subs } = await supabase.from('push_subscriptions')
      .select('id, endpoint, p256dh, auth').in('member_id', memberIds)
    if (!subs || subs.length === 0) continue

    const daysLate = Math.max(1, Math.round((Date.now() - new Date(item.date + 'T00:00:00').getTime()) / 86400000))
    const { title, body } = MESSAGES[item.stage](item.title, daysLate)
    const payload = JSON.stringify({ title, body, url: '/dashboard/social' })

    let anySent = false
    await Promise.all(subs.map(async sub => {
      try {
        await webpush.sendNotification({ endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } }, payload)
        sent++; anySent = true
      } catch (err: any) {
        if (err?.statusCode === 404 || err?.statusCode === 410) {
          await supabase.from('push_subscriptions').delete().eq('id', sub.id)
        }
      }
    }))

    if (anySent) {
      await supabase.from('activity_log').insert({
        table_name: item.table, record_id: item.id, action: 'reminder_sent', field: item.stage,
        description: body,
      })
    }
  }

  return NextResponse.json({ sent, reminders: reminders.length })
}
