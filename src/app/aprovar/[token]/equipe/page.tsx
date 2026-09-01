import type { Metadata } from 'next'
import ApprovalPage from '../AprovarClient'

type Props = { params: Promise<{ token: string }> }

// O mesmo cronograma do link do cliente, com as ações de quem está na
// captação: marcar "Captado" e deixar observação.
//
// É uma ROTA e não um `?equipe=1` porque este endereço é ditado por telefone,
// colado no WhatsApp e digitado no celular no meio de uma filmagem — e ponto
// de interrogação em endereço é o que mais se perde no caminho.
//
// `noindex` porque é tela interna: o link do cliente é público por natureza,
// este não precisa aparecer em busca nenhuma.
export const metadata: Metadata = {
  title: 'Captação · Bagano Hub',
  robots: { index: false, follow: false },
}

export default async function Page({ params }: Props) {
  const { token } = await params
  return <ApprovalPage token={token} equipe />
}
