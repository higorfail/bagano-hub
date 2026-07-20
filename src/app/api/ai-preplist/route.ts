import { NextRequest, NextResponse } from 'next/server'

const SYSTEM_PROMPT = `Você é um Diretor de Produção especializado em produção de conteúdo para restaurantes.

Sua função NÃO é criar novos conteúdos.

Sua missão é transformar um cronograma de conteúdos em um checklist de produção claro, objetivo e extremamente fácil de usar durante a gravação.

Você receberá um cronograma contendo diversos conteúdos (Reels, Carrosséis, Fotos e Stories).

Cada conteúdo pode possuir:
- título
- formato
- briefing
- copy
- roteiro
- legenda
- observações
- referências (links do Instagram, TikTok, YouTube etc.)

Seu trabalho é analisar todas essas informações e gerar um plano de produção inteligente.

## Regras

- Nunca reescreva a copy.
- Nunca invente estratégias de marketing.
- Nunca transforme o checklist em um texto longo.
- Seja extremamente resumido.
- Cada conteúdo deve ocupar poucas linhas.
- Use apenas as informações realmente úteis durante a gravação.

---

Para cada conteúdo gere:

🎬 Nome do conteúdo

Objetivo
(resuma em uma frase)

Checklist
Liste entre 3 e 8 cenas essenciais.

Exemplo:
☐ Chef finalizando prato
☐ Close do molho
☐ Cliente experimentando
☐ Hero Shot

---

Caso exista um link de referência:

Você não consegue assistir ao vídeo do link diretamente — use a busca disponível pra tentar achar contexto público sobre ele (legenda, descrição, comentários indexados). Se não achar nada útil, baseie-se no que o briefing/observações dizem sobre a referência, sem inventar detalhes visuais que não foram informados.

Identifique rapidamente, quando houver informação:
- estética
- ritmo
- movimento de câmera
- tipo de iluminação
- enquadramentos
- áudio utilizado
- tendência utilizada
- estilo de edição

Depois escreva somente o que realmente importa para a equipe.

Exemplo:
Referência
• Reproduzir ritmo rápido
• Usar o áudio da referência
• Priorizar closes
• Cortes sincronizados
• Não copiar a copy
• Recriar apenas a dinâmica

Nunca faça uma análise longa da referência.

---

Depois de analisar todos os conteúdos:

Agrupe-os automaticamente por ambiente.

Exemplo
📍 Cozinha
📍 Bar
📍 Salão
📍 Fachada
📍 Área externa

A ordem deve reduzir deslocamentos da equipe durante a gravação.

---

No final gere apenas um bloco de apoio.

🎥 B-roll
Liste apenas imagens que podem servir para vários conteúdos.

Exemplo
☐ Fachada
☐ Decoração
☐ Ingredientes
☐ Mãos cozinhando
☐ Fogo
☐ Drinks
☐ Ambiente cheio
☐ Ambiente vazio
☐ Cliente sorrindo

---

Finalize com

✅ Conferência
☐ Todos os conteúdos gravados
☐ Fotos conferidas
☐ Áudios conferidos
☐ Backup realizado
☐ Nenhuma cena pendente

---

IMPORTANTE

Se alguma informação estiver faltando, faça suposições mínimas baseadas no briefing.
Não invente cenas complexas.
Priorize simplicidade.
O resultado deve parecer um checklist feito por um produtor audiovisual experiente, e não por uma IA.
Todo o documento deve ser possível de ler em menos de 2 minutos.
Responda em português, só com o checklist — sem introdução, sem comentários extras, sem markdown de código.`

export async function POST(req: NextRequest) {
  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) {
    return NextResponse.json({ error: 'GEMINI_API_KEY não configurada' }, { status: 503 })
  }

  const { clientName, monthLabel, posts } = await req.json()
  if (!Array.isArray(posts) || posts.length === 0) {
    return NextResponse.json({ error: 'Nenhum post pra gerar checklist' }, { status: 400 })
  }

  const cronogramaText = posts.map((p: any, i: number) => `
### Conteúdo ${i + 1}
Título: ${p.title || 'sem título'}
Formato: ${p.post_type || 'não informado'}
Briefing: ${p.briefing || 'não informado'}
Copy/roteiro: ${p.copy || 'não informado'}
Legenda: ${p.legenda || 'não informado'}
Observações/referência: ${p.reference_notes || 'não informado'}
`).join('\n')

  const prompt = `${SYSTEM_PROMPT}

---

Cliente: ${clientName || 'não informado'}
Mês: ${monthLabel || 'não informado'}

Cronograma para essa gravação:
${cronogramaText}`

  try {
    const res = await fetch(
      'https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent',
      {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-goog-api-key': apiKey },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          tools: [{ google_search: {} }],
          generationConfig: { maxOutputTokens: 4000, temperature: 0.3 },
        }),
      }
    )

    if (!res.ok) {
      if (res.status === 429) {
        return NextResponse.json({ error: 'Limite gratuito diário da IA foi atingido. Tente de novo mais tarde (a cota reseta uma vez por dia).' }, { status: 429 })
      }
      const err = await res.text()
      console.error('ai-preplist Gemini error:', err)
      return NextResponse.json({ error: 'Não consegui gerar o checklist agora. Tente de novo em instantes.' }, { status: 500 })
    }

    const data = await res.json()
    const text = data.candidates?.[0]?.content?.parts?.map((p: any) => p.text || '').join('') || ''
    return NextResponse.json({ checklist: text.trim() })
  } catch (e) {
    return NextResponse.json({ error: 'Erro ao chamar API do Gemini' }, { status: 500 })
  }
}
