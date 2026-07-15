'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import { useUser } from '@/lib/UserContext'
import { useToast } from '@/lib/ToastContext'
import { dbError } from '@/lib/dbError'
import Button from '@/components/ui/Button'

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
  useEffect(() => { document.title = 'Clientes · Bagano Hub' }, [])
  const { currentMember, showOnlyMine } = useUser()
  const { toast } = useToast()
  const [clients, setClients] = useState<Client[]>([])
  const [archivedClients, setArchivedClients] = useState<Client[]>([])
  const [myClientIds, setMyClientIds] = useState<string[]>([])
  const [search, setSearch] = useState('')
  const [showArchive, setShowArchive] = useState(false)
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [form, setForm] = useState(EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const [editingClient, setEditingClient] = useState<Client | null>(null)
  const [uploadingLogo, setUploadingLogo] = useState(false)
  const [pullingIg, setPullingIg] = useState(false)

  // Sobe um arquivo de imagem para o Storage e devolve a URL pública estável
  async function uploadLogo(file: Blob, ext: string): Promise<string | null> {
    const supabase = createClient()
    const path = `posts/client-logos/${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`
    const { error } = await supabase.storage.from('bagano-materiais').upload(path, file, { upsert: false, contentType: file.type || undefined })
    if (error) { toast('Erro no upload: ' + error.message); return null }
    const { data: { publicUrl } } = supabase.storage.from('bagano-materiais').getPublicUrl(path)
    return publicUrl
  }

  async function handleLogoFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (file) {
      setUploadingLogo(true)
      const ext = (file.name.split('.').pop() || 'png').toLowerCase()
      const url = await uploadLogo(file, ext)
      if (url) setForm(f => ({ ...f, logo_url: url }))
      setUploadingLogo(false)
    }
    e.target.value = ''
  }

  async function pullFromInstagram() {
    if (!form.instagram_url.trim()) { toast('Preencha o link do Instagram primeiro'); return }
    setPullingIg(true)
    try {
      const res = await fetch('/api/instagram-avatar', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ instagram_url: form.instagram_url }),
      })
      const data = await res.json()
      if (!res.ok) { toast(data.error || 'Não foi possível puxar do Instagram'); return }
      // converte o dataUrl em Blob e re-hospeda no Storage
      const blob = await (await fetch(data.dataUrl)).blob()
      const ext = (data.contentType?.split('/')[1] || 'jpg').split(';')[0]
      const url = await uploadLogo(blob, ext)
      if (!url) return
      setForm(f => ({
        ...f,
        logo_url: url,
        instagram_followers: data.followers != null ? String(data.followers) : f.instagram_followers,
        instagram_following: data.following != null ? String(data.following) : f.instagram_following,
      }))
      toast('Foto atualizada a partir do Instagram')
    } catch {
      toast('Erro ao puxar do Instagram')
    } finally {
      setPullingIg(false)
    }
  }

  useEffect(() => {
    load()
  }, [currentMember])

  async function load() {
    const supabase = createClient()
    const { data } = await supabase.from('clients').select('*').eq('status', 'active').order('name')
    setClients(data || [])
    const { data: archived } = await supabase.from('clients').select('*').eq('status', 'inactive').order('name')
    setArchivedClients(archived || [])
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
    const { error } = editingClient
      ? await supabase.from('clients').update(payload).eq('id', editingClient.id)
      : await supabase.from('clients').insert({ ...payload, status: 'active' })
    if (dbError(error, toast, 'salvar cliente')) { setSaving(false); return }
    await load()
    setShowModal(false)
    setSaving(false)
  }

  async function deactivate() {
    if (!editingClient) return
    setSaving(true)
    const { error } = await createClient().from('clients').update({ status: 'inactive' }).eq('id', editingClient.id)
    if (dbError(error, toast, 'desativar cliente')) { setSaving(false); return }
    await load()
    setShowModal(false)
    setSaving(false)
  }

  async function reactivate() {
    if (!editingClient) return
    setSaving(true)
    const { error } = await createClient().from('clients').update({ status: 'active' }).eq('id', editingClient.id)
    if (dbError(error, toast, 'reativar cliente')) { setSaving(false); return }
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
    <div className="p-4 md:p-6 flex flex-col gap-5">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-baseline gap-2.5 min-w-0">
          <h1 className="text-xl font-bold text-[var(--color-text-primary)] tracking-tight">Clientes</h1>
          <p className="text-[var(--color-text-muted)] text-sm truncate">{clients.length} clientes ativos</p>
        </div>
        <Button variant="dark" onClick={openCreate}>+ Novo cliente</Button>
      </div>

      <input
        type="text"
        placeholder="Buscar cliente..."
        value={search}
        onChange={e => setSearch(e.target.value)}
        className="w-full sm:max-w-xs border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm text-[var(--color-text-primary)] placeholder:text-[var(--color-text-faint)] outline-none focus:border-[var(--color-brand)] bg-[var(--color-bg-card)]"
      />

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
        {filtered.map(client => (
          <a
            key={client.id}
            href={'/dashboard/clientes/' + client.id}
            className="bg-[var(--color-bg-card)] border border-[var(--color-border)] rounded-2xl p-4 block shadow-card hover:shadow-pop hover:-translate-y-0.5 hover:border-[var(--color-border-hover)] transition-all group relative"
            style={{ borderLeftWidth: 3, borderLeftColor: client.color_hex }}
          >
            <button
              onClick={e => openEdit(client, e)}
              className="absolute top-3 right-3 w-7 h-7 rounded-lg flex items-center justify-center text-[var(--color-text-muted)] hover:bg-[var(--color-bg-subtle)] hover:text-[var(--color-text-primary)] opacity-0 group-hover:opacity-100 transition-all text-xs"
              title="Editar cliente"
            >
              ✎
            </button>
            <div className="flex items-center gap-3 mb-4">
              {client.logo_url
                ? <img src={client.logo_url} alt={client.name} className="w-10 h-10 rounded-full object-cover flex-shrink-0" onError={e => { (e.target as HTMLImageElement).style.display = 'none' }} />
                : <div className="w-10 h-10 rounded-full flex items-center justify-center text-sm font-semibold text-white flex-shrink-0" style={{ background: client.color_hex }}>{getInitials(client.name)}</div>
              }
              <div className="min-w-0">
                <p className="text-sm font-medium text-[var(--color-text-primary)] truncate">{client.name}</p>
              </div>
            </div>
          </a>
        ))}
      </div>

      {/* Arquivo — clientes inativos */}
      {archivedClients.length > 0 && (
        <div className="mt-4">
          <button
            onClick={() => setShowArchive(v => !v)}
            className="flex items-center gap-2 text-sm text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] transition-colors mb-4"
          >
            <span>{showArchive ? '▾' : '▸'}</span>
            Arquivo ({archivedClients.length} cliente{archivedClients.length !== 1 ? 's' : ''} inativo{archivedClients.length !== 1 ? 's' : ''})
          </button>
          {showArchive && (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4 opacity-60">
              {archivedClients.map(client => (
                <a
                  key={client.id}
                  href={'/dashboard/clientes/' + client.id}
                  className="bg-[var(--color-bg-card)] border border-[var(--color-border)] rounded-2xl p-4 block hover:border-[var(--color-border-hover)] transition-all group relative grayscale"
                  style={{ borderLeftWidth: 3, borderLeftColor: client.color_hex }}
                >
                  <button
                    onClick={e => openEdit(client, e)}
                    className="absolute top-3 right-3 w-7 h-7 rounded-lg flex items-center justify-center text-[var(--color-text-muted)] hover:bg-[var(--color-bg-subtle)] hover:text-[var(--color-text-primary)] opacity-0 group-hover:opacity-100 transition-all text-xs"
                    title="Editar cliente"
                  >
                    ✏️
                  </button>
                  <div className="flex items-center gap-3 mb-2">
                    {client.logo_url
                      ? <img src={client.logo_url} alt={client.name} className="w-10 h-10 rounded-full object-cover flex-shrink-0" onError={e => { (e.target as HTMLImageElement).style.display = 'none' }} />
                      : <div className="w-10 h-10 rounded-full flex items-center justify-center text-sm font-semibold text-white flex-shrink-0" style={{ background: client.color_hex }}>{getInitials(client.name)}</div>
                    }
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-[var(--color-text-primary)] truncate">{client.name}</p>
                      <p className="text-xs text-[var(--color-text-muted)]">Inativo</p>
                    </div>
                  </div>
                </a>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Modal criar / editar */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/30" onClick={() => setShowModal(false)} />
          <div className="relative bg-[var(--color-bg-card)] rounded-2xl shadow-pop w-full max-w-md p-6 flex flex-col gap-5">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-semibold text-[var(--color-text-primary)]">
                {editingClient ? 'Editar cliente' : 'Novo cliente'}
              </h2>
              <button onClick={() => setShowModal(false)} className="w-8 h-8 rounded-lg hover:bg-[var(--color-bg-subtle)] flex items-center justify-center text-[var(--color-text-muted)] text-lg">×</button>
            </div>

            {/* Preview do avatar */}
            <div className="flex items-center gap-3">
              {form.logo_url
                ? <img src={form.logo_url} alt={form.name} className="w-12 h-12 rounded-xl object-cover flex-shrink-0" onError={e => { (e.target as HTMLImageElement).style.display = 'none' }} />
                : <div className="w-12 h-12 rounded-xl flex items-center justify-center text-white font-bold text-sm flex-shrink-0" style={{ background: form.color_hex }}>{form.name ? getInitials(form.name) : '?'}</div>
              }
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
                <label className="text-xs font-medium text-[var(--color-text-secondary)] mb-1.5 block">Foto / Logo</label>
                <div className="flex items-center gap-2">
                  <label className={`inline-flex items-center gap-2 px-3 py-2.5 rounded-xl border border-[var(--color-border)] text-sm cursor-pointer hover:bg-[var(--color-bg-subtle)] ${uploadingLogo ? 'opacity-60 pointer-events-none' : ''}`}>
                    {uploadingLogo ? 'Enviando…' : 'Subir imagem'}
                    <input type="file" accept="image/*" onChange={handleLogoFile} className="hidden" />
                  </label>
                  {form.logo_url && (
                    <button type="button" onClick={() => setForm(f => ({ ...f, logo_url: '' }))} className="text-xs text-[var(--color-text-muted)] hover:underline">Remover</button>
                  )}
                </div>
                <input
                  type="url"
                  value={form.logo_url}
                  onChange={e => setForm(f => ({ ...f, logo_url: e.target.value }))}
                  placeholder="…ou cole uma URL de imagem"
                  className="w-full mt-2 border border-[var(--color-border)] rounded-xl px-3 py-2.5 text-sm outline-none focus:border-[var(--color-brand)] text-[var(--color-text-primary)]"
                />
                <p className="text-[11px] text-[var(--color-text-muted)] mt-1">Dica: URLs do Instagram expiram. Prefira subir a imagem ou usar “Puxar do Instagram”.</p>
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
                <div className="flex items-center gap-2">
                  <input
                    type="url"
                    value={form.instagram_url}
                    onChange={e => setForm(f => ({ ...f, instagram_url: e.target.value }))}
                    placeholder="https://instagram.com/perfil"
                    className="flex-1 border border-[var(--color-border)] rounded-xl px-3 py-2.5 text-sm outline-none focus:border-[var(--color-brand)] text-[var(--color-text-primary)]"
                  />
                  <button
                    type="button"
                    onClick={pullFromInstagram}
                    disabled={pullingIg || !form.instagram_url.trim()}
                    className="whitespace-nowrap px-3 py-2.5 rounded-xl border border-[var(--color-border)] text-sm hover:bg-[var(--color-bg-subtle)] disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {pullingIg ? 'Puxando…' : 'Puxar foto'}
                  </button>
                </div>
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
              {editingClient && editingClient.status === 'active' && (
                <button
                  onClick={deactivate}
                  disabled={saving}
                  className="text-xs font-medium px-3 py-2 rounded-xl transition-colors"
                  style={{ color: 'var(--ds-error-text)' }}
                  onMouseEnter={e => (e.currentTarget.style.background = 'var(--ds-error-bg)')}
                  onMouseLeave={e => (e.currentTarget.style.background = '')}
                >
                  Desativar
                </button>
              )}
              {editingClient && editingClient.status === 'inactive' && (
                <button
                  onClick={reactivate}
                  disabled={saving}
                  className="text-xs font-medium px-3 py-2 rounded-xl transition-colors"
                  style={{ color: 'var(--ds-success-text)' }}
                  onMouseEnter={e => (e.currentTarget.style.background = 'var(--ds-success-bg)')}
                  onMouseLeave={e => (e.currentTarget.style.background = '')}
                >
                  Reativar cliente
                </button>
              )}
              <div className="flex-1" />
              <Button variant="ghost" onClick={() => setShowModal(false)}>Cancelar</Button>
              <Button variant="dark" onClick={save} disabled={saving || !form.name.trim()}>
                {saving ? 'Salvando...' : editingClient ? 'Salvar' : 'Criar cliente'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
