// Em que ano cai a campanha sazonal que está em jogo AGORA, e quanto falta.
//
// Campanha sazonal é uma data que se repete todo ano: Dia dos Pais é sempre em
// agosto. Mas o trabalho dela não termina no dia da data — sobra post em
// produção, extra não entregue, material pendente.
//
// A conta antiga pulava pro ano seguinte no dia SEGUINTE à data: em 12 de
// agosto o Dia dos Pais já dizia "faltam 364 dias", e junto sumia da tela tudo
// que ainda não tinha fechado. Aqui a campanha só troca de ano depois de uma
// janela de encerramento; dentro dela os dias ficam negativos ("passou há 3
// dias") e a campanha continua sendo a DESTE ano.
export const CAMPAIGN_GRACE_DAYS = 21

function startOfDay(d: Date) { return new Date(d.getFullYear(), d.getMonth(), d.getDate()) }

function daysBetween(from: Date, to: Date) {
  return Math.round((startOfDay(to).getTime() - startOfDay(from).getTime()) / 86400000)
}

export function campaignYear(month: number, day: number, ref: Date = new Date()): number {
  // Ano anterior entra na varredura por causa do Natal: em 5 de janeiro a
  // campanha que a equipe ainda está encerrando é a de dezembro do ano
  // passado, não a que só acontece daqui a onze meses.
  for (const y of [ref.getFullYear() - 1, ref.getFullYear(), ref.getFullYear() + 1]) {
    if (daysBetween(new Date(y, month - 1, day), ref) <= CAMPAIGN_GRACE_DAYS) return y
  }
  return ref.getFullYear() + 1
}

// Negativo = a data já passou mas a campanha segue aberta (janela de encerramento).
export function campaignDaysUntil(month: number, day: number, ref: Date = new Date()): number {
  return daysBetween(ref, new Date(campaignYear(month, day, ref), month - 1, day))
}

// Mês/ano do cronograma em que um post desta campanha deve nascer.
//
// Sem isso, criar um post pela campanha usava o mês do RELÓGIO: um post de
// Natal criado em novembro caía no cronograma de novembro, e o post_number era
// contado sobre novembro — número repetido no cronograma de dezembro.
export function campaignPeriod(month: number, day: number, ref: Date = new Date()) {
  return { month, year: campaignYear(month, day, ref) }
}
