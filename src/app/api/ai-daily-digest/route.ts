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
    // Diz explicitamente quando NÃO há etiqueta. Mandar o campo vazio deixava
    // um buraco que o modelo preenchia sozinho — foi assim que ele passou a
    // afirmar "criar a legenda" pra cards que não pediam legenda nenhuma.
    const etiquetas = Array.isArray(it.labels) && it.labels.length
      ? ` — etiquetas: ${it.labels.join(', ')}`
      : ' — sem etiqueta (tarefa desconhecida)'
    const campanha = it.campaign ? ` — campanha: ${it.campaign}` : ''
    return `- ${tipo} "${it.title}" (${it.clientName || 'sem cliente'})${it.ajuste ? ' — AJUSTE PEDIDO PELO CLIENTE' : ''}${it.overdue ? ' — ATRASADO' : ''}${it.dueDate ? ` — prazo ${it.dueDate}` : ''}${campanha}${etiquetas}`
  }).join('\n')

  const prompt = `Você é um assistente de produtividade de uma agência de social media. Escreva só a CONTINUAÇÃO de uma frase que já começa com "Para você, ${memberName || 'a pessoa'}: " — não repita o nome nem cumprimente, comece direto pelo resumo. Máximo 30 palavras, em português. Termine com ponto final. Não use markdown. Responda só com essa continuação.

Regras:
- Agrupe por tipo de conteúdo usando o nome real (reels, carrossel, story, post), não "posts" genérico.
- As ETIQUETAS dizem o trabalho que falta em cada card. Use-as pra descrever a tarefa em português natural, não copie o texto da etiqueta cru: "CRIAR LEGENDA" vira "criar a legenda", "Criar o design" vira "criar o design", "AGENDAR" vira "agendar".
- Item SEM etiqueta não tem tarefa conhecida: cite só o tipo e o cliente, sem inventar o que falta fazer.
- Quando um item for de CAMPANHA (Dia dos Pais, Natal…), cite a campanha junto — é o que dá o senso de prazo real. Não invente campanha pra item que não tem.
- Priorize: ajustes pedidos pelo cliente primeiro, depois atrasados, depois o resto.
- Cite nome de cliente quando ajudar a localizar o trabalho.

FORMATO (é só a forma da frase — os nomes, números e tarefas abaixo são
inventados e NÃO podem aparecer na resposta):
  «N» «tipo» de «cliente» pra «tarefa da etiqueta», mais «N» «tipo» de «cliente».

REGRA MAIS IMPORTANTE: todo cliente, número, tipo e tarefa da sua resposta tem
que sair da lista de Pendências abaixo. Se algo não está lá, não existe.

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
          // Sem thinkingConfig: o modelo por trás de gemini-flash-lite-latest
          // passou a recusar thinkingBudget:0 (INVALID_ARGUMENT), o que
          // derrubou silenciosamente TODAS as chamadas de IA do Hub.
          generationConfig: { maxOutputTokens: 200, temperature: 0.4 },
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
