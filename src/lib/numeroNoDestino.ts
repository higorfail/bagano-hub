// O número do post é do MÊS, não do post.
//
// `post_number` é único por cliente+mês+ano (trava `schedules_numero_unico_no_mes`),
// porque virou endereço: /criativa-padaria/cronograma/2026-09/5. Mover um post
// carregando o número junto é levar um endereço que já pertence a outro.
//
// Foi o que acontecia: mover o #5 de outubro da Criativa Padaria pra setembro,
// onde já existe um #5, dava "duplicate key value violates unique constraint".
// O erro aparecia num toast preto, sem dizer o que fazer, e o post ficava onde
// estava.
//
// Aqui o post ganha número novo ao chegar. Não reaproveita buraco: se setembro
// tem 1–14 com o 11 vago, o recém-chegado é o 15, não o 11. Buraco vem de post
// apagado ou movido, e o endereço dele pode estar no navegador de alguém — o
// 11 antigo abrindo um post diferente é pior do que a numeração ter falhas.
// Quem quiser a numeração arrumada arrasta, e aí passa por `renumerarPosts`.
export async function numerosNoDestino(
  db: { from: (t: string) => any },
  clientId: string,
  month: number,
  year: number,
  quantos = 1,
): Promise<number[]> {
  const { data } = await db.from('schedules')
    .select('post_number')
    .eq('client_id', clientId).eq('month', month).eq('year', year)
    .order('post_number', { ascending: false })
    .limit(1)

  const maior = data?.[0]?.post_number ?? 0
  return Array.from({ length: quantos }, (_, i) => maior + 1 + i)
}
