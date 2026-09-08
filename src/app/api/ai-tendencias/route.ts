import { NextRequest, NextResponse } from 'next/server'
import { usuarioLogado } from '@/lib/apiAuth'
import { GEMINI } from '@/lib/gemini'
import { noticiasDoNicho } from '@/lib/noticiasDoNicho'

// Tendências do nicho, buscadas de verdade.
//
// A busca NÃO é feita pelo Gemini. O plano da nossa chave não tem a ferramenta
// `google_search`: medido em dois dias seguidos, chamada simples devolve 200 e
// a mesma chamada com busca devolve 429 na primeira tentativa, em todos os
// modelos. Cota zero, não cota esgotada.
//
// Então quem busca é o servidor (`noticiasDoNicho`, via Google News RSS) e o
// modelo só LÊ o que recebeu. Isso é melhor do que seria com grounding:
//
//   1. A FONTE é garantida. O modelo escolhe entre os links que recebeu, não
//      escreve um. Tendência inventada com fonte inventada era o pior
//      resultado possível desta tela.
//   2. A busca é apontável — a lista de consultas fica em `noticiasDoNicho`.
//
// Sem notícia nenhuma a rota não chama o modelo: pedir tendência sem material
// é pedir invenção, e é exatamente o que não se quer aqui.

const CATEGORIAS = ['formato', 'audio', 'assunto', 'data', 'estetica']

export async function POST(req: NextRequest) {
  if (!await usuarioLogado()) return NextResponse.json({ error: 'não autorizado' }, { status: 401 })
  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) return NextResponse.json({ error: 'GEMINI_API_KEY não configurada' }, { status: 503 })

  const { concorrentes = [], quantas = 8 } = await req.json().catch(() => ({}))

  const hoje = new Date()
  const DIAS = 45
  const desde = new Date(hoje.getTime() - DIAS * 86400000).toLocaleDateString('pt-BR')

  const noticias = await noticiasDoNicho(DIAS)
  if (!noticias.length) {
    return NextResponse.json({
      error: 'Não consegui alcançar as fontes de notícia agora. Tente de novo em alguns minutos.',
    }, { status: 503 })
  }

  const alvos = Array.isArray(concorrentes) && concorrentes.length
    ? `\n\nConcorrentes dos nossos clientes, para contexto do que é o nicho: ${concorrentes.slice(0, 25).join(', ')}`
    : ''

  const material = noticias
    .map((n, i) => `${i + 1}. ${n.titulo}\n   veículo: ${n.veiculo} · ${n.data}\n   link: ${n.link}`)
    .join('\n')

  const prompt = `Você trabalha numa agência brasileira de social media especializada em GASTRONOMIA (restaurantes, pizzarias, sushi, sorveterias, padarias, hamburguerias).

Abaixo estão ${noticias.length} matérias REAIS publicadas de ${desde} para cá. Leia e extraia as que representam uma TENDÊNCIA que um restaurante consegue usar nas próximas semanas.${alvos}

MATÉRIAS:
${material}

Regras, todas obrigatórias:

- Use SOMENTE o que está nas matérias acima. Não acrescente tendência que você conhece de outro lugar — se não está na lista, não entra.
- O campo "fonte" tem que ser o link EXATO de uma das matérias acima. Nunca escreva outro link.
- Ignore matéria que não vira conteúdo: turismo, agenda de evento de uma cidade só, notícia de celebridade, curso, feira setorial.
- Nada de conselho atemporal ("poste com frequência", "mostre os bastidores"). Isso não é tendência, é manual — a equipe já sabe.
- Traga quantas encontrar, até ${quantas}. Se só três matérias virarem tendência de verdade, traga três. Lista curta e verdadeira vale mais que longa e forçada.

Responda APENAS com JSON válido (sem markdown, sem crases):

{
  "tendencias": [
    {
      "titulo": "curto, o nome da tendência",
      "descricao": "o que é, em 1-2 frases",
      "gancho": "como um restaurante usa isso — específico, algo que dá pra produzir esta semana",
      "categoria": "um de: ${CATEGORIAS.join(' | ')}",
      "fonte": "o link exato da matéria de onde saiu",
      "exemplos": ["quem já fez, se a matéria disser"]
    }
  ]
}`

  // Escada de modelos, não uma chamada só.
  //
  // Medido agora: `gemini-flash-latest` devolveu 503 ("high demand") duas vezes
  // seguidas e `flash-lite` respondeu de primeira. Sem a escada, a equipe
  // aperta "Buscar" num momento de pico e não recebe nada — e o trabalho de
  // buscar as 67 matérias vai junto pro lixo.
  const ESCADA = [GEMINI.FLASH, GEMINI.FLASH, GEMINI.FLASH_LITE, GEMINI.FLASH_LITE]
  const espera = (ms: number) => new Promise(r => setTimeout(r, ms))

  try {
    let res: Response | null = null
    for (let i = 0; i < ESCADA.length; i++) {
      res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${ESCADA[i]}:generateContent`,
        {
          method: 'POST',
          headers: { 'content-type': 'application/json', 'x-goog-api-key': apiKey },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            // Temperatura baixa: aqui não se quer criatividade, se quer o que
            // estava escrito nas matérias.
            generationConfig: { maxOutputTokens: 4000, temperature: 0.2 },
          }),
        }
      )
      if (res.ok) break
      // 429 é cota — insistir não resolve e só queima o resto. 503 é pico, e
      // passa.
      if (res.status === 429) break
      if (i < ESCADA.length - 1) await espera(2500)
    }

    if (!res || !res.ok) {
      const err = res ? await res.text() : ''
      console.error('ai-tendencias Gemini error:', res?.status, err)
      if (res?.status === 429) return NextResponse.json({ error: 'Limite de uso da IA atingido. Tente daqui a pouco.' }, { status: 429 })
      return NextResponse.json({ error: 'A IA está congestionada agora. Tente de novo em alguns minutos — as matérias já foram lidas, é só o resumo que faltou.' }, { status: 503 })
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

    // Só entra tendência cujo link ESTÁ na lista que mandamos. O modelo tem
    // instrução de copiar um dos links, mas instrução não é garantia — e uma
    // fonte inventada é pior que fonte nenhuma, porque parece verificável.
    const linksReais = new Set(noticias.map(n => n.link))
    const porLink = new Map(noticias.map(n => [n.link, n]))

    const tendencias = lista.slice(0, 20).map((t: any) => {
      const fonte = String(t?.fonte || '').trim()
      const noticia = linksReais.has(fonte) ? porLink.get(fonte) : undefined
      return {
        titulo: String(t?.titulo || '').slice(0, 200),
        descricao: String(t?.descricao || ''),
        gancho: String(t?.gancho || ''),
        categoria: CATEGORIAS.includes(t?.categoria) ? t.categoria : 'assunto',
        // Guarda o link real, e junto o veículo — "O TEMPO" diz mais na tela
        // que uma URL de redirecionamento do Google News.
        fonte: noticia ? `${noticia.veiculo || 'matéria'} · ${noticia.link}` : '',
        exemplos: Array.isArray(t?.exemplos) ? t.exemplos.filter((x: any) => typeof x === 'string').slice(0, 5) : [],
      }
    }).filter((t: any) => t.titulo && t.fonte)

    return NextResponse.json({ tendencias, buscadoEm: new Date().toISOString(), materiasLidas: noticias.length })
  } catch {
    return NextResponse.json({ error: 'Erro ao chamar a API do Gemini' }, { status: 500 })
  }
}
