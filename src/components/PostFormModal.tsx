'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase'
import { useToast } from '@/lib/ToastContext'
import { useUser } from '@/lib/UserContext'
import { logActivity } from '@/lib/activity'
import { dbError } from '@/lib/dbError'
import ModalPortal from '@/components/ModalPortal'
import { X } from 'lucide-react'

const POST_TYPES = [
  { value: 'carrossel',        label: 'Carrossel' },
  { value: 'reels',            label: 'Reels' },
  { value: 'post',             label: 'Post' },
  { value: 'story',            label: 'Story' },
  { value: 'carrossel_stories',label: 'Carrossel/Stories' },
]
const STATUSES = [
  { value: 'producao',             label: 'Produção' },
  { value: 'revisao_interna',      label: 'Revisão interna' },
  { value: 'aguardando_aprovacao', label: 'Aguardando aprovação' },
  { value: 'aprovado',             label: 'Aprovado' },
  { value: 'agendado',             label: 'Agendado' },
  { value: 'publicado',            label: 'Publicado' },
]
const FUNIL_OPTIONS = ['Topo de funil', 'Meio de funil', 'Fundo de funil', 'Institucional', 'Promocional', 'Engajamento', 'Venda']

const SEASONAL_EMOJI: Record<string, string> = {
  natal: '🎄', maes: '🌸', namorados: '💕',
  pascoa: '🐣', carnaval: '🎭', pais: '👔', custom: '📌'
}

const EMPTY = {
  title: '', copy: '', post_type: 'carrossel', scheduled_date: '',
  status: 'producao', drive_url: '', reference_notes: '',
  funil: '', campaign_type: '',
}

type Props = {
  clientId: string
  clientName: string
  month: number
  year: number
  nextPostNumber: number
  onClose: () => void
  onSaved: () => void
}

