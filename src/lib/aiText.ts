/**
 * Tira os vícios de escrita que denunciam texto de IA.
 *
 * O travessão é o mais evidente: modelos usam "—" como pausa o tempo todo, e
 * ninguém escreve legenda de Instagram assim. Instruir no prompt ajuda mas não
 * resolve sozinho — os modelos voltam a usar. Então também limpamos na saída.
 *
 * ATENÇÃO ao aplicar: só na parte GERADA. O rodapé fixo de alguns clientes tem
 * travessão de verdade no endereço ("207F (fundos) – Praia dos Amores"), e
 * limpar o texto inteiro corromperia o dado do cliente.
 */
export function stripAiTells(text: string): string {
  return text
    // Travessão entre espaços vira vírgula: é o uso que soa a IA.
    .replace(/\s+[—–]\s+/g, ', ')
    // Travessão colado (intervalo tipo "10—12") vira hífen simples.
    .replace(/([^\s])[—–]([^\s])/g, '$1-$2')
    // Vírgula duplicada que a troca acima pode criar.
    .replace(/,\s*,/g, ',')
    .replace(/,\s*\./g, '.')
    .trim()
}

/** Trecho pra colar nos prompts, pra o modelo já nascer sem o vício. */
export const NO_AI_TELLS = `Não use travessão (— nem –) em lugar nenhum: use vírgula, ponto ou parênteses. Travessão é a marca mais óbvia de texto escrito por IA.`
