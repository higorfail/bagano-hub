import { createClient } from './supabase'
import { withBase } from '@/lib/base'

// Mantém captação e evento do Google alinhados sem ninguém precisar lembrar.
//
// Antes havia um botão "sincronizar" por captação. Botão que precisa ser
// lembrado é botão que não é apertado: das 7 captações do hub, 5 nunca viraram
// evento — inclusive as 4 que ainda estavam por acontecer. O envio agora anda
// junto com o salvar.
//
// Regra de dono, pra não existir conflito a resolver: o hub manda no evento que
// ele criou (é quem guarda o `google_calendar_event_id`); o que nasceu no
// Google o hub mostra e não toca.

export type CaptacaoSync = {
  id: string
  client_id: string | null
  scheduled_date: string
  scheduled_time: string | null
  duration_minutes: number | null
  notes: string | null
  status: string | null
  google_calendar_event_id: string | null
}

/** HH:MM a partir do que o banco devolve ("17:00:00" numa coluna TIME). */
function hhmm(t: string | null | undefined): string | null {
  if (!t) return null
  const m = /^(\d{1,2}):(\d{2})/.exec(t.trim())
  return m ? `${m[1].padStart(2, '0')}:${m[2]}` : null
}

/** Horário de término = início + duração, no mesmo formato HH:MM. */
function fim(startTime: string, minutos: number): string {
  const [h, m] = startTime.split(':').map(Number)
  const total = h * 60 + m + minutos
  return `${String(Math.floor(total / 60) % 24).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`
}

function corpo(capt: CaptacaoSync, clientName: string, teamNames: string) {
  const hora = hhmm(capt.scheduled_time)
  return {
    summary: `📸 Captação — ${clientName || 'Cliente'}`,
    description: [capt.notes, teamNames ? `Equipe: ${teamNames}` : ''].filter(Boolean).join('\n'),
    date: capt.scheduled_date,
    startTime: hora || undefined,
    endTime: hora ? fim(hora, capt.duration_minutes || 60) : undefined,
  }
}

/**
 * Põe a captação no Google: cria se ainda não existe, atualiza se já existe.
 * Devolve o id do evento (novo ou o mesmo), ou null se não deu.
 *
 * Nunca joga exceção pra fora: a captação já está salva no banco quando isto
 * roda, e derrubar a tela por causa do calendário seria trocar um problema
 * pequeno por um grande. O que dá errado volta como null e vira aviso.
 */
export async function enviarCaptacao(
  capt: CaptacaoSync, clientName: string, teamNames: string,
): Promise<string | null> {
  const payload = corpo(capt, clientName, teamNames)
  try {
    if (capt.google_calendar_event_id) {
      const res = await fetch(withBase('/api/calendar'), {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ eventId: capt.google_calendar_event_id, ...payload }),
      })
      if (res.ok) return capt.google_calendar_event_id
      // 410 = alguém apagou o evento à mão no Google. O id guardado não vale
      // mais; recria em vez de desistir, senão a captação fica órfã pra sempre.
      if (res.status !== 410) return null
    }
    const res = await fetch(withBase('/api/calendar'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    if (!res.ok) return null
    const { eventId } = await res.json()
    return eventId || null
  } catch {
    return null
  }
}

/** Envia e já guarda o id no banco. Devolve se o Google ficou em dia. */
export async function sincronizarCaptacao(
  capt: CaptacaoSync, clientName: string, teamNames: string,
): Promise<{ ok: boolean; eventId: string | null }> {
  const eventId = await enviarCaptacao(capt, clientName, teamNames)
  if (eventId && eventId !== capt.google_calendar_event_id) {
    await createClient().from('captacoes')
      .update({ google_calendar_event_id: eventId }).eq('id', capt.id)
  }
  return { ok: !!eventId, eventId }
}

/** Tira o evento do Google. Silencioso: apagar o que já não existe é sucesso. */
export async function removerDoCalendario(
  eventId: string | null | undefined,
  qual: 'captacao' | 'criacao' = 'captacao',
) {
  if (!eventId) return
  try {
    await fetch(withBase('/api/calendar'), {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      // Apagar no calendário errado não dá erro: o Google responde 404, o hub
      // trata como sucesso (apagar o que não existe É sucesso) e o evento
      // continua lá, no outro calendário, pra sempre.
      body: JSON.stringify({ eventId, cal: qual }),
    })
  } catch { /* o evento fica; não vale travar a tela por isso */ }
}

