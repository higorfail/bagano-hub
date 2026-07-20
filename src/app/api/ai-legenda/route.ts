import { NextRequest, NextResponse } from 'next/server'

export async function POST(req: NextRequest) {
  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) {
    return NextResponse.json({ error: 'GEMINI_API_KEY não configurada' }, { status: 503 })
  }

  const { title, post_type, briefing, copy, manual } = await req.json()
  if (!briefing?.trim() && !copy?.trim()) {
    return NextResponse.json({ legenda: '' })
  }

  const tov = manual?.tone_of_voice
  const manualContext = manual ? `
Contexto da marca (manual do cliente):
- Conceito: ${manual.concept || 'não informado'}
- Tagline: ${manual.tagline || 'não informado'}
- Personalidade de tom de voz: ${tov?.personality || 'não informado'}
- Palavras que a marca usa: ${tov?.use_words?.join(', ') || 'não informado'}
- Palavras que a marca evita: ${tov?.avoid_words?.join(', ') || 'não informado'}
- Taglines de referência: ${tov?.taglines?.join(' · ') || 'não informado'}
- Pilares editoriais: ${manual.editorial_pillars?.map((p: any) => p.name).join(', ') || 'não informado'}
` : ''

  const prompt = `Você é um social media escrevendo a legenda de um post de Instagram para uma marca.
Escreva uma sugestão de legenda em português, natural, no tom da marca descrito abaixo. Pode incluir emojis com moderação e uma chamada pra ação no final, se fizer sentido. Não use hashtags a menos que o briefing peça. Não invente informações que não estão no briefing/copy.

Tipo de post: ${post_type || 'não especificado'}
Título/tema do post: ${title || 'sem título'}
Briefing: ${briefing || 'não informado'}
Copy/roteiro de referência: ${copy || 'não informado'}
${manualContext}
Responda APENAS com o texto da legenda pronta, sem explicações, sem aspas, sem markdown.`

  async function callGemini(model: string) {
    return fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-goog-api-key': apiKey },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { maxOutputTokens: 500, temperature: 0.7, thinkingConfig: { thinkingBudget: 0 } },
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
      console.error('ai-legenda Gemini error:', err)
      return NextResponse.json({ error: 'Não consegui gerar uma sugestão agora.' }, { status: 500 })
    }

    const data = await res.json()
    const legenda = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || ''
    return NextResponse.json({ legenda })
  } catch (e) {
    return NextResponse.json({ error: 'Erro ao chamar API do Gemini' }, { status: 500 })
  }
}
