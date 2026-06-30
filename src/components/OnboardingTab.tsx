'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import { Plus, Trash2, Check, ChevronUp, ChevronDown } from 'lucide-react'

type Task = { id: string; title: string; done: boolean; order_index: number }

const DEFAULT_TASKS = [
  'Briefing completo preenchido',
  'Acesso às redes sociais concedido',
  'Pasta do Drive criada e compartilhada',
  'Reunião de alinhamento realizada',
  'Identidade visual recebida',
  'Primeiros posts planejados',
  'Calendário do mês 1 aprovado',
]

export default function OnboardingTab({ clientId }: { clientId: string }) {
  const [tasks, setTasks]     = useState<Task[]>([])
  const [loading, setLoading] = useState(true)
  const [newTitle, setNewTitle] = useState('')
  const [adding, setAdding]   = useState(false)
  const [saving, setSaving]   = useState(false)
  const [error, setError]     = useState<string | null>(null)

  useEffect(() => { load() }, [clientId])

  async function load() {
    const { data, error } = await createClient()
      .from('onboarding_tasks')
      .select('id, title, done, order_index')
      .eq('client_id', clientId)
      .order('order_index')
    if (error) { setError(error.message); setLoading(false); return }
    if (data && data.length > 0) {
      setTasks(data)
    } else if (data && data.length === 0) {
      await seedDefaults()
    }
    setLoading(false)
  }

  async function seedDefaults() {
    const supabase = createClient()
    const rows = DEFAULT_TASKS.map((title, i) => ({ client_id: clientId, title, done: false, order_index: i }))
    const { data, error } = await supabase.from('onboarding_tasks').insert(rows).select('id, title, done, order_index')
    if (error) { setError(error.message); return }
    setTasks(data || [])
  }

  async function toggle(task: Task) {
    const done = !task.done
    const { error } = await createClient().from('onboarding_tasks').update({ done, done_at: done ? new Date().toISOString() : null }).eq('id', task.id)
    if (error) { setError(error.message); return }
    setTasks(ts => ts.map(t => t.id === task.id ? { ...t, done } : t))
  }

  async function addTask() {
    if (!newTitle.trim()) return
    setSaving(true)
    setError(null)
    const { data, error } = await createClient().from('onboarding_tasks').insert({
      client_id: clientId, title: newTitle.trim(), done: false, order_index: tasks.length
    }).select('id, title, done, order_index').single()
    if (error) { setError(error.message); setSaving(false); return }
    if (data) setTasks(ts => [...ts, data])
    setNewTitle('')
    setAdding(false)
    setSaving(false)
  }

  async function remove(id: string) {
    const { error } = await createClient().from('onboarding_tasks').delete().eq('id', id)
    if (error) { setError(error.message); return }
    setTasks(ts => ts.filter(t => t.id !== id))
  }

  async function move(index: number, direction: -1 | 1) {
    const targetIndex = index + direction
    if (targetIndex < 0 || targetIndex >= tasks.length) return
    const reordered = [...tasks]
    ;[reordered[index], reordered[targetIndex]] = [reordered[targetIndex], reordered[index]]
    setTasks(reordered)
    const supabase = createClient()
    const [{ error: e1 }, { error: e2 }] = await Promise.all([
      supabase.from('onboarding_tasks').update({ order_index: index }).eq('id', reordered[index].id),
      supabase.from('onboarding_tasks').update({ order_index: targetIndex }).eq('id', reordered[targetIndex].id),
    ])
    const error = e1 || e2
    if (error) setError(error.message)
  }

  if (loading) return (
    <div className="flex items-center justify-center py-16">
      <div className="w-5 h-5 border-2 border-[var(--color-border)] border-t-[#1A1916] rounded-full animate-spin" />
    </div>
  )

  const done  = tasks.filter(t => t.done).length
  const total = tasks.length
  const pct   = total > 0 ? Math.round((done / total) * 100) : 0

  return (
    <div className="max-w-xl space-y-5">
      {error && (
        <div className="rounded-xl px-4 py-3 text-sm border" style={{ background: 'var(--ds-error-bg)', borderColor: 'var(--ds-error-border)', color: 'var(--ds-error-text)' }}>
          Erro: {error}
        </div>
      )}
      {/* Progress */}
      <div className="bg-[var(--color-bg-card)] rounded-2xl border border-[var(--color-border)] p-5">
        <div className="flex items-center justify-between mb-3">
          <p className="text-sm font-semibold text-[var(--color-text-primary)]">Progresso do onboarding</p>
          <span className="text-sm font-bold text-[var(--color-text-primary)]">{pct}%</span>
        </div>
        <div className="w-full bg-[var(--color-bg-subtle)] rounded-full h-2">
          <div
            className="h-2 rounded-full transition-all duration-500"
            style={{ width: `${pct}%`, backgroundColor: pct === 100 ? '#22c55e' : 'var(--color-brand)' }}
          />
        </div>
        <p className="text-xs text-[var(--color-text-muted)] mt-2">{done} de {total} etapas concluídas</p>
      </div>

      {/* Tasks */}
      <div className="bg-[var(--color-bg-card)] rounded-2xl border border-[var(--color-border)] overflow-hidden divide-y divide-[var(--color-border)]">
        {tasks.map((task, i) => (
          <div key={task.id} className="flex items-center gap-3 px-5 py-3.5 group hover:bg-[var(--color-bg-subtle)] transition-colors">
            <div className="flex flex-col -my-1 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
              <button
                onClick={() => move(i, -1)}
                disabled={i === 0}
                className="w-5 h-4 flex items-center justify-center text-[var(--color-text-faint)] hover:text-[var(--color-text-primary)] disabled:opacity-30"
              >
                <ChevronUp size={12} />
              </button>
              <button
                onClick={() => move(i, 1)}
                disabled={i === tasks.length - 1}
                className="w-5 h-4 flex items-center justify-center text-[var(--color-text-faint)] hover:text-[var(--color-text-primary)] disabled:opacity-30"
              >
                <ChevronDown size={12} />
              </button>
            </div>
            <button
              onClick={() => toggle(task)}
              className={`w-5 h-5 rounded-md border-2 flex-shrink-0 flex items-center justify-center transition-all ${task.done ? 'border-[var(--ds-success-accent)]' : 'border-[var(--color-border)] hover:border-[var(--ds-success-accent)]'}`} style={task.done ? { background: 'var(--ds-success-accent)' } : {}}
            >
              {task.done && <Check size={11} className="text-white" strokeWidth={3} />}
            </button>
            <span className={`flex-1 text-sm transition-all ${task.done ? 'line-through text-[var(--color-text-muted)]' : 'text-[var(--color-text-primary)]'}`}>
              {task.title}
            </span>
            <button
              onClick={() => remove(task.id)}
              className="opacity-0 group-hover:opacity-100 w-7 h-7 rounded-lg flex items-center justify-center text-[var(--color-text-faint)] transition-all"
                onMouseEnter={e => { e.currentTarget.style.color = 'var(--ds-error-text)'; e.currentTarget.style.background = 'var(--ds-error-bg)' }}
                onMouseLeave={e => { e.currentTarget.style.color = ''; e.currentTarget.style.background = '' }}
            >
              <Trash2 size={13} />
            </button>
          </div>
        ))}

        {/* Adicionar */}
        {adding ? (
          <div className="flex items-center gap-2 px-5 py-3">
            <input
              autoFocus
              type="text"
              value={newTitle}
              onChange={e => setNewTitle(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') addTask(); if (e.key === 'Escape') setAdding(false) }}
              placeholder="Nova etapa..."
              className="flex-1 text-sm outline-none bg-transparent text-[var(--color-text-primary)] placeholder:text-[var(--color-text-faint)]"
            />
            <button onClick={addTask} disabled={saving || !newTitle.trim()}
              className="text-xs px-3 py-1.5 rounded-lg bg-[var(--color-brand)] text-[var(--color-brand-fg)] font-semibold disabled:opacity-40">
              {saving ? '...' : 'Adicionar'}
            </button>
            <button onClick={() => setAdding(false)} className="text-xs text-[var(--color-text-muted)] px-2 py-1.5 hover:bg-[var(--color-bg-subtle)] rounded-lg">
              Cancelar
            </button>
          </div>
        ) : (
          <button
            onClick={() => setAdding(true)}
            className="w-full flex items-center gap-2 px-5 py-3.5 text-sm text-[var(--color-text-muted)] hover:bg-[var(--color-bg-subtle)] transition-colors"
          >
            <Plus size={14} />
            Adicionar etapa
          </button>
        )}
      </div>
    </div>
  )
}
