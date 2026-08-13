import { NextRequest, NextResponse } from 'next/server'

/**
 * Lê o pedido de alteração do cliente e responde UMA coisa: esse pedido mexe na
 * legenda?
 *
 * O destino da peça já é certo pelo tipo do post — reels vai pro Editor, post,
 * story e carrossel vão pro Designer, e isso não precisa de IA. A única
 * pergunta que sobra é se a Estratégia, que escreve, entra junto.
 *
 * Uma pergunta de sim ou não é muito mais confiável que uma classificação de
 * quatro categorias, e é tudo que o roteamento consome. Sem chave, sem resposta
 * ou com resposta estranha, devolve `null` e o pedido segue só pra quem produziu
 * a peça — o comportamento de sempre. O pior caso da IA é o presente.
 */
export async function POST(req: NextRequest) {
  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) return NextResponse.json({ alvo: null })

  const { comment, postType, title } = await req.json()
  if (!comment || !String(comment).trim()) return NextResponse.json({ alvo: null })

  // Só as duas saídas que mudam o destino. Pedido de tema novo ("cancela a
  // feijoada, pode ser outro assunto") continua sendo "arte": é a mesma pessoa
  // que vai refazer a peça.
  const prompt = `Um cliente de uma agência de social media pediu alteração num post já produzido. Leia o pedido e responda se ele envolve mudar o TEXTO DA LEGENDA da publicação.

Responda com UMA palavra, exatamente uma destas duas:
legenda — o pedido inclui mudar, reescrever ou corrigir a legenda, a copy, a chamada ou as hashtags da publicação
arte — o pedido é sobre qualquer outra coisa: a imagem, o vídeo, a foto, a cor, o corte, o texto que está dentro da peça, o tema do post, a data, ou é vago demais

Na dúvida, responda arte.

Tipo do post: ${postType || 'não informado'}
Título do post: ${title || 'sem título'}
Pedido do cliente: "${String(comment).slice(0, 1500)}"

Responda só a palavra, sem pontuação, sem explicação.`

  async function callGemini() {
    return fetch('https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-lite-latest:generateContent', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-goog-api-key': apiKey as string },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { maxOutputTokens: 10, temperature: 0 },
      }),
    })
  }

  try {
    let res = await callGemini()
    if (res.status === 503) res = await callGemini()
    if (!res.ok) {
      console.error('ai-ajuste-alvo Gemini error:', res.status, await res.text())
      return NextResponse.json({ alvo: null })
    }
    const data = await res.json()
    const bruto = (data.candidates?.[0]?.content?.parts?.[0]?.text || '').trim().toLowerCase()
    // Palavra fora da lista é resposta inútil, não um terceiro estado: vira null
    // e cai na regra por tipo.
    const alvo = ['arte', 'legenda'].find(a => bruto.startsWith(a)) || null
    return NextResponse.json({ alvo })
  } catch {
    return NextResponse.json({ alvo: null })
  }
}
