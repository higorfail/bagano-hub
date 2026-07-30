import { NextRequest, NextResponse } from 'next/server'

// Frase do dia que acompanha o "Bom dia, Fulano" no topo do Hub — escrita
// como um colega de equipe comentaria, usando o que a pessoa realmente tem
// pra fazer hoje. Não é motivacional nem corporativa: a graça é abrir o Hub
// e querer saber qual é a frase de hoje.
//
// Sem busca na web de propósito: o modelo tem data de corte de conhecimento,
// então "assunto do momento" sairia velho ou inventado — o oposto do efeito
// desejado. O humor vem do que é atemporal (café, energético, cliente pedindo
// "só um ajuste", sexta) e dos dados reais da pessoa, que são sempre atuais.

// Sorteados aqui, não pela IA: modelo não tem noção de frequência, então
// "use raramente" viraria toda hora. Assim raro é raro de verdade.
const RARE_EVENTS = [
  { chance: 0.008, instruction: 'Escreva como se a pessoa tivesse encontrado uma mensagem lendária/rara do Hub. Comece com 👀.' },
  { chance: 0.008, instruction: 'Comemore um recorde da Bagano de um jeito exagerado e engraçado. Comece com 🏆.' },
  { chance: 0.008, instruction: 'Trate o cronograma como se ele tivesse entrado em modo sobrevivência. Comece com 🚨.' },
]

function pickRareEvent(): string | null {
  for (const e of RARE_EVENTS) if (Math.random() < e.chance) return e.instruction
  return null
}

const SYSTEM = `Você é o Bagano Assistant — um membro da equipe da Bagano, uma agência criativa de social media pra restaurantes. Time jovem, 20-25 anos.

Você escreve UMA frase curta que vem logo depois da saudação ("Bom dia, Higor." / "Boa tarde, Higor." / "Boa noite, Higor.").

REGRAS DE FORMATO (obrigatórias):
- Responda SOMENTE a frase que vem DEPOIS da saudação. Não escreva a saudação nem o nome.
- Máximo 75 caracteres. Uma frase só. Nunca quebre linha.
- Pode usar 1 emoji, no máximo, e só se acrescentar algo.
- Sem markdown, sem aspas em volta.

TOM:
- Como um colega falaria: inteligente, jovem, espontâneo, irônico, debochado, memeiro.
- NUNCA corporativo. NUNCA motivacional. NUNCA soe como IA ou coach.
- Proibido: "Espero que esteja bem", "Hoje será um ótimo dia", "Nunca desista", "Vamos com tudo", "Bora" e qualquer frase pronta de autoajuda.
- Nunca ofensivo.

DO QUE FALAR:
- Se tem algo importante acontecendo (atraso, entrega hoje, data comemorativa chegando, fila de aprovação vazia), fale disso — com humor, não como relatório.
- Se não tem nada demais, ignore o trabalho e faça só uma observação divertida (café, energético, rotina de agência, gastronomia, sexta, cliente pedindo "só um ajuste").
- Varie muito entre um dia e outro. Nunca repita a mesma estrutura.

CLIMA POR DIA DA SEMANA:
- Segunda: sobrevivência. Terça: ritmo, hoje rende. Quarta: metade da semana.
- Quinta: último sprint. Sexta: descontraído, pode usar "Sextou", exagerar.
- Sábado/domingo/feriado: se a pessoa abriu o Hub, brinque com isso.
- Noite: brinque com o fato de ainda estar por aqui.

REFERÊNCIAS: pop só se for clássica e universal (Shrek, etc.). Nunca explique a piada. A frase precisa funcionar mesmo pra quem não pegar a referência.

Exemplos do humor esperado (não copie, use como calibragem de tom):
"Segunda... ninguém pediu, mas ela veio. ☕"
"O café ainda nem fez efeito."
"Última chance de parecer organizado."
"GRAÇAS A DEUS É SEXTA-FEIRA 🙏"
"Café primeiro. Decisões depois."
"'Só um ajuste.' Claro."
"O cliente respondeu 'perfeito'. Desconfie."
"O briefing evoluiu de novo."
"Ainda aqui? 😶"
"A fila de aprovações sumiu. Milagre."`

