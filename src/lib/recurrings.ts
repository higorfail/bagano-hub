// Recorrentes: conteúdo que se repete na rotina do cliente (story de "aberto
// hoje", post do almoço executivo). Diferente de post/extra, ele não é uma
// ocorrência descartável que anda pelo fluxo de aprovação — é um MOLDE fixo que
// gera uma marcação por dia. Por isso não tem status nem coluna: tem "feito
// hoje" ou não.

export type RecurringType = 'story' | 'post'
export type RecurrenceMode = 'daily' | 'weekdays' | 'monthdays' | 'dates'

export type Recurring = {
  id: string
  client_id: string
  title: string
  type: RecurringType
  notes: string | null
  drive_folder_url: string | null
  caption: string | null
  recurrence_mode: RecurrenceMode
  weekdays: number[] | null
  month_days: number[] | null
  specific_dates: string[] | null
  /** Horários do dia, 'HH:MM'. Vazio = um único compromisso sem hora marcada. */
  times: string[] | null
  active: boolean
  position: number | null
  created_at: string
}

/** Uma marcação de "postei". Uma linha por (recorrente, dia, horário). */
export type RecurringLog = {
  id: string
  recurring_id: string
  done_date: string
  /** 'HH:MM' — ou '' quando o recorrente não tem horário. Nunca NULL: em
   *  Postgres, NULL não colide com NULL num UNIQUE, e o dia poderia ser
   *  marcado como feito várias vezes. */
  slot: string
  drive_file_id: string | null
  done_by: string | null
  created_at: string
}

/** A legenda de UMA arte da pasta. Mora no hub, amarrada ao id do arquivo do
 *  Drive — o Drive não guarda esse texto pra gente. */
export type RecurringVariant = {
  id: string
  recurring_id: string
  drive_file_id: string
  caption: string | null
}

export const TYPE_LABEL: Record<RecurringType, string> = {
  story: 'Story',
  post:  'Post',
}

export const WEEKDAY_LETTER = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S']
export const WEEKDAY_SHORT  = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb']

// ── Datas ────────────────────────────────────────────────────────────────────
// Tudo em data LOCAL. `toISOString()` converte pra UTC, e no Brasil (UTC-3) isso
// vira o dia seguinte a partir das 21h — a lista de "hoje" trocaria sozinha no
// fim da tarde, ainda em pleno horário de trabalho.

