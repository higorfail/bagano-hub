// Duração de captação, escrita como as pessoas falam.
//
// O banco guarda minutos, que é o certo pra contar — mas a tela mostrava o
// número cru: "180min". Ninguém marca uma filmagem de cento e oitenta minutos;
// marca de três horas. Ler "180min" obriga a dividir por 60 de cabeça toda vez,
// e é o tipo de conta que a pessoa faz errado com pressa.
//
// Os minutos continuam no banco. Isto é só como se escreve.

export function duracaoEmTexto(minutos: number | null | undefined): string {
  const m = Math.max(0, Math.round(minutos || 0))
  if (m === 0) return '—'
  if (m < 60) return `${m}min`
  const horas = Math.floor(m / 60)
  const resto = m % 60
  // "2h" e não "2h00": o zero não acrescenta nada e só alonga a linha.
  return resto === 0 ? `${horas}h` : `${horas}h${String(resto).padStart(2, '0')}`
}

/**
 * As durações que a agência usa de verdade.
 *
 * Era um campo numérico livre, e campo livre aqui só serve pra alguém digitar
 * 90 quando queria 1h30 e não perceber a diferença — ou digitar 1 achando que
 * é uma hora. Com lista, o valor possível é sempre um valor que existe.
 */
export const DURACOES_DE_CAPTACAO = [30, 45, 60, 90, 120, 150, 180, 240, 300, 360, 480]
