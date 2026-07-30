// Copia texto que depende de um valor assíncrono (ex: buscar/gerar um token
// de aprovação no banco antes de montar o link). Chamar `navigator.clipboard
// .writeText()` só DEPOIS de um `await` quebra no Safari — ele exige que a
// escrita aconteça sincronamente dentro do gesto do usuário (clique), e
// qualquer await antes disso já "perdeu" esse gesto pro WebKit. Chrome é mais
// tolerante, por isso o bug só aparecia pro time que usa Safari.
//
// navigator.clipboard.write() com uma Promise dentro do ClipboardItem
// contorna isso: a CHAMADA em si é síncrona (ainda dentro do gesto), só o
// conteúdo resolve depois — é o padrão que o próprio WebKit recomenda.
export async function copyTextAsync(getText: () => Promise<string>): Promise<boolean> {
  const textPromise = getText() // chamado uma única vez, reaproveitado nos dois caminhos abaixo

  if (typeof ClipboardItem !== 'undefined' && navigator.clipboard?.write) {
    try {
      await navigator.clipboard.write([
        new ClipboardItem({ 'text/plain': textPromise.then(text => new Blob([text], { type: 'text/plain' })) }),
      ])
      return true
    } catch {
      // Segue pro fallback (ex: Firefox, que não aceita Promise dentro de ClipboardItem)
    }
  }

  try {
    await navigator.clipboard.writeText(await textPromise)
    return true
  } catch {
    return false
  }
}
