// Os modelos do Gemini, num lugar só.
//
// Estavam escritos à mão em 14 pontos de 8 rotas. Trocar de modelo — porque o
// Google descontinuou, porque um ficou caro, porque outro escreve legenda
// melhor — era caçar string por string, e esquecer um deixava duas rotas
// respondendo com modelos diferentes sem ninguém notar.
//
// Sobre o sufixo `-latest`: ele é uma ESCOLHA, não descuido. Aponta sempre pra
// versão corrente, então uma mudança do Google chega sem aviso e pode mudar o
// texto das legendas de um dia pro outro. A troca seria fixar a versão
// (`gemini-2.5-flash`, por exemplo), que dá comportamento estável — e um dia é
// descontinuada, aí o hub para de gerar texto até alguém perceber.
//
// Ficou no `-latest` de propósito: quebrar aos poucos é melhor que parar de
// uma vez, num hub sem alarme de erro em rota de IA. Quando houver alarme,
// vale reconsiderar — e aí a mudança é uma linha aqui.
export const GEMINI = {
  /** Mais capaz: briefing, manual do cliente, lista de pauta. */
  FLASH: 'gemini-flash-latest',
  /** Mais barato e rápido: resumo curto, saudação, classificação de ajuste. */
  FLASH_LITE: 'gemini-flash-lite-latest',
} as const