export default function PostFormModal({ clientId, clientName, month, year, nextPostNumber, onClose, onSaved }: Props) {
  const { toast } = useToast()
  const { currentMember } = useUser()
  const [form, setForm] = useState(EMPTY)
  const [saving, setSaving] = useState(false)
  const [campaigns, setCampaigns] = useState<any[]>([])

  useEffect(() => {
    createClient()
      .from('campaigns')
      .select('id, type, name, active')
      .eq('client_id', clientId)
      .eq('active', true)
      .then(({ data }) => setCampaigns(data || []))
  }, [clientId])

  async function save() {
    if (!form.title.trim()) return
    setSaving(true)
    const supabase = createClient()
    const { data, error } = await supabase.from('schedules').insert({
      client_id: clientId, month, year, post_number: nextPostNumber,
      ...form,
      scheduled_date: form.scheduled_date || null,
      campaign_type: form.campaign_type || null,
    }).select('id').single()
    setSaving(false)
    if (dbError(error, toast, 'criar post')) return
    if (data) await logActivity({ tableName: 'schedules', recordId: data.id, clientId, action: 'created', actorName: currentMember?.name, description: `${currentMember?.name || 'Alguém'} criou "${form.title}"` })
    onSaved()
    onClose()
  }

  const Field = ({ label, children }: { label: string, children: React.ReactNode }) => (
    <div>
      <label className="text-xs font-medium text-[var(--color-text-muted)] mb-1.5 block uppercase tracking-wide">{label}</label>
      {children}
    </div>
  )

  const inputCls = "w-full border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm text-[var(--color-text-primary)] outline-none focus:border-[var(--color-brand)] bg-[var(--color-bg-card)] transition-colors"

  return (
    <ModalPortal>
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-[60] p-4" onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="bg-[var(--color-bg-card)] rounded-2xl w-full max-w-lg flex flex-col max-h-[92vh] shadow-pop">

        {/* Header */}
        <div className="px-5 py-4 border-b border-[var(--color-border)] flex items-center justify-between">
          <div>
            <h2 className="text-sm font-semibold text-[var(--color-text-primary)]">Novo post</h2>
            <p className="text-xs text-[var(--color-text-muted)] mt-0.5">#{nextPostNumber} · {clientName}</p>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-lg hover:bg-[var(--color-bg-subtle)] flex items-center justify-center text-[var(--color-text-muted)] transition-colors">
            <X size={16} />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-5 flex flex-col gap-4">

          <Field label="Título *">
            <input
              value={form.title}
              onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
              placeholder="Ex: Abertura do forno a lenha"
              className={inputCls}
              autoFocus
            />
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Tipo">
              <select value={form.post_type} onChange={e => setForm(f => ({ ...f, post_type: e.target.value }))} className={inputCls}>
                {POST_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
            </Field>
            <Field label="Status">
              <select value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value }))} className={inputCls}>
                {STATUSES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
              </select>
            </Field>
          </div>

          {/* Campanha — aparece se houver campanhas ativas */}
          {campaigns.length > 0 && (
            <Field label="Campanha">
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => setForm(f => ({ ...f, campaign_type: '' }))}
                  className={`text-xs px-3 py-1.5 rounded-lg border transition-colors ${!form.campaign_type ? 'bg-[var(--color-brand)] text-[var(--color-brand-fg)] border-[var(--color-brand)]' : 'border-[var(--color-border)] text-[var(--color-text-secondary)] hover:border-[var(--color-border-hover)]'}`}
                >
                  Nenhuma
                </button>
                {campaigns.map(camp => (
                  <button
                    key={camp.id}
                    type="button"
                    onClick={() => setForm(f => ({ ...f, campaign_type: f.campaign_type === camp.type ? '' : camp.type }))}
                    className={`text-xs px-3 py-1.5 rounded-lg border transition-colors flex items-center gap-1.5 ${form.campaign_type === camp.type ? 'bg-[var(--color-brand)] text-[var(--color-brand-fg)] border-[var(--color-brand)]' : 'border-[var(--color-border)] text-[var(--color-text-secondary)] hover:border-[var(--color-border-hover)]'}`}
                  >
                    <span>{SEASONAL_EMOJI[camp.type] || '📌'}</span>
                    {camp.name}
                  </button>
                ))}
              </div>
            </Field>
          )}

          <div className="grid grid-cols-2 gap-3">
            <Field label="Data estimada">
              <input type="date" value={form.scheduled_date} onChange={e => setForm(f => ({ ...f, scheduled_date: e.target.value }))} className={inputCls} />
            </Field>
            <Field label="Funil">
              <input list="funil-opts" value={form.funil} onChange={e => setForm(f => ({ ...f, funil: e.target.value }))} placeholder="Escolha ou escreva..." className={inputCls} />
              <datalist id="funil-opts">{FUNIL_OPTIONS.map(o => <option key={o} value={o} />)}</datalist>
            </Field>
          </div>

          <Field label="Copy / Briefing">
            <textarea value={form.copy} onChange={e => setForm(f => ({ ...f, copy: e.target.value }))} rows={4} placeholder="Texto da legenda ou briefing do post..." className={inputCls + ' resize-none'} />
          </Field>

          <Field label="Link Drive">
            <input value={form.drive_url} onChange={e => setForm(f => ({ ...f, drive_url: e.target.value }))} placeholder="https://drive.google.com/..." className={inputCls} />
          </Field>

          <Field label="Referências / Observações">
            <textarea value={form.reference_notes} onChange={e => setForm(f => ({ ...f, reference_notes: e.target.value }))} rows={2} placeholder="Links de referência, observações..." className={inputCls + ' resize-none'} />
          </Field>

        </div>

        {/* Footer */}
        <div className="px-5 py-4 border-t border-[var(--color-border)] flex gap-3 justify-end bg-[var(--color-bg-alt)] rounded-b-2xl">
          <button onClick={onClose} className="px-4 py-2 text-sm text-[var(--color-text-secondary)] border border-[var(--color-border)] rounded-lg hover:bg-[var(--color-bg-subtle)] transition-colors">
            Cancelar
          </button>
          <button onClick={save} disabled={saving || !form.title.trim()} className="px-4 py-2 text-sm text-[var(--color-brand-fg)] bg-[var(--color-brand)] rounded-lg disabled:opacity-50 transition-colors">
            {saving ? 'Salvando...' : 'Salvar post'}
          </button>
        </div>
      </div>
    </div>
    </ModalPortal>
  )
}
