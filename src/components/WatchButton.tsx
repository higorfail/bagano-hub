'use client'

import { useEffect, useState } from 'react'
import { Eye } from 'lucide-react'
import { getWatcherIds, toggleWatch } from '@/lib/watch'
import { useUser } from '@/lib/UserContext'

export default function WatchButton({ tableName, recordId }: { tableName: string; recordId?: string }) {
  const { currentMember, members } = useUser()
  const [watcherIds, setWatcherIds] = useState<string[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!recordId) { setWatcherIds([]); return }
    getWatcherIds(tableName, recordId).then(setWatcherIds)
  }, [tableName, recordId])

  if (!recordId || !currentMember) return null
  const watching = watcherIds.includes(currentMember.id)
  const watchers = watcherIds.map(id => members.find(m => m.id === id)).filter(Boolean) as { id: string; name: string; color?: string }[]

  async function handleToggle() {
    setLoading(true)
    await toggleWatch(tableName, recordId!, currentMember!.id, watching)
    setWatcherIds(prev => watching ? prev.filter(id => id !== currentMember!.id) : [...prev, currentMember!.id])
    setLoading(false)
  }

  return (
    <div className="flex items-center gap-1.5">
      <button onClick={handleToggle} disabled={loading} title={watching ? 'Parar de observar' : 'Observar — receber notificações de atividade neste card'}
        className={`flex items-center gap-1.5 text-[11px] font-medium px-2.5 py-1 rounded-lg border transition-colors ${watching
          ? 'border-[var(--color-accent)] text-[var(--color-accent)] bg-[var(--color-accent)]/10'
          : 'border-[var(--color-border)] text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-bg-subtle)]'}`}>
        <Eye size={12} /> {watching ? 'Observando' : 'Observar'}
      </button>
      {watchers.length > 0 && (
        <div className="flex -space-x-1.5" title={watchers.map(w => w.name).join(', ')}>
          {watchers.slice(0, 4).map(w => (
            <div key={w.id}
              className="w-5 h-5 rounded-full border-2 border-[var(--color-bg-card)] flex items-center justify-center text-white text-[8px] font-bold"
              style={{ background: w.color || 'var(--color-brand)' }}>
              {w.name.split(' ').map(x => x[0]).join('').slice(0, 2).toUpperCase()}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
