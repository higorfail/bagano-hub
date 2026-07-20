import { NextRequest, NextResponse } from 'next/server'

export async function POST(req: NextRequest) {
  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) {
    return NextResponse.json({ error: 'GEMINI_API_KEY não configurada' }, { status: 503 })
  }

  const { name, instagram, website } = await req.json()
  if (!name?.trim()) {
    return NextResponse.json({ error: 'Nome do cliente é obrigatório' }, { status: 400 })
  }

  const prompt = `Você é um pesquisador montando um manual de marca para uma agência de social media. Pesquise na web informações REAIS e VERIFICÁVEIS sobre o negócio abaixo e monte um rascunho estruturado.

Negócio: ${name}
${instagram ? `Instagram: ${instagram}` : ''}
${website ? `Site: ${website}` : ''}

Busque especificamente em:
- Site oficial (se houver)
- Ficha do Google / Google Maps (endereço, telefone, horário de funcionamento, avaliações)
- Instagram (bio, destaques, posts recentes — conceito, tom, promoções)
- Aplicativos de delivery (iFood, Rappi, etc.) — ESSA é a melhor fonte pra cardápio detalhado com preços
- Notícias, blogs ou reportagens que mencionem o negócio (história, diferenciais)

Monte o cardápio (campo "menu") o mais completo possível, com categorias e itens reais com preço quando encontrar — não invente itens ou preços que não encontrou, apenas omita o que não achar.

Responda APENAS com um JSON válido (sem markdown, sem \`\`\`, sem comentários), no formato exato abaixo. Se não encontrar informação para um campo, deixe string vazia "", array vazio [] ou objeto vazio {} — NUNCA invente dados que não pesquisou:

{
  "tagline": "",
  "concept": "",
  "history": "",
  "pillars": [{ "name": "", "description": "" }],
  "address": "",
  "phone": "",
  "hours": {},
  "instagram": "",
  "website": "",
  "delivery_links": [],
  "menu": [{ "category": "", "items": [{ "name": "", "price": "", "description": "" }] }],
  "differentials": [],
  "promotions": [{ "title": "", "description": "" }],
  "tone_of_voice": { "personality": "", "use_words": [], "avoid_words": [], "taglines": [] }
}`

  try {
    const res = await fetch(
      'https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent',
      {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-goog-api-key': apiKey },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          tools: [{ google_search: {} }],
          generationConfig: { maxOutputTokens: 4000, temperature: 0.2 },
        }),
      }
    )

    if (!res.ok) {
      if (res.status === 429) {
        return NextResponse.json({ error: 'Limite gratuito diário da IA foi atingido. Tente de novo mais tarde (a cota reseta uma vez por dia).' }, { status: 429 })
      }
      const err = await res.text()
      console.error('ai-manual Gemini error:', err)
      return NextResponse.json({ error: 'Não consegui gerar o rascunho agora. Tente de novo em instantes.' }, { status: 500 })
    }

    const data = await res.json()
    let text = data.candidates?.[0]?.content?.parts?.map((p: any) => p.text || '').join('') || ''
    // Remove code fences caso o modelo ignore a instrução e ainda embrulhe em ```json
    text = text.trim().replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/```\s*$/i, '')
    return NextResponse.json({ manual: text })
  } catch (e) {
    return NextResponse.json({ error: 'Erro ao chamar API do Gemini' }, { status: 500 })
  }
}
