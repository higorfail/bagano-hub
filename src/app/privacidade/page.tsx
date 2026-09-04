import type { Metadata } from 'next'

// Política de privacidade.
//
// Não é burocracia opcional: a Meta EXIGE uma URL pública de política de
// privacidade pra aceitar o App Review, e sem review não existe publicação no
// Instagram de conta de cliente. Estava faltando, e é um bloqueio que só se
// descobre ao tentar submeter.
//
// Escrita pro que o hub realmente faz — não um modelo genérico. Quem lê é o
// revisor da Meta e, eventualmente, um cliente da Bagano.
export const metadata: Metadata = {
  title: 'Política de Privacidade · Bagano Hub',
  robots: { index: true, follow: true },
}

const ATUALIZADO = '4 de setembro de 2026'

export default function Privacidade() {
  return (
    <main style={{ maxWidth: 720, margin: '0 auto', padding: '48px 20px 80px', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif', color: '#1f2937', lineHeight: 1.7 }}>
      <h1 style={{ fontSize: 28, fontWeight: 800, letterSpacing: '-0.02em', margin: '0 0 6px' }}>Política de Privacidade</h1>
      <p style={{ fontSize: 13, color: '#6b7280', margin: '0 0 32px' }}>Bagano Hub · atualizada em {ATUALIZADO}</p>

      <Secao titulo="O que é o Bagano Hub">
        Ferramenta interna da Bagano Marketing para organizar a produção de conteúdo dos
        clientes da agência: cronograma de posts, materiais, captações e aprovação. O acesso
        é restrito à equipe, com exceção das páginas de aprovação, abertas por link para o
        cliente daquele conteúdo.
      </Secao>

      <Secao titulo="Que dados tratamos">
        <b>Da equipe:</b> nome, e-mail e função, para login e para saber quem faz o quê.<br />
        <b>Dos clientes da agência:</b> nome da empresa, logo, endereço do perfil no Instagram
        e o conteúdo produzido para eles — textos, imagens e vídeos.<br />
        <b>Do Instagram e Facebook,</b> quando o cliente autoriza a conexão: identificador da
        conta comercial, nome de usuário e o necessário para publicar o conteúdo que a própria
        agência produziu. Não coletamos mensagens diretas, lista de seguidores nem dados de
        pessoas que interagem com os perfis.
      </Secao>

      <Secao titulo="Para que usamos">
        Exclusivamente para operar o serviço contratado: organizar, aprovar e publicar o
        conteúdo do cliente. Não vendemos, alugamos nem compartilhamos esses dados com
        terceiros para publicidade, e não usamos para treinar modelos.
      </Secao>

      <Secao titulo="Com quem compartilhamos">
        Apenas com a infraestrutura necessária para o serviço funcionar: Supabase (banco de
        dados), Vercel (hospedagem), Google (arquivos no Drive e agenda) e Meta (publicação
        no Instagram). Cada um trata os dados apenas para prestar esse serviço.
      </Secao>

      <Secao titulo="Por quanto tempo guardamos">
        Enquanto durar a relação com o cliente. Encerrado o contrato, os dados podem ser
        excluídos a pedido — ver a página de <a href="/exclusao-de-dados" style={{ color: '#7c0006' }}>exclusão de dados</a>.
        Tokens de acesso ao Instagram são revogados imediatamente quando a conexão é desfeita.
      </Secao>

      <Secao titulo="Seus direitos">
        Você pode pedir acesso, correção ou exclusão dos seus dados, e revogar a conexão com
        o Instagram a qualquer momento — pelo próprio Facebook, em Configurações → Aplicativos
        e sites, ou falando com a gente.
      </Secao>

      <Secao titulo="Contato">
        <a href="mailto:contato@bagano.com.br" style={{ color: '#7c0006' }}>contato@bagano.com.br</a>
      </Secao>
    </main>
  )
}

function Secao({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <section style={{ marginBottom: 28 }}>
      <h2 style={{ fontSize: 15, fontWeight: 700, margin: '0 0 8px' }}>{titulo}</h2>
      <p style={{ fontSize: 14, margin: 0, color: '#374151' }}>{children}</p>
    </section>
  )
}
