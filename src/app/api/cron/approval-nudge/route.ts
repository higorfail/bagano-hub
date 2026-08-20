import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import webpush from 'web-push'
import { storeNotifications } from '@/lib/storeNotifications'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

const vapidPublic = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
const vapidPrivate = process.env.VAPID_PRIVATE_KEY
if (vapidPublic && vapidPrivate) {
  webpush.setVapidDetails('mailto:contato@bagano.com.br', vapidPublic, vapidPrivate)
}

// Já existia aviso pra quando o cliente RESPONDE (approval-digest). Não existia
// nenhum pra quando ele NÃO responde — e é esse o caso que trava o funil: um
// terço de tudo que está aberto espera o cliente, com dezenas parados há mais
// de duas semanas. Ninguém era avisado porque ninguém tinha o que olhar.
//
// Quem recebe é a estrategista e a social media do cliente — quem fala com ele.
// Não vai pro designer nem pro editor: o trabalho deles já saiu da mão.
const DIAS_PARA_COBRAR = 5
const RECOBRAR_A_CADA = 5

// Um aviso por CLIENTE, não por post. O cliente que está com 11 conteúdos
// parados precisa de uma cobrança, não de onze — foi a mesma lição do
// approval-digest.
const STATUS_ESPERANDO = ['aguardando_aprovacao', 'aguardando_aprovacao_crono']

const BR_TZ = 'America/Sao_Paulo'
const brDate = new Intl.DateTimeFormat('en-CA', { timeZone: BR_TZ, year: 'numeric', month: '2-digit', day: '2-digit' })

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET
  if (secret) {
    const auth = req.headers.get('authorization')
    if (auth !== `Bearer ${secret}`) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  const hoje = brDate.format(new Date())
  const limite = new Date(Date.now() - DIAS_PARA_COBRAR * 86_400_000).toISOString()

  // `updated_at` e não `created_at`: o que importa é há quanto tempo o post
  // está parado ESPERANDO, não a idade dele. Post criado em maio e mandado pro
  // cliente ontem não é cobrança de hoje.
  const { data: parados } = await supabase.from('schedules')
    .select('id, title, client_id, status, updated_at')
    .in('status', STATUS_ESPERANDO)
    .lt('updated_at', limite)
  if (!parados?.length) return NextResponse.json({ sent: 0, clientes: 0 })

  const { data: clients } = await supabase.from('clients').select('id, name')
  const nomeCliente = new Map((clients || []).map((c: any) => [c.id, c.name]))

  // Agrupa por cliente e guarda o mais antigo — é o número que dá o tamanho do
  // problema ("há 12 dias"), muito mais útil que a média.
  const porCliente = new Map<string, { qtd: number; maisAntigo: string }>()
  for (const p of parados) {
    if (!p.client_id) continue
    const atual = porCliente.get(p.client_id)
    if (!atual) porCliente.set(p.client_id, { qtd: 1, maisAntigo: p.updated_at })
    else {
      atual.qtd++
      if (p.updated_at < atual.maisAntigo) atual.maisAntigo = p.updated_at
    }
  }

  let sent = 0
  let avisados = 0

  for (const [clientId, info] of porCliente) {
    // Quem fala com o cliente: estrategista e social media.
    const { data: time } = await supabase.from('client_team')
      .select('member_id, funcao').eq('client_id', clientId).in('funcao', ['estrategia', 'social'])
    const memberIds = [...new Set((time || []).map((t: any) => t.member_id))].filter(Boolean)
    if (!memberIds.length) continue

    // Não repete todo dia. Sem esta trava, o cliente que demora duas semanas
    // gera catorze cobranças iguais e a pessoa para de ler todas.
    const desde = new Date(Date.now() - RECOBRAR_A_CADA * 86_400_000).toISOString()
    const { data: jaAvisou } = await supabase.from('hub_notifications')
      .select('id').eq('kind', 'approval_nudge').eq('client_id', clientId)
      .gte('created_at', desde).limit(1)
    if (jaAvisou?.length) continue

    const dias = Math.max(DIAS_PARA_COBRAR, Math.round((Date.now() - new Date(info.maisAntigo).getTime()) / 86_400_000))
    const nome = nomeCliente.get(clientId) || 'Cliente'
    const body = info.qtd === 1
      ? `${nome} está há ${dias} dias sem aprovar 1 conteúdo. Vale lembrar.`
      : `${nome} está há ${dias} dias sem aprovar ${info.qtd} conteúdos. Vale lembrar.`
    const url = `/dashboard/aprovacao?client=${clientId}`

    await storeNotifications(supabase, {
      memberIds, clientId, kind: 'approval_nudge',
      title: 'Cliente demorando pra aprovar', body, url,
    })
    avisados++

    if (!vapidPublic || !vapidPrivate) continue
    const { data: subs } = await supabase.from('push_subscriptions')
      .select('id, endpoint, p256dh, auth').in('member_id', memberIds)
    const payload = JSON.stringify({ title: `${nome} · aprovação parada`, body, url })
    await Promise.all((subs || []).map(async (sub: any) => {
      try {
        await webpush.sendNotification({ endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } }, payload)
        sent++
      } catch (err: any) {
        if (err?.statusCode === 404 || err?.statusCode === 410) {
          await supabase.from('push_subscriptions').delete().eq('id', sub.id)
        } else {
          console.error('cron/approval-nudge: falha ao enviar push', { statusCode: err?.statusCode, body: err?.body })
        }
      }
    }))
  }

  return NextResponse.json({ hoje, clientesAvisados: avisados, sent })
}
