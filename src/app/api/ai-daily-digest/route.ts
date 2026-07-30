import { NextRequest, NextResponse } from 'next/server'

export async function POST(req: NextRequest) {
  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) return NextResponse.json({ error: 'GEMINI_API_KEY não configurada' }, { status: 503 })

  const { memberName, items } = await req.json()
  if (!Array.isArray(items) || items.length === 0) {
    return NextResponse.json({ digest: '' })
  }

  const itemsText = items.slice(0, 20).map((it: any) => {
    const tipo = it.postType || it.kind
    const etiquetas = Array.isArray(it.labels) && it.labels.length ? ` — etiquetas: ${it.labels.join(', ')}` : ''
    return `- ${tipo} "${it.title}" (${it.clientName || 'sem cliente'})${it.ajuste ? ' — AJUSTE PEDIDO PELO CLIENTE' : ''}${it.overdue ? ' — ATRASADO' : ''}${it.dueDate ? ` — prazo ${it.dueDate}` : ''}${etiquetas}`
  }).join('\n')

  const prompt = `Você é um assistente de produtividade de uma agência de social media. Escreva só a CONTINUAÇÃO de uma frase que já começa com "Para você, ${memberName || 'a pessoa'}: " — não repita o nome nem cumprimente, comece direto pelo resumo. Máximo 30 palavras, em português. Termine com ponto final. Não use markdown. Responda só com essa continuação.

Regras:
- Agrupe por tipo de conteúdo usando o nome real (reels, carrossel, story, post), não "posts" genérico.
- As ETIQUETAS dizem o trabalho que falta em cada card. Use-as pra descrever a tarefa em português natural, não copie o texto da etiqueta cru: "CRIAR LEGENDA" vira "criar a legenda", "Criar o design" vira "criar o design", "AGENDAR" vira "agendar". Ex: "6 reels do Mundo Selvagem — 4 pra criar legenda e 2 pro design."
- Priorize: ajustes pedidos pelo cliente primeiro, depois atrasados, depois o resto.
- Cite nome de cliente quando ajudar a localizar o trabalho.
- Não invente nada que não está na lista.

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
