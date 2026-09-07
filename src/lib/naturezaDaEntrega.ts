// O que foi entregue: post pra Instagram, ou material?
//
// Extras nasceu pra "post fora do cronograma", mas na prática a equipe usa a
// caixa mais próxima. Nos 19 extras entregues até hoje, um é o rodapé de uma
// revista impressa do Dom Leonello — um PDF. Ele aparecia no hub como post: com
// tipo "Post", indo pro link de aprovação junto dos outros, e agora com uma
// simulação de Instagram em volta de um arquivo que nunca vai pro Instagram.
//
// A pergunta "isso é post?" tem uma resposta que não depende de ninguém
// preencher nada certo: o TIPO DOS ARQUIVOS entregues. Post é imagem ou vídeo.
// PDF, planilha, .zip e arquivo-fonte não são — são material.
//
// A régua é de propósito conservadora. Um aviso errado é pior que aviso
// nenhum: quem leva palpite errado do sistema para de ler os palpites. Por
// isso: basta UMA imagem ou vídeo na pasta pra ser post (arte com o PDF do
// briefing junto continua sendo arte), e "não sei" é uma resposta válida.

export type Natureza =
  /** Tem imagem ou vídeo: é post. */
  | 'instagram'
  /** Só documento — PDF, planilha, arquivo-fonte. Não vai pro Instagram. */
  | 'documento'
  /** Pasta vazia, só subpastas, formato desconhecido. Não opina. */
  | 'indefinido'

type Arquivo = { name?: string | null; mimeType?: string | null }

// Extensão vale mais que mimeType porque o Drive erra: numa das pastas do
// D'Mori um "3.mov" está gravado como image/jpeg. O nome do arquivo é o que a
// pessoa escreveu, e nisso ela acerta.
const EXT_DOCUMENTO = /\.(pdf|docx?|xlsx?|pptx?|odt|ods|csv|txt|rtf|zip|rar|7z|ai|psd|eps|indd|cdr|sketch|fig)$/i
const EXT_MIDIA     = /\.(jpe?g|png|webp|avif|heic|heif|gif|tiff?|bmp|mp4|mov|m4v|avi|webm|mkv)$/i

const MIME_DOCUMENTO = /^(application\/pdf|application\/msword|application\/rtf|application\/zip|application\/x-(zip|rar|7z)|application\/postscript|application\/vnd\.(ms-|openxmlformats|oasis|adobe|google-apps\.(document|spreadsheet|presentation|form))|text\/(plain|csv)|image\/vnd\.adobe\.photoshop)/i
const MIME_MIDIA     = /^(image|video)\//i

/** Um arquivo só: documento, mídia, ou nem um nem outro. */
function classificar(f: Arquivo): Natureza {
  const nome = f.name || ''
  // Extensão primeiro, nos dois sentidos — ela é a fonte mais confiável.
  if (EXT_DOCUMENTO.test(nome)) return 'documento'
  if (EXT_MIDIA.test(nome)) return 'instagram'
  const mime = f.mimeType || ''
  // Ordem importa: image/vnd.adobe.photoshop casa com os dois, e é documento.
  if (MIME_DOCUMENTO.test(mime)) return 'documento'
  if (MIME_MIDIA.test(mime)) return 'instagram'
  return 'indefinido'
}

/**
 * O que tem dentro da pasta entregue.
 *
 * Subpasta não conta nem pra um lado nem pro outro: metade das pastas de extra
 * é só subpasta ("01", "02", "Stories"), e o conteúdo de verdade está um nível
 * abaixo. Isso é "não sei", não é "não é post".
 */
export function naturezaDaEntrega(arquivos: Arquivo[] | null | undefined): Natureza {
  const lista = (arquivos || []).filter(f => f.mimeType !== 'application/vnd.google-apps.folder')
  if (!lista.length) return 'indefinido'
  const tipos = lista.map(classificar)
  if (tipos.includes('instagram')) return 'instagram'
  if (tipos.includes('documento')) return 'documento'
  return 'indefinido'
}

/**
 * Como chamar o que foi entregue, pra escrever o aviso: "PDF", "XLSX"…
 *
 * Só letras na extensão. Com dígitos, a subpasta "Stories 28.09" virava um
 * aviso dizendo que a entrega era um "09".
 */
export function nomeDoFormato(arquivos: Arquivo[] | null | undefined): string {
  const exts = new Set(
    (arquivos || [])
      .filter(f => f.mimeType !== 'application/vnd.google-apps.folder')
      .map(f => (f.name || '').match(/\.([a-z]{2,5})$/i)?.[1]?.toUpperCase())
      .filter(Boolean) as string[],
  )
  return exts.size === 1 ? [...exts][0] : 'arquivo'
}
