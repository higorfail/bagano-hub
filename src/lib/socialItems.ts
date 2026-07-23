// Camada de dados da página Publicações — unifica `schedules` e `extras`
// num único formato (`SocialItem`) para as visões de board/calendário/semana.
import { createClient } from '@/lib/supabase'
import { extractDriveFileId } from '@/lib/useMentions'
import { todayBrasiliaISO } from '@/lib/timezone'
import { logActivity } from '@/lib/activity'

export type SocialActor = { id?: string | null; name?: string | null }

export type SocialColumn = 'aprovado' | 'agendado' | 'publicado'
export type SocialSource = 'schedule' | 'extra'

export type SocialItem = {
  id: string
  source: SocialSource
  title: string
  clientId: string | null
  postType: string | null
  // Número do post no cronograma (igual ao Kanban/Cronograma) — só existe em
  // schedules; extras não têm essa numeração.
  postNumber: number | null
  column: SocialColumn
  scheduledDate: string | null
  scheduledTime: string | null
  copy: string | null
  legenda: string | null
  driveUrl: string | null
  driveFolderUrl: string | null
  labels: { text: string; color: string }[] | null
  assignedMembers: string[]
  // Mês/ano de produção do cronograma (igual ao Kanban) — só existe em
  // schedules; extras não têm esse conceito (fica null).
  productionMonth: number | null
  productionYear: number | null
  raw: ScheduleRow | ExtraRow
}

export type ScheduleRow = {
  id: string
  post_number: number
  title: string
  post_type: string
  status: string
  scheduled_date: string | null
  client_id: string
  month: number
  year: number
  approval_status: string | null
  copy: string | null
  legenda: string | null
  drive_url: string | null
  drive_folder_url: string | null
}

export type ExtraRow = {
  id: string
  title: string
  type: string
  status: 'backlog' | 'aguardando_aprovacao' | 'done'
  client_id: string | null
  due_date: string | null
  due_time: string | null
  copy: string | null
  legenda: string | null
  drive_url: string | null
  labels: { text: string; color: string }[] | null
  assigned_members: string[] | null
  assigned_member_id: string | null
  client_approval_status: string | null
  published_at: string | null
  scheduled_at: string | null
}

// Tipos de post — mesmo vocabulário usado em schedules.post_type e extras.type
export const POST_TYPE_LABEL: Record<string, string> = {
  reels: 'Reels', carrossel: 'Carrossel', post: 'Post',
  story: 'Story', carrossel_stories: 'Carrossel/Stories',
}
export const POST_TYPE_ACCENT: Record<string, string> = {
  reels: '#ef4444', carrossel: '#3b82f6', post: '#f59e0b',
  story: '#8b5cf6', carrossel_stories: '#6366f1',
}

export const SOCIAL_COLUMNS: { key: SocialColumn; label: string; color: string }[] = [
  { key: 'aprovado',  label: 'Aprovados', color: '#3B82F6' },
  { key: 'agendado',  label: 'Agendado',  color: '#14B8A6' },
  { key: 'publicado', label: 'Publicado', color: '#22C55E' },
]

const SCHEDULE_SELECT ='id, post_number, title, post_type, status, scheduled_date, client_id, month, year, approval_status, copy, legenda, drive_url, drive_folder_url'
const EXTRA_SELECT = 'id, title, type, status, client_id, due_date, due_time, copy, legenda, drive_url, labels, assigned_members, assigned_member_id, client_approval_status, published_at, scheduled_at'

export function scheduleToSocialItem(row: ScheduleRow): SocialItem | null {
  let column: SocialColumn
  if (row.status === 'aprovado') column = 'aprovado'
  else if (row.status === 'agendado') column = 'agendado'
  else if (row.status === 'publicado') column = 'publicado'
  else return null // fora do escopo desta página (pré-aprovação)

  return {
    id: row.id,
    source: 'schedule',
    title: row.title,
    clientId: row.client_id,
    postType: row.post_type,
    postNumber: row.post_number,
    column,
    scheduledDate: row.scheduled_date,
    scheduledTime: null,
    copy: row.copy,
    legenda: row.legenda,
    driveUrl: row.drive_url,
    driveFolderUrl: row.drive_folder_url,
    labels: null,
    assignedMembers: [],
    productionMonth: row.month,
    productionYear: row.year,
    raw: row,
  }
}

