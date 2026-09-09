// Aniversários que caem numa semana.
//
// Guardados como data completa em `clients.birthday` (o dono do restaurante) e
// `team_members.birthday`. O ANO não interessa a ninguém aqui — o que se quer
// saber é "cai nesta semana?" —, mas guardar a data inteira custa o mesmo e
// deixa a porta aberta pra mudar de ideia depois. Comparar por mês+dia é
// trabalho do código, não do formato.
//
// `birthday_label` existe porque o aniversário do CLIENTE quase nunca é do
// cliente: é do Tiago do Big Poke, da Ana do Bem Viver. Sem o nome, o card
// diria "Aniversário do Big Poke", que é outra coisa (e essa outra coisa já
// mora em `special_dates`).

export type Aniversario = {
  /** ISO do dia em que cai NESTE ano. */
  dia: string
  nome: string
  /** 'cliente' pinta com a cor da marca; 'equipe' é da casa. */
  tipo: 'cliente' | 'equipe'
  clientId?: string
  cor?: string | null
}

/** O mesmo aniversário, transposto para o ano de `dia`. */
function noAnoDe(nascimento: string, referencia: Date): string | null {
  const m = nascimento.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (!m) return null
  const [, , mes, diaDoMes] = m
  return `${referencia.getFullYear()}-${mes}-${diaDoMes}`
}

/**
 * Quais aniversários caem entre `de` e `ate` (ISO, inclusive).
 *
 * Vira uma vez por ano na virada: a semana entre 28/12 e 03/01 tem dias em dois
 * anos diferentes. Por isso a transposição usa o ano de CADA dia do intervalo,
 * não o ano de hoje.
 */
export function aniversariosNoPeriodo(
  de: string,
  ate: string,
  clientes: { id: string; name: string; color_hex?: string | null; birthday?: string | null; birthday_label?: string | null }[],
  equipe: { id: string; name: string; birthday?: string | null }[],
): Aniversario[] {
  const inicio = new Date(de + 'T12:00:00')
  const fim = new Date(ate + 'T12:00:00')
  const anos = new Set([inicio.getFullYear(), fim.getFullYear()])

  const achados: Aniversario[] = []
  const dentro = (iso: string | null) => !!iso && iso >= de && iso <= ate

  for (const ano of anos) {
    const ref = new Date(ano, 0, 1)
    for (const c of clientes) {
      if (!c.birthday) continue
      const dia = noAnoDe(c.birthday, ref)
      if (!dentro(dia)) continue
      achados.push({
        dia: dia as string,
        // Sem nome da pessoa, "Aniversário do Big Poke" viraria aniversário da
        // MARCA — outra data, que mora em special_dates.
        nome: c.birthday_label?.trim() || c.name,
        tipo: 'cliente', clientId: c.id, cor: c.color_hex,
      })
    }
    for (const m of equipe) {
      if (!m.birthday) continue
      const dia = noAnoDe(m.birthday, ref)
      if (!dentro(dia)) continue
      achados.push({ dia: dia as string, nome: m.name, tipo: 'equipe' })
    }
  }
  return achados.sort((a, b) => a.dia.localeCompare(b.dia) || a.nome.localeCompare(b.nome))
}
