// Gravação que acontece por trás da tela — e que não pode falhar calada.
//
// Registrar quem observa um card, gravar o histórico, gravar a notificação:
// ninguém clicou nisso, então não há botão pra ficar vermelho. Até aqui essas
// falhas só viravam `console.error`, num console que ninguém abre. O efeito é
// pior do que parece:
//   - `card_watchers` falha → a pessoa foi adicionada ao card e NUNCA é avisada
//     dele. Ela não sabe que devia saber.
//   - `hub_notifications` falha → o aviso não existe. Some sem rastro.
//   - `activity_log` falha → o histórico do card fica com um buraco, e quem for
//     entender "quem mexeu nisso" chega a uma conclusão errada.
//
// Duas mudanças. A primeira: INSISTIR uma vez. A maioria dessas falhas é
// passageira — rede oscilando, prazo estourado, o Supabase respirando. Uma
// segunda tentativa 400 ms depois resolve quase todas, e sai de graça.
//
// A segunda: quando nem a segunda tentativa passa, AVISAR NA TELA. A lib não
// tem acesso ao toast (que vive num contexto do React), então ela grita por
// evento e quem estiver montado escuta. Se ninguém escutar, não custa nada.
const ESPERA_MS = 400

export const EVENTO_FALHA = 'hub:gravacao-falhou'

export type FalhaDeFundo = { onde: string; detalhe: string }

export async function gravarInsistindo(
  onde: string,
  // `PromiseLike` e não `Promise`: o builder do supabase-js é "thenable" mas
  // não é uma Promise de verdade — exigir Promise recusaria a chamada natural
  // `() => supabase.from(...).insert(...)` e obrigaria um `await` a mais.
  gravar: () => PromiseLike<{ error: unknown }>,
): Promise<boolean> {
  for (let tentativa = 1; tentativa <= 2; tentativa++) {
    let erro: unknown
    try {
      const { error } = await gravar()
      if (!error) return true
      erro = error
    } catch (e) {
      erro = e
    }

    if (tentativa === 1) {
      await new Promise(r => setTimeout(r, ESPERA_MS))
      continue
    }

    const detalhe = erro instanceof Error ? erro.message
      : typeof erro === 'object' && erro && 'message' in erro ? String((erro as any).message)
      : String(erro)
    console.error(`[${onde}] não gravou, nem na segunda tentativa:`, erro)
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent<FalhaDeFundo>(EVENTO_FALHA, { detail: { onde, detalhe } }))
    }
    return false
  }
  return false
}
