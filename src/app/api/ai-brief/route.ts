import { NextRequest, NextResponse } from 'next/server'

export async function POST(req: NextRequest) {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    return NextResponse.json({ error: 'ANTHROPIC_API_KEY não configurada' }, { status: 503 })
  }

  const { title, post_type, funil, briefing, copy } = await req.json()

  const prompt = `Você é um assistente de produção de conteúdo para redes sociais.
Gere uma nota de produção concisa para o designer/editor que vai criar este post. Escreva em português, em bullet points (use • como marcador), máximo 4 bullets curtos e diretos. Foque em: formato técnico, tom visual, elementos essenciais, materiais disponíveis ou referências mencionadas.

Dados do post:
- Tipo: ${post_type}
- Título: ${title}
- Funil: ${funil || 'não especificado'}
- Briefing aprovado: ${briefing || 'não informado'}
- Copy/roteiro: ${copy || 'não informado'}

Responda APENAS com os bullets, sem título ou explicação.`

  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 300,
        messages: [{ role: 'user', content: prompt }],
      }),
    })

    if (!res.ok) {
      const err = await res.text()
      return NextResponse.json({ error: err }, { status: 500 })
    }

    const data = await res.json()
    const brief = data.content?.[0]?.text || ''
    return NextResponse.json({ brief })
  } catch (e) {
    return NextResponse.json({ error: 'Erro ao chamar API' }, { status: 500 })
  }
}
