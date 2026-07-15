// Nome de host limpo pra exibir link em vez da URL crua (padrão Trello-like)
export function hostOf(url: string) {
  try { return new URL(url).hostname.replace('www.', '') } catch { return url }
}
