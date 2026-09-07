import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin as supabase } from '@/lib/supabaseAdmin'
import webpush from 'web-push'
import { storeNotifications } from '@/lib/storeNotifications'
import { calcularFolego, fraseFolego, type Folego } from '@/lib/folego'
import { brasiliaISOFromDate } from '@/lib/timezone'
import { activeClientIds } from '@/lib/activeClients'

const vapidPublic = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
const vapidPrivate = process.env.VAPID_PRIVATE_KEY
if (vapidPublic && vapidPrivate) {
  webpush.setVapidDetails('mailto:contato@bagano.com.br', vapidPublic, vapidPrivate)
}

// Aviso de fôlego acabando.
//
// A "Situação dos clientes" no painel já sabe quando o conteúdo de um cliente
// está no fim — mas só quem abre a tela descobre, e quem precisa descobrir é
// quem monta o cronograma. Quando a falta aparece, já é tarde: montar pauta,
// captar e produzir leva mais que os poucos dias que sobraram.
//
// Chega UMA vez por semana, na segunda de manhã, e só com quem está apertado.
// Cliente confortável não vira notificação — é o que mantém o aviso lido.

/** Estados que merecem aviso. 'ok' fica de fora, por definição. */
const APERTADOS: Folego['estado'][] = ['curto', 'fim', 'sem-material', 'sem-data']

// Não repete a mesma cobrança toda semana pro mesmo cliente. Seis dias porque
// o cron é semanal: sete cairia exatamente na borda e às vezes puliria.
const JANELA_DIAS = 6

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET
  if (secret) {
    const auth = req.headers.get('authorization')
    if (auth !== `Bearer ${secret}`) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  const hoje = brasiliaISOFromDate(new Date())

  // `activeClientIds` e não um `.eq('status','active')` à mão: o recorte de
  // cliente desativado mora num lugar só (ver src/lib/activeClients.ts), e é o
  // que `scripts/checar-cliente-inativo.mjs` sabe reconhecer. Filtrar certo
  // por um caminho que o verificador não enxerga deixa a próxima tela passar.
  const [ativos, { data: todosClientes }, { data: equipe }, { data: gerentes }] = await Promise.all([
    activeClientIds(supabase),
    supabase.from('clients').select('id, name'),
    supabase.from('client_team').select('client_id, member_id, funcao').eq('funcao', 'estrategia'),
    supabase.from('team_members').select('id, name').eq('role', 'gerente'),
  ])
  const clientes = (todosClientes || []).filter(c => ativos.has(c.id))
  if (!clientes.length) return NextResponse.json({ skipped: 'sem cliente ativo' })

  const ids = clientes.map(c => c.id)
  const [{ data: posts }, { data: extras }] = await Promise.all([
    supabase.from('schedules').select('client_id, status, post_type, scheduled_date').in('client_id', ids),
    supabase.from('extras').select('client_id, status, type, published_at').in('client_id', ids).is('archived_at', null),
  ])

  const porCliente = new Map<string, { posts: any[]; extras: any[] }>()
  for (const c of clientes) porCliente.set(c.id, { posts: [], extras: [] })
  for (const p of posts || []) porCliente.get(p.client_id)?.posts.push(p)
  for (const e of extras || []) porCliente.get(e.client_id)?.extras.push(e)

  const apertados = clientes
    .map(c => {
      const d = porCliente.get(c.id)!
      return { cliente: c, folego: calcularFolego(d.posts, d.extras, hoje) }
    })
    .filter(x => APERTADOS.includes(x.folego.estado))
    // Pior primeiro: quem já acabou vem antes de quem tem uma semana.
    .sort((a, b) => APERTADOS.indexOf(a.folego.estado) - APERTADOS.indexOf(b.folego.estado) || a.folego.restantes - b.folego.restantes)

  if (!apertados.length) return NextResponse.json({ apertados: 0, sent: 0 })

  // Quem já foi avisado deste cliente nos últimos dias não é avisado de novo.
  const desde = new Date(Date.now() - JANELA_DIAS * 86400000).toISOString()
  const { data: jaAvisados } = await supabase.from('hub_notifications')
    .select('member_id').eq('kind', 'folego').gte('created_at', desde)
  const avisado = new Set((jaAvisados || []).map(n => n.member_id))

  // O estrategista de cada cliente. Sem estrategista definido, o gerente
  // responde — melhor alguém saber do que ninguém.
  const estrategistas = new Map<string, string[]>()
  for (const t of equipe || []) {
    if (!estrategistas.has(t.client_id)) estrategistas.set(t.client_id, [])
    estrategistas.get(t.client_id)!.push(t.member_id)
  }
  const idsGerente = (gerentes || []).map(g => g.id)

  // Um aviso por PESSOA, com os clientes dela — e não um por cliente. Cinco
  // avisos seguidos viram ruído, e a equipe já desligou notificação uma vez
  // por excesso.
  const porPessoa = new Map<string, { frases: string[] }>()
  for (const { cliente, folego } of apertados) {
    const alvos = estrategistas.get(cliente.id)?.length ? estrategistas.get(cliente.id)! : idsGerente
    for (const membro of alvos) {
      if (avisado.has(membro)) continue
      if (!porPessoa.has(membro)) porPessoa.set(membro, { frases: [] })
      porPessoa.get(membro)!.frases.push(fraseFolego(cliente.name, folego))
    }
  }

  let enviados = 0
  for (const [membro, { frases }] of porPessoa) {
    const title = frases.length === 1 ? '🫁 Conteúdo acabando' : `🫁 ${frases.length} clientes com conteúdo acabando`
    const body = frases.slice(0, 4).join(' · ') + (frases.length > 4 ? ` · e mais ${frases.length - 4}` : '')

    // UMA entrada na caixa, com todos os clientes dentro.
    //
    // A primeira versão gravava uma linha por cliente — 17 entradas repetindo
    // a mesma mensagem no sininho. É exatamente o excesso que fez a equipe
    // desligar notificação uma vez; corrigir isso vale mais que a precisão de
    // saber, semana que vem, qual cliente específico já foi avisado.
    await storeNotifications(supabase, {
      memberIds: [membro], kind: 'folego',
      title, body, url: '/dashboard',
    })

    if (vapidPublic && vapidPrivate) {
      const { data: subs } = await supabase.from('push_subscriptions')
        .select('id, endpoint, p256dh, auth').eq('member_id', membro)
      const payload = JSON.stringify({ title, body, url: '/dashboard' })
      for (const sub of subs || []) {
        try {
          await webpush.sendNotification(
            { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } }, payload)
          enviados++
        } catch (err: any) {
          if (err?.statusCode === 404 || err?.statusCode === 410) {
            await supabase.from('push_subscriptions').delete().eq('id', sub.id)
          }
        }
      }
    }
  }

  return NextResponse.json({
    apertados: apertados.length,
    avisados: porPessoa.size,
    sent: enviados,
    detalhe: apertados.map(a => `${a.cliente.name}: ${a.folego.estado}`),
  })
}
