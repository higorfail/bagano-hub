import { NextRequest, NextResponse } from 'next/server'
import { usuarioLogado } from '@/lib/apiAuth'
import { GEMINI } from '@/lib/gemini'
import { buscarNoDrive } from '@/lib/driveFetch'
import { SITE_URL } from '@/lib/base'

// Ler o manual de marca que o cliente já tem, em PDF.
//
// Vários clientes chegam com um PDF pronto — feito por outra agência, por um
// designer, ou pelo próprio dono. Hoje esse material morre no Drive: preencher
// o manual do hub à mão a partir dele é uma tarde de trabalho, e por isso
// ninguém faz.
//
// O PDF vai INTEIRO pro Gemini, sem biblioteca de extração no meio. Testado com
// PDF de verdade: o modelo lê o texto direto do arquivo. Extrair texto aqui
// seria pior — perderia a ordem visual das páginas, as legendas das imagens e
// as cores escritas em quadro, que é justamente onde mora a paleta.
//
// Nota sobre a busca na web: o gerador de rascunho (`ai-manual`) usa
// `google_search`, que o plano da nossa chave NÃO tem — ele devolve 429 sempre.
// Aqui não há esse problema: a fonte é o arquivo, não a web.

/** Limite do que cabe numa requisição do Gemini com o arquivo embutido. */
const TETO_MB = 15

/**
 * O PDF pode vir de dois lugares: do computador ou de um LINK DO DRIVE.
 *
 * O link é o caminho normal aqui — o manual do cliente já está numa pasta do
 * Drive, e obrigar a baixar pra depois subir é um passo inteiro por nada.
 *
 * A chave do Google é restrita por referrer, então o servidor declara um que
 * bate com o domínio liberado — mesmo truque do drive-thumb e do drive-folder.
 */
const REFERRER = `${SITE_URL.replace(/\/$/, '')}/`

async function pdfDoDrive(link: string): Promise<{ base64: string; nome: string } | { erro: string; status: number }> {
  const id = link.match(/[-\w]{25,}/)?.[0]
  if (!id) return { erro: 'Esse link não parece do Google Drive. Copie o endereço do arquivo (não o da pasta).', status: 400 }
  const key = process.env.NEXT_PUBLIC_GOOGLE_API_KEY
  if (!key) return { erro: 'Chave do Google não configurada.', status: 503 }

  const meta = await buscarNoDrive(
    `https://www.googleapis.com/drive/v3/files/${id}?fields=name,mimeType,size&key=${key}`,
    { headers: { Referer: REFERRER } },
  )
  if (!meta.ok) {
    // O caso comum não é link errado, é permissão — e dizer "não encontrado"
    // manda a pessoa procurar o link de novo em vez de liberar o acesso.
    return { erro: 'Não consegui abrir esse arquivo. Verifique se ele está compartilhado como "qualquer pessoa com o link".', status: 404 }
  }
  const info = await meta.json()
  if (info.mimeType !== 'application/pdf') {
    return { erro: `Esse arquivo é ${info.mimeType || 'de outro tipo'}, não PDF. Se o manual for Google Docs ou Slides, exporte como PDF no Drive antes.`, status: 400 }
  }
  const mb = Number(info.size || 0) / 1024 / 1024
  if (mb > TETO_MB) return { erro: `O PDF tem ${mb.toFixed(1)} MB e o limite é ${TETO_MB} MB.`, status: 413 }

  const bin = await buscarNoDrive(
    `https://www.googleapis.com/drive/v3/files/${id}?alt=media&key=${key}`,
    { headers: { Referer: REFERRER } },
  )
  if (!bin.ok) return { erro: 'Achei o arquivo mas não consegui baixá-lo. Tente de novo em instantes.', status: 502 }
  return { base64: Buffer.from(await bin.arrayBuffer()).toString('base64'), nome: info.name || 'manual.pdf' }
}

