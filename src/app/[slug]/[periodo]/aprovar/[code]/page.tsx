import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import ApprovalPage from '../../../../aprovar/[token]/AprovarClient'
import { slugify } from '@/lib/linkAprovacao'
import { withBase } from '@/lib/base'

type Props = { params: Promise<{ slug: string; periodo: string; code: string }> }

// Endereço legível do link de aprovação: /piastro-cucina/crono-set/aprovar/k3m9xq2p
//
// O nome do cliente e o mês existem pra QUEM LÊ — no WhatsApp o link passa a
// dizer do que se trata. Quem manda de verdade é o código no fim: é ele que
// busca o token, e é ele que faz o papel de senha numa página sem login.
//
// Só casa com caminhos de 4 segmentos terminados em "aprovar/<código>", então
// não engole URL nenhuma do hub — nada de rota curinga na raiz.

/** Acha o token pelo código e confere que o nome no endereço é mesmo daquele cliente. */
async function resolver(slug: string, code: string) {
  const supabase = supabaseAdmin
  const { data: tk } = await supabase
    .from('approval_tokens')
    .select('token, client_id, type, month, year')
    .eq('code', code).eq('active', true).maybeSingle()
  if (!tk) return null

  const { data: cliente } = await supabase
    .from('clients').select('name, slug, logo_url').eq('id', tk.client_id).maybeSingle()
  if (!cliente) return null

  // O nome no endereço tem que bater com o dono do código. Sem isto, qualquer
  // nome colado na frente de um código válido abriria o conteúdo — e o link
  // passaria a MENTIR sobre de quem ele é, que é pior que ser feio.
  const esperado = cliente.slug || slugify(cliente.name)
  if (slug !== esperado) return null

  return { token: tk.token, cliente }
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug, code } = await params
  const r = await resolver(slug, code)
  const nome = r?.cliente?.name
  const title = nome ? `Aprovação · ${nome}` : 'Aprovação de conteúdo'
  return {
    title,
    description: nome ? `Revise e aprove o conteúdo de ${nome} — Bagano Hub` : 'Revise e aprove o conteúdo — Bagano Hub',
    openGraph: {
      title,
      description: nome ? `Revise e aprove o conteúdo de ${nome} — Bagano Hub` : 'Revise e aprove o conteúdo — Bagano Hub',
      // O banner interno do hub não pode ir pro WhatsApp do cliente; vale a
      // logo dele, como já faz o endereço antigo.
      images: r?.cliente?.logo_url
        ? [{ url: r.cliente.logo_url }]
        : [{ url: withBase('/icons/icon-512.png'), width: 512, height: 512 }],
    },
  }
}

export default async function Page({ params }: Props) {
  const { slug, code } = await params
  const r = await resolver(slug, code)
  if (!r) notFound()
  return <ApprovalPage token={r.token} />
}
