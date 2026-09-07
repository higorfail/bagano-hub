import { NextRequest, NextResponse } from 'next/server'
import { usuarioLogado } from '@/lib/apiAuth'
import { GEMINI } from '@/lib/gemini'

// Tendências do nicho, buscadas de verdade.
//
// O Gemini sozinho não serve pra isso: ele responde do que aprendeu até o corte
// de treino, e tendência velha é pior que tendência nenhuma — a equipe produz
// uma peça pra um som que já morreu. Por isso `google_search`, o mesmo
// mecanismo que o gerador de manual já usa: o modelo busca antes de responder.
//
// Cada tendência sai com FONTE. Sem ela não dá pra separar o que foi lido do
// que foi inventado, e a primeira tendência inventada que alguém produzir
// derruba a confiança na tela inteira.
//
// Limite honesto: a busca lê o que o Google indexou. Pinterest, blogs de
// marketing, portais de gastronomia e matérias sobre TikTok saem bem;
// INSTAGRAM sai raso, porque a Meta bloqueia rastreador. Ler o Instagram dos
// concorrentes de verdade depende da Business Discovery API da Meta, que exige
// App Review aprovado.

const CATEGORIAS = ['formato', 'audio', 'assunto', 'data', 'estetica']

export async function POST(req: NextRequest) {
  if (!await usuarioLogado()) return NextResponse.json({ error: 'não autorizado' }, { status: 401 })
  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) return NextResponse.json({ error: 'GEMINI_API_KEY não configurada' }, { status: 503 })

  const { concorrentes = [], quantas = 8 } = await req.json().catch(() => ({}))

  const hoje = new Date()
  const mes = hoje.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })
  // Janela explícita. Sem ela o modelo devolve conselho atemporal — "use
  // vídeos curtos", "mostre os bastidores" — que não é tendência, é manual.
  const desde = new Date(hoje.getTime() - 45 * 86400000).toLocaleDateString('pt-BR')

  const alvos = Array.isArray(concorrentes) && concorrentes.length
    ? `\nOlhe também estes perfis de restaurantes concorrentes dos nossos clientes, se alcançar o conteúdo público deles: ${concorrentes.slice(0, 25).join(', ')}`
    : ''

  const prompt = `Você pesquisa tendências de conteúdo para uma agência brasileira de social media especializada em GASTRONOMIA (restaurantes, pizzarias, sushi, sorveterias, padarias, hamburguerias).

Hoje é ${mes}. Pesquise na web o que está em alta AGORA, de ${desde} para cá.

Busque em: Pinterest (Pinterest Predicts e buscas de comida em alta), portais e blogs de marketing digital e social media, matérias sobre tendências do TikTok e do Reels, portais de gastronomia e de restaurantes, e listas de áudios em alta.${alvos}

Traga ${quantas} tendências CONCRETAS e APLICÁVEIS por um restaurante nas próximas semanas. Cada uma precisa ser algo que dá pra produzir: um formato de vídeo, um áudio, um assunto, uma data, um jeito de fotografar.

NÃO traga conselho atemporal ("poste com frequência", "mostre os bastidores", "use vídeos curtos"). Isso não é tendência, é manual — e a equipe já sabe.

Se não encontrar ${quantas} tendências REAIS e recentes, traga menos. Lista curta e verdadeira vale mais que longa e inventada. NUNCA invente uma tendência que você não encontrou na busca.

Responda APENAS com JSON válido (sem markdown, sem crases), assim:

{
  "tendencias": [
    {
      "titulo": "curto, o nome da tendência",
      "descricao": "o que é, em 1-2 frases",
      "gancho": "como um restaurante usa isso — específico, algo que dá pra produzir esta semana",
      "categoria": "um de: ${CATEGORIAS.join(' | ')}",
      "fonte": "o site ou perfil onde você viu, com URL quando tiver",
      "exemplos": ["quem já fez, se você encontrou"]
    }
  ]
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
          // Temperatura baixa, como no gerador de manual: aqui não se quer
          // criatividade, se quer o que foi encontrado.
          generationConfig: { maxOutputTokens: 4000, temperature: 0.2 },
        }),
      }
    )

    if (!res.ok) {
      const err = await res.text()
      console.error('ai-tendencias Gemini error:', res.status, err)
      if (res.status === 429) return NextResponse.json({ error: 'Limite de uso da IA atingido. Tente daqui a pouco.' }, { status: 429 })
      return NextResponse.json({ error: 'Não consegui buscar as tendências agora.' }, { status: 500 })
    }

    const data = await res.json()
    let texto = data.candidates?.[0]?.content?.parts?.map((p: any) => p.text || '').join('') || ''
    texto = texto.trim().replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/```\s*$/i, '')

    let lista: any
    try { lista = JSON.parse(texto).tendencias } catch {
      console.error('ai-tendencias JSON inválido:', texto.slice(0, 400))
      return NextResponse.json({ error: 'A IA respondeu num formato que não deu pra ler. Tente de novo.' }, { status: 502 })
    }
    if (!Array.isArray(lista)) return NextResponse.json({ error: 'A IA não devolveu tendências.' }, { status: 502 })

    // Os links que o Google devolveu junto da resposta. Quando o modelo não
    // escreve a fonte, é daqui que ela sai — e é isso que separa "li isso" de
    // "acho que existe".
    const apoios: string[] = (data.candidates?.[0]?.groundingMetadata?.groundingChunks || [])
      .map((c: any) => c?.web?.title || c?.web?.uri).filter(Boolean)

    const tendencias = lista.slice(0, 20).map((t: any) => ({
      titulo: String(t?.titulo || '').slice(0, 200),
      descricao: String(t?.descricao || ''),
      gancho: String(t?.gancho || ''),
      categoria: CATEGORIAS.includes(t?.categoria) ? t.categoria : 'assunto',
      fonte: String(t?.fonte || '') || apoios.slice(0, 2).join(' · '),
      exemplos: Array.isArray(t?.exemplos) ? t.exemplos.filter((x: any) => typeof x === 'string').slice(0, 5) : [],
    })).filter((t: any) => t.titulo)

    return NextResponse.json({ tendencias, buscadoEm: new Date().toISOString(), fontesConsultadas: apoios.slice(0, 12) })
  } catch {
    return NextResponse.json({ error: 'Erro ao chamar a API do Gemini' }, { status: 500 })
  }
}
