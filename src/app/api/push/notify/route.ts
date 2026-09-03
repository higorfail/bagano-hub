import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import webpush from 'web-push'
import { quemAvisar } from '@/lib/quemAvisar'

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
  // Captação e agenda de criação não são cards: não há o que abrir por id, o
  // destino é a própria Agenda, onde a semana inteira está.
  captacoes:      () => '/dashboard/agenda',
  agenda_criacao: () => '/dashboard/agenda',
}

// ─── O que interrompe vs. o que só fica registrado ───────────────────────────
//
// Tudo continua sendo GRAVADO na caixa de entrada e no histórico do card. O
// que muda aqui é o que vibra o telefone.
//
// A ação `updated` é um balaio: cobre desde "colou um link" até "mudou a data
// de publicação". Notificando tudo, a caixa recebia 900+ avisos em 3 dias e
// virava ruído — três pushes em três segundos por colar três links num card.
// No volume errado, a notificação que importa some junto com o resto.
//
// Lista de PERMISSÃO, não de proibição: evento novo nasce silencioso. Quem
// está consertando excesso não quer que o próximo tipo entre gritando.
const PUSH_WORTHY_UPDATE = [
  /adicionou .+ (ao|à) /i,                       // te puseram num card
  /removeu .+ (do|da) /i,                        // te tiraram de um card
  /(definiu|mudou|atualizou) (a data|o prazo|a hora|o horário)/i,
  /mudou a data/i,
  /entregou o conteúdo/i,                        // marco de produção
  /atribuiu essa tarefa/i,
]

// Etiqueta é caso à parte: no fluxo da Bagano ela É a tarefa ("CRIAR
// LEGENDA"), então vale interromper — mas só quem está marcado no card, não
// todos os observadores.
const LABEL_UPDATE = /etiqueta/i

// Identidade do card na notificação: título, que tipo é e o número do post.
// É o que permite a lista mostrar "#11 · Reels · Feijoada" em vez de só um
// título solto — o tipo diz o trabalho que é, e o número é como o time se
// refere ao post na conversa do dia a dia.
type CardMeta = { title: string | null; type: string | null; number: number | null }

async function resolveCardMeta(tableName: string, recordId: string): Promise<CardMeta> {
  const empty: CardMeta = { title: null, type: null, number: null }
  if (tableName === 'schedules') {
    const { data } = await supabase.from('schedules').select('title, post_type, post_number').eq('id', recordId).maybeSingle()
    return { title: data?.title || null, type: data?.post_type || null, number: data?.post_number ?? null }
  }
  if (tableName === 'extras') {
    const { data } = await supabase.from('extras').select('title, type').eq('id', recordId).maybeSingle()
    return { title: data?.title || null, type: data?.type || 'extra', number: null }
  }
  if (tableName === 'materials') {
    const { data } = await supabase.from('materials').select('title').eq('id', recordId).maybeSingle()
    return { title: data?.title || null, type: 'material', number: null }
  }
  if (tableName === 'personal_tasks') {
    const { data } = await supabase.from('personal_tasks').select('title, type').eq('id', recordId).maybeSingle()
    return { title: data?.title || null, type: data?.type || 'tarefa', number: null }
  }
  // Cronograma finalizado não é um card e não tem título — sem isto a lista
  // mostrava "Card" genérico acima de "finalizou o cronograma de Julho".
  if (tableName === 'cronograma_status') return { title: 'Cronograma do mês', type: 'cronograma', number: null }
  // Captação e criação se identificam pelo CLIENTE, não por um título próprio —
  // é assim que a equipe fala delas ("a captação do Zebuino"), e é a única
  // coisa que a tabela tem de identidade.
  if (tableName === 'captacoes' || tableName === 'agenda_criacao') {
    const { data } = await supabase.from(tableName).select('client_id').eq('id', recordId).maybeSingle()
    let nome: string | null = null
    if (data?.client_id) {
      const { data: c } = await supabase.from('clients').select('name').eq('id', data.client_id).maybeSingle()
      nome = c?.name || null
    }
    const rotulo = tableName === 'captacoes' ? 'Captação' : 'Criação'
    return { title: nome ? `${rotulo} — ${nome}` : rotulo, type: rotulo.toLowerCase(), number: null }
  }
  return empty
}