export function extraToSocialItem(row: ExtraRow): SocialItem | null {
  let column: SocialColumn
  if (row.published_at) {
    column = 'publicado'
  } else if (row.scheduled_at) {
    column = 'agendado'
  } else {
    // Só é "pronto pra publicar" quando a produção terminou e, SE chegou a
    // ser enviado pro cliente aprovar, a aprovação já veio (não bloqueia se
    // nunca foi enviado — nem todo Extra passa por aprovação de cliente).
    // A coluna nunca é inferida por due_date (prazo de produção, não é ela
    // quem decidiu isso) — tudo que fica pronto cai em Aprovado; só um
    // arrasto/ação manual dela dentro desta página move pra Agendado/Publicado.
    if (row.status !== 'done') return null
    if (row.client_approval_status && row.client_approval_status !== 'aprovado') return null
    column = 'aprovado'
  }

  const assignedMembers = row.assigned_members?.length
    ? row.assigned_members
    : row.assigned_member_id ? [row.assigned_member_id] : []

  return {
    id: row.id,
    source: 'extra',
    title: row.title,
    clientId: row.client_id,
    postType: row.type,
    postNumber: null,
    column,
    scheduledDate: row.due_date,
    scheduledTime: row.due_time,
    copy: row.copy,
    legenda: row.legenda,
    // Extras guardam pasta e arquivo único no mesmo campo drive_url (sem coluna
    // separada como schedules) — mesma detecção já usada pros extras em
    // AprovarClient.tsx, senão uma pasta tenta virar miniatura de arquivo e falha.
    driveUrl: /\/folders\//.test(row.drive_url || '') ? null : row.drive_url,
    driveFolderUrl: /\/folders\//.test(row.drive_url || '') ? row.drive_url : null,
    labels: row.labels,
    assignedMembers,
    productionMonth: null,
    productionYear: null,
    raw: row,
  }
}

export async function fetchSocialItems(): Promise<SocialItem[]> {
  const supabase = createClient()
  const [{ data: scheduleData }, { data: extraData }] = await Promise.all([
    supabase.from('schedules').select(SCHEDULE_SELECT).in('status', ['aprovado', 'agendado', 'publicado']),
    supabase.from('extras').select(EXTRA_SELECT),
  ])

  const items: SocialItem[] = []
  for (const row of (scheduleData || []) as ScheduleRow[]) {
    const item = scheduleToSocialItem(row)
    if (item) items.push(item)
  }
  for (const row of (extraData || []) as unknown as ExtraRow[]) {
    const item = extraToSocialItem(row)
    if (item) items.push(item)
  }
  return items
}

export type DateQuickFilter = 'todos' | 'hoje' | 'semana' | 'mes'

export type SocialFilters = {
  clientIds: Set<string>
  types: Set<string>
  sources: Set<SocialSource>
  dateFilter: DateQuickFilter
  missingDateOnly: boolean
  overdueOnly: boolean
  // Mês de produção (igual ao seletor do Kanban) — null = todos os meses.
  // Só filtra schedules pelo mês/ano de produção; extras (sem esse campo)
  // são filtrados pelo mês da própria data (scheduledDate), se tiverem uma.
  monthFilter: { month: number; year: number } | null
  search: string
}

// Qualquer coisa com uma data marcada que já passou e ainda não foi
// publicada — não só "Agendado": um post que ficou parado em "Aprovado"
// com uma data vencida também é atrasado (às vezes mais grave, já que nem
// chegou a ser agendado de fato). Mesmo critério usado pelo cron de push em
// /api/cron/overdue-posts. Sempre calcula "hoje" no fuso de Brasília — nunca
// UTC puro, que vira o dia errado entre 21h e meia-noite.
export function isOverdue(item: SocialItem, todayISO = todayBrasiliaISO()): boolean {
  return item.column !== 'publicado' && !!item.scheduledDate && item.scheduledDate < todayISO
}

function startOfWeek(d: Date) {
  const day = d.getDay() // 0 = domingo
  const diff = d.getDate() - day + (day === 0 ? -6 : 1) // semana começa na segunda
  return new Date(d.getFullYear(), d.getMonth(), diff)
}

