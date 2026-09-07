// O teto invisível de 1000 linhas.
//
// O Supabase corta toda resposta em 1000 registros por padrão, e o corte é
// SILENCIOSO: HTTP 200, array com 1000 itens, nenhum aviso. A tela monta com
// o que veio e ninguém descobre que faltou — o número na tela simplesmente
// fica errado, e parece que sumiu conteúdo.
//
// Medido em 2026-09-07:
//   activity_log       10.143 linhas   (todas as leituras são por card — ok)
//   hub_notifications   8.808 linhas   (idem)
//   card_watchers         868 linhas   (leituras por card — ok)
//   schedules             481 linhas   ← cresce ~100/mês
//
// O kanban lê `schedules` inteiro, sem recorte. Hoje cabe; em uns cinco meses
// não cabe mais, e ele vai perder os posts mais antigos calado. Filtrar a
// consulta esconderia meses do seletor (que é montado a partir do que veio),
// então a saída é ESCANDALIZAR quando acontecer, em vez de mudar a tela agora.
export const TETO_POSTGREST = 1000

export function avisarSeCortou<T>(onde: string, linhas: T[] | null | undefined): T[] {
  const dados = linhas || []
  if (dados.length === TETO_POSTGREST) {
    // console.error e não warn: isto não é um detalhe, é a tela mentindo.
    console.error(
      `[hub] "${onde}" voltou exatamente ${TETO_POSTGREST} registros — o teto do Supabase. ` +
      `Quase certamente falta conteúdo, e a tela está mostrando menos do que existe. ` +
      `Conserto: recortar a consulta (por período, cliente ou status) ou paginar.`,
    )
  }
  return dados
}
