import { NextRequest, NextResponse } from 'next/server'

/**
 * Lê o pedido de alteração do cliente e diz O QUE ele quer mudar: a arte, a
 * legenda, as duas, ou o post inteiro. Quem conserta sai daí — ajuste de
 * legenda não é trabalho de designer.
 *
 * Ela só desloca o destino; nunca é a única guarda. Sem resposta, sem chave, ou
 * com resposta estranha, devolve alvo `null` e o hub roteia pelo tipo do post,
 * que é o comportamento de sempre. O pior caso da IA é o presente.
 */
export async function POST(req: NextRequest) {
  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) return NextResponse.json({ alvo: null })

  const { comment, postType, title } = await req.json()
  if (!comment || !String(comment).trim()) return NextResponse.json({ alvo: null })

  // As quatro saídas vieram dos pedidos reais dos clientes da Bagano. "outro"
  // não é lata de lixo: é a categoria mais comum hoje — "cancelou a feijoada,
  // pode virar outro tema" não é conserto de arte nem de texto, é o post
  // inteiro caindo, e mandar isso pro designer queima uma ida e volta.
  const prompt = `Você classifica pedidos de alteração que um cliente de agência de social media faz sobre um post já produzido.

Responda com UMA palavra, exatamente uma destas quatro:
arte — a mudança é no material visual: imagem, vídeo, foto, cor, corte, ordem das telas, ou algum texto que está DENTRO da peça
legenda — a mudança é só no texto que acompanha a publicação: legenda, copy, chamada, hashtag, erro de português na legenda
ambos — pede mudança na arte E na legenda
outro — o post inteiro cai ou muda de rumo (trocar o tema, cancelar, mudar a data, refazer com outro assunto), ou o pedido é vago demais pra saber o que mudar

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
    // Palavra fora da lista é resposta inútil, não um quinto estado: vira null
    // e cai na regra por tipo.
    const alvo = ['arte', 'legenda', 'ambos', 'outro'].find(a => bruto.startsWith(a)) || null
    return NextResponse.json({ alvo })
  } catch {
    return NextResponse.json({ alvo: null })
  }
}
