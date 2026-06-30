'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import { Plus, Trash2, Pencil, Check, X, Users } from 'lucide-react'
import { moveToTrash } from '@/lib/trash'

type Member = { id: string; name: string; role: string; color: string }

const ROLES = [
  { value: 'videos',     label: 'Editor de vídeo' },
  { value: 'posts',      label: 'Designer' },
  { value: 'estrategia', label: 'Estratégia' },
  { value: 'social',     label: 'Social Media' },
  { value: 'acompanha',  label: 'Acompanha' },
  { value: 'outro',      label: 'Outro' },
]

const COLORS = [
  '#6366f1','#8b5cf6','#ec4899','#ef4444',
  '#f97316','#eab308','#22c55e','#14b8a6',
  '#3b82f6','#06b6d4','#a855f7','#64748b',
]

function initials(name: string) {
  return name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()
}

const emptyForm = { name: '', role: 'posts', color: '#6366f1' }

export default function EquipePage() {
  const [members,  setMembers]  = useState<Member[]>([])
  const [loading,  setLoading]  = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [form,     setForm]     = useState(emptyForm)
  const [saving,   setSaving]   = useState(false)
  const [editing,  setEditing]  = useState<string | null>(null)
  const [editForm, setEditForm] = useState(emptyForm)
  const [deleting, setDeleting] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)

  useEffect(() => { load() }, [])

  async function load() {
    const { data } = await createClient().from('team_members').select('id, name, role, color').order('name')
    setMembers(data || [])
    setLoading(false)
  }

  async function save() {
    if (!form.name.trim()) return
    setSaving(true)
    await createClient().from('team_members').insert({ name: form.name.trim(), role: form.role, color: form.color })
    await load()
    setForm(emptyForm)
    setShowForm(false)
    setSaving(false)
  }

  async function saveEdit(id: string) {
    if (!editForm.name.trim()) return
    await createClient().from('team_members').update({ name: editForm.name.trim(), role: editForm.role, color: editForm.color }).eq('id', id)
    await load()
    setEditing(null)
  }

  async function remove(id: string) {
    setDeleting(id)
    const member = members.find(m => m.id === id)
    if (member) {
      try { await moveToTrash('member', id, member.name) } catch { /* trash table missing */ }
    }
    await createClient().from('team_members').delete().eq('id', id)
    setMembers(m => m.filter(x => x.id !== id))
    setDeleting(null)
    setConfirmDelete(null)
  }

  if (loading) return (
    <div className="flex items-center justify-center h-full">
      <div className="w-5 h-5 border-2 border-[var(--color-border)] border-t-[var(--color-text-primary)] rounded-full animate-spin" />
    </div>
  )

  return (
    <div className="min-h-screen bg-[var(--color-bg-page)]">
      <div className="max-w-5xl mx-auto px-8 py-10">

        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-bold text-[var(--color-text-primary)] tracking-tight">Equipe</h1>
            <p className="text-sm text-[var(--color-text-muted)] mt-0.5">{members.length} colaborador{members.length !== 1 ? 'es' : ''}</p>
          </div>
          <button
            onClick={() => { setShowForm(true); setForm(emptyForm) }}
            className="flex items-center gap-2 bg-[var(--color-brand)] text-[var(--color-brand-fg)] rounded-xl px-4 py-2.5 text-sm font-semibold hover:opacity-90 transition-opacity"
          >
            <Plus size={15} />
            Novo membro
          </button>
        </div>

        {/* Cards grid */}
        {members.length === 0 ? (
          <div className="text-center py-32 flex flex-col items-center gap-4">
            <div className="w-16 h-16 rounded-2xl bg-[var(--color-bg-subtle)] flex items-center justify-center">
              <Users size={28} strokeWidth={1.5} className="text-[var(--color-text-faint)]" />
            </div>
            <div>
              <p className="font-medium text-[var(--color-text-primary)]">Nenhum colaborador ainda</p>
              <p className="text-sm text-[var(--color-text-muted)] mt-1">Adicione os membros da equipe para começar</p>
            </div>
            <button
              onClick={() => setShowForm(true)}
              className="mt-2 text-sm font-semibold text-[var(--color-brand)] hover:opacity-70 transition-opacity"
            >
              + Adicionar primeiro membro
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-4 gap-4">
            {members.map(m => (
              <div
                key={m.id}
                className="bg-[var(--color-bg-card)] rounded-2xl border border-[var(--color-border)] overflow-hidden group relative shadow-card"
              >
                {/* Color bar */}
                <div className="h-1 w-full" style={{ background: m.color }} />

                {editing === m.id ? (
                  /* ── Edit mode ── */
                  <div className="p-5 space-y-4">
                    <p className="text-xs font-semibold text-[var(--color-text-muted)] uppercase tracking-wider">Editar</p>
                    <input
                      autoFocus
                      type="text"
                      value={editForm.name}
                      onChange={e => setEditForm(f => ({ ...f, name: e.target.value }))}
                      onKeyDown={e => { if (e.key === 'Enter') saveEdit(m.id); if (e.key === 'Escape') setEditing(null) }}
                      placeholder="Nome"
                      className="w-full border border-[var(--color-border)] rounded-xl px-3 py-2 text-sm outline-none focus:border-[var(--color-brand)] bg-[var(--color-bg-page)] text-[var(--color-text-primary)]"
                    />
                    <select
                      value={editForm.role}
                      onChange={e => setEditForm(f => ({ ...f, role: e.target.value }))}
                      className="w-full border border-[var(--color-border)] rounded-xl px-3 py-2 text-sm outline-none focus:border-[var(--color-brand)] bg-[var(--color-bg-page)] text-[var(--color-text-primary)]"
                    >
                      {ROLES.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
                    </select>
                    <div className="flex gap-1.5 flex-wrap">
                      {COLORS.map(c => (
                        <button
                          key={c}
                          onClick={() => setEditForm(f => ({ ...f, color: c }))}
                          className="w-6 h-6 rounded-lg transition-all"
                          style={{ background: c, outline: editForm.color === c ? `2px solid ${c}` : 'none', outlineOffset: 2 }}
                        />
                      ))}
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={() => saveEdit(m.id)}
                        className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl bg-[var(--color-brand)] text-[var(--color-brand-fg)] text-xs font-semibold hover:opacity-90 transition-opacity"
                      >
                        <Check size={12} /> Salvar
                      </button>
                      <button
                        onClick={() => setEditing(null)}
                        className="px-3 py-2 rounded-xl text-xs text-[var(--color-text-muted)] hover:bg-[var(--color-bg-subtle)] transition-colors"
                      >
                        <X size={12} />
                      </button>
                    </div>
                  </div>
                ) : confirmDelete === m.id ? (
                  /* ── Confirm delete ── */
                  <div className="p-5 flex flex-col items-center gap-3 text-center">
                    <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: 'var(--ds-error-bg)' }}>
                      <Trash2 size={16} style={{ color: 'var(--ds-error-accent)' }} />
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-[var(--color-text-primary)]">Remover {m.name.split(' ')[0]}?</p>
                      <p className="text-xs text-[var(--color-text-muted)] mt-0.5">Essa ação não pode ser desfeita</p>
                    </div>
                    <div className="flex gap-2 w-full">
                      <button
                        onClick={() => setConfirmDelete(null)}
                        className="flex-1 py-2 rounded-xl text-xs font-medium text-[var(--color-text-muted)] hover:bg-[var(--color-bg-subtle)] transition-colors"
                      >
                        Cancelar
                      </button>
                      <button
                        onClick={() => remove(m.id)}
                        disabled={deleting === m.id}
                        className="flex-1 py-2 rounded-xl text-xs font-semibold transition-colors disabled:opacity-50"
                        style={{ background: 'var(--ds-error-bg)', color: 'var(--ds-error-text)' }}
                      >
                        {deleting === m.id ? '...' : 'Remover'}
                      </button>
                    </div>
                  </div>
                ) : (
                  /* ── Normal view ── */
                  <div className="p-5">
                    {/* Avatar */}
                    <div className="flex flex-col items-center gap-3 mb-5">
                      <div
                        className="w-16 h-16 rounded-2xl flex items-center justify-center text-white text-xl font-bold flex-shrink-0"
                        style={{ background: m.color || '#6366f1' }}
                      >
                        {initials(m.name)}
                      </div>
                      <div className="text-center min-w-0 w-full">
                        <p className="font-semibold text-[var(--color-text-primary)] truncate">{m.name}</p>
                        <p className="text-xs text-[var(--color-text-muted)] mt-0.5">{ROLES.find(r => r.value === m.role)?.label || m.role}</p>
                      </div>
                    </div>

                    {/* Actions — visible on hover */}
                    <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button
                        onClick={() => { setEditing(m.id); setEditForm({ name: m.name, role: m.role || 'posts', color: m.color || '#6366f1' }) }}
                        className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl text-xs font-medium text-[var(--color-text-secondary)] bg-[var(--color-bg-subtle)] hover:bg-[var(--color-bg-page)] transition-colors"
                      >
                        <Pencil size={11} />
                        Editar
                      </button>
                      <button
                        onClick={() => setConfirmDelete(m.id)}
                        className="w-9 flex items-center justify-center rounded-xl text-[var(--color-text-muted)] bg-[var(--color-bg-subtle)] hover:bg-[var(--color-bg-page)] transition-colors"
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Modal novo membro */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/20 backdrop-blur-sm" onClick={() => setShowForm(false)} />
          <div className="relative bg-[var(--color-bg-card)] rounded-2xl border border-[var(--color-border)] w-full max-w-sm p-6 space-y-5 animate-scale-in shadow-pop">

            <div className="flex items-center justify-between">
              <p className="font-semibold text-[var(--color-text-primary)]">Novo colaborador</p>
              <button onClick={() => setShowForm(false)} className="w-8 h-8 flex items-center justify-center rounded-xl text-[var(--color-text-muted)] hover:bg-[var(--color-bg-subtle)]">
                <X size={16} />
              </button>
            </div>

            {/* Preview */}
            <div className="flex items-center gap-3 p-3 bg-[var(--color-bg-subtle)] rounded-xl">
              <div className="w-10 h-10 rounded-xl flex items-center justify-center text-white font-bold text-sm flex-shrink-0" style={{ background: form.color }}>
                {form.name ? initials(form.name) : '?'}
              </div>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-[var(--color-text-primary)] truncate">{form.name || 'Nome do colaborador'}</p>
                <p className="text-xs text-[var(--color-text-muted)]">{ROLES.find(r => r.value === form.role)?.label}</p>
              </div>
            </div>

            <div className="space-y-3">
              <input
                autoFocus
                type="text"
                value={form.name}
                onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                onKeyDown={e => e.key === 'Enter' && save()}
                placeholder="Nome completo"
                className="w-full border border-[var(--color-border)] rounded-xl px-3 py-2.5 text-sm outline-none focus:border-[var(--color-brand)] bg-[var(--color-bg-page)] text-[var(--color-text-primary)]"
              />
              <select
                value={form.role}
                onChange={e => setForm(f => ({ ...f, role: e.target.value }))}
                className="w-full border border-[var(--color-border)] rounded-xl px-3 py-2.5 text-sm outline-none focus:border-[var(--color-brand)] bg-[var(--color-bg-page)] text-[var(--color-text-primary)]"
              >
                {ROLES.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
              </select>
            </div>

            <div>
              <p className="text-xs font-medium text-[var(--color-text-muted)] mb-2">Cor</p>
              <div className="flex gap-2 flex-wrap">
                {COLORS.map(c => (
                  <button
                    key={c}
                    onClick={() => setForm(f => ({ ...f, color: c }))}
                    className="w-7 h-7 rounded-lg transition-all"
                    style={{ background: c, outline: form.color === c ? `2.5px solid ${c}` : 'none', outlineOffset: 2 }}
                  />
                ))}
              </div>
            </div>

            <div className="flex gap-2 pt-1">
              <button
                onClick={() => setShowForm(false)}
                className="px-4 py-2.5 rounded-xl text-sm text-[var(--color-text-muted)] hover:bg-[var(--color-bg-subtle)] transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={save}
                disabled={saving || !form.name.trim()}
                className="flex-1 px-5 py-2.5 rounded-xl bg-[var(--color-brand)] text-[var(--color-brand-fg)] text-sm font-semibold disabled:opacity-40 hover:opacity-90 transition-opacity"
              >
                {saving ? 'Salvando...' : 'Adicionar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
