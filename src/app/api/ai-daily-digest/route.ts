import { NextRequest, NextResponse } from 'next/server'

export async function POST(req: NextRequest) {
  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) return NextResponse.json({ error: 'GEMINI_API_KEY não configurada' }, { status: 503 })

  const { memberName, items } = await req.json()
  if (!Array.isArray(items) || items.length === 0) {
    return NextResponse.json({ digest: '' })
  }

  const itemsText = items.slice(0, 20).map((it: any) =>
    `- ${it.kind} "${it.title}" (${it.clientName || 'sem cliente'})${it.ajuste ? ' — AJUSTE PEDIDO PELO CLIENTE' : ''}${it.overdue ? ' — ATRASADO' : ''}${it.dueDate ? ` — prazo ${it.dueDate}` : ''}`
  ).join('\n')

  const prompt = `Você é um assistente de produtividade de uma agência de social media. Escreva só a CONTINUAÇÃO de uma frase que já começa com "Para você, ${memberName || 'a pessoa'}: " — não repita o nome nem cumprimente, comece direto pelo resumo (ex: "1 ajuste pedido pelo cliente e 8 reels pra produzir."). Máximo 25 palavras, em português. Resuma o que é mais urgente da lista de pendências abaixo, agrupando por tipo de conteúdo quando fizer sentido (ex: "8 reels" em vez de "8 posts"). Priorize: ajustes pedidos pelo cliente primeiro, depois atrasados, depois o resto. Não invente nada que não está na lista. Não use markdown. Termine com ponto final. Responda só com essa continuação.

Pendências:
${itemsText}`

  try {
    const res = await fetch(
      'https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-lite-latest:generateContent',
      {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-goog-api-key': apiKey },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { maxOutputTokens: 200, temperature: 0.4, thinkingConfig: { thinkingBudget: 0 } },
        }),
      }
    )

    if (!res.ok) {
      if (res.status === 429) {
        return NextResponse.json({ error: 'Limite gratuito diário da IA foi atingido.' }, { status: 429 })
      }
      const err = await res.text()
      console.error('ai-daily-digest Gemini error:', err)
      return NextResponse.json({ error: 'Não consegui gerar o resumo agora.' }, { status: 500 })
    }

    const data = await res.json()
    const digest = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || ''
    return NextResponse.json({ digest })
  } catch (e) {
    return NextResponse.json({ error: 'Erro ao chamar API do Gemini' }, { status: 500 })
  }
}
