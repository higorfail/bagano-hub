// Lê o que foi REALMENTE colado em drive_url, em vez de assumir "um link, um
// arquivo" — alguém pode entregar várias fotos como links soltos (separados
// por espaço/quebra de linha) em vez de subir tudo numa pasta do Drive.
// Extrai TODOS os IDs de arquivo presentes no texto, não só o primeiro.
export function extractDriveIds(driveUrl?: string | null): string[] {
  if (!driveUrl) return []
  const matches = driveUrl.match(/[-\w]{25,}/g) || []
  return Array.from(new Set(matches))
}
