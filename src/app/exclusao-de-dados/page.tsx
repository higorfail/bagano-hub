import type { Metadata } from 'next'

// Instruções de exclusão de dados.
//
// A Meta exige, no App Review, uma URL de exclusão de dados OU instruções
// públicas de como pedir. Esta página é a segunda opção — a mais honesta pro
// caso da Bagano, porque a exclusão aqui envolve conteúdo produzido sob
// contrato e não pode ser um botão que apaga tudo sem conversa.
export const metadata: Metadata = {
  title: 'Exclusão de dados · Bagano Hub',
  robots: { index: true, follow: true },
}

export default function ExclusaoDeDados() {
  return (
    <main style={{ maxWidth: 720, margin: '0 auto', padding: '48px 20px 80px', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif', color: '#1f2937', lineHeight: 1.7 }}>
      <h1 style={{ fontSize: 28, fontWeight: 800, letterSpacing: '-0.02em', margin: '0 0 24px' }}>Exclusão de dados</h1>

      <p style={{ fontSize: 14, marginBottom: 20 }}>
        Para pedir a exclusão dos seus dados do Bagano Hub, mande um e-mail para{' '}
        <a href="mailto:contato@bagano.com.br" style={{ color: '#7c0006' }}>contato@bagano.com.br</a>{' '}
        com o assunto <b>&ldquo;Exclusão de dados&rdquo;</b>, informando o nome da empresa ou o perfil
        do Instagram. Respondemos em até 7 dias e concluímos a exclusão em até 30.
      </p>

      <h2 style={{ fontSize: 15, fontWeight: 700, margin: '0 0 8px' }}>Para desconectar o Instagram na hora</h2>
      <p style={{ fontSize: 14, marginBottom: 20 }}>
        No Facebook, vá em <b>Configurações e privacidade → Configurações → Aplicativos e sites</b>,
        encontre o Bagano Hub e remova. O acesso é cortado imediatamente, sem depender da gente.
      </p>

      <h2 style={{ fontSize: 15, fontWeight: 700, margin: '0 0 8px' }}>O que é excluído</h2>
      <p style={{ fontSize: 14 }}>
        Tokens de acesso, identificadores da conta e os dados de perfil que guardamos. O conteúdo
        produzido sob contrato (textos, artes e vídeos) segue a regra combinada em contrato —
        e a gente diz exatamente o que fica e o que sai antes de concluir.
      </p>
    </main>
  )
}
