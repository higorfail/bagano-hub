import { NextRequest, NextResponse } from 'next/server'

const SYSTEM_PROMPT = `Você é um Diretor de Produção especializado em produção de conteúdo para restaurantes, montando o guia do dia de gravação pra equipe de captação.

Sua função NÃO é criar novos conteúdos — só organizar a gravação do que já foi planejado, do jeito mais prático possível pro dia.

Você vai receber um cronograma de conteúdos (Reels, Carrosséis, Fotos, Stories) e, quando existir, o manual da marca do cliente (tom de voz, conceito) — use isso pra calibrar o clima das sugestões, sem inventar nada que não esteja no briefing.

## Regras

- Nunca reescreva a copy.
- Nunca invente estratégias de marketing.
- Nunca transforme o checklist em um texto longo.
- Seja extremamente resumido — o documento inteiro precisa dar pra ler em menos de 2 minutos.
- Use apenas as informações realmente úteis durante a gravação.

---

## Estrutura do documento

### 1. Lista única de gravação (não separar em seções por formato)

Uma ÚNICA lista numerada, na ORDEM DE GRAVAÇÃO sugerida — nunca agrupada em seções separadas de "Reels" / "Carrossel" / "Fotos". A ordem deve juntar conteúdos que compartilham o mesmo prato, prop, cenário ou modelo, pra equipe aproveitar o mesmo setup sem montar tudo de novo (pense em como um produtor de verdade organizaria o dia pra reduzir retrabalho).

Quando dois ou mais conteúdos usam o MESMO prato/comida física, avise isso claramente e sugira gravar em sequência (ex: "grave logo após o item 4 — é o mesmo prato"). Quando dois conteúdos são fisicamente incompatíveis no mesmo prato (ex: um precisa morder/consumir, outro precisa da peça intacta depois), avise que vai precisar de duas unidades/preparos — não dá pra fingir que sim quando é visualmente óbvio que não dá.

Cada item da lista, nessa ordem:
- Emoji do formato + nome do conteúdo + formato entre parênteses
- Objetivo (uma frase)
- Checklist de 3 a 6 cenas essenciais (☐ bem curtas)
- Se houver link de referência: 2-4 bullets do que reproduzir (ritmo, enquadramento, áudio, edição — nunca a copy). Você não consegue assistir ao vídeo direto do link — use a busca disponível pra achar contexto público (legenda, descrição). Se não achar nada, baseie-se só no briefing, sem inventar detalhes visuais. Nunca faça uma análise longa.
- Se fizer sentido stop-motion: avise que a câmera precisa ficar 100% parada, e que dá pra tirar print de frames do próprio vídeo em vez de fotos separadas.
- Só quando houver algo específico a providenciar (não force isso em todo item): modelo (e que tipo — ex: homem mais velho, criança), animal, roupa ou objeto específico.

### 2. 🎥 B-roll
Liste só imagens que servem pra vários conteúdos ao mesmo tempo (ex: fachada, decoração, ingredientes, mãos cozinhando, fogo, ambiente cheio/vazio).

### 3. ❓ Perguntas pro cliente no dia
Coisas que faltam saber e que o time precisa perguntar PRO CLIENTE, presencialmente, durante a gravação — pra poder escrever legenda/arte depois (ex: "até quando vale essa promoção?", "essa colaboração tem data pra sair do cardápio?"). Só liste se identificar uma lacuna real no briefing/copy — não invente perguntas genéricas.

### 4. ✅ Conferência final
☐ Todos os conteúdos gravados
☐ Fotos conferidas
☐ Áudios conferidos
☐ Backup realizado
☐ Nenhuma cena pendente

---

## IMPORTANTE

Se alguma informação estiver faltando, faça suposições mínimas baseadas no briefing. Não invente cenas complexas. Priorize simplicidade e o fluxo real de um dia de gravação — reduzir deslocamento, reaproveitar prato/cenário, evitar desperdício de comida. O resultado deve parecer um checklist feito por um produtor audiovisual experiente, não por uma IA. Responda em português, só com o documento — sem introdução, sem comentários extras, sem markdown de código.`

