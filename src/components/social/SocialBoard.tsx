'use client'

import { useState } from 'react'
import { SocialItem, SOCIAL_COLUMNS, SocialColumn, moveSocialItem, scheduleSocialItem } from '@/lib/socialItems'
import { groupByClient, useClientGrouping } from '@/lib/useClientGrouping'
import { useToast } from '@/lib/ToastContext'
import { dbError } from '@/lib/dbError'
import SocialItemCard from './SocialItemCard'
import { ChevronDown, ChevronRight } from 'lucide-react'

type Client = { id: string; name: string; color_hex: string }

type Props = {
  items: SocialItem[]
  clients: Client[]
  onOpenItem: (item: SocialItem) => void
  onItemsChange: (updater: (items: SocialItem[]) => SocialItem[]) => void
}

export default function SocialBoard({ items, clients, onOpenItem, onItemsChange }: Props) {
  const { toast } = useToast()
  const [dragging, setDragging] = useState<string | null>(null)
  const [dragOver, setDragOver] = useState<string | null>(null)
  const { isCollapsed, toggleCollapse, draggingGroup, setDraggingGroup, dragCounters } = useClientGrouping()

  function getClient(id: string | null) { return clients.find(c => c.id === id) }

  // Sem data primeiro (precisam de atenção pra ganhar uma), depois cronológico —
  // sem isso a ordem era só a da consulta ao banco, sem nenhum sentido visual.
  function sortByDate(list: SocialItem[]) {
    return [...list].sort((a, b) => {
      if (!a.scheduledDate && !b.scheduledDate) return 0
      if (!a.scheduledDate) return -1
      if (!b.scheduledDate) return 1
      return a.scheduledDate.localeCompare(b.scheduledDate) || (a.scheduledTime || '').localeCompare(b.scheduledTime || '')
    })
  }
  function getColItems(col: SocialColumn) { return sortByDate(items.filter(i => i.column === col)) }

  async function moveItem(itemId: string, toColumn: SocialColumn) {
    const item = items.find(i => i.id === itemId)
    if (!item || item.column === toColumn) return
    const prev = items
    onItemsChange(list => list.map(i => i.id === itemId ? { ...i, column: toColumn } : i))
    const { error } = await moveSocialItem(item, toColumn)
    if (error) { onItemsChange(() => prev); dbError(error, toast, 'mover publicação') }
  }

  async function schedule(itemId: string, date: string) {
    const item = items.find(i => i.id === itemId)
    if (!item) return
    const prev = items
    onItemsChange(list => list.map(i => i.id === itemId ? { ...i, scheduledDate: date, column: 'agendado' } : i))
    const { error } = await scheduleSocialItem(item, date)
    if (error) { onItemsChange(() => prev); dbError(error, toast, 'agendar') }
  }

  async function moveGroup(clientKey: string, fromCol: SocialColumn, toCol: SocialColumn) {
    if (fromCol === toCol) return
    const groupItems = getColItems(fromCol).filter(i => (i.clientId || '_sem_cliente') === clientKey)
    if (groupItems.length === 0) return
    const prev = items
    const ids = new Set(groupItems.map(i => i.id))
    onItemsChange(list => list.map(i => ids.has(i.id) ? { ...i, column: toCol } : i))
    const results = await Promise.all(groupItems.map(i => moveSocialItem(i, toCol)))
    const failed = results.find(r => r.error)
    if (failed?.error) { onItemsChange(() => prev); dbError(failed.error, toast, 'mover cliente') }
  }

  return (
    <div className="flex-1 overflow-x-auto p-4 snap-x snap-mandatory lg:snap-none">
      <div className="flex gap-4 h-full">
        {SOCIAL_COLUMNS.map(col => {
          const colItems = getColItems(col.key)
          const groups = groupByClient(colItems, i => i.clientId)
          const isDragOver = dragOver === col.key
          return (
            <div
              key={col.key}
              className={`flex flex-col w-[calc(100vw-2rem)] md:w-[380px] lg:w-auto lg:flex-1 lg:min-w-[300px] lg:max-w-[460px] flex-shrink-0 snap-center lg:snap-align-none rounded-2xl overflow-hidden transition-all ${isDragOver ? 'ring-2 ring-offset-1' : ''}`}
              style={isDragOver ? { outline: `2px solid ${col.color}`, outlineOffset: 1 } : {}}
              onDragEnter={() => {
                dragCounters.current[col.key] = (dragCounters.current[col.key] || 0) + 1
                setDragOver(col.key)
              }}
              onDragLeave={() => {
                dragCounters.current[col.key] = (dragCounters.current[col.key] || 1) - 1
                if (dragCounters.current[col.key] <= 0) { dragCounters.current[col.key] = 0; setDragOver(null) }
              }}
              onDragOver={e => e.preventDefault()}
              onDrop={() => {
                if (draggingGroup) moveGroup(draggingGroup.clientId, draggingGroup.fromCol as SocialColumn, col.key)
                else if (dragging) moveItem(dragging, col.key)
                dragCounters.current[col.key] = 0
                setDragging(null); setDragOver(null); setDraggingGroup(null)
              }}
            >
              <div className="px-3 py-2.5 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: col.color }} />
                  <span className="text-xs font-semibold text-[var(--color-text-primary)]">{col.label}</span>
                </div>
                <span className="text-[10px] font-bold text-[var(--color-text-muted)] bg-[var(--color-bg-card)] rounded-full w-5 h-5 flex items-center justify-center border border-[var(--color-border)]">
                  {colItems.length}
                </span>
              </div>

              <div className="flex-1 overflow-y-auto px-2 pb-2 flex flex-col gap-1.5">
                {colItems.length === 0 && (
                  <div className={`flex items-center justify-center h-20 border-2 border-dashed rounded-xl mx-1 transition-colors ${isDragOver ? 'border-[var(--color-brand)] bg-[var(--color-brand)]/5' : 'border-[var(--color-border)]'}`}>
                    <p className={`text-[10px] font-medium ${isDragOver ? 'text-[var(--color-brand)]' : 'text-[var(--color-text-faint)]'}`}>
                      {isDragOver ? 'Solte aqui' : '—'}
                    </p>
                  </div>
                )}

                {groups.map(([clientKey, groupItems]) => {
                  const client = getClient(clientKey)
                  const groupKey = `${col.key}:${clientKey}`
                  const collapsed = isCollapsed(groupKey)
                  const isGroupDragging = draggingGroup?.clientId === clientKey && draggingGroup?.fromCol === col.key
                  const byType = groupItems.reduce((acc, i) => {
                    const label = i.postType || '—'
                    acc[label] = (acc[label] || 0) + 1
                    return acc
                  }, {} as Record<string, number>)
                  return (
                    <div key={clientKey} className="flex flex-col gap-1 transition-opacity" style={{ opacity: isGroupDragging ? 0.4 : 1 }}>
                      <button
                        draggable
                        onDragStart={e => { setDraggingGroup({ clientId: clientKey, fromCol: col.key }); e.dataTransfer.effectAllowed = 'move'; e.stopPropagation() }}
                        onDragEnd={() => { setDraggingGroup(null); setDragOver(null); dragCounters.current = {} }}
                        onClick={() => toggleCollapse(groupKey)}
                        title="Arraste para mover o cliente inteiro de coluna"
                        className="flex items-center gap-2 px-2 py-1.5 rounded-xl hover:bg-[var(--color-bg-card)] transition-colors w-full text-left group cursor-grab active:cursor-grabbing"
                      >
                        <div className="w-4 h-4 rounded-md flex items-center justify-center text-white text-[9px] font-bold flex-shrink-0" style={{ background: client?.color_hex || '#A8A59E' }}>
                          {client?.name?.slice(0, 1) || '?'}
                        </div>
                        <span className="text-[11px] font-semibold text-[var(--color-text-secondary)] flex-1 truncate">{client?.name || 'Sem cliente'}</span>
                        <span className="text-[10px] text-[var(--color-text-faint)]">{groupItems.length}</span>
                        {collapsed
                          ? <ChevronRight size={11} className="text-[var(--color-text-faint)] flex-shrink-0" />
                          : <ChevronDown size={11} className="text-[var(--color-text-faint)] flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" />
                        }
                      </button>

                      {collapsed && (
                        <div className="mx-1 px-3 py-2 rounded-xl bg-[var(--color-bg-card)] border border-[var(--color-border)] flex flex-wrap gap-1">
                          {Object.entries(byType).map(([type, count]) => (
                            <span key={type} className="text-[10px] font-medium text-[var(--color-text-muted)]">{count}× {type}</span>
                          ))}
                        </div>
                      )}

                      {!collapsed && groupItems.map(item => (
                        <SocialItemCard
                          key={item.id}
                          item={item}
                          client={client}
                          compact
                          draggable
                          onDragStart={() => setDragging(item.id)}
                          onDragEnd={() => { setDragging(null); setDragOver(null); dragCounters.current = {} }}
                          onClick={() => onOpenItem(item)}
                          onPublish={() => moveItem(item.id, 'publicado')}
                          onSchedule={date => schedule(item.id, date)}
                        />
                      ))}
                    </div>
                  )
                })}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