export async function POST(req: NextRequest) {
  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) return NextResponse.json({ greeting: '' })

  const ctx = await req.json().catch(() => null)
  if (!ctx) return NextResponse.json({ greeting: '' })

  const {
    memberName, role, weekday, period, dateLabel,
    pending, overdue, dueToday, waitingClient, ajustes,
    clientsWithWork, nextSpecialDate, publishedThisMonth, totalThisMonth,
  } = ctx

  const facts = [
    `Pessoa: ${memberName || 'alguém do time'}${role ? ` (${role})` : ''}`,
    `Quando: ${weekday}, ${period}, ${dateLabel}`,
    pending ? `Pendências dela hoje: ${pending}` : 'Sem nenhuma pendência — lista limpa',
    overdue ? `Atrasados: ${overdue}` : null,
    dueToday ? `Vencem hoje: ${dueToday}` : null,
    ajustes ? `Ajustes pedidos pelo cliente: ${ajustes}` : null,
    waitingClient ? `Esperando resposta do cliente: ${waitingClient}` : null,
    clientsWithWork?.length ? `Clientes com trabalho dela: ${clientsWithWork.slice(0, 4).join(', ')}` : null,
    nextSpecialDate ? `Data comemorativa chegando: ${nextSpecialDate}` : null,
    totalThisMonth ? `Progresso do mês da agência: ${publishedThisMonth}/${totalThisMonth} posts publicados` : null,
  ].filter(Boolean).join('\n')

  const rare = pickRareEvent()

  const prompt = `${SYSTEM}

CONTEXTO DE HOJE:
${facts}
${rare ? `\nINSTRUÇÃO ESPECIAL DE HOJE: ${rare}` : ''}

Escreva a frase (só ela, sem a saudação, máximo 75 caracteres):`

  try {
    const res = await fetch(
      'https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-lite-latest:generateContent',
      {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-goog-api-key': apiKey },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          // Temperatura alta: a graça é variar todo dia. Repetir a mesma
          // estrutura mata a curiosidade de "qual é a frase de hoje".
          // Sem thinkingConfig: o modelo por trás de gemini-flash-lite-latest
          // passou a recusar thinkingBudget:0 (INVALID_ARGUMENT), o que
          // derrubou silenciosamente TODAS as chamadas de IA do Hub.
          generationConfig: { maxOutputTokens: 120, temperature: 1.1 },
        }),
      }
    )
    if (!res.ok) return NextResponse.json({ greeting: '' })

    const data = await res.json()
    let greeting: string = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || ''
    // O modelo às vezes devolve a saudação junto mesmo sendo instruído a não
    // fazer isso — corta pra não sair "Bom dia, Higor. Bom dia, Higor. ...".
    // O \b no fim do nome é essencial: a equipe tem "Gabi" e "Gabis", e sem
    // ele remover "Gabi" de uma frase que começa com "Gabis," deixaria um "s,"
    // solto no meio da saudação.
    const nameRe = memberName
      ? new RegExp(`^${memberName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b[,!.]?\\s*`, 'i')
      : null
    greeting = greeting
      .replace(/^["'`]|["'`]$/g, '')
      .replace(/^(bom dia|boa tarde|boa noite)[,!.]?\s*/i, '')
    if (nameRe) greeting = greeting.replace(nameRe, '')
    greeting = greeting
      .replace(/\n+/g, ' ')
      .trim()
    // Estourou o limite: melhor não mostrar do que cortar no meio da piada.
    if (greeting.length > 90) greeting = ''
    return NextResponse.json({ greeting })
  } catch {
    return NextResponse.json({ greeting: '' })
  }
}
