// Centraliza o tratamento de erro de operações no Supabase.
// Uso: const { error } = await supabase...; if (dbError(error, toast, 'salvar cliente')) return
export function dbError(
  error: { message?: string } | null | undefined,
  toast: (msg: string) => void,
  action = 'salvar',
): boolean {
  if (!error) return false
  console.error(`[db] erro ao ${action}:`, error)
  toast(`Erro ao ${action}. ${error.message ?? 'Tente novamente.'}`)
  return true
}
