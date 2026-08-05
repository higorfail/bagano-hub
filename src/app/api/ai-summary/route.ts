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

  // 50 caracteres, não 70: o resumo vive em UMA linha dentro do card, e a
  // largura útil ali é a coluna menos a prévia menos o respiro — na coluna
  // estreita sobra pouco. Com 70 a frase quase sempre terminava em reticências;
  // com 50 ela cabe inteira na maioria dos casos, e o corte vira exceção.
  const prompt = `Resuma o texto abaixo em 1 frase bem curta e direta, em português, com no MÁXIMO 50 caracteres — conte os caracteres e reescreva se passar. Ela precisa caber inteira numa única linha estreita de um card, então prefira sempre a versão mais curta. Diga a ação ou o objeto principal, nada de contexto. Não use aspas, listas, tags nem introduções como "este texto fala sobre" ou "resumo:". Responda apenas com a frase pura, sem ponto final.

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
          // Sem thinkingConfig: o modelo por trás de gemini-flash-lite-latest
          // passou a recusar thinkingBudget:0 (INVALID_ARGUMENT), o que
          // derrubou silenciosamente TODAS as chamadas de IA do Hub.
          generationConfig: { maxOutputTokens: 100, temperature: 0.3 },
        }),
      }
    )
  }

  try {
    let res = await callGemini('gemini-flash-lite-latest')
    if (res.status === 503) res = await callGemini('gemini-flash-lite-latest')

    if (!res.ok) {
      const err = await res.text()
      console.error('ai-summary Gemini error:', res.status, err)
      if (res.status === 429) {
        return NextResponse.json({ error: 'Limite de uso da IA atingido no momento. Tente de novo em instantes ou mais tarde.' }, { status: 429 })
      }
      return NextResponse.json({ error: 'Não consegui gerar o resumo agora.' }, { status: 500 })
    }

    const data = await res.json()
    const summary = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || ''
    return NextResponse.json({ summary })
  } catch (e) {
    return NextResponse.json({ error: 'Erro ao chamar API do Gemini' }, { status: 500 })
  }
}