export async function POST(req: NextRequest) {
  if (!await usuarioLogado()) return NextResponse.json({ error: 'não autorizado' }, { status: 401 })
  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) return NextResponse.json({ error: 'GEMINI_API_KEY não configurada' }, { status: 503 })

  const form = await req.formData().catch(() => null)
  const arquivo = form?.get('arquivo')
  const link = String(form?.get('link') || '').trim()

  let base64: string
  let nomeArquivo: string

  if (link) {
    const r = await pdfDoDrive(link)
    if ('erro' in r) return NextResponse.json({ error: r.erro }, { status: r.status })
    base64 = r.base64
    nomeArquivo = r.nome
  } else if (arquivo instanceof File) {
    if (arquivo.type !== 'application/pdf') {
      return NextResponse.json({ error: 'Só PDF por enquanto. Se o manual for imagem ou slide, exporte como PDF antes.' }, { status: 400 })
    }
    const mb = arquivo.size / 1024 / 1024
    if (mb > TETO_MB) {
      // Dizer o tamanho: "arquivo grande demais" faz a pessoa tentar de novo
      // com o mesmo arquivo.
      return NextResponse.json({
        error: `O PDF tem ${mb.toFixed(1)} MB e o limite é ${TETO_MB} MB. Manual de marca costuma passar disso por causa das imagens — exportar em qualidade menor resolve, o que importa aqui é o texto.`,
      }, { status: 413 })
    }
    base64 = Buffer.from(await arquivo.arrayBuffer()).toString('base64')
    nomeArquivo = arquivo.name
  } else {
    return NextResponse.json({ error: 'Mande um PDF ou cole o link do Drive.' }, { status: 400 })
  }

  const prompt = `Este PDF é o manual de marca de um cliente de uma agência de social media especializada em gastronomia. Leia o documento inteiro e extraia o que estiver nele.

Regras, todas obrigatórias:

- Use SOMENTE o que está escrito no PDF. Não complete com o que você sabe sobre a marca, não deduza, não invente cor nem prato nem preço.
- Campo sem informação no documento fica vazio: "" para texto, [] para lista, {} para objeto. Deixar vazio é a resposta certa, não uma falha.
- Cores: só as que aparecerem como código (#RRGGBB, RGB ou CMYK convertido). "Azul" sem código não vira cor — vai como nada.
- Tom de voz: "use_words" e "avoid_words" só se o documento listar palavras. Adjetivo solto ("moderno", "jovem") vai em "personality", não vira palavra da lista.

Responda APENAS com JSON válido (sem markdown, sem crases), neste formato exato:

{
  "tagline": "",
  "concept": "",
  "history": "",
  "pillars": [{ "name": "", "description": "" }],
  "colors": [{ "name": "", "hex": "" }],
  "fonts": [{ "role": "", "family": "" }],
  "address": "",
  "phone": "",
  "hours": {},
  "instagram": "",
  "website": "",
  "delivery_links": [],
  "menu": [{ "category": "", "items": [{ "name": "", "price": "", "description": "" }] }],
  "differentials": [],
  "promotions": [{ "title": "", "description": "" }],
  "personas": [{ "name": "", "age": "", "profile": "", "behaviors": "" }],
  "editorial_pillars": [{ "name": "", "description": "" }],
  "content_series": [{ "name": "", "description": "", "frequency": "" }],
  "production_notes": "",
  "tone_of_voice": { "personality": "", "use_words": [], "avoid_words": [], "taglines": [] }
}`

  // Escada de modelos: `flash` responde 503 com frequência, e perder a leitura
  // de um PDF de 10 MB por um pico de demanda seria caro — o arquivo já subiu.
  const ESCADA = [GEMINI.FLASH, GEMINI.FLASH_LITE, GEMINI.FLASH, GEMINI.FLASH_LITE]
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
            contents: [{ parts: [
              { inline_data: { mime_type: 'application/pdf', data: base64 } },
              { text: prompt },
            ] }],
            // Temperatura baixa: aqui não se quer criatividade, se quer o que
            // está escrito no documento.
            generationConfig: { maxOutputTokens: 8000, temperature: 0.1 },
          }),
        }
      )
      if (res.ok) break
      if (res.status === 429) break  // cota não melhora insistindo
      if (i < ESCADA.length - 1) await espera(2500)
    }

    if (!res || !res.ok) {
      const err = res ? await res.text() : ''
      console.error('ai-manual-pdf erro:', res?.status, err.slice(0, 400))
      if (res?.status === 429) return NextResponse.json({ error: 'Limite de uso da IA atingido. Tente daqui a pouco.' }, { status: 429 })
      return NextResponse.json({ error: 'A IA está congestionada agora. Tente de novo em alguns minutos — o arquivo não precisa ser subido de novo.' }, { status: 503 })
    }

    const data = await res.json()
    let texto = data.candidates?.[0]?.content?.parts?.map((p: any) => p.text || '').join('') || ''
    texto = texto.trim().replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/```\s*$/i, '')

    // Valida antes de devolver: JSON quebrado vira um textarea cheio de lixo
    // pra alguém consertar à mão, e ninguém conserta.
    try { JSON.parse(texto) } catch {
      console.error('ai-manual-pdf JSON inválido:', texto.slice(0, 400))
      return NextResponse.json({ error: 'A IA respondeu num formato que não deu pra ler. Tente de novo.' }, { status: 502 })
    }

    return NextResponse.json({ manual: texto, arquivo: nomeArquivo })
  } catch {
    return NextResponse.json({ error: 'Erro ao chamar a API do Gemini' }, { status: 500 })
  }
}