export function filterSocialItems(items: SocialItem[], filters: SocialFilters): SocialItem[] {
  const todayStr = todayBrasiliaISO()
  const now = new Date(todayStr + 'T12:00:00') // ancorado no "hoje" de Brasília, não no fuso do dispositivo
  const weekStart = startOfWeek(now)
  const weekEnd = new Date(weekStart); weekEnd.setDate(weekEnd.getDate() + 6)

  return items.filter(item => {
    if (filters.clientIds.size > 0 && (!item.clientId || !filters.clientIds.has(item.clientId))) return false
    if (filters.types.size > 0 && (!item.postType || !filters.types.has(item.postType))) return false
    if (filters.sources.size > 0 && !filters.sources.has(item.source)) return false
    if (filters.search.trim() && !item.title.toLowerCase().includes(filters.search.trim().toLowerCase())) return false

    if (filters.monthFilter) {
      if (item.source === 'schedule') {
        if (item.productionMonth !== filters.monthFilter.month || item.productionYear !== filters.monthFilter.year) return false
      } else {
        if (!item.scheduledDate) return false
        const d = new Date(item.scheduledDate + 'T12:00:00')
        if (d.getMonth() + 1 !== filters.monthFilter.month || d.getFullYear() !== filters.monthFilter.year) return false
      }
    }

    if (filters.missingDateOnly) return !item.scheduledDate
    if (filters.overdueOnly) return isOverdue(item, todayStr)

    if (filters.dateFilter !== 'todos') {
      if (!item.scheduledDate) return false
      if (filters.dateFilter === 'hoje') return item.scheduledDate === todayStr
      const d = new Date(item.scheduledDate + 'T12:00:00')
      if (filters.dateFilter === 'semana') return d >= weekStart && d <= weekEnd
      if (filters.dateFilter === 'mes') return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth()
    }
    return true
  })
}

// Baixa o conteúdo entregue (Drive) sem sair da página — usado pelo botão de
// download nos cards de Publicações. Cai pra "abrir no Drive" quando o proxy
// não consegue (arquivo não compartilhado por link, Doc/Sheet/Slide nativo, etc)
// ou quando o conteúdo é uma pasta inteira (carrossel) — nesse caso não dá pra
// baixar tudo como um arquivo só, então só abre a pasta.
export async function downloadDriveContent(driveUrl: string | null | undefined, driveFolderUrl?: string | null): Promise<{ ok: boolean; message: string }> {
  if (!driveUrl && !driveFolderUrl) return { ok: false, message: 'Este item não tem conteúdo do Drive vinculado.' }
  if (!driveUrl && driveFolderUrl) {
    window.open(driveFolderUrl, '_blank')
    return { ok: true, message: 'É uma pasta com vários arquivos — abrindo no Drive.' }
  }
  const id = extractDriveFileId(driveUrl!)
  if (!id) return { ok: false, message: 'Não consegui identificar o arquivo do Drive nesse link.' }

  try {
    const res = await fetch(`/api/drive-download?id=${id}`)
    const contentType = res.headers.get('content-type') || ''
    if (res.ok && !contentType.includes('application/json')) {
      const blob = await res.blob()
      const disposition = res.headers.get('content-disposition') || ''
      const match = disposition.match(/filename="([^"]+)"/)
      const filename = match ? match[1] : 'arquivo'
      const blobUrl = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = blobUrl; a.download = filename
      document.body.appendChild(a); a.click(); a.remove()
      URL.revokeObjectURL(blobUrl)
      return { ok: true, message: 'Download iniciado.' }
    }
    const data = await res.json().catch(() => null)
    if (data?.fallbackUrl) { window.open(data.fallbackUrl, '_blank'); return { ok: true, message: 'Este arquivo só pode ser aberto no Drive.' } }
    window.open(driveUrl!, '_blank')
    return { ok: true, message: 'Não deu pra baixar direto — abrindo no Drive.' }
  } catch {
    window.open(driveUrl!, '_blank')
    return { ok: true, message: 'Erro no download — abrindo no Drive.' }
  }
}

