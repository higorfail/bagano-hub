import type { Metadata } from 'next'
import { createClient } from '@/lib/supabase'
import ApprovalPage from './AprovarClient'

type Props = { params: Promise<{ token: string }> }

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { token } = await params
  const supabase = createClient()

  const { data: tk } = await supabase
    .from('approval_tokens').select('client_id').eq('token', token).eq('active', true).single()
  const client = tk
    ? (await supabase.from('clients').select('name, logo_url').eq('id', tk.client_id).single()).data
    : null

  const title = client?.name ? `Aprovação · ${client.name}` : 'Aprovação de conteúdo'
  const description = client?.name
    ? `Revise e aprove o conteúdo de ${client.name} — Bagano Hub`
    : 'Revise e aprove o conteúdo — Bagano Hub'

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      images: client?.logo_url ? [{ url: client.logo_url }] : undefined,
    },
  }
}

export default async function Page({ params }: Props) {
  const { token } = await params
  return <ApprovalPage token={token} />
}
