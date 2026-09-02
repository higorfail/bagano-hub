import { createClient } from './supabase'

// Renumerar posts arrastando, sem colidir no meio do caminho.
//
// Reordenar 1,2,3 pra 3,1,2 passa por estados em que dois posts têm o mesmo
// número. Isso sempre foi verdade, e antes não importava porque nada impedia
// número repetido — e foi assim que três pares repetidos apareceram no banco,
// um deles fazendo dois posts diferentes do NI HAO serem ambos o "#9".
//
// Agora que o número é ENDEREÇO (/cliente/cronograma/2026-09/11), repetido
// deixou de ser feio e passou a ser link que abre o post errado. Daí a
// restrição única no banco — que, sendo comum, quebraria o arrastar.
//
// A saída é a restrição ser ADIÁVEL (conferida no fim da transação) e a
// renumeração acontecer em UMA chamada. As três telas mandavam N updates em
// paralelo, o que são N transações, cada uma conferida no seu commit: adiar
// não ajudaria em nada.
export async function renumerarPosts(
  // Pares explícitos, e não "a ordem do array vira 1..N": o feed do iPhone
  // numera ao CONTRÁRIO (o primeiro da tela é o maior número, porque é o post
  // mais recente). Inferir da ordem inverteria a numeração dele em silêncio.
  novos: { id: string; post_number: number }[],
): Promise<{ ok: boolean; erro?: string }> {
  if (!novos.length) return { ok: true }
  const supabase = createClient()

  const { error } = await supabase.rpc('renumerar_posts', {
    p_ids: novos.map(n => n.id),
    p_numeros: novos.map(n => n.post_number),
  })
  if (!error) return { ok: true }

  // A função é passo manual no Supabase. Sem ela, cai no jeito antigo: N
  // updates soltos. Funciona enquanto a restrição também não existir — e as
  // duas chegam juntas, no mesmo SQL.
  if (/function|does not exist|schema cache/i.test(error.message)) {
    const res = await Promise.all(
      novos.map(n => supabase.from('schedules').update({ post_number: n.post_number }).eq('id', n.id)),
    )
    const err = res.find(r => r.error)?.error
    return err ? { ok: false, erro: err.message } : { ok: true }
  }
  return { ok: false, erro: error.message }
}
