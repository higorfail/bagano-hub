// "Hoje"/"agora" corretos pro fuso de Brasília — não confiar em
// `new Date().toISOString()` (sempre UTC: entre 21h e 23h59 em Brasília já
// é o dia seguinte em UTC, então qualquer comparação de "hoje" feita assim
// vira o dia errado nesse intervalo) nem no fuso do dispositivo do usuário
// (pode estar errado/diferente). Usado tanto no servidor (cron) quanto no
// cliente (Publicações) pra todo mundo bater a mesma data.
const BR_TZ = 'America/Sao_Paulo'

// en-CA formata como YYYY-MM-DD nativamente — sem montar string na mão.
const brDateFormatter = new Intl.DateTimeFormat('en-CA', { timeZone: BR_TZ, year: 'numeric', month: '2-digit', day: '2-digit' })

export function todayBrasiliaISO(): string {
  return brDateFormatter.format(new Date())
}

export function brasiliaISOFromDate(d: Date): string {
  return brDateFormatter.format(d)
}

// Soma/subtrai dias numa data "YYYY-MM-DD" sem risco de virada de fuso —
// meio-dia nunca cruza a meia-noite ao aplicar o offset local do Node/browser.
export function addDaysISO(iso: string, days: number): string {
  const d = new Date(iso + 'T12:00:00')
  d.setDate(d.getDate() + days)
  return d.toISOString().slice(0, 10)
}

export function daysBetweenISO(fromISO: string, toISO: string): number {
  const a = new Date(fromISO + 'T12:00:00')
  const b = new Date(toISO + 'T12:00:00')
  return Math.round((b.getTime() - a.getTime()) / 86400000)
}
