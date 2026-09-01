// O endereço legível de um link de aprovação.
//
//   antes   /aprovar/7a007569-d801-4b2e-9f3a-1c8e5d2b4a90
//   agora   /piastro-cucina/crono-set/aprovar/k3m9xq2p
//
// O que o cliente lê no WhatsApp passa a dizer de quem é e de que mês é. O
// código no fim continua existindo porque é ele que faz o papel de senha: a
// página não tem login, e sem um segredo no caminho o endereço seria montável
// por qualquer pessoa que soubesse o nome do cliente — inclusive pra APROVAR
// no lugar dele.
//
// Oito caracteres dão 2×10^14 combinações. Ninguém acerta por tentativa, e o
// endereço fica curto o bastante pra ser ditado por telefone.

const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez']

const TIPO: Record<string, string> = {
  cronograma: 'crono',
  final: 'final',
  extras: 'extras',
  geral: 'geral',
}

/** "Piastro Cucina" → "piastro-cucina" */
export function slugify(nome: string): string {
  return (nome || '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
}

/** cronograma + setembro → "crono-set" */
export function periodoSlug(tipo: string | null, mes?: number | null): string {
  const t = TIPO[tipo || ''] || 'aprovacao'
  const m = mes && mes >= 1 && mes <= 12 ? `-${MESES[mes - 1]}` : ''
  return `${t}${m}`
}

// Sem 0/O e 1/l/I: este código é ditado por telefone e digitado em celular no
// meio de uma filmagem, e é exatamente aí que zero vira ó e um vira ele.
const ALFABETO = 'abcdefghjkmnpqrstuvwxyz23456789'

/** Código curto e inadivinhável. */
export function novoCodigo(tamanho = 8): string {
  const bytes = new Uint8Array(tamanho)
  crypto.getRandomValues(bytes)
  return Array.from(bytes, b => ALFABETO[b % ALFABETO.length]).join('')
}

/**
 * O caminho do link de aprovação.
 *
 * Sem código, cai no endereço antigo — que continua valendo. Assim nada quebra
 * enquanto os 113 tokens já enviados não tiverem código, e ninguém precisa
 * reenviar link nenhum.
 */
export function caminhoAprovacao(args: {
  slug?: string | null
  tipo?: string | null
  mes?: number | null
  code?: string | null
  token: string
  equipe?: boolean
}): string {
  const sufixo = args.equipe ? '/equipe' : ''
  if (!args.code || !args.slug) return `/aprovar/${args.token}${sufixo}`
  return `/${args.slug}/${periodoSlug(args.tipo || null, args.mes)}/aprovar/${args.code}${sufixo}`
}

/**
 * Endereço público de um token, já no formato legível.
 *
 * Ponto único: os seis lugares que copiavam link montavam a URL na mão, e
 * cada um teria que aprender o formato novo (e um deles esqueceria).
 *
 * Tolerante de propósito. As colunas `code` e `slug` chegam por ALTER TABLE,
 * que é passo manual no Supabase — e uma consulta pedindo coluna que ainda não
 * existe não devolve "sem código", devolve ERRO, derrubando o botão de copiar
 * link inteiro. Aqui o erro vira silenciosamente o endereço antigo, que
 * continua funcionando.
 */
export async function linkPublico(
  supabase: { from: (t: string) => any },
  token: string,
  opts: { equipe?: boolean } = {},
): Promise<string> {
  const antigo = `/aprovar/${token}${opts.equipe ? '/equipe' : ''}`
  try {
    const { data: tk, error } = await supabase.from('approval_tokens')
      .select('code, type, month, client_id').eq('token', token).maybeSingle()
    if (error || !tk?.code) return antigo

    const { data: c, error: e2 } = await supabase.from('clients')
      .select('slug, name').eq('id', tk.client_id).maybeSingle()
    if (e2 || !c) return antigo

    return caminhoAprovacao({
      slug: c.slug || slugify(c.name), tipo: tk.type, mes: tk.month,
      code: tk.code, token, equipe: opts.equipe,
    })
  } catch {
    return antigo
  }
}
