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

// Título do card pra notificação — é ele que agrupa a lista do sininho ("POST
// 11 — REEL" com as três mudanças de data embaixo, em vez de três linhas
// soltas). Cada tabela guarda o nome numa coluna diferente.
const TITLE_COLUMN: Record<string, string> = {
  schedules: 'title',
  materials: 'title',
  extras: 'title',
  personal_tasks: 'title',
}

async function resolveCardTitle(tableName: string, recordId: string): Promise<string | null> {
  const col = TITLE_COLUMN[tableName]
  if (!col) return null
  const { data } = await supabase.from(tableName).select(col).eq('id', recordId).maybeSingle()
  return (data as any)?.[col] || null
}

// Dispara push pros watchers de um card (schedules/materials/extras), sempre que
// logActivity registra algo — ver src/lib/activity.ts. Roda como role anon (sem
// sessão de usuário), então push_subscriptions/card_watchers precisam de GRANT
// pro anon (ver push_subscriptions_setup.sql).
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null)
  if (!body?.tableName || !body?.recordId) return NextResponse.json({ skipped: 'invalid body' })

  const { tableName, recordId, clientId, actorId, actorName, description, skipPush, action } = body
  const buildUrl = URL_BY_TABLE[tableName]
  if (!buildUrl) return NextResponse.json({ skipped: 'unsupported table' })

  // A checagem de VAPID desceu pra depois de gravar a notificação: antes ela
  // saía aqui em cima e, sem as chaves configuradas, NADA era registrado — o
  // sininho ficava vazio junto com o push.
  const canPush = !!(vapidPublic && vapidPrivate) && !skipPush

  const { data: watchers } = await supabase.from('card_watchers')
    .select('member_id').eq('table_name', tableName).eq('record_id', recordId)
  let memberIds = [...new Set((watchers || []).map((w: any) => w.member_id))].filter(id => id && id !== actorId)

  // Post de cronograma: precisa do estágio pra decidir quem mais avisar, e do
  // month/year pro link abrir no mês certo (o Cronograma filtra por essas
  // colunas, diferentes de scheduled_date — sem elas o deep-link abria o
  // cliente certo mas no mês atual, sem o post).
  let sched: { month?: number; year?: number; status?: string } | null = null
  if (tableName === 'schedules') {
    const { data } = await supabase.from('schedules').select('month, year, status').eq('id', recordId).maybeSingle()
    sched = data
  }

  // Depois de aprovado o post é responsabilidade da Social Media — é ela quem
  // agenda e publica. Qualquer mexida dali em diante (principalmente TROCAR A
  // DATA) precisa chegar nela, mesmo que nunca tenha aberto o card. Sem isso
  // ela só descobria a mudança ao procurar o post no dia e não achar — caso
  // real com um post do Satō. Não basta virar watcher ao aprovar: quando quem
  // aprova é o cliente pelo link público, esse caminho nem passa pelo Hub.
  const isLiveStage = ['aprovado', 'agendado', 'publicado'].includes(sched?.status || '')
  if (isLiveStage && clientId) {
    const { data: social } = await supabase.from('client_team')
      .select('member_id').eq('client_id', clientId).eq('funcao', 'social')
    const socialIds = (social || []).map((s: any) => s.member_id).filter((id: string) => id && id !== actorId)
    memberIds = [...new Set([...memberIds, ...socialIds])]
  }

  if (memberIds.length === 0) return NextResponse.json({ sent: 0 })

  // Com vários clientes, "Gee moveu de X pra Y" sozinho não diz de qual —
  // antepõe o nome do cliente no título quando o card pertence a um.
  let clientName: string | null = null
  if (clientId) {
    const { data: client } = await supabase.from('clients').select('name').eq('id', clientId).maybeSingle()
    clientName = client?.name || null
  }

  let url = buildUrl(recordId, clientId)
  if (sched?.month && sched?.year) url += `&m=${sched.month}&y=${sched.year}`

  // Grava a notificação ANTES de tentar o push, e independente dele. É isso que
  // faz o sininho e o push serem a mesma coisa: aprovação do cliente vem com
  // skipPush (o resumo em lote evita um push por post), e antes disso ela
  // simplesmente não existia pro sininho.
  const cardTitle = await resolveCardTitle(tableName, recordId)
  await supabase.from('notifications').insert(
    memberIds.map(memberId => ({
      member_id: memberId,
      card_table: tableName,
      card_id: recordId,
      client_id: clientId || null,
      kind: action || 'activity',
      actor_name: actorName || null,
      actor_id: actorId || null,
      title: cardTitle,
      body: description || 'Atualização num card que você acompanha',
      url,
    }))
  )

  if (!canPush) return NextResponse.json({ sent: 0, stored: memberIds.length })

  const { data: subs } = await supabase.from('push_subscriptions')
    .select('id, member_id, endpoint, p256dh, auth').in('member_id', memberIds)
  if (!subs || subs.length === 0) return NextResponse.json({ sent: 0, stored: memberIds.length })

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