export type EventoGoogle = {
  id: string
  /** De qual calendário veio — filmagem ou dia de criação. */
  origem?: 'captacao' | 'criacao'
  summary: string
  description: string | null
  location: string | null
  htmlLink: string | null
  date: string
  startTime: string | null
  endTime: string | null
  allDay: boolean
}

/**
 * Lê os eventos do Google num intervalo.
 *
 * `ignorar` são os ids que o hub já mostra por conta própria — sem isso a
 * captação criada aqui apareceria duas vezes na mesma tela, uma como captação
 * e outra como evento do Google.
 */
export async function eventosDoGoogle(
  start: string, end: string, ignorar: Set<string> = new Set(),
  qual: 'captacao' | 'criacao' = 'captacao',
): Promise<EventoGoogle[]> {
  try {
    const res = await fetch(withBase(`/api/calendar?start=${start}&end=${end}&cal=${qual}`))
    if (!res.ok) return []
    const { events } = await res.json()
    // `origem` viaja junto com o evento: depois de misturar as duas listas, o
    // id não diz mais de qual calendário veio, e quem desenha precisa saber
    // separar filmagem de dia de criação.
    return (events as EventoGoogle[])
      .filter(e => !ignorar.has(e.id))
      .map(e => ({ ...e, origem: qual }))
  } catch {
    return []
  }
}

/** Os dois calendários de uma vez, cada evento sabendo de onde veio. */
export async function todosEventosDoGoogle(
  start: string, end: string, ignorar: Set<string> = new Set(),
): Promise<EventoGoogle[]> {
  const [cap, cri] = await Promise.all([
    eventosDoGoogle(start, end, ignorar, 'captacao'),
    eventosDoGoogle(start, end, ignorar, 'criacao'),
  ])
  return [...cap, ...cri]
}


// ── Agenda de criação ────────────────────────────────────────────────────

export type CriacaoSync = {
  id: string
  client_id: string
  /** Data já resolvida (week_start + day_of_week), no formato YYYY-MM-DD. */
  date: string
  notes: string | null
  google_calendar_event_id?: string | null
}

/**
 * Manda um dia de criação pro Google.
 *
 * Vai como dia inteiro de propósito: a agenda de criação diz "quarta é dia do
 * Donna", não "quarta às 14h". Inventar um horário pra caber na faixa horária
 * seria escrever no calendário de todo mundo uma informação que não existe.
 */
export async function sincronizarCriacao(
  entry: CriacaoSync, clientName: string, teamNames: string,
): Promise<{ ok: boolean; eventId: string | null }> {
  const payload = {
    summary: `✏️ Criação — ${clientName || 'Cliente'}`,
    description: [entry.notes, teamNames ? `Equipe: ${teamNames}` : ''].filter(Boolean).join('\n'),
    date: entry.date,
    // Calendário próprio: captação é a filmagem no cliente, criação é o dia em
    // que designer e editor sentam pra fazer. Compartilhar o mesmo calendário
    // deixava só o título separando os dois — e foi assim que criação voltou do
    // Google virada em captação.
    cal: 'criacao' as const,
  }

  let eventId: string | null = null
  try {
    if (entry.google_calendar_event_id) {
      const res = await fetch(withBase('/api/calendar'), {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ eventId: entry.google_calendar_event_id, ...payload }),
      })
      if (res.ok) eventId = entry.google_calendar_event_id
      else if (res.status !== 410) return { ok: false, eventId: null }
    }
    if (!eventId) {
      const res = await fetch(withBase('/api/calendar'), {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (!res.ok) return { ok: false, eventId: null }
      eventId = (await res.json()).eventId || null
    }
  } catch {
    return { ok: false, eventId: null }
  }

  if (eventId && eventId !== entry.google_calendar_event_id) {
    // Tolerante à coluna ainda não existir: o ALTER TABLE é um passo manual no
    // Supabase, e um erro aqui não pode derrubar a tela — o evento JÁ está no
    // Google, e perder o id só significa que a próxima edição cria outro.
    const { error } = await createClient().from('agenda_criacao')
      .update({ google_calendar_event_id: eventId }).eq('id', entry.id)
    if (error) console.warn('agenda_criacao sem google_calendar_event_id ainda:', error.message)
  }
  return { ok: true, eventId }
}

/** Data real de uma linha da agenda de criação (guardada por semana + dia). */
export function dataDaCriacao(weekStart: string, dayOfWeek: number): string {
  const d = new Date(weekStart + 'T12:00:00')
  d.setDate(d.getDate() + (dayOfWeek - 1))
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
