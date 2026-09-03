import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import webpush from 'web-push'
import { storeNotifications } from '@/lib/storeNotifications'
import { activeClientIds, fromActiveClients } from '@/lib/activeClients'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
)

const vapidPublic = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
const vapidPrivate = process.env.VAPID_PRIVATE_KEY
if (vapidPublic && vapidPrivate) {
  webpush.setVapidDetails('mailto:contato@bagano.com.br', vapidPublic, vapidPrivate)
}

// O resumo do gerente.
//
// Gerente não recebe aviso avulso (ver src/lib/quemAvisar.ts): stream
// operacional vira gerente que ignora tudo, e aí perde também o que importava.
// Este cron responde outra pergunta — "como a agência está" em vez de "o que
// aconteceu agora" — e chega UMA vez por dia.
//
// Tudo aqui é coisa que só se enxerga somando: um post atrasado é rotina, doze
// é um problema; um cliente sem responder é normal, cinco é um padrão.

const PARADO_DIAS = 5
const ESPERANDO_CLIENTE = ['aguardando_aprovacao', 'aguardando_aprovacao_crono', 'ajuste']
const ABERTO = [
  'estrategia', 'aguardando_aprovacao_crono', 'captacao', 'producao',
  'revisao_interna', 'aguardando_aprovacao', 'ajuste', 'aprovado', 'agendado',
]

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET
  if (secret) {
    const auth = req.headers.get('authorization')
    if (auth !== `Bearer ${secret}`) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  const { data: gerentes } = await supabase.from('team_members')
    .select('id, name').eq('role', 'gerente')
  if (!gerentes?.length) return NextResponse.json({ skipped: 'sem gerente' })

  const hoje = new Date()
  const hojeISO = hoje.toISOString().slice(0, 10)
  const limite = new Date(Date.now() - PARADO_DIAS * 86400000).toISOString()
  const ativos = await activeClientIds(supabase)

  const [{ data: scRaw }, { data: clientesRaw }, { data: equipes }] = await Promise.all([
    supabase.from('schedules').select('client_id, status, month, year, scheduled_date, updated_at'),
    supabase.from('clients').select('id, name').eq('status', 'active'),
    supabase.from('client_team').select('client_id, funcao'),
  ])
  const sc = fromActiveClients(scRaw, ativos)
  const nome = new Map((clientesRaw || []).map(c => [c.id, c.name]))

  // 1. Atrasado: passou da data e não foi ao ar.
  const atrasados = sc.filter(s =>
    s.scheduled_date && s.scheduled_date < hojeISO &&
    !['publicado', 'cancelado'].includes(s.status))

  // 2. Parado com o cliente. `updated_at` e não `created_at`: o que importa é
  //    há quanto tempo está ESPERANDO, não a idade do post.
  const parados = sc.filter(s =>
    ESPERANDO_CLIENTE.includes(s.status) && s.updated_at && s.updated_at < limite)
  const clientesParados = [...new Set(parados.map(s => s.client_id))]

  // 3. Mês que não fechou — trabalho vivo em cronograma de mês passado.
  const mesAtual = hoje.getFullYear() * 12 + hoje.getMonth()
  const encalhados = sc.filter(s =>
    ABERTO.includes(s.status) && s.year * 12 + (s.month - 1) < mesAtual)
  const mesesAbertos = new Set(encalhados.map(s => `${s.client_id}:${s.year}-${s.month}`))

  // 4. Cliente sem função definida.
  //
  // Isto não é organização, é buraco de AVISO: as regras de notificação leem
  // client_team por cliente, então um cliente sem social é um cliente onde
  // ninguém é avisado de post aprovado nem de material pronto. E o silêncio
  // não se anuncia — descobre-se semanas depois, quando algo não foi feito.
  const funcoesPorCliente = new Map<string, Set<string>>()
  for (const t of equipes || []) {
    if (!funcoesPorCliente.has(t.client_id)) funcoesPorCliente.set(t.client_id, new Set())
    funcoesPorCliente.get(t.client_id)!.add(t.funcao)
  }
  const semFuncao = [...nome.keys()].filter(cid => {
    const f = funcoesPorCliente.get(cid) || new Set()
    return !f.has('estrategia') || !f.has('social') || !(f.has('videos') || f.has('posts'))
  })

  const partes: string[] = []
  if (atrasados.length) partes.push(`${atrasados.length} ${atrasados.length === 1 ? 'post atrasado' : 'posts atrasados'}`)
  if (parados.length) {
    const top = clientesParados.slice(0, 2).map(c => nome.get(c) || 'cliente').join(' e ')
    partes.push(`${parados.length} parados com ${clientesParados.length === 1 ? top : `${clientesParados.length} clientes`}${clientesParados.length > 1 ? ` (${top}…)` : ''}`)
  }
  if (mesesAbertos.size) partes.push(`${mesesAbertos.size} ${mesesAbertos.size === 1 ? 'mês não fechou' : 'meses não fecharam'}`)
  if (semFuncao.length) {
    const quais = semFuncao.slice(0, 2).map(c => nome.get(c) || 'cliente').join(' e ')
    partes.push(`${semFuncao.length} sem equipe completa (${quais}${semFuncao.length > 2 ? '…' : ''}) — não recebem aviso`)
  }

  // Dia sem nada a relatar não gera aviso. Resumo que chega todo dia dizendo
  // "tudo bem" é o mesmo ruído que ele veio substituir — e o silêncio passa a
  // significar alguma coisa.
  if (!partes.length) return NextResponse.json({ sent: 0, motivo: 'nada a relatar' })

  const body = partes.join(' · ')
  const memberIds = gerentes.map(g => g.id)

  await storeNotifications(supabase, {
    memberIds, kind: 'resumo_gerente',
    title: '📊 Como a agência está',
    body, url: '/dashboard/fechar-mes',
  })

  let enviados = 0
  if (vapidPublic && vapidPrivate) {
    const { data: subs } = await supabase.from('push_subscriptions')
      .select('id, endpoint, p256dh, auth, member_id').in('member_id', memberIds)
    const payload = JSON.stringify({ title: '📊 Como a agência está', body, url: '/dashboard/fechar-mes' })
    for (const sub of subs || []) {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } }, payload)
        enviados++
      } catch (err: any) {
        // Assinatura morta (trocou de aparelho, desinstalou o app) some. Sem
        // isso ela é tentada todo dia, pra sempre.
        if (err?.statusCode === 404 || err?.statusCode === 410) {
          await supabase.from('push_subscriptions').delete().eq('id', sub.id)
        }
      }
    }
  }

  return NextResponse.json({
    sent: enviados, gerentes: gerentes.length, body,
    detalhe: {
      atrasados: atrasados.length, parados: parados.length,
      mesesAbertos: mesesAbertos.size, semEquipe: semFuncao.map(c => nome.get(c)),
    },
  })
}
