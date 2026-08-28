import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { google } from 'googleapis'
import { decidir, linhaNova, type EventoBruto } from '@/lib/importarCaptacoes'
import { fromActiveClients } from '@/lib/activeClients'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

// Traz pro hub as captações marcadas direto no Google Agenda.
//
// A equipe marca lá — medido antes de existir isto: ~55 captações no Google
// contra 7 no hub. O Calendário do hub já MOSTRAVA esses eventos, mas mostrar
// não é saber: nada no hub conseguia contar quantas captações um cliente teve,
// nem avisar ninguém sobre elas.
//
// A janela começa HOJE de propósito. Puxar o passado inteiro encheria a agenda
// de compromissos que já aconteceram, e a decisão de importar histórico é de
// quem toca a agência, não deste cron. Consequência assumida: evento criado no
// Google para uma data que JÁ PASSOU não entra.
const DIAS_A_FRENTE = 120

/** HH:MM como está escrito no dateTime do Google — sem conversão de fuso.
 *  Este cron roda na Vercel, em UTC: converter adiantaria tudo em 3 horas. */
const horaLocal = (dt: string | null | undefined) => (dt ? dt.slice(11, 16) : null)

function calendario() {
  const key = process.env.GOOGLE_SERVICE_ACCOUNT_KEY
  const calendarId = process.env.GOOGLE_CALENDAR_ID
  if (!key || !calendarId) return null
  try {
    const auth = new google.auth.GoogleAuth({
      credentials: JSON.parse(key),
      scopes: ['https://www.googleapis.com/auth/calendar'],
    })
    return { cal: google.calendar({ version: 'v3', auth }), calendarId }
  } catch {
    return null
  }
}

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET
  if (secret) {
    const auth = req.headers.get('authorization')
    if (auth !== `Bearer ${secret}`) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  const ctx = calendario()
  if (!ctx) return NextResponse.json({ skipped: 'Google Calendar não configurado' })

  // `dry=1` mostra o que faria sem gravar nada. Importar em cima de dado de
  // produção sem poder olhar antes é como esta rota NÃO deve ser usada.
  const dry = req.nextUrl.searchParams.get('dry') === '1'

  const hoje = new Date()
  const hojeISO = new Intl.DateTimeFormat('sv-SE', { timeZone: 'America/Sao_Paulo' }).format(hoje)
  const fim = new Date(hoje.getTime() + DIAS_A_FRENTE * 86400000)

  try {
    const [{ data: eventos }, { data: clientes }, { data: captacoes }, { data: membros }] = await Promise.all([
      ctx.cal.events.list({
        calendarId: ctx.calendarId,
        timeMin: new Date(`${hojeISO}T00:00:00-03:00`).toISOString(),
        timeMax: fim.toISOString(),
        singleEvents: true,
        orderBy: 'startTime',
        maxResults: 250,
      }),
      supabase.from('clients').select('id, name').eq('status', 'active'),
      supabase.from('captacoes').select('id, client_id, team_member_ids, google_calendar_event_id, scheduled_date, scheduled_time, status'),
      supabase.from('team_members').select('id, name, email'),
    ] as const)

    const brutos: EventoBruto[] = (eventos.items || []).map(e => ({
      id: e.id || '',
      summary: (e.summary || '').trim(),
      date: e.start?.date || (e.start?.dateTime || '').slice(0, 10),
      startTime: horaLocal(e.start?.dateTime),
      endTime: horaLocal(e.end?.dateTime),
      allDay: !!e.start?.date,
      cancelado: e.status === 'cancelled',
      // Quem vai. A conta de serviço não pode CONVIDAR (403), mas LER a lista
      // de convidados ela pode — e é ali que a equipe já registra quem vai na
      // captação, sem precisar mudar de hábito.
      emails: (e.attendees || []).map(a => a.email || '').filter(Boolean),
    })).filter(e => e.id && e.date)

    // Só clientes ativos entram na conta — tanto no reconhecimento (já é assim,
    // `clientes` vem filtrado) quanto na busca por captação órfã. Manter as de
    // cliente desativado aqui não daria erro, mas deixaria o cron passando por
    // dado que o resto do hub já esconde, e é assim que a regra volta a se
    // perder.
    const ativos = new Set((clientes || []).map(c => c.id))
    const decisoes = decidir(brutos, clientes || [], fromActiveClients(captacoes, ativos), membros || [])
    const criar = decisoes.filter(d => d.acao === 'criar') as Extract<typeof decisoes[number], { acao: 'criar' }>[]
    const atualizar = decisoes.filter(d => d.acao === 'atualizar') as Extract<typeof decisoes[number], { acao: 'atualizar' }>[]
    const cancelar = decisoes.filter(d => d.acao === 'cancelar') as Extract<typeof decisoes[number], { acao: 'cancelar' }>[]
    const vincular = decisoes.filter(d => d.acao === 'vincular') as Extract<typeof decisoes[number], { acao: 'vincular' }>[]
    const equipe = decisoes.filter(d => d.acao === 'equipe') as Extract<typeof decisoes[number], { acao: 'equipe' }>[]

    const resumo = {
      janela: `${hojeISO} → ${DIAS_A_FRENTE} dias`,
      eventos: brutos.length,
      criar: criar.map(d => ({ cliente: d.clientName, quando: `${d.evento.date} ${d.evento.startTime || 'dia inteiro'}`, titulo: d.evento.summary })),
      atualizar: atualizar.map(d => ({ de: d.de, para: d.para, titulo: d.evento.summary })),
      vincular: vincular.map(d => ({ cliente: d.clientName, quando: d.evento.date, titulo: d.evento.summary })),
      equipe: equipe.map(d => ({ quem: d.nomes.join(', '), titulo: d.evento.summary })),
      cancelar: cancelar.length,
      ignorados: decisoes.filter(d => d.acao === 'ignorar').length,
    }

    if (dry) return NextResponse.json({ dry: true, ...resumo })

    if (criar.length) {
      const { error } = await supabase.from('captacoes').insert(criar.map(d => linhaNova(d, hojeISO, membros || [])))
      if (error) return NextResponse.json({ error: error.message, ...resumo }, { status: 500 })
    }
    // Adota a captação órfã em vez de criar outra igual.
    for (const d of vincular) {
      await supabase.from('captacoes')
        .update({ google_calendar_event_id: d.evento.id }).eq('id', d.captacaoId)
    }
    // Preenche quem vai, nas que estavam sem ninguém marcado.
    for (const d of equipe) {
      await supabase.from('captacoes')
        .update({ team_member_ids: d.memberIds }).eq('id', d.captacaoId)
    }
    // A data é do Google — aqui só se acompanha o que ele decidiu. O hub nem
    // deixa editar data de captação, então não há o que ser sobrescrito.
    for (const d of atualizar) {
      await supabase.from('captacoes').update({
        scheduled_date: d.evento.date,
        scheduled_time: d.evento.allDay ? null : d.evento.startTime,
      }).eq('id', d.captacaoId)
    }
    // Apagado no Google vira cancelada, não sumida: preserva o histórico e o
    // que alguém já tenha anotado no card.
    for (const d of cancelar) {
      await supabase.from('captacoes').update({ status: 'cancelada' }).eq('id', d.captacaoId)
    }

    return NextResponse.json({ ok: true, ...resumo })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
