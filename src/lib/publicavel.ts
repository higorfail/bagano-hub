// O post está publicável no Instagram?
//
// Vale HOJE, mesmo sem a API conectada: quem agenda na mão descobre o
// problema no Business Suite, com o post na hora de subir. Vale ainda mais
// depois, porque publicação por API falha em silêncio às 18h de sábado.
//
// Medido nos 63 posts prontos da Bagano: 45 passariam, 18 não — 17 com imagem
// PNG e 1 HEIF. E o hábito já está quase certo: 127 dos arquivos são JPEG
// contra 26 PNG. Não é retrabalho geral, são 18 casos.

/** O Instagram aceita só JPEG em imagem. PNG, HEIF e WebP são recusados. */
const IMAGEM_OK = ['image/jpeg', 'image/jpg']
/** Vídeo aceita MP4 e MOV. */
const VIDEO_OK = ['video/mp4', 'video/quicktime']

const MB = 1048576
const IMAGEM_MAX = 8 * MB
const VIDEO_MAX = 1024 * MB

export type Arquivo = { name: string; mimeType: string; size?: number | string | null }

export type Problema = {
  gravidade: 'impede' | 'atencao'
  texto: string
  /** O que fazer — dito em uma linha, porque é o que a pessoa precisa. */
  saida: string
}

/**
 * `tipo` é o post_type do hub (carrossel, reels, story…), usado só pra checar
 * a contagem do carrossel. O resto vale pra qualquer formato.
 */
export function verificarPublicacao(arquivos: Arquivo[], tipo?: string | null): Problema[] {
  const out: Problema[] = []
  const midia = arquivos.filter(a => !a.mimeType.includes('folder'))

  if (!midia.length) {
    return [{ gravidade: 'impede', texto: 'Sem arquivo na pasta', saida: 'Subir a arte no Drive' }]
  }

  const imagens = midia.filter(a => a.mimeType.startsWith('image/'))
  const videos = midia.filter(a => a.mimeType.startsWith('video/'))

  const imgRuins = imagens.filter(a => !IMAGEM_OK.includes(a.mimeType))
  if (imgRuins.length) {
    const fmts = [...new Set(imgRuins.map(a => a.mimeType.split('/')[1].toUpperCase()))].join(' e ')
    out.push({
      gravidade: 'impede',
      texto: `${imgRuins.length} ${imgRuins.length === 1 ? 'imagem' : 'imagens'} em ${fmts}`,
      saida: 'O Instagram só aceita JPEG — reexportar como JPG',
    })
  }

  const vidRuins = videos.filter(a => !VIDEO_OK.includes(a.mimeType))
  if (vidRuins.length) {
    out.push({
      gravidade: 'impede',
      texto: `${vidRuins.length} vídeo em formato não aceito`,
      saida: 'Converter pra MP4',
    })
  }

  const pesadas = imagens.filter(a => Number(a.size || 0) > IMAGEM_MAX)
  if (pesadas.length) {
    out.push({
      gravidade: 'impede',
      texto: `${pesadas.length} ${pesadas.length === 1 ? 'imagem passa' : 'imagens passam'} de 8MB`,
      saida: 'Exportar com menos qualidade ou redimensionar',
    })
  }

  const vidPesados = videos.filter(a => Number(a.size || 0) > VIDEO_MAX)
  if (vidPesados.length) {
    out.push({ gravidade: 'impede', texto: `${vidPesados.length} vídeo passa de 1GB`, saida: 'Comprimir o vídeo' })
  }

  // Carrossel: 2 a 10. Um só não é carrossel, e acima de 10 o Instagram corta
  // sem avisar qual ficou de fora.
  if ((tipo || '').startsWith('carrossel')) {
    if (midia.length === 1) {
      out.push({ gravidade: 'atencao', texto: 'Carrossel com um arquivo só', saida: 'Publicar como post simples, ou subir os outros' })
    } else if (midia.length > 10) {
      out.push({ gravidade: 'impede', texto: `Carrossel com ${midia.length} arquivos`, saida: 'O limite é 10 — tirar os excedentes' })
    }
  }

  return out
}

/** Resumo de uma linha, pro selo na tela. Null quando está tudo certo. */
export function seloPublicacao(problemas: Problema[]): { texto: string; impede: boolean } | null {
  if (!problemas.length) return null
  const impede = problemas.some(p => p.gravidade === 'impede')
  return {
    texto: problemas.length === 1 ? problemas[0].texto : `${problemas.length} problemas no arquivo`,
    impede,
  }
}
