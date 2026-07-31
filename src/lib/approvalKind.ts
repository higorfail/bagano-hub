// Um post passa por DUAS aprovações do cliente ao longo do mês:
//   1. o cronograma (a ideia/estratégia) — leva o post pra Produção
//   2. a arte final (o conteúdo pronto)  — leva o post pra Aprovado
//
// As duas gravam approval_status='aprovado', então esse campo sozinho não
// diz qual delas aconteceu. O que diferencia é o estágio em que o post está.
// Sem distinguir, o Hub mostrava "✓ Aprovado pelo cliente" num post cuja arte
// final nunca tinha sido enviada pro cliente — caso real que fez o time achar
// que o cliente já tinha aprovado o material final (HAGO, julho/26).
const FINAL_STAGES = ['aprovado', 'agendado', 'publicado']

export type ApprovalKind = 'crono' | 'final' | null

export function approvalKind(status?: string | null, approvalStatus?: string | null): ApprovalKind {
  if (approvalStatus !== 'aprovado') return null
  // Post em AJUSTE não exibe aprovação, mesmo que o cronograma tenha sido
  // aprovado antes. approval_status continua 'aprovado' desde aquela
  // aprovação, então o card mostrava "✓ Crono" verde enquanto pedia trabalho.
  // O selo tem que dizer onde o post ESTÁ, não onde ele já esteve.
  if (status === 'ajuste') return null
  return FINAL_STAGES.includes(status || '') ? 'final' : 'crono'
}

// Rótulo de uma palavra pros selos compactos (mini card, kanban, cronograma).
// Existe pra esses lugares perguntarem à biblioteca em vez de testarem
// approval_status na mão — foi assim que a regra do ajuste passou batida em
// quatro telas ao mesmo tempo.
export function approvalShort(status?: string | null, approvalStatus?: string | null): string | null {
  const kind = approvalKind(status, approvalStatus)
  return kind === 'final' ? 'Final' : kind === 'crono' ? 'Crono' : null
}

// Rótulo curto na linguagem que o time usa no dia a dia.
export function approvalLabel(status?: string | null, approvalStatus?: string | null): string | null {
  const kind = approvalKind(status, approvalStatus)
  if (!kind) return null
  return kind === 'final' ? 'Final aprovado' : 'Crono aprovado'
}
