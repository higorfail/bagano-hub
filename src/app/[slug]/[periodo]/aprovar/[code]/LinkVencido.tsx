// A tela de link vencido.
//
// Antes isto era `notFound()` — um 404 seco, igual a endereço digitado errado.
// Do lado do cliente as duas coisas parecem a mesma: "o site da Bagano não
// abre". Ele não tem como saber que existe um link novo, então não pede, e o
// conteúdo fica esperando aprovação que não vem — enquanto a equipe acha que
// ele está enrolando.
//
// Medido em 2026-09-07: 87 links desativados, e 5 clientes ATIVOS sem nenhum
// link válido. Todos eles, ao abrir o que têm, viam este 404.
export default function LinkVencido({ cliente }: { cliente: { name: string; logo_url?: string | null } | null }) {
  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f5f5f3', padding: 24, fontFamily: 'system-ui, -apple-system, sans-serif' }}>
      <div style={{ maxWidth: 420, width: '100%', background: '#fff', borderRadius: 20, padding: '40px 32px', textAlign: 'center', border: '1px solid #ebebeb' }}>
        {cliente?.logo_url && (
          <img src={cliente.logo_url} alt={cliente.name}
            style={{ width: 56, height: 56, borderRadius: 16, objectFit: 'contain', border: '1px solid #f0f0f0', marginBottom: 20 }} />
        )}
        <h1 style={{ fontSize: 19, fontWeight: 700, color: '#1c1a18', margin: '0 0 12px' }}>
          Este link de aprovação venceu
        </h1>
        <p style={{ fontSize: 14, lineHeight: 1.6, color: '#57534e', margin: '0 0 8px' }}>
          {cliente?.name
            ? <>O conteúdo de <strong>{cliente.name}</strong> continua guardado — só este endereço deixou de valer.</>
            : <>O conteúdo continua guardado — só este endereço deixou de valer.</>}
        </p>
        <p style={{ fontSize: 14, lineHeight: 1.6, color: '#57534e', margin: 0 }}>
          Peça o link novo para quem te acompanha na Bagano.
        </p>
        <p style={{ fontSize: 12, color: '#a8a29e', marginTop: 28, marginBottom: 0 }}>
          Bagano Hub
        </p>
      </div>
    </div>
  )
}