export function isoOf(d: Date): string {
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${mm}-${dd}`
}

export function todayISO(): string {
  return isoOf(new Date())
}

/** Meio-dia, não meia-noite: imune a fuso e horário de verão empurrando o dia. */
export function parseISO(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, m - 1, d, 12, 0, 0)
}

export function shiftISO(iso: string, days: number): string {
  const d = parseISO(iso)
  d.setDate(d.getDate() + days)
  return isoOf(d)
}

export function humanDate(iso: string): string {
  const today = todayISO()
  if (iso === today) return 'Hoje'
  if (iso === shiftISO(today, 1)) return 'Amanhã'
  if (iso === shiftISO(today, -1)) return 'Ontem'
  const d = parseISO(iso)
  return `${WEEKDAY_SHORT[d.getDay()]}, ${d.getDate()} ${['jan','fev','mar','abr','mai','jun','jul','ago','set','out','nov','dez'][d.getMonth()]}`
}

// ── Recorrência ──────────────────────────────────────────────────────────────

export function occursOn(rec: Recurring, iso: string): boolean {
  const d = parseISO(iso)
  switch (rec.recurrence_mode) {
    case 'daily':     return true
    case 'weekdays':  return (rec.weekdays || []).includes(d.getDay())
    case 'monthdays': return (rec.month_days || []).includes(d.getDate())
    case 'dates':     return (rec.specific_dates || []).includes(iso)
    default:          return false
  }
}

/** Os compromissos do dia. Um recorrente com 2 horários vira 2 linhas na tela —
 *  story do almoço e story do jantar são trabalhos separados, e marcar um não
 *  pode dar o outro por feito. */
export function slotsFor(rec: Recurring, iso: string): string[] {
  if (!occursOn(rec, iso)) return []
  const times = (rec.times || []).filter(Boolean)
  return times.length ? [...times].sort() : ['']
}

export function recurrenceLabel(rec: Recurring): string {
  switch (rec.recurrence_mode) {
    case 'daily':
      return 'Todo dia'
    case 'weekdays': {
      const ds = [...(rec.weekdays || [])].sort()
      if (!ds.length) return 'Nenhum dia'
      if (ds.length === 7) return 'Todo dia'
      if (ds.join() === '1,2,3,4,5') return 'Seg a sex'
      if (ds.join() === '0,6') return 'Fim de semana'
      return ds.map(d => WEEKDAY_SHORT[d]).join(', ')
    }
    case 'monthdays': {
      const ds = [...(rec.month_days || [])].sort((a, b) => a - b)
      if (!ds.length) return 'Nenhum dia'
      return `Dia ${ds.join(', ')} do mês`
    }
    case 'dates': {
      const ds = (rec.specific_dates || []).filter(iso => iso >= todayISO()).sort()
      if (!ds.length) return 'Sem datas futuras'
      return `${ds.length} data${ds.length === 1 ? '' : 's'} · próxima ${humanDate(ds[0])}`
    }
    default:
      return '—'
  }
}

export function timesLabel(rec: Recurring): string | null {
  const times = (rec.times || []).filter(Boolean)
  if (!times.length) return null
  return [...times].sort().join(' · ')
}

/** Passou da hora e ninguém marcou. Sem horário, só atrasa depois que o dia vira
 *  — cobrar "atrasado" às 8h da manhã de um story sem hora marcada seria ruído. */
export function isLate(iso: string, slot: string): boolean {
  const today = todayISO()
  if (iso < today) return true
  if (iso > today) return false
  if (!slot) return false
  const now = new Date()
  const [h, m] = slot.split(':').map(Number)
  return now.getHours() * 60 + now.getMinutes() > h * 60 + m
}

// ── Rotação das artes ────────────────────────────────────────────────────────

/** Quando cada arte foi usada pela última vez. */
export function lastUsedMap(logs: RecurringLog[]): Record<string, string> {
  const map: Record<string, string> = {}
  for (const log of logs) {
    if (!log.drive_file_id) continue
    if (!map[log.drive_file_id] || log.done_date > map[log.drive_file_id]) {
      map[log.drive_file_id] = log.done_date
    }
  }
  return map
}

/** A arte sugerida do dia: a que faz mais tempo que não vai ao ar. Não é
 *  sorteio — sorteio repete a mesma imagem dois dias seguidos com frequência
 *  alta, que é exatamente o que a rotação existe pra evitar. Nunca usada vem
 *  antes de qualquer uma já usada. */
export function pickVariant(fileIds: string[], logs: RecurringLog[]): string | null {
  if (!fileIds.length) return null
  const lastUsed = lastUsedMap(logs)
  const sorted = [...fileIds].sort((a, b) => {
    const ua = lastUsed[a]
    const ub = lastUsed[b]
    if (!ua && !ub) return fileIds.indexOf(a) - fileIds.indexOf(b)
    if (!ua) return -1
    if (!ub) return 1
    return ua < ub ? -1 : ua > ub ? 1 : 0
  })
  return sorted[0]
}

export function lastUsedLabel(fileId: string, logs: RecurringLog[]): string {
  const iso = lastUsedMap(logs)[fileId]
  if (!iso) return 'nunca usada'
  const days = Math.round((parseISO(todayISO()).getTime() - parseISO(iso).getTime()) / 86_400_000)
  if (days <= 0) return 'usada hoje'
  if (days === 1) return 'usada ontem'
  return `usada há ${days} dias`
}

// ── Consulta ─────────────────────────────────────────────────────────────────

export const FOLDER_ID_RE = /\/folders\/([-\w]{25,})/

export function folderIdOf(url?: string | null): string | null {
  if (!url) return null
  return url.match(FOLDER_ID_RE)?.[1] || url.match(/[-\w]{25,}/)?.[0] || null
}

export function logKey(recurringId: string, iso: string, slot: string): string {
  return `${recurringId}|${iso}|${slot}`
}
