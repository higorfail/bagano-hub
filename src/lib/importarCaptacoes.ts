import { identificarCliente, ehBloqueio } from './googleEventos'

// Traz pro hub as captações que a equipe marca direto no Google.
//
// A ponte era de mão única de verdade só num sentido: o hub escrevia, e do
// outro lado o Calendário apenas MOSTRAVA o que vinha do Google, sem virar
// registro. Só que o registro real de captação vive lá — medido: ~55 no Google
// contra 7 no hub. Quem trabalha marca no Google, e o hub ficava sem saber de
// quase tudo.
//
// A regra de dono continua valendo, e aqui ela fica ainda mais limpa porque o
// hub NÃO deixa editar a data de uma captação (só o status): o Google manda no
// QUANDO, e o hub manda no QUEM e no O QUÊ (equipe, status, meses cobertos).
// Não existe o mesmo campo sendo disputado dos dois lados.

export type EventoBruto = {
  id: string
  summary: string
  date: string
  startTime: string | null
  endTime: string | null
  allDay: boolean
  cancelado?: boolean
}

export type Decisao =
  | { acao: 'criar';    evento: EventoBruto; clientId: string; clientName: string }
  | { acao: 'atualizar'; evento: EventoBruto; captacaoId: string; de: string; para: string }
  | { acao: 'cancelar';  evento: EventoBruto; captacaoId: string }
  | { acao: 'ignorar';   evento: EventoBruto; motivo: string }

export type CaptacaoExistente = {
  id: string
  google_calendar_event_id: string | null
  scheduled_date: string
  scheduled_time: string | null
  status: string | null
}

/** Minutos entre duas horas HH:MM. Serve pra guardar a duração do evento. */
export function duracao(ini: string | null, fim: string | null, padrao = 120): number {
  if (!ini || !fim) return padrao
  const m = (t: string) => { const [h, mm] = t.split(':').map(Number); return h * 60 + (mm || 0) }
  const d = m(fim) - m(ini)
  return d > 0 ? d : padrao
}

/**
 * Decide o que fazer com cada evento — puro, sem tocar em banco nem em rede,
 * pra poder ser conferido com os eventos de verdade antes de escrever qualquer
 * coisa. Importar em cima de dado de produção sem saber o que vai entrar é o
 * tipo de coisa que só se descobre depois.
 */
export function decidir(
  eventos: EventoBruto[],
  clientesAtivos: { id: string; name: string }[],
  captacoes: CaptacaoExistente[],
): Decisao[] {
  const porEvento = new Map<string, CaptacaoExistente>()
  for (const c of captacoes) {
    if (c.google_calendar_event_id) porEvento.set(c.google_calendar_event_id, c)
  }

  return eventos.map((e): Decisao => {
    const jaExiste = porEvento.get(e.id)

    if (e.cancelado) {
      // Apagado no Google. Não apagamos a captação: viramos o status, que
      // preserva o histórico e não some com nada que alguém já tenha anotado.
      return jaExiste && jaExiste.status !== 'cancelada'
        ? { acao: 'cancelar', evento: e, captacaoId: jaExiste.id }
        : { acao: 'ignorar', evento: e, motivo: 'apagado no Google, sem captação ativa aqui' }
    }

    // "GEE OFF" e afins são ausência, não compromisso com cliente.
    if (ehBloqueio(e.summary)) return { acao: 'ignorar', evento: e, motivo: 'ausência' }

    if (jaExiste) {
      const hora = e.allDay ? null : e.startTime
      const mesmaData = jaExiste.scheduled_date === e.date
      const mesmaHora = (jaExiste.scheduled_time || '').slice(0, 5) === (hora || '')
      if (mesmaData && mesmaHora) return { acao: 'ignorar', evento: e, motivo: 'já em dia' }
      return {
        acao: 'atualizar', evento: e, captacaoId: jaExiste.id,
        de:   `${jaExiste.scheduled_date} ${(jaExiste.scheduled_time || '').slice(0, 5) || '(dia inteiro)'}`,
        para: `${e.date} ${hora || '(dia inteiro)'}`,
      }
    }

    // Conservador: sem cliente reconhecido, não inventa captação. O
    // reconhecedor recusa empate de propósito, e evento como "BOAT SHOW" ou
    // "TRATAMENTO" simplesmente não é captação de cliente nenhum.
    const cli = identificarCliente(e.summary, clientesAtivos)
    if (!cli) return { acao: 'ignorar', evento: e, motivo: 'sem cliente reconhecido' }

    return { acao: 'criar', evento: e, clientId: cli.id, clientName: cli.name }
  })
}

/** Como a captação nasce a partir do evento. */
export function linhaNova(d: Extract<Decisao, { acao: 'criar' }>, hojeISO: string) {
  const e = d.evento
  const hora = e.allDay ? null : e.startTime
  return {
    client_id: d.clientId,
    scheduled_date: e.date,
    scheduled_time: hora,
    duration_minutes: duracao(e.startTime, e.endTime),
    // Passado entra como realizada: importar um mês de histórico como
    // "agendada" encheria a agenda de compromissos que já aconteceram.
    status: e.date < hojeISO ? 'realizada' : 'agendada',
    // O título inteiro vira observação — é onde mora o que o nome do cliente
    // não diz ("HAPPY HOUR + PIZZA DO MÊS", "+ ISRA", "(BRAVA)").
    notes: e.summary,
    // Quem vai fica em branco: o Google não sabe, e chutar seria pior que
    // deixar a pessoa preencher. Fica visível na Agenda pra ser completado.
    team_member_ids: null,
    months_covered: 1,
    google_calendar_event_id: e.id,
  }
}
