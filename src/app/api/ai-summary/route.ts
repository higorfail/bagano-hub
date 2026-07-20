import { NextRequest, NextResponse } from 'next/server'

export async function POST(req: NextRequest) {
  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) {
    return NextResponse.json({ error: 'GEMINI_API_KEY não configurada' }, { status: 503 })
  }

  const { text, title } = await req.json()
  if (!text || !String(text).trim()) {
    return NextResponse.json({ summary: '' })
  }

  const prompt = `Resuma o texto abaixo em 1 frase bem curta e direta (máximo 70 caracteres, sem exceção), em português, com a informação mais importante para quem vai bater o olho num card de trabalho. Não use aspas, listas, tags nem introduções como "este texto fala sobre" ou "resumo:". Responda apenas com a frase pura, sem ponto final.

Título: ${title || 'sem título'}
Texto: ${text}`

  // gemini-flash-latest costuma ficar sobrecarregado (503) em horários de pico —
  // flash-lite é mais estável e sobra pra uma tarefa simples como essa. Ainda
  // assim, tenta de novo uma vez se vier 503 antes de desistir.
  async function callGemini(model: string) {
    return fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-goog-api-key': apiKey },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { maxOutputTokens: 100, temperature: 0.3, thinkingConfig: { thinkingBudget: 0 } },
        }),
      }
    )
  }

  try {
    let res = await callGemini('gemini-flash-lite-latest')
    if (res.status === 503) res = await callGemini('gemini-flash-lite-latest')

    if (!res.ok) {
      if (res.status === 429) {
        return NextResponse.json({ error: 'Limite gratuito diário da IA foi atingido. Tente de novo mais tarde.' }, { status: 429 })
      }
      const err = await res.text()
      console.error('ai-summary Gemini error:', err)
      return NextResponse.json({ error: 'Não consegui gerar o resumo agora.' }, { status: 500 })
    }

    const data = await res.json()
    const summary = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || ''
    return NextResponse.json({ summary })
  } catch (e) {
    return NextResponse.json({ error: 'Erro ao chamar API do Gemini' }, { status: 500 })
  }
}
