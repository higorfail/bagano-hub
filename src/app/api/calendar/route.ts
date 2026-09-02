import { google } from 'googleapis'
import { NextRequest, NextResponse } from 'next/server'
import { usuarioLogado } from '@/lib/apiAuth'

// Ponte com o Google Calendar da Bagano (calendário "Captação").
//
// A ligação era de mão única — o hub escrevia e nunca lia. Medido antes de
// mexer: das 7 captações do hub só 2 tinham virado evento, e dos 8 eventos do
// Google só 1 tinha saído do hub. As duas agendas viviam separadas, porque a
// equipe cria o evento direto no Google e o hub não enxergava nada disso.
//
// Agora vai nos dois sentidos, com uma regra de dono pra não precisar de
// resolução de conflito: quem criou o evento manda nele. Evento nascido no hub
// tem `google_calendar_event_id` guardado e é o hub que o mantém; evento
// nascido no Google o hub mostra e não toca.
// Dois calendários, porque são dois compromissos diferentes: captação é a
// filmagem no cliente, criação é o dia em que designer e editor sentam pra
// fazer. Ficavam no mesmo lugar e só o título separava — o que já custou um
// laço, com criação voltando do Google virada em captação.
//
// Sem o de criação configurado, tudo cai no de captação (o comportamento de
// antes). Assim nada quebra enquanto a variável não estiver na Vercel.
export type QualCalendario = 'captacao' | 'criacao'

function idDoCalendario(qual: QualCalendario): string | undefined {
  if (qual === 'criacao') {
    return process.env.GOOGLE_CALENDAR_CRIACAO_ID || process.env.GOOGLE_CALENDAR_ID
  }
  return process.env.GOOGLE_CALENDAR_ID
}

function getAuth(qual: QualCalendario = 'captacao') {
  const key = process.env.GOOGLE_SERVICE_ACCOUNT_KEY
  const calendarId = idDoCalendario(qual)
  if (!key || !calendarId) return null
  try {
    const credentials = JSON.parse(key)
    const auth = new google.auth.GoogleAuth({
      credentials,
      scopes: ['https://www.googleapis.com/auth/calendar'],
    })
    return { calendar: google.calendar({ version: 'v3', auth }), calendarId }
  } catch {
    return null
  }
}

const TZ = 'America/Sao_Paulo'

/** HH:MM como está escrito no dateTime do Google, sem conversão de fuso. */
function horaLocal(dateTime: string | null | undefined): string | null {
  return dateTime ? dateTime.slice(11, 16) : null
}
const NAO_CONFIGURADO = { error: 'Google Calendar não configurado' }

/**
 * HH:MM, sempre.
 *
 * O banco guarda `scheduled_time` como TIME e devolve "17:00:00" — com os
 * segundos. Concatenar `:00` nisso produzia "2026-08-26T17:00:00:00", que o
 * Google recusa com 400. Era por isso que TODA captação com horário falhava em
 * silêncio: das 8 no banco, as únicas duas que tinham evento no Google eram
 * justamente as duas SEM hora marcada.
 *
 * O recorte mora aqui, no ponto por onde POST e PATCH passam, em vez de em cada
 * quem chama — foi um chamador confiar no formato do banco que criou o problema.
 */
function hhmm(t?: string | null): string | null {
  if (!t) return null
  const m = /^(\d{1,2}):(\d{2})/.exec(t.trim())
  return m ? `${m[1].padStart(2, '0')}:${m[2]}` : null
}

/** Monta start/end no formato do Google: com hora quando há hora, dia inteiro quando não há. */
function periodo(date: string, startTime?: string, endTime?: string) {
  const ini = hhmm(startTime)
  const fim = hhmm(endTime)
  return ini && fim
    ? {
        start: { dateTime: `${date}T${ini}:00`, timeZone: TZ },
        end:   { dateTime: `${date}T${fim}:00`, timeZone: TZ },
      }
    : { start: { date }, end: { date } }
}

/** Devolve o acesso ao calendário, ou a resposta de recusa pronta pra retornar. */
async function comAcesso(qual: QualCalendario = 'captacao'): Promise<NonNullable<ReturnType<typeof getAuth>> | NextResponse> {
  if (!(await usuarioLogado())) {
    return NextResponse.json({ error: 'não autorizado' }, { status: 401 })
  }
  return getAuth(qual) ?? NextResponse.json(NAO_CONFIGURADO, { status: 503 })
}

/** Qual calendário a chamada quer. Ausente = captação, como sempre foi. */
function qualDaQuery(p: URLSearchParams): QualCalendario {
  return p.get('cal') === 'criacao' ? 'criacao' : 'captacao'
}

/**
 * Lê os eventos de um intervalo. É o lado que faltava.
 *
 * Serve também de teste de configuração: a Agenda perguntava se o calendário
 * estava ligado mandando um POST vazio, que virava uma tentativa de criar
 * evento sem título nem data — uma escrita fadada a falhar a cada abertura da
 * tela. Perguntar lendo custa o mesmo e não escreve nada.
 */
