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
  cronograma_status: (id, clientId) => `/dashboard/cronograma${clientId ? `?client=${clientId}` : ''}`,
  personal_tasks: id => `/dashboard/tarefas?task=${id}`,
}

// Dispara push pros watchers de um card (schedules/materials/extras), sempre que
// logActivity registra algo — ver src/lib/activity.ts. Roda como role anon (sem
// sessão de usuário), então push_subscriptions/card_watchers precisam de GRANT
// pro anon (ver push_subscriptions_setup.sql).
export async function POST(req: NextRequest) {
  if (!vapidPublic || !vapidPrivate) {
    console.error('push/notify: VAPID_PUBLIC_KEY/VAPID_PRIVATE_KEY não configuradas no ambiente — nenhum push será enviado.')
    return NextResponse.json({ skipped: 'no vapid keys' })
  }

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

  // Com vários clientes, "Gee moveu de X pra Y" sozinho não diz de qual —
  // antepõe o nome do cliente no título quando o card pertence a um.
  let clientName: string | null = null
  if (clientId) {
    const { data: client } = await supabase.from('clients').select('name').eq('id', clientId).maybeSingle()
    clientName = client?.name || null
  }

  // O Cronograma carrega os posts por month/year (colunas próprias da
  // tabela, diferentes de scheduled_date) — sem passar isso no link, clicar
  // na notificação abria o cliente certo mas no mês atual, e o post do
  // deep-link nunca aparecia na lista carregada (então nunca abria o card).
  let url = buildUrl(recordId, clientId)
  if (tableName === 'schedules') {
    const { data: sched } = await supabase.from('schedules').select('month, year').eq('id', recordId).maybeSingle()
    if (sched?.month && sched?.year) url += `&m=${sched.month}&y=${sched.year}`
  }

  const payload = JSON.stringify({
    title: clientName ? `${clientName} · ${actorName || 'Bagano Hub'}` : (actorName || 'Bagano Hub'),
    body: description || 'Atualização num card que você acompanha',
    url,
  })

  let sent = 0
  await Promise.all(subs.map(async (sub: any) => {
    try {
      await webpush.sendNotification({ endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } }, payload)
      sent++
    } catch (err: any) {
      if (err?.statusCode === 404 || err?.statusCode === 410) {
        await supabase.from('push_subscriptions').delete().eq('id', sub.id)
      } else {
        // Qualquer outro erro (VAPID errado, payload malformado, 401/403 etc.)
        // ficava completamente silencioso — nem no log do servidor aparecia.
        // Isso tornava impossível saber POR QUE um push não chegava (relatado
        // várias vezes: "não funciona no Chrome" sem nenhum erro visível).
        console.error('push/notify: falha ao enviar', { statusCode: err?.statusCode, body: err?.body, endpoint: sub.endpoint })
      }
    }
  }))

  return NextResponse.json({ sent })
}
