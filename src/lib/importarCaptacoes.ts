import { identificarCliente, ehBloqueio, normalizar } from './googleEventos'

/** Palavras que marcam compromisso que não é captação. */
const NAO_E_FILMAGEM = /\b(BRIEFING|REUNIAO|REUNIOES)\b/

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
  /** E-mails dos convidados — é daí que sai quem vai na captação. */
  emails?: string[]
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
  | { acao: 'vincular';  evento: EventoBruto; captacaoId: string; clientName: string }
  | { acao: 'equipe';    evento: EventoBruto; captacaoId: string; memberIds: string[]; nomes: string[] }
  | { acao: 'ignorar';   evento: EventoBruto; motivo: string }

export type CaptacaoExistente = {
  id: string
  client_id: string | null
  team_member_ids?: string[] | null
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
// Endereços que a equipe usa no calendário e que não estão no cadastro do hub.
//
// Sem isto, quem vai na captação sai errado por um detalhe de e-mail: o Otávio
// aparece 43 vezes como `otavio@nouzlab.com` contra 8 como o `baganomkt` que
// está no cadastro — ficaria de fora de quase todas.
//
// O outlook do Franz foi confirmado por comportamento, não por palpite: em 29
// eventos ele aparece SEMPRE junto do gmail dele, e nenhuma vez sozinho — é a
// mesma pessoa convidada nos dois endereços.
//
// Endereço de cliente (criativapadaria@) e de quem saiu da equipe não entram
// aqui de propósito: o que não bate com o cadastro simplesmente é ignorado.
export const APELIDOS_EMAIL: Record<string, string> = {
  'otavio@nouzlab.com': 'baganomkt@gmail.com',
  'lucaspasetti@outlook.com': 'luquinhaspasetti@gmail.com',
}

/** Quem, dos convidados, é da equipe. Devolve ids do hub. */
export function equipeDoEvento(
  emails: string[] | undefined,
  membros: { id: string; name: string; email: string | null }[],
): { ids: string[]; nomes: string[] } {
  const porEmail = new Map(membros.filter(m => m.email).map(m => [m.email!.toLowerCase(), m]))
  const achados = new Map<string, string>()
  for (const bruto of emails || []) {
    const e = (bruto || '').trim().toLowerCase()
    if (!e) continue
    const m = porEmail.get(APELIDOS_EMAIL[e] || e)
    if (m) achados.set(m.id, m.name)
  }
  return { ids: [...achados.keys()], nomes: [...achados.values()] }
}

export function decidir(
  eventos: EventoBruto[],
  clientesAtivos: { id: string; name: string }[],
  captacoes: CaptacaoExistente[],
  membros: { id: string; name: string; email: string | null }[] = [],
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

    // Briefing e reunião são compromisso com cliente, mas NÃO são filmagem — e
    // a lista do hub se chama Captações. Deixar entrar encheria de coisa que
    // não é o que a tela promete: "BRIEFING BEM VIVER" e "REUNIÃO DE PRODUÇÃO
    // ENTRE NÓS" apareceriam como captação e ninguém saberia que não são.
    if (NAO_E_FILMAGEM.test(normalizar(e.summary))) {
      return { acao: 'ignorar', evento: e, motivo: 'não é filmagem' }
    }

    if (jaExiste) {
      const hora = e.allDay ? null : e.startTime
      const mesmaData = jaExiste.scheduled_date === e.date
      const mesmaHora = (jaExiste.scheduled_time || '').slice(0, 5) === (hora || '')
      if (mesmaData && mesmaHora) {
        // Data certa, mas ninguém marcado: preenche a equipe a partir dos
        // convidados. É o que faz a captação importada alcançar as pessoas —
        // sem isso ela existe no hub e não avisa ninguém.
        const eq = equipeDoEvento(e.emails, membros)
        if (eq.ids.length && !(jaExiste.team_member_ids || []).length) {
          return { acao: 'equipe', evento: e, captacaoId: jaExiste.id, memberIds: eq.ids, nomes: eq.nomes }
        }
        return { acao: 'ignorar', evento: e, motivo: 'já em dia' }
      }
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

    // Mesma filmagem, dos dois lados, sem ninguém saber.
    //
    // A captação criada no hub que NÃO chegou ao Google (o bug de horário
    // derrubou todas as que tinham hora marcada) não tem event id — então o
    // evento equivalente lá parece novidade, e importar criaria a mesma
    // filmagem duas vezes. Cliente e dia iguais bastam pra reconhecer: ninguém
    // filma o mesmo cliente duas vezes no mesmo dia.
    //
    // Vincular em vez de criar também CONSERTA o elo quebrado: dali em diante o
    // hub volta a acompanhar as mudanças de data feitas no Google.
    const orfa = captacoes.find(c =>
      !c.google_calendar_event_id && c.client_id === cli.id && c.scheduled_date === e.date)
    if (orfa) return { acao: 'vincular', evento: e, captacaoId: orfa.id, clientName: cli.name }

    return { acao: 'criar', evento: e, clientId: cli.id, clientName: cli.name }
  })
}

/** Como a captação nasce a partir do evento. */
export function linhaNova(
  d: Extract<Decisao, { acao: 'criar' }>,
  hojeISO: string,
  membros: { id: string; name: string; email: string | null }[] = [],
) {
  const e = d.evento
  const eq = equipeDoEvento(e.emails, membros)
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
    // Quem vai sai dos CONVIDADOS do evento. O Google sabe, sim — só não no
    // corpo do evento, e sim na lista de convidados, que a conta de serviço
    // consegue LER (convidar é que ela não pode). Vazio quando ninguém da
    // equipe está convidado.
    team_member_ids: eq.ids.length ? eq.ids : null,
    months_covered: 1,
    google_calendar_event_id: e.id,
  }
}
