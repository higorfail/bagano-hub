import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

export async function POST(req: NextRequest) {
  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) {
    return NextResponse.json({ error: 'GEMINI_API_KEY não configurada' }, { status: 503 })
  }

  const { title, post_type, briefing, copy, manual, clientId } = await req.json()
  if (!briefing?.trim() && !copy?.trim()) {
    return NextResponse.json({ legenda: '' })
  }

  // Legendas reais desta marca, como referência de ESTILO.
  //
  // O manual descreve o tom em abstrato ("personalidade", "palavras que usa"),
  // mas ninguém escreve a partir de adjetivos. O hub já guarda centenas de
  // legendas escritas pela equipe E aprovadas pelo cliente — é o retrato mais
  // fiel da voz da marca que existe, e melhor que o Instagram: o perfil tem
  // posts antigos, de antes da agência, e coisas que ninguém aprovaria hoje.
  let voiceSamples: string[] = []
  if (clientId) {
    const { data } = await supabase
      .from('schedules')
      .select('legenda, created_at')
      .eq('client_id', clientId)
      .not('legenda', 'is', null)
      .in('status', ['aprovado', 'agendado', 'publicado'])
      .order('created_at', { ascending: false })
      .limit(8)
    voiceSamples = (data || [])
      .map((r: any) => (r.legenda || '').trim())
      .filter((t: string) => t.length > 20)
  }
  // Catálogo curado no manual do cliente (onde entram as legendas boas do
  // Instagram, coladas à mão) vem primeiro: foi escolha de alguém, não sorteio
  // das mais recentes.
  const curated: string[] = Array.isArray(manual?.tone_of_voice?.caption_samples)
    ? manual.tone_of_voice.caption_samples.filter((t: any) => typeof t === 'string' && t.trim().length > 20)
    : []
  const samples = [...curated, ...voiceSamples].slice(0, 10)

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

  // Aviso duro de que são referência de FORMA, não de conteúdo. Sem isso o
  // modelo reaproveita o assunto dos exemplos — foi exatamente o que aconteceu
  // no resumo do "Para você", onde ele copiou cliente e números do exemplo.
  const samplesContext = samples.length ? `
Legendas REAIS já publicadas por esta marca — use só como referência de JEITO
DE ESCREVER: tamanho, ritmo, uso de emoji, formato da chamada, se abre com
pergunta ou afirmação. NÃO reaproveite o assunto, os pratos, as promoções nem
as frases delas. A legenda nova é sobre o briefing acima e mais nada.
${samples.map((t, i) => `${i + 1}. ${t}`).join('\n')}
` : ''

  const prompt = `Você é um social media escrevendo a legenda de um post de Instagram para uma marca.
Escreva uma sugestão de legenda em português, natural, no tom da marca descrito abaixo. Pode incluir emojis com moderação e uma chamada pra ação no final, se fizer sentido. Não use hashtags a menos que o briefing peça. Não invente informações que não estão no briefing/copy.

Tipo de post: ${post_type || 'não especificado'}
Título/tema do post: ${title || 'sem título'}
Briefing: ${briefing || 'não informado'}
Copy/roteiro de referência: ${copy || 'não informado'}
${manualContext}${samplesContext}
Responda APENAS com o texto da legenda pronta, sem explicações, sem aspas, sem markdown.`

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
          generationConfig: { maxOutputTokens: 500, temperature: 0.7 },
        }),
      }
    )
  }

  try {
    let res = await callGemini('gemini-flash-lite-latest')
    if (res.status === 503) res = await callGemini('gemini-flash-lite-latest')

    if (!res.ok) {
      const err = await res.text()
      console.error('ai-legenda Gemini error:', res.status, err)
      if (res.status === 429) {
        return NextResponse.json({ error: 'Limite de uso da IA atingido no momento. Tente de novo em instantes ou mais tarde.' }, { status: 429 })
      }
      return NextResponse.json({ error: 'Não consegui gerar uma sugestão agora.' }, { status: 500 })
    }

    const data = await res.json()
    const legenda = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || ''
    return NextResponse.json({ legenda })
  } catch (e) {
    return NextResponse.json({ error: 'Erro ao chamar API do Gemini' }, { status: 500 })
  }
}
