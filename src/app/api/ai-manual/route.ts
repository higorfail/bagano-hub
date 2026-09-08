import { NextRequest, NextResponse } from 'next/server'
import { usuarioLogado } from '@/lib/apiAuth'
import { GEMINI } from '@/lib/gemini'

export async function POST(req: NextRequest) {
  // Sem isto a rota respondia a qualquer requisição da internet — a chave do
  // Gemini é nossa, e a cota também.
  if (!await usuarioLogado()) return NextResponse.json({ error: 'não autorizado' }, { status: 401 })
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
      `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI.FLASH}:generateContent`,
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
      const err = await res.text()
      console.error('ai-manual Gemini error:', res.status, err)
      if (res.status === 429) {
        // Não é "tente mais tarde". Esta rota usa `google_search`, e o plano
        // da nossa chave do Gemini não inclui essa ferramenta: medido em dois
        // dias seguidos, chamada simples devolve 200 e a mesma com busca
        // devolve 429 na PRIMEIRA tentativa, em todos os modelos. Dizer "tente
        // mais tarde" fazia a equipe tentar de novo pra sempre.
        //
        // A saída sem mexer no plano é a mesma que Tendências usa: buscar as
        // fontes no servidor e mandar o texto pro modelo. Aqui é mais difícil
        // porque as fontes são o site, o Instagram e o iFood do cliente.
        return NextResponse.json({
          error: 'A busca na web não está liberada no plano atual da chave do Gemini — não adianta tentar de novo. Dá pra preencher o manual à mão pela própria tela (Começar em branco).',
        }, { status: 429 })
      }
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
