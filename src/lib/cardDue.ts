// Como a data de entrega aparece nos cards dos quadros.
//
// Antes cada quadro falava uma língua: o de Extras dizia "15d atraso" e o de
// Materiais dizia "20 de jul. · atrasado". Cada um contava metade — um dava a
// gravidade sem a data, o outro a data sem a gravidade. Aqui vai "20/jul ·
// 15d atraso": a data pra planejar, o relativo pra sentir o tamanho do
// problema.
const MES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez']

export type CardDue = {
  /** "20/jul" */
  date: string
  /** "hoje", "amanhã", "15d atraso" — vazio quando a data está longe. */
  relative: string
  overdue: boolean
  /** Vence hoje ou amanhã: merece destaque, mas não é atraso. */
  soon: boolean
}

export function cardDue(iso?: string | null): CardDue | null {
  if (!iso) return null
  const d = new Date(iso + 'T12:00:00')
  if (isNaN(d.getTime())) return null
  const hoje = new Date()
  const dias = Math.round(
    (new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime() -
     new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate()).getTime()) / 86400000)

  const date = `${String(d.getDate()).padStart(2, '0')}/${MES[d.getMonth()]}`
  let relative = ''
  if (dias < 0)       relative = `${-dias}d atraso`
  else if (dias === 0) relative = 'hoje'
  else if (dias === 1) relative = 'amanhã'

  return { date, relative, overdue: dias < 0, soon: dias === 0 || dias === 1 }
}
