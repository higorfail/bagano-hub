// Pra quem vai o aviso quando o cliente não tem time montado.
//
// Cliente sem linha em `client_team` é caso normal: cliente novo, alguém saiu,
// ninguém montou o time ainda. O envio tratava isso como "não tem destinatário"
// e seguia adiante — o Maya Sushi aprovou uma leva de conteúdo e o resumo não
// chegou no celular de ninguém NEM apareceu no sininho, porque o digest apaga a
// fila logo depois de montar o recado, com ou sem quem avisar. O aviso não
// atrasou: ele deixou de existir, e não tem de onde recuperar (o registro das
// decisões continua no activity_log, isso não se perde).
//
// A reserva são os sócios e a assistente — quem consegue agir sobre o recado E
// arrumar o cadastro que causou o buraco. Sai por `role`/`is_owner` e não por
// id fixo, pra que trocar de assistente não exija mexer em código.
const PAPEIS_DE_RESERVA = ['assistente']

export async function destinatariosDeReserva(db: any): Promise<string[]> {
  const { data } = await db.from('team_members').select('id, role, is_owner')
  return (data || [])
    .filter((m: any) => m.is_owner || PAPEIS_DE_RESERVA.includes(m.role || ''))
    .map((m: any) => m.id)
}

/**
 * O recado ganha a explicação do desvio. Sem esta linha o sócio recebe um
 * resumo de um cliente que não é dele e não tem como saber por quê — e o
 * cadastro furado, que é a causa, continua furado.
 */
export function avisoDeTimeVazio(nomeCliente: string) {
  return ` ${nomeCliente} está sem time no Hub — avisamos vocês porque não havia quem avisar.`
}