// Só muda a data (e opcionalmente hora) sem mexer na coluna/status — usado
// quando ela arrasta um item já agendado/publicado pra outro dia no
// Calendário/Semana. Diferente de scheduleSocialItem, que também comete a
// coluna pra Agendado (o que reverteria um item já Publicado de volta pra
// Agendado só por mudar a data, o que não faz sentido).
function logSocialActivity(item: SocialItem, description: string, actor?: SocialActor) {
  // Sem isso, o card nunca mostra na Atividade quando a social media agendou
  // ou publicou pelo board de Publicações (drag-and-drop, botão Agendar/
  // Publicar) — só ações feitas dentro do card completo (PostCard/ExtraCard)
  // eram logadas.
  logActivity({
    tableName: item.source === 'schedule' ? 'schedules' : 'extras',
    recordId: item.id,
    clientId: item.clientId,
    action: 'status_changed',
    actorName: actor?.name,
    actorId: actor?.id,
    description,
  })
}

export async function updateItemDate(item: SocialItem, date: string, time?: string, actor?: SocialActor) {
  const supabase = createClient()
  const who = actor?.name || 'Alguém'
  const result = item.source === 'schedule'
    ? await supabase.from('schedules').update({ scheduled_date: date }).eq('id', item.id)
    : await supabase.from('extras').update(time !== undefined ? { due_date: date, due_time: time } : { due_date: date }).eq('id', item.id)
  if (!result.error) logSocialActivity(item, `${who} mudou a data de "${item.title}" pra ${date}`, actor)
  return result
}

// Agenda de vez: define a data (e opcionalmente hora) E move pro Agendado
// numa ação só — usado pelo botão "Agendar". Diferente de moveSocialItem
// pro caso 'agendado', porque também precisa gravar a data escolhida (não
// só cair no default de hoje quando não houver uma ainda).
export async function scheduleSocialItem(item: SocialItem, date: string, time?: string, actor?: SocialActor) {
  const supabase = createClient()
  const who = actor?.name || 'Alguém'
  let result
  if (item.source === 'schedule') {
    result = await supabase.from('schedules').update({ scheduled_date: date, status: 'agendado' }).eq('id', item.id)
  } else {
    const patch: Record<string, unknown> = { due_date: date, scheduled_at: new Date().toISOString(), published_at: null }
    if (time) patch.due_time = time
    result = await supabase.from('extras').update(patch).eq('id', item.id)
  }
  if (!result.error) logSocialActivity(item, `${who} agendou "${item.title}" pra ${date}`, actor)
  return result
}

// Atualiza o campo que determina a coluna, de volta na tabela de origem.
export async function moveSocialItem(item: SocialItem, toColumn: SocialColumn, actor?: SocialActor) {
  const supabase = createClient()
  const who = actor?.name || 'Alguém'
  const COLUMN_LABEL: Record<SocialColumn, string> = { aprovado: 'Aprovado', agendado: 'Agendado', publicado: 'Publicado' }
  let result
  if (item.source === 'schedule') {
    const status = toColumn // os nomes de coluna já são os valores de status de schedules
    result = await supabase.from('schedules').update({ status }).eq('id', item.id)
  } else if (toColumn === 'publicado') {
    // extras: não há status "aprovado"/"agendado" — cada coluna grava campos
    // diferentes. status/client_approval_status não são tocados aqui: pra um
    // extra chegar neste board ele já passou pelo gate (produção concluída e,
    // se aplicável, aprovado) — mover entre colunas do board de Publicações
    // nunca deveria voltar esse estado atrás.
    result = await supabase.from('extras').update({ published_at: new Date().toISOString() }).eq('id', item.id)
  } else if (toColumn === 'agendado') {
    const patch: Record<string, unknown> = { scheduled_at: new Date().toISOString(), published_at: null }
    if (!item.scheduledDate) patch.due_date = todayBrasiliaISO()
    result = await supabase.from('extras').update(patch).eq('id', item.id)
  } else {
    // toColumn === 'aprovado' — due_date fica como está (é só informativo);
    // só desfaz os marcadores manuais de agendado/publicado.
    result = await supabase.from('extras').update({ scheduled_at: null, published_at: null }).eq('id', item.id)
  }
  if (!result.error) logSocialActivity(item, `${who} moveu "${item.title}" para ${COLUMN_LABEL[toColumn]}`, actor)
  return result
}
