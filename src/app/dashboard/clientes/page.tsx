'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import { useUser } from '@/lib/UserContext'

type Client = {
  id: string
  name: string
  color_hex: string
  logo_url: string
  drive_folder_url: string
  sous_chef_url: string
  instagram_url: string
  instagram_followers: number | null
  instagram_following: number | null
  status: string
}

const PRESET_COLORS = [
  '#1A1916', '#dc2626', '#ea580c', '#d97706', '#16a34a',
  '#0891b2', '#2563eb', '#7c3aed', '#db2777', '#475569',
]

const EMPTY_FORM = { name: '', color_hex: '#2563eb', logo_url: '', drive_folder_url: '', sous_chef_url: '', instagram_url: '', instagram_followers: '', instagram_following: '' }

function getInitials(name: string) {
  return name.split(' ').map((w: string) => w[0]).join('').slice(0, 2).toUpperCase()
}

export default function ClientesPage() {
  const { currentMember, showOnlyMine } = useUser()
  const [clients, setClients] = useState<Client[]>([])
  const [myClientIds, setMyClientIds] = useState<string[]>([])
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [form, setForm] = useState(EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const [editingClient, setEditingClient] = useState<Client | null>(null)

  useEffect(() => {
    load()
  }, [currentMember])

  async function load() {
    const supabase = createClient()
    const { data } = await supabase.from('clients').select('*').eq('status', 'active').order('name')
    setClients(data || [])
    const { data: teamData } = await supabase.from('client_team').select('client_id, member_id')
    if (currentMember && teamData) {
      setMyClientIds(teamData.filter(t => t.member_id === currentMember.id).map(t => t.client_id))
    }
    setLoading(false)
  }

  function openCreate() {
    setEditingClient(null)
    setForm(EMPTY_FORM)
    setShowModal(true)
  }

  function openEdit(c: Client, e: React.MouseEvent) {
    e.preventDefault()
    e.stopPropagation()
    setEditingClient(c)
    setForm({ name: c.name, color_hex: c.color_hex, logo_url: c.logo_url || '', drive_folder_url: c.drive_folder_url || '', sous_chef_url: c.sous_chef_url || '', instagram_url: c.instagram_url || '', instagram_followers: c.instagram_followers?.toString() || '', instagram_following: c.instagram_following?.toString() || '' })
    setShowModal(true)
  }

  async function save() {
    if (!form.name.trim()) return
    setSaving(true)
    const supabase = createClient()
    const payload = {
      ...form,
      instagram_followers: form.instagram_followers ? parseInt(form.instagram_followers) : null,
      instagram_following: form.instagram_following ? parseInt(form.instagram_following) : null,
    }
    if (editingClient) {
      await supabase.from('clients').update(payload).eq('id', editingClient.id)
    } else {
      await supabase.from('clients').insert({ ...payload, status: 'active' })
    }
    await load()
    setShowModal(false)
    setSaving(false)
  }

  async function deactivate() {
    if (!editingClient) return
    setSaving(true)
    const supabase = createClient()
    await supabase.from('clients').update({ status: 'inactive' }).eq('id', editingClient.id)
    await load()
    setShowModal(false)
    setSaving(false)
  }

  const filtered = clients.filter(c =>
    c.name.toLowerCase().includes(search.toLowerCase()) &&
    (!showOnlyMine || !currentMember || myClientIds.includes(c.id))
  )

  if (loading) return (
    <div className="p-6 flex items-center justify-center h-full">
      <p className="text-[var(--color-text-muted)] text-sm">Carregando clientes...</p>
    </div>
  )

  return (
    <div className="p-6 flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-[var(--color-text-primary)] font-semibold text-lg">Clientes</h1>
          <p className="text-[var(--color-text-secondary)] text-sm mt-0.5">{clients.length} clientes ativos</p>
        </div>
        <button
          onClick={openCreate}
          className="bg-[var(--color-text-primary)] text-white rounded-lg px-4 py-2 text-sm font-medium hover:opacity-90 transition-opacity"
        >
          + Novo cliente
        </button>
      </div>

      <input
        type="text"
        placeholder="Buscar cliente..."
        value={search}
        onChange={e => setSearch(e.target.value)}
        className="w-full max-w-xs border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm outline-none focus:border-[var(--color-brand)] bg-[var(--color-bg-card)]"
      />

      <div className="grid grid-cols-4 gap-4">
        {filtered.map(client => (
          <a
            key={client.id}
            href={'/dashboard/clientes/' + client.id}
            className="bg-[var(--color-bg-card)] border border-[var(--color-border)] rounded-2xl p-4 block hover:shadow-sm transition-all group relative"
            style={{ borderLeftWidth: 3, borderLeftColor: client.color_hex }}
          >
            <button
              onClick={e => openEdit(client, e)}
              className="absolute top-3 right-3 w-7 h-7 rounded-lg flex items-center justify-center text-[var(--color-text-muted)] hover:bg-[var(--color-bg-subtle)] hover:text-[var(--color-text-primary)] opacity-0 group-hover:opacity-100 transition-all text-xs"
              title="Editar cliente"
            >
              ✏️
            </button>
            <div className="flex items-center gap-3 mb-4">
              <div
                className="w-10 h-10 rounded-xl flex items-center justify-center text-sm font-semibold text-white flex-shrink-0"
                style={{ background: client.color_hex }}
              >
                {getInitials(client.name)}
              </div>
              <div className="min-w-0">
                <p className="text-sm font-medium text-[var(--color-text-primary)] truncate">{client.name}</p>
              </div>
            </div>
          </a>
        ))}
      </div>

      {/* Modal criar / editar */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/30" onClick={() => setShowModal(false)} />
          <div className="relative bg-[var(--color-bg-card)] rounded-2xl shadow-xl w-full max-w-md p-6 flex flex-col gap-5">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-semibold text-[var(--color-text-primary)]">
                {editingClient ? 'Editar cliente' : 'Novo cliente'}
              </h2>
              <button onClick={() => setShowModal(false)} className="w-8 h-8 rounded-lg hover:bg-[var(--color-bg-subtle)] flex items-center justify-center text-[var(--color-text-muted)] text-lg">×</button>
            </div>

            {/* Preview do avatar */}
            <div className="flex items-center gap-3">
              <div
                className="w-12 h-12 rounded-xl flex items-center justify-center text-white font-bold text-sm flex-shrink-0"
                style={{ background: form.color_hex }}
              >
                {form.name ? getInitials(form.name) : '?'}
              </div>
              <p className="text-sm text-[var(--color-text-muted)]">Prévia do avatar</p>
            </div>

            <div className="flex flex-col gap-4">
              <div>
                <label className="text-xs font-medium text-[var(--color-text-secondary)] mb-1.5 block">Nome do cliente *</label>
                <input
                  autoFocus
                  type="text"
                  value={form.name}
                  onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                  onKeyDown={e => e.key === 'Enter' && save()}
                  placeholder="Ex: Gee Sorvetes"
                  className="w-full border border-[var(--color-border)] rounded-xl px-3 py-2.5 text-sm outline-none focus:border-[var(--color-brand)] text-[var(--color-text-primary)]"
                />
              </div>

              <div>
                <label className="text-xs font-medium text-[var(--color-text-secondary)] mb-1.5 block">Cor</label>
                <div className="flex items-center gap-2 flex-wrap">
                  {PRESET_COLORS.map(c => (
                    <button
                      key={c}
                      onClick={() => setForm(f => ({ ...f, color_hex: c }))}
                      className="w-7 h-7 rounded-lg transition-all"
                      style={{
                        background: c,
                        boxShadow: form.color_hex === c ? `0 0 0 2px white, 0 0 0 4px ${c}` : 'none'
                      }}
                    />
                  ))}
                  <input
                    type="color"
                    value={form.color_hex}
                    onChange={e => setForm(f => ({ ...f, color_hex: e.target.value }))}
                    className="w-7 h-7 rounded-lg cursor-pointer border border-[var(--color-border)] p-0.5"
                    title="Cor personalizada"
                  />
                </div>
              </div>

              <div>
                <label className="text-xs font-medium text-[var(--color-text-secondary)] mb-1.5 block">Link do Drive</label>
                <input
                  type="url"
                  value={form.drive_folder_url}
                  onChange={e => setForm(f => ({ ...f, drive_folder_url: e.target.value }))}
                  placeholder="https://drive.google.com/..."
                  className="w-full border border-[var(--color-border)] rounded-xl px-3 py-2.5 text-sm outline-none focus:border-[var(--color-brand)] text-[var(--color-text-primary)]"
                />
              </div>

              <div>
                <label className="text-xs font-medium text-[var(--color-text-secondary)] mb-1.5 block">Link do Manual (Sous Chef)</label>
                <input
                  type="url"
                  value={form.sous_chef_url}
                  onChange={e => setForm(f => ({ ...f, sous_chef_url: e.target.value }))}
                  placeholder="https://..."
                  className="w-full border border-[var(--color-border)] rounded-xl px-3 py-2.5 text-sm outline-none focus:border-[var(--color-brand)] text-[var(--color-text-primary)]"
                />
              </div>

              <div>
                <label className="text-xs font-medium text-[var(--color-text-secondary)] mb-1.5 block">Instagram</label>
                <input
                  type="url"
                  value={form.instagram_url}
                  onChange={e => setForm(f => ({ ...f, instagram_url: e.target.value }))}
                  placeholder="https://instagram.com/perfil"
                  className="w-full border border-[var(--color-border)] rounded-xl px-3 py-2.5 text-sm outline-none focus:border-[var(--color-brand)] text-[var(--color-text-primary)]"
                />
              </div>

              <div className="flex gap-3">
                <div className="flex-1">
                  <label className="text-xs font-medium text-[var(--color-text-secondary)] mb-1.5 block">Seguidores</label>
                  <input
                    type="number"
                    value={form.instagram_followers}
                    onChange={e => setForm(f => ({ ...f, instagram_followers: e.target.value }))}
                    placeholder="0"
                    className="w-full border border-[var(--color-border)] rounded-xl px-3 py-2.5 text-sm outline-none focus:border-[var(--color-brand)] text-[var(--color-text-primary)]"
                  />
                </div>
                <div className="flex-1">
                  <label className="text-xs font-medium text-[var(--color-text-secondary)] mb-1.5 block">Seguindo</label>
                  <input
                    type="number"
                    value={form.instagram_following}
                    onChange={e => setForm(f => ({ ...f, instagram_following: e.target.value }))}
                    placeholder="0"
                    className="w-full border border-[var(--color-border)] rounded-xl px-3 py-2.5 text-sm outline-none focus:border-[var(--color-brand)] text-[var(--color-text-primary)]"
                  />
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2 pt-1">
              {editingClient && (
                <button
                  onClick={deactivate}
                  disabled={saving}
                  className="text-xs text-red-500 hover:text-red-700 font-medium px-3 py-2 rounded-lg hover:bg-red-50 transition-colors"
                >
                  Desativar cliente
                </button>
              )}
              <div className="flex-1" />
              <button
                onClick={() => setShowModal(false)}
                className="px-4 py-2 rounded-xl text-sm font-medium text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-subtle)] transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={save}
                disabled={saving || !form.name.trim()}
                className="px-5 py-2 rounded-xl text-sm font-semibold bg-[var(--color-brand)] text-[var(--color-brand-fg)] hover:opacity-90 disabled:opacity-40 transition-opacity"
              >
                {saving ? 'Salvando...' : editingClient ? 'Salvar' : 'Criar cliente'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
