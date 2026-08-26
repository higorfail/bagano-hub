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
    .select('client_id, approved_count, rejected_count, window_start, clients(name)')
    .lte('last_action_at', cutoff)

  const pending = (due || []).filter((r: any) => r.approved_count > 0 || r.rejected_count > 0)
  if (pending.length === 0) return NextResponse.json({ sent: 0, digests: 0 })

  let sent = 0
  for (const row of pending as any[]) {
    const clientName = row.clients?.name || 'Cliente'

    // Conta POSTS DISTINTOS na janela, não eventos. O contador acumulado
    // dizia "12 conteúdos" pra 11 posts porque um deles foi aprovado duas
    // vezes (aprovado → marcado como ajuste internamente → aprovado de novo).
    const since = row.window_start || row.last_action_at
    const { data: events } = await supabase.from('activity_log')
      .select('record_id, action')
      .eq('client_id', row.client_id)
      .in('action', ['client_approved', 'client_rejected', 'crono_approved', 'crono_rejected'])
      .gte('created_at', since)

    const approvedIds = new Set<string>()
    const cronoIds    = new Set<string>()
    const rejectedIds = new Set<string>()
    for (const e of (events || []) as any[]) {
      // Um post que foi aprovado E teve ajuste pedido na mesma janela conta
      // como ajuste: é o estado em que ele terminou, e é o que exige ação.
      if (e.action === 'client_rejected' || e.action === 'crono_rejected') {
        rejectedIds.add(e.record_id); approvedIds.delete(e.record_id); cronoIds.delete(e.record_id)
      } else if (!rejectedIds.has(e.record_id)) {
        // Aprovar a ESTRATÉGIA e aprovar a ARTE são recados diferentes, e o
        // resumo dizia "aprovou N conteúdos" pros dois. O primeiro pede uma
        // decisão da estrategista (o post vai pra captação ou já pra produção?);
        // o segundo não pede nada de ninguém. Somados, a decisão desaparecia no
        // meio de um número que na maior parte das vezes não exige ação.
        if (e.action === 'crono_approved') cronoIds.add(e.record_id)
        else approvedIds.add(e.record_id)
      }
    }
    // Sem eventos no activity_log (janela antiga), cai no contador de antes.
    const approvedN = events?.length ? approvedIds.size : row.approved_count
    const cronoN    = events?.length ? cronoIds.size    : 0
    const rejectedN = events?.length ? rejectedIds.size : row.rejected_count
    if (approvedN === 0 && cronoN === 0 && rejectedN === 0) {
      await supabase.from('approval_digest_queue').delete().eq('client_id', row.client_id)
      continue
    }

    const parts: string[] = []
    if (approvedN > 0) parts.push(`aprovou ${approvedN} conteúdo${approvedN !== 1 ? 's' : ''}`)
    if (cronoN > 0)    parts.push(`aprovou a estratégia de ${cronoN} post${cronoN !== 1 ? 's' : ''}`)
    if (rejectedN > 0) parts.push(`pediu ajuste em ${rejectedN} conteúdo${rejectedN !== 1 ? 's' : ''}`)
    // A frase termina no que precisa ser feito, e não no que aconteceu — quem
    // lê no celular costuma ler só o começo, mas nunca só o fim.
    const pendencia = cronoN > 0 ? ' Falta definir captação ou produção.' : ''
    const body = `${clientName} ${parts.join(', ')}.${pendencia}`

    const { data: team } = await supabase.from('client_team').select('member_id').eq('client_id', row.client_id)
    const memberIds = [...new Set((team || []).map((t: any) => t.member_id))]

    if (memberIds.length > 0) {
      // Grava ANTES de enviar: o push é o aviso, isto é o registro. Sem esta
      // linha o resumo chegava no telefone e não existia na linha do tempo.
      await storeNotifications(supabase, {
        memberIds,
        clientId: row.client_id,
        kind: 'approval_digest',
        title: `Resumo de aprovação · ${clientName}`,
        body,
        url: `/dashboard/cronograma?client=${row.client_id}`,
        actorName: clientName,
      })

      const { data: subs } = await supabase.from('push_subscriptions')
        .select('id, endpoint, p256dh, auth').in('member_id', memberIds)
      const payload = JSON.stringify({ title: '📋 Resumo de aprovação', body, url: `/dashboard/cronograma?client=${row.client_id}` })
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
