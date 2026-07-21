// Agrupamento/colapso de cards por cliente dentro de uma coluna — extraído do
// Kanban (src/app/dashboard/kanban/page.tsx) para ser reaproveitado por qualquer
// board com o mesmo padrão (ex.: página de Publicações).
import { useRef, useState } from 'react'

export function groupByClient<T>(items: T[], keyOf: (item: T) => string | null = (item: any) => item.client_id): [string, T[]][] {
  const map: Record<string, T[]> = {}
  for (const item of items) {
    const key = keyOf(item) || '_sem_cliente'
    if (!map[key]) map[key] = []
    map[key].push(item)
  }
  return Object.entries(map)
}

export function useClientGrouping() {
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [draggingGroup, setDraggingGroup] = useState<{ clientId: string; fromCol: string } | null>(null)
  const dragCounters = useRef<Record<string, number>>({})

  function toggleCollapse(groupKey: string) {
    setExpanded(prev => {
      const next = new Set(prev)
      if (next.has(groupKey)) next.delete(groupKey); else next.add(groupKey)
      return next
    })
  }

  function isCollapsed(groupKey: string) {
    return !expanded.has(groupKey)
  }

  return { expanded, isCollapsed, toggleCollapse, draggingGroup, setDraggingGroup, dragCounters }
}
