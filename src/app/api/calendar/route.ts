import { google } from 'googleapis'
import { NextRequest, NextResponse } from 'next/server'

function getAuth() {
  const key = process.env.GOOGLE_SERVICE_ACCOUNT_KEY
  const calendarId = process.env.GOOGLE_CALENDAR_ID
  if (!key || !calendarId) return null
  try {
    const credentials = JSON.parse(key)
    const auth = new google.auth.GoogleAuth({
      credentials,
      scopes: ['https://www.googleapis.com/auth/calendar'],
    })
    return { auth, calendarId }
  } catch {
    return null
  }
}

export async function POST(req: NextRequest) {
  const ctx = getAuth()
  if (!ctx) {
    return NextResponse.json({ error: 'Google Calendar não configurado' }, { status: 503 })
  }

  const body = await req.json()
  const { summary, description, date, startTime, endTime, location } = body

  try {
    const calendar = google.calendar({ version: 'v3', auth: ctx.auth })

    const hasTime = startTime && endTime
    const start = hasTime
      ? { dateTime: `${date}T${startTime}:00`, timeZone: 'America/Sao_Paulo' }
      : { date }
    const end = hasTime
      ? { dateTime: `${date}T${endTime}:00`, timeZone: 'America/Sao_Paulo' }
      : { date }

    const event = await calendar.events.insert({
      calendarId: ctx.calendarId,
      requestBody: { summary, description: description || '', start, end, location: location || '' },
    })

    return NextResponse.json({ eventId: event.data.id })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest) {
  const ctx = getAuth()
  if (!ctx) {
    return NextResponse.json({ error: 'Google Calendar não configurado' }, { status: 503 })
  }

  const { eventId } = await req.json()
  if (!eventId) return NextResponse.json({ error: 'eventId obrigatório' }, { status: 400 })

  try {
    const calendar = google.calendar({ version: 'v3', auth: ctx.auth })
    await calendar.events.delete({ calendarId: ctx.calendarId, eventId })
    return NextResponse.json({ ok: true })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