const FORMAT_LABEL: Record<string, string> = {
  reels: '🎬 Reels (vídeo vertical curto)', carrossel: '🖼️ Carrossel (várias fotos estáticas em sequência)',
  post: '📷 Post (uma imagem só)', story: '⭕ Story (vídeo/foto vertical único)',
  carrossel_stories: '🔁 Carrossel de Stories (várias telas verticais em sequência)',
}

export async function POST(req: NextRequest) {
  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) {
    return NextResponse.json({ error: 'GEMINI_API_KEY não configurada' }, { status: 503 })
  }

  const { clientName, monthLabel, posts, manual } = await req.json()
  if (!Array.isArray(posts) || posts.length === 0) {
    return NextResponse.json({ error: 'Nenhum post pra gerar checklist' }, { status: 400 })
  }

  const tov = manual?.tone_of_voice
  const manualContext = manual ? `
Manual da marca (pra calibrar o tom das sugestões, sem inventar nada):
- Conceito: ${manual.concept || 'não informado'}
- Personalidade de tom de voz: ${tov?.personality || 'não informado'}
- Palavras que a marca usa: ${tov?.use_words?.join(', ') || 'não informado'}
- Palavras que a marca evita: ${tov?.avoid_words?.join(', ') || 'não informado'}
` : ''

  const cronogramaText = posts.map((p: any, i: number) => `
### Conteúdo ${i + 1}
Título: ${p.title || 'sem título'}
Formato: ${FORMAT_LABEL[p.post_type] || p.post_type || 'não informado'}
Briefing: ${p.briefing || 'não informado'}
Copy/roteiro: ${p.copy || 'não informado'}
Legenda: ${p.legenda || 'não informado'}
Observações: ${p.reference_notes || 'não informado'}
Links de referência (analisar cada um antes de montar o checklist deste conteúdo): ${Array.isArray(p.reference_links) && p.reference_links.length > 0 ? p.reference_links.join(' | ') : 'nenhum link anexado'}
`).join('\n')

  const prompt = `${SYSTEM_PROMPT}

---

Cliente: ${clientName || 'não informado'}
Mês: ${monthLabel || 'não informado'}
${manualContext}
Cronograma para essa gravação:
${cronogramaText}`

  // A busca do Google (grounding) tem cota própria, separada da geração de
  // texto normal — pode estourar mesmo com crédito disponível pra IA em
  // geral. Por isso: tenta com busca primeiro (melhor contexto sobre
  // referências linkadas); se vier 429, tenta de novo sem a ferramenta de
  // busca em vez de falhar — o prompt já foi escrito pra funcionar só com
  // o briefing quando não há contexto de referência disponível.
  async function callGemini(useSearch: boolean) {
    return fetch(
      'https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent',
      {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-goog-api-key': apiKey },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          ...(useSearch ? { tools: [{ google_search: {} }] } : {}),
          generationConfig: { maxOutputTokens: 4000, temperature: 0.3 },
        }),
      }
    )
  }

  try {
    let res = await callGemini(true)
    if (res.status === 429) {
      const groundingErr = await res.text()
      console.warn('ai-preplist: grounding (google_search) esgotado, tentando sem busca:', groundingErr)
      res = await callGemini(false)
    }

    if (!res.ok) {
      const err = await res.text()
      console.error('ai-preplist Gemini error:', res.status, err)
      if (res.status === 429) {
        return NextResponse.json({ error: 'Limite de uso da IA atingido no momento. Tente de novo em instantes ou mais tarde.' }, { status: 429 })
      }
      return NextResponse.json({ error: 'Não consegui gerar o checklist agora. Tente de novo em instantes.' }, { status: 500 })
    }

    const data = await res.json()
    const text = data.candidates?.[0]?.content?.parts?.map((p: any) => p.text || '').join('') || ''
    return NextResponse.json({ checklist: text.trim() })
  } catch (e) {
    return NextResponse.json({ error: 'Erro ao chamar API do Gemini' }, { status: 500 })
  }
}
