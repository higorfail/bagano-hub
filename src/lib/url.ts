// Nome de host limpo pra exibir link em vez da URL crua (padrão Trello-like)
export function hostOf(url: string) {
  try { return new URL(url).hostname.replace('www.', '') } catch { return url }
}

export function formatBytes(bytes: number) {
  if (bytes < 1024) return bytes + ' B'
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB'
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB'
}