export async function GET(req: NextRequest) {
  const acesso = await comAcesso(qualDaQuery(req.nextUrl.searchParams))
  if (acesso instanceof NextResponse) return acesso
  const { calendar, calendarId } = acesso

  const p = req.nextUrl.searchParams
  const start = p.get('start')
  const end   = p.get('end')
  if (!start || !end) return NextResponse.json({ error: 'start e end obrigatórios' }, { status: 400 })

  try {
    const { data } = await calendar.events.list({
      calendarId,
      timeMin: new Date(`${start}T00:00:00-03:00`).toISOString(),
      timeMax: new Date(`${end}T23:59:59-03:00`).toISOString(),
      // `singleEvents` expande a recorrência: sem isso um evento semanal volta
      // como uma linha só e some do calendário em todas as semanas menos uma.
      singleEvents: true,
      orderBy: 'startTime',
      maxResults: 250,
    })
    const events = (data.items || []).map(e => ({
      id: e.id,
      summary: e.summary || '(sem título)',
      description: e.description || null,
      location: e.location || null,
      htmlLink: e.htmlLink || null,
      // Dia inteiro vem em `date`; com hora vem em `dateTime`. Quem consome
      // precisa distinguir os dois pra não inventar 00:00 como horário real.
      date: e.start?.date || (e.start?.dateTime || '').slice(0, 10),
      // A hora sai da PRÓPRIA string, não de `new Date(...)`.
      //
      // O Google devolve "2026-08-26T15:00:00-03:00": a hora local do evento já
      // está escrita ali. Passar isso por `new Date().toTimeString()` converte
      // pro fuso de QUEM ESTÁ RODANDO — e quem roda é a Vercel, em UTC. Toda
      // captação aparecia 3 horas adiantada em produção: 15:00 virava 18:00.
      // Na minha máquina (UTC-3) o erro não aparecia, que é o que torna este
      // tipo de bug traiçoeiro.
      startTime: horaLocal(e.start?.dateTime),
      endTime:   horaLocal(e.end?.dateTime),
      allDay: !!e.start?.date,
    }))
    return NextResponse.json({ events })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  const body = await req.json()
  const acesso = await comAcesso(body?.cal === 'criacao' ? 'criacao' : 'captacao')
  if (acesso instanceof NextResponse) return acesso
  const { calendar, calendarId } = acesso

  const { summary, description, date, startTime, endTime, location } = body
  if (!date) return NextResponse.json({ error: 'date obrigatório' }, { status: 400 })

  try {
    const event = await calendar.events.insert({
      calendarId,
      requestBody: {
        summary, description: description || '', location: location || '',
        ...periodo(date, startTime, endTime),
      },
    })
    return NextResponse.json({ eventId: event.data.id })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

/**
 * Atualiza um evento que o hub criou.
 *
 * Sem isto, mudar a data de uma captação já enviada deixava o Google com a
 * data velha pra sempre — e ninguém percebe um evento que ficou parado no dia
 * errado. Só era possível criar e apagar.
 */
export async function PATCH(req: NextRequest) {
  const body = await req.json()
  const acesso = await comAcesso(body?.cal === 'criacao' ? 'criacao' : 'captacao')
  if (acesso instanceof NextResponse) return acesso
  const { calendar, calendarId } = acesso

  const { eventId, summary, description, date, startTime, endTime, location } = body
  if (!eventId) return NextResponse.json({ error: 'eventId obrigatório' }, { status: 400 })
  if (!date)    return NextResponse.json({ error: 'date obrigatório' },    { status: 400 })

  try {
    const { data } = await calendar.events.patch({
      calendarId,
      eventId,
      requestBody: {
        summary, description: description || '', location: location || '',
        ...periodo(date, startTime, endTime),
      },
    })
    // Apagado à mão no Google não some: vira `cancelled`, e o patch CONTINUA
    // funcionando nele — medido contra a API de verdade. Sem esta checagem o
    // hub gravaria as alterações num evento invisível e daria tudo por certo,
    // enquanto a captação seguia fora do calendário da equipe.
    if (data.status === 'cancelled') {
      return NextResponse.json({ error: 'evento foi apagado no Google', gone: true }, { status: 410 })
    }
    return NextResponse.json({ ok: true })
  } catch (err: any) {
    // Id que o Google já não reconhece — mesmo desfecho: quem chamou recria.
    if (err.code === 404 || err.code === 410) {
      return NextResponse.json({ error: 'evento não existe mais', gone: true }, { status: 410 })
    }
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest) {
  const body = await req.json()
  const acesso = await comAcesso(body?.cal === 'criacao' ? 'criacao' : 'captacao')
  if (acesso instanceof NextResponse) return acesso
  const { calendar, calendarId } = acesso

  const { eventId } = body
  if (!eventId) return NextResponse.json({ error: 'eventId obrigatório' }, { status: 400 })

  try {
    await calendar.events.delete({ calendarId, eventId })
    return NextResponse.json({ ok: true })
  } catch (err: any) {
    // Já não existe = o objetivo está cumprido. Tratar como erro faria a tela
    // reclamar de um apagamento que deu certo.
    if (err.code === 404 || err.code === 410) return NextResponse.json({ ok: true })
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