// Dispara push pros watchers de um card (schedules/materials/extras), sempre que
// logActivity registra algo — ver src/lib/activity.ts. Roda como role anon (sem
// sessão de usuário), então push_subscriptions/card_watchers precisam de GRANT
// pro anon (ver push_subscriptions_setup.sql).
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null)
  if (!body?.tableName || !body?.recordId) return NextResponse.json({ skipped: 'invalid body' })

  const { tableName, recordId, clientId, actorId, actorName, description, skipPush, action, field } = body
  const buildUrl = URL_BY_TABLE[tableName]
  if (!buildUrl) return NextResponse.json({ skipped: 'unsupported table' })

  // A checagem de VAPID desceu pra depois de gravar a notificação: antes ela
  // saía aqui em cima e, sem as chaves configuradas, NADA era registrado — o
  // sininho ficava vazio junto com o push.
  const canPush = !!(vapidPublic && vapidPrivate) && !skipPush

  // ── Quem precisa saber ────────────────────────────────────────────────
  //
  // Antes: TODOS os observadores do card, em qualquer mudança. Resultado
  // medido em 4 dias: Yasmim 61 avisos/dia, Franz 50, Higor 49, Gabi 44 — e a
  // equipe desligando o push, que é a reação sã e faz o hub perder junto os
  // avisos que importam.
  //
  // Agora a regra é uma só, em src/lib/quemAvisar.ts: avisa quem RECEBE a
  // bola. Fica num arquivo à parte porque é regra de negócio, não de
  // transporte — e porque assim dá pra testar sem subir servidor.
  const [{ data: watchers }, { data: equipe }] = await Promise.all([
    supabase.from('card_watchers')
      .select('member_id').eq('table_name', tableName).eq('record_id', recordId),
    clientId
      ? supabase.from('client_team').select('member_id, funcao').eq('client_id', clientId)
      : Promise.resolve({ data: [] as { member_id: string; funcao: string }[] }),
  ])

  // Status e mês/ano do card. O status é o que decide o destinatário; o
  // mês/ano faz o link abrir no cronograma certo (o Cronograma filtra por
  // essas colunas, diferentes de scheduled_date — sem elas o deep-link abria
  // o cliente certo no mês atual, sem o post).
  let sched: { month?: number; year?: number; status?: string } | null = null
  let atribuidos: string[] = []
  if (tableName === 'schedules') {
    const { data } = await supabase.from('schedules')
      .select('month, year, status, assigned_members').eq('id', recordId).maybeSingle()
    sched = data
    atribuidos = (data as any)?.assigned_members || []
  } else if (tableName === 'extras' || tableName === 'materials') {
    const { data } = await supabase.from(tableName)
      .select('status, assigned_members').eq('id', recordId).maybeSingle()
    sched = data ? { status: (data as any).status } : null
    atribuidos = (data as any)?.assigned_members || []
  }

  const decisao = quemAvisar({
    tabela: tableName,
    action,
    field,
    statusNovo: sched?.status,
    atribuidos,
    observadores: [...new Set((watchers || []).map((w: any) => w.member_id))],
    equipeDoCliente: (equipe || []) as { member_id: string; funcao: string }[],
    atorId: actorId,
  })

  // Quem fez não é avisado do que fez.
  const memberIds = [...new Set(decisao.ids)].filter(id => id && id !== actorId)

  if (memberIds.length === 0) return NextResponse.json({ sent: 0, motivo: decisao.motivo })

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
  // Card apagado: o histórico FICA (deletar não desfaz o que aconteceu), mas
  // as notificações dele passam a dizer isso. Sem essa marca elas continuavam
  // parecendo abríveis e o clique largava a pessoa no cronograma vazio.
  if (action === 'deleted') {
    await supabase.from('hub_notifications')
      .update({ card_deleted: true })
      .eq('card_table', tableName)
      .eq('card_id', recordId)
  }

  const card = await resolveCardMeta(tableName, recordId)
  const base = memberIds.map(memberId => ({
    member_id: memberId,
    card_table: tableName,
    card_id: recordId,
    client_id: clientId || null,
    kind: action || 'activity',
    actor_name: actorName || null,
    actor_id: actorId || null,
    title: card.title,
    body: description || 'Atualização num card que você acompanha',
    url,
  }))
  const extras = { card_type: card.type, card_number: card.number, card_deleted: action === 'deleted' }

  // O erro do insert era DESCARTADO, e isso custou caro: quando adicionei
  // card_type/card_number/card_deleted, uma coluna ainda não criada no banco
  // fazia o insert inteiro ser recusado — em silêncio. O push saía logo
  // depois, então a notificação chegava no telefone e não ficava salva em
  // lugar nenhum, sem nada no log dizendo por quê.
  //
  // Agora: tenta com os campos completos e, se falhar, grava sem os opcionais.
  // Notificação perdida é pior que notificação sem o selo de tipo.
  let { error: insErr } = await supabase.from('hub_notifications').insert(base.map(b => ({ ...b, ...extras })))
  if (insErr) {
    console.error('push/notify: insert completo falhou, tentando sem campos opcionais', insErr)
    const retry = await supabase.from('hub_notifications').insert(base)
    if (retry.error) console.error('push/notify: NÃO consegui gravar a notificação', retry.error)
  }

  // Daqui pra baixo decide-se só QUEM VIBRA. A gravação acima já aconteceu
  // pra todo mundo — ninguém perde histórico por causa deste filtro.
  let pushTargets = memberIds
  if (action === 'updated') {
    const desc = description || ''
    if (LABEL_UPDATE.test(desc)) {
      // Etiqueta interrompe só quem está marcado no card: é uma tarefa
      // atribuída, não um recado pra toda a lista de observadores.
      const { data: card } = await supabase.from(tableName).select('assigned_members').eq('id', recordId).maybeSingle()
      const assigned: string[] = Array.isArray((card as any)?.assigned_members) ? (card as any).assigned_members : []
      pushTargets = memberIds.filter(id => assigned.includes(id))
    } else if (!PUSH_WORTHY_UPDATE.some(re => re.test(desc))) {
      pushTargets = []
    }
  }

  if (!canPush || pushTargets.length === 0) return NextResponse.json({ sent: 0, stored: memberIds.length })

  const { data: subs } = await supabase.from('push_subscriptions')
    .select('id, member_id, endpoint, p256dh, auth').in('member_id', pushTargets)
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
