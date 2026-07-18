'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase'
import {
  MapPin, Phone, AtSign, Globe, Truck, BookOpen,
  ChevronDown, ChevronRight, Sparkles, X,
} from 'lucide-react'

type Pillar       = { name: string; description: string }
type Color        = { name: string; hex: string }
type Font         = { role: string; family: string }
type MenuItem     = { name: string; price: string; description: string }
type MenuCategory = { category: string; items: MenuItem[] }
type Promotion    = { title: string; description: string }
type CalEvent     = { date: string; title: string; description: string }
type Persona      = { name: string; age: string | number; profile: string; behaviors: string }
type ContentSeries = { name: string; description: string; frequency: string }

type ManualData = {
  souschef_slug: string
  tagline: string
  concept: string
  history: string
  pillars: Pillar[]
  colors: Color[]
  fonts: Font[]
  address: string
  phone: string
  hours: Record<string, string>
  instagram: string
  website: string
  delivery_links: string[]
  menu: MenuCategory[]
  differentials: string[]
  promotions: Promotion[]
  events: CalEvent[]
  tone_of_voice: {
    personality?: string
    use_words?: string[]
    avoid_words?: string[]
    taglines?: string[]
  } | null
  personas: Persona[]
  editorial_pillars: Pillar[]
  content_series: ContentSeries[]
  production_notes: string
}

const TABS = [
  { key: 'overview',     label: 'Visão Geral' },
  { key: 'visual',       label: 'Visual' },
  { key: 'operational',  label: 'Operacional' },
  { key: 'menu',         label: 'Cardápio' },
  { key: 'content',      label: 'Conteúdo' },
  { key: 'voice',        label: 'Tom de Voz' },
]

function SectionBlock({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-3">
      <h3 className="text-[10px] font-bold text-[var(--color-text-muted)] uppercase tracking-widest">{title}</h3>
      {children}
    </div>
  )
}

function Card({ children, className = '', style }: { children: React.ReactNode; className?: string; style?: React.CSSProperties }) {
  return (
    <div className={`bg-[var(--color-bg-card)] border border-[var(--color-border)] rounded-2xl p-4 ${className}`} style={style}>
      {children}
    </div>
  )
}

function Empty({ text }: { text: string }) {
  return <p className="text-xs text-[var(--color-text-faint)] italic py-2">{text}</p>
}

// ── TABS ──────────────────────────────────────────────────────────────────────

function OverviewTab({ data }: { data: ManualData }) {
  const hasContent = data.concept || data.history || data.pillars?.length || data.differentials?.length
  if (!hasContent) return <Empty text="Visão geral não disponível ainda." />

  return (
    <div className="flex flex-col gap-6">
      {data.concept && (
        <SectionBlock title="Conceito">
          <Card>
            <p className="text-sm text-[var(--color-text-secondary)] leading-relaxed">{data.concept}</p>
          </Card>
        </SectionBlock>
      )}

      {data.history && (
        <SectionBlock title="História">
          <Card>
            <p className="text-sm text-[var(--color-text-secondary)] leading-relaxed">{data.history}</p>
          </Card>
        </SectionBlock>
      )}

      {data.pillars?.length > 0 && (
        <SectionBlock title="Pilares da Marca">
          <div className="grid grid-cols-2 gap-3">
            {data.pillars.map((p, i) => (
              <Card key={i}>
                <p className="text-sm font-semibold text-[var(--color-text-primary)] mb-1">{p.name}</p>
                <p className="text-xs text-[var(--color-text-muted)] leading-relaxed">{p.description}</p>
              </Card>
            ))}
          </div>
        </SectionBlock>
      )}

      {data.differentials?.length > 0 && (
        <SectionBlock title="Diferenciais">
          <Card>
            <ul className="flex flex-col gap-2">
              {data.differentials.map((d, i) => (
                <li key={i} className="flex items-start gap-2.5 text-sm text-[var(--color-text-secondary)]">
                  <span className="mt-2 w-1.5 h-1.5 rounded-full bg-[var(--color-brand)] flex-shrink-0" />
                  {d}
                </li>
              ))}
            </ul>
          </Card>
        </SectionBlock>
      )}
    </div>
  )
}

function VisualTab({ data }: { data: ManualData }) {
  const tov = data.tone_of_voice
  const hasContent = data.colors?.length || data.fonts?.length || tov?.taglines?.length
  if (!hasContent) return <Empty text="Identidade visual não definida ainda." />

  return (
    <div className="flex flex-col gap-6">
      {data.colors?.length > 0 && (
        <SectionBlock title="Paleta de Cores">
          <div className="flex flex-wrap gap-4">
            {data.colors.map((c, i) => (
              <div key={i} className="flex flex-col items-center gap-2">
                <div className="w-16 h-16 rounded-2xl border border-[var(--color-border)] shadow-sm" style={{ background: c.hex }} />
                <p className="text-xs font-medium text-[var(--color-text-primary)] text-center max-w-[72px] leading-tight">{c.name}</p>
                <p className="text-[10px] font-mono text-[var(--color-text-muted)] uppercase">{c.hex}</p>
              </div>
            ))}
          </div>
        </SectionBlock>
      )}

      {data.fonts?.length > 0 && (
        <SectionBlock title="Tipografia">
          <Card>
            <div className="flex flex-col gap-3">
              {data.fonts.map((f, i) => (
                <div key={i} className="flex items-center justify-between gap-4">
                  <span className="text-xs text-[var(--color-text-muted)]">{f.role}</span>
                  <span className="text-sm font-medium text-[var(--color-text-primary)]">{f.family}</span>
                </div>
              ))}
            </div>
          </Card>
        </SectionBlock>
      )}

      {tov?.taglines && tov.taglines.length > 0 && (
        <SectionBlock title="Taglines">
          <div className="flex flex-col gap-2">
            {tov.taglines.map((t, i) => (
              <Card key={i} className="border-l-4" style={{ borderLeftColor: 'var(--color-brand)' }}>
                <p className="text-sm font-medium text-[var(--color-text-primary)] italic">"{t}"</p>
              </Card>
            ))}
          </div>
        </SectionBlock>
      )}
    </div>
  )
}

function OperationalTab({ data }: { data: ManualData }) {
  const hoursEntries = Object.entries(data.hours || {})
  const hasContent = data.address || data.phone || hoursEntries.length || data.instagram || data.website || data.delivery_links?.length
  if (!hasContent) return <Empty text="Informações operacionais não disponíveis." />

  return (
    <div className="flex flex-col gap-6">
      {(data.address || data.phone || data.instagram || data.website) && (
        <SectionBlock title="Contato">
          <Card>
            <div className="flex flex-col gap-3">
              {data.address && (
                <div className="flex items-start gap-2.5">
                  <MapPin size={13} className="text-[var(--color-text-muted)] mt-0.5 flex-shrink-0" />
                  <p className="text-sm text-[var(--color-text-secondary)]">{data.address}</p>
                </div>
              )}
              {data.phone && (
                <div className="flex items-center gap-2.5">
                  <Phone size={13} className="text-[var(--color-text-muted)] flex-shrink-0" />
                  <p className="text-sm text-[var(--color-text-secondary)]">{data.phone}</p>
                </div>
              )}
              {data.instagram && (
                <div className="flex items-center gap-2.5">
                  <AtSign size={13} className="text-[var(--color-text-muted)] flex-shrink-0" />
                  <p className="text-sm text-[var(--color-text-secondary)]">{data.instagram}</p>
                </div>
              )}
              {data.website && (
                <div className="flex items-center gap-2.5">
                  <Globe size={13} className="text-[var(--color-text-muted)] flex-shrink-0" />
                  <a
                    href={data.website.startsWith('http') ? data.website : `https://${data.website}`}
                    target="_blank" rel="noopener noreferrer"
                    className="text-sm underline" style={{ color: 'var(--ds-info-text)' }}
                  >
                    {data.website}
                  </a>
                </div>
              )}
            </div>
          </Card>
        </SectionBlock>
      )}

      {hoursEntries.length > 0 && (
        <SectionBlock title="Horários de Funcionamento">
          <Card>
            <div className="flex flex-col gap-2">
              {hoursEntries.map(([day, hours]) => (
                <div key={day} className="flex items-center justify-between gap-4">
                  <span className="text-sm text-[var(--color-text-muted)] capitalize">{day}</span>
                  <span className={`text-sm font-medium ${hours === 'Fechado' ? 'text-[var(--color-text-faint)]' : 'text-[var(--color-text-primary)]'}`}>{hours}</span>
                </div>
              ))}
            </div>
          </Card>
        </SectionBlock>
      )}

      {data.delivery_links?.length > 0 && (
        <SectionBlock title="Delivery">
          <Card>
            <div className="flex items-center gap-2 flex-wrap">
              <Truck size={13} className="text-[var(--color-text-muted)]" />
              {data.delivery_links.map((link, i) => (
                <span key={i} className="text-xs font-medium px-2 py-1 rounded-lg bg-[var(--color-bg-subtle)] text-[var(--color-text-secondary)]">{link}</span>
              ))}
            </div>
          </Card>
        </SectionBlock>
      )}
    </div>
  )
}

function MenuTab({ data }: { data: ManualData }) {
  const [openCats, setOpenCats] = useState<Set<number>>(new Set([0]))
  if (!data.menu?.length) return <Empty text="Cardápio não disponível." />

  function toggle(i: number) {
    setOpenCats(prev => {
      const next = new Set(prev)
      if (next.has(i)) next.delete(i)
      else next.add(i)
      return next
    })
  }

  return (
    <div className="flex flex-col gap-2">
      {data.menu.map((cat, ci) => {
        const isOpen = openCats.has(ci)
        return (
          <div key={ci} className="bg-[var(--color-bg-card)] border border-[var(--color-border)] rounded-2xl overflow-hidden">
            <button
              onClick={() => toggle(ci)}
              className="w-full flex items-center justify-between px-4 py-3 hover:bg-[var(--color-bg-subtle)] transition-colors text-left"
            >
              <span className="text-sm font-semibold text-[var(--color-text-primary)]">{cat.category}</span>
              <div className="flex items-center gap-2 flex-shrink-0">
                <span className="text-xs text-[var(--color-text-muted)]">{cat.items?.length || 0} itens</span>
                {isOpen
                  ? <ChevronDown size={13} className="text-[var(--color-text-muted)]" />
                  : <ChevronRight size={13} className="text-[var(--color-text-muted)]" />
                }
              </div>
            </button>

            {isOpen && cat.items?.length > 0 && (
              <div className="border-t border-[var(--color-border)]">
                {cat.items.map((item, ii) => (
                  <div
                    key={ii}
                    className={`px-4 py-3 flex items-start justify-between gap-4 ${ii > 0 ? 'border-t border-[var(--color-border)]' : ''}`}
                  >
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-[var(--color-text-primary)]">{item.name}</p>
                      {item.description && (
                        <p className="text-xs text-[var(--color-text-muted)] mt-0.5 leading-relaxed">{item.description}</p>
                      )}
                    </div>
                    {item.price && (
                      <span className="text-sm font-semibold text-[var(--color-text-primary)] flex-shrink-0">{item.price}</span>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

function ContentTab({ data }: { data: ManualData }) {
  const hasContent = data.editorial_pillars?.length || data.content_series?.length || data.promotions?.length || data.events?.length
  if (!hasContent) return <Empty text="Estratégia de conteúdo não disponível ainda." />

  return (
    <div className="flex flex-col gap-6">
      {data.editorial_pillars?.length > 0 && (
        <SectionBlock title="Pilares Editoriais">
          <div className="grid grid-cols-2 gap-3">
            {data.editorial_pillars.map((p, i) => (
              <Card key={i}>
                <p className="text-sm font-semibold text-[var(--color-text-primary)] mb-1">{p.name}</p>
                <p className="text-xs text-[var(--color-text-muted)] leading-relaxed">{p.description}</p>
              </Card>
            ))}
          </div>
        </SectionBlock>
      )}

      {data.content_series?.length > 0 && (
        <SectionBlock title="Séries de Conteúdo">
          <div className="flex flex-col gap-2">
            {data.content_series.map((s, i) => (
              <Card key={i}>
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1">
                    <p className="text-sm font-semibold text-[var(--color-text-primary)]">{s.name}</p>
                    <p className="text-xs text-[var(--color-text-muted)] mt-1 leading-relaxed">{s.description}</p>
                  </div>
                  <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-[var(--color-bg-subtle)] text-[var(--color-text-muted)] flex-shrink-0 mt-0.5">{s.frequency}</span>
                </div>
              </Card>
            ))}
          </div>
        </SectionBlock>
      )}

      {data.promotions?.length > 0 && (
        <SectionBlock title="Promoções & Ativações">
          <div className="flex flex-col gap-2">
            {data.promotions.map((p, i) => (
              <Card key={i}>
                <p className="text-sm font-semibold text-[var(--color-text-primary)]">{p.title}</p>
                <p className="text-xs text-[var(--color-text-muted)] mt-1 leading-relaxed">{p.description}</p>
              </Card>
            ))}
          </div>
        </SectionBlock>
      )}

      {data.events?.length > 0 && (
        <SectionBlock title="Datas & Eventos">
          <div className="flex flex-col gap-2">
            {data.events.map((e, i) => (
              <Card key={i}>
                <div className="flex items-start gap-3">
                  <span className="text-[10px] font-bold text-[var(--color-brand)] bg-[var(--color-bg-subtle)] px-2 py-1 rounded-lg flex-shrink-0 mt-0.5 text-center leading-tight min-w-[52px]">
                    {e.date}
                  </span>
                  <div className="flex-1">
                    <p className="text-sm font-semibold text-[var(--color-text-primary)]">{e.title}</p>
                    {e.description && (
                      <p className="text-xs text-[var(--color-text-muted)] mt-0.5 leading-relaxed">{e.description}</p>
                    )}
                  </div>
                </div>
              </Card>
            ))}
          </div>
        </SectionBlock>
      )}
    </div>
  )
}

function VoiceTab({ data }: { data: ManualData }) {
  const tov = data.tone_of_voice
  const hasContent = tov?.personality || tov?.use_words?.length || tov?.avoid_words?.length || data.personas?.length || data.production_notes
  if (!hasContent) return <Empty text="Tom de voz não definido ainda." />

  return (
    <div className="flex flex-col gap-6">
      {tov?.personality && (
        <SectionBlock title="Personalidade da Marca">
          <Card>
            <p className="text-sm text-[var(--color-text-secondary)] leading-relaxed">{tov.personality}</p>
          </Card>
        </SectionBlock>
      )}

      {tov?.use_words && tov.use_words.length > 0 && (
        <SectionBlock title="Palavras & Expressões para Usar">
          <div className="flex flex-wrap gap-2">
            {tov.use_words.map((w, i) => (
              <span
                key={i}
                className="text-xs font-medium px-2.5 py-1 rounded-full"
                style={{ background: 'var(--ds-success-bg)', color: 'var(--ds-success-text)' }}
              >
                {w}
              </span>
            ))}
          </div>
        </SectionBlock>
      )}

      {tov?.avoid_words && tov.avoid_words.length > 0 && (
        <SectionBlock title="Palavras & Expressões para Evitar">
          <div className="flex flex-wrap gap-2">
            {tov.avoid_words.map((w, i) => (
              <span
                key={i}
                className="text-xs font-medium px-2.5 py-1 rounded-full"
                style={{ background: 'var(--ds-error-bg)', color: 'var(--ds-error-text)' }}
              >
                {w}
              </span>
            ))}
          </div>
        </SectionBlock>
      )}

      {data.personas?.length > 0 && (
        <SectionBlock title="Personas">
          <div className="grid grid-cols-2 gap-3">
            {data.personas.map((p, i) => (
              <Card key={i}>
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-10 h-10 rounded-full bg-[var(--color-bg-subtle)] border border-[var(--color-border)] flex items-center justify-center text-sm font-bold text-[var(--color-text-primary)] flex-shrink-0">
                    {String(p.name)[0]?.toUpperCase() || '?'}
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-[var(--color-text-primary)] truncate">{p.name}</p>
                    {p.age && <p className="text-xs text-[var(--color-text-muted)]">{p.age}</p>}
                  </div>
                </div>
                {p.profile && (
                  <p className="text-xs text-[var(--color-text-secondary)] leading-relaxed mb-2">{p.profile}</p>
                )}
                {p.behaviors && (
                  <p className="text-xs text-[var(--color-text-muted)] leading-relaxed italic">{p.behaviors}</p>
                )}
              </Card>
            ))}
          </div>
        </SectionBlock>
      )}

      {data.production_notes && (
        <SectionBlock title="Notas de Produção">
          <Card className="border-l-4" style={{ borderLeftColor: 'var(--color-brand)' }}>
            <p className="text-sm text-[var(--color-text-secondary)] leading-relaxed">{data.production_notes}</p>
          </Card>
        </SectionBlock>
      )}
    </div>
  )
}

// ── GERADOR DE RASCUNHO VIA IA (pesquisa na web) ───────────────────────────────

function ManualGeneratorModal({
  genName, setGenName, genInstagram, setGenInstagram, genWebsite, setGenWebsite,
  genLoading, genError, genDraft, setGenDraft, genSaving, onGenerate, onSave, onClose,
}: {
  genName: string; setGenName: (v: string) => void
  genInstagram: string; setGenInstagram: (v: string) => void
  genWebsite: string; setGenWebsite: (v: string) => void
  genLoading: boolean; genError: string; genDraft: string; setGenDraft: (v: string) => void
  genSaving: boolean
  onGenerate: () => void; onSave: () => void; onClose: () => void
}) {
  return (
    <div className="fixed inset-0 bg-black/50 z-[70] flex items-center justify-center p-4" onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="bg-[var(--color-bg-card)] rounded-2xl border border-[var(--color-border)] shadow-pop w-full max-w-xl max-h-[85vh] flex flex-col overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--color-border)] flex-shrink-0">
          <p className="font-bold text-[var(--color-text-primary)] flex items-center gap-2"><Sparkles size={16} className="text-[#8b5cf6]" /> Gerar rascunho do manual com IA</p>
          <button onClick={onClose} className="w-7 h-7 rounded-lg hover:bg-[var(--color-bg-subtle)] flex items-center justify-center text-[var(--color-text-secondary)]"><X size={15} /></button>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-4 flex flex-col gap-3">
          <p className="text-xs text-[var(--color-text-muted)] leading-relaxed">
            A IA pesquisa na web (site, Google Maps, Instagram, iFood/Rappi, notícias) e monta um rascunho.
            Revise com atenção — pode errar dado, principalmente preços de cardápio — antes de salvar.
          </p>
          <div className="grid grid-cols-1 gap-2.5">
            <div>
              <label className="text-[10px] font-bold uppercase tracking-wider text-[var(--color-text-muted)] block mb-1">Nome do negócio</label>
              <input value={genName} onChange={e => setGenName(e.target.value)} placeholder="Ex: Donna Pizzeria"
                className="w-full border border-[var(--color-border)] rounded-lg px-3 py-1.5 text-sm bg-[var(--color-bg-page)] text-[var(--color-text-primary)] outline-none focus:border-[var(--color-brand)]" />
            </div>
            <div>
              <label className="text-[10px] font-bold uppercase tracking-wider text-[var(--color-text-muted)] block mb-1">Instagram (opcional)</label>
              <input value={genInstagram} onChange={e => setGenInstagram(e.target.value)} placeholder="https://instagram.com/..."
                className="w-full border border-[var(--color-border)] rounded-lg px-3 py-1.5 text-sm bg-[var(--color-bg-page)] text-[var(--color-text-primary)] outline-none focus:border-[var(--color-brand)]" />
            </div>
            <div>
              <label className="text-[10px] font-bold uppercase tracking-wider text-[var(--color-text-muted)] block mb-1">Site (opcional)</label>
              <input value={genWebsite} onChange={e => setGenWebsite(e.target.value)} placeholder="https://..."
                className="w-full border border-[var(--color-border)] rounded-lg px-3 py-1.5 text-sm bg-[var(--color-bg-page)] text-[var(--color-text-primary)] outline-none focus:border-[var(--color-brand)]" />
            </div>
          </div>
          <button onClick={onGenerate} disabled={genLoading || !genName.trim()}
            className="flex items-center justify-center gap-1.5 text-sm font-semibold px-4 py-2 rounded-xl text-white transition-opacity hover:opacity-90 disabled:opacity-50"
            style={{ background: '#8b5cf6' }}>
            {genLoading ? <><div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" /> Pesquisando…</> : <>🔎 Pesquisar e gerar</>}
          </button>
          {genError && <p className="text-xs text-[var(--ds-error-text)] bg-[var(--ds-error-bg)] rounded-lg px-3 py-2">{genError}</p>}
          {genDraft && (
            <div>
              <label className="text-[10px] font-bold uppercase tracking-wider text-[var(--color-text-muted)] block mb-1">Rascunho gerado — revise antes de salvar</label>
              <textarea value={genDraft} onChange={e => setGenDraft(e.target.value)} rows={16}
                className="w-full border border-[var(--color-border)] rounded-lg px-3 py-2 text-xs font-mono bg-[var(--color-bg-page)] text-[var(--color-text-primary)] outline-none focus:border-[var(--color-brand)] resize-none" />
            </div>
          )}
        </div>
        <div className="flex items-center justify-end gap-2 px-5 py-3.5 border-t border-[var(--color-border)] flex-shrink-0">
          <button onClick={onClose} className="px-4 py-1.5 text-sm text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] transition-colors">Cancelar</button>
          <button onClick={onSave} disabled={!genDraft || genSaving}
            className="px-4 py-1.5 text-sm font-semibold bg-[var(--color-brand)] text-[var(--color-brand-fg)] rounded-lg disabled:opacity-40 transition-opacity">
            {genSaving ? 'Salvando…' : 'Salvar no manual'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── MAIN ──────────────────────────────────────────────────────────────────────

export default function ManualTab({ clientId }: { clientId: string }) {
  const [data, setData]       = useState<ManualData | null>(null)
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState('overview')
  const [clientInfo, setClientInfo] = useState<{ name: string; instagram_url: string | null } | null>(null)

  // Gerador de rascunho via IA (pesquisa na web) — pra clientes novos sem manual
  const [showGenerator, setShowGenerator] = useState(false)
  const [genName,      setGenName]      = useState('')
  const [genInstagram, setGenInstagram] = useState('')
  const [genWebsite,   setGenWebsite]   = useState('')
  const [genLoading,   setGenLoading]   = useState(false)
  const [genError,     setGenError]     = useState('')
  const [genDraft,     setGenDraft]     = useState('')
  const [genSaving,    setGenSaving]    = useState(false)

  async function load() {
    const supabase = createClient()
    const [{ data: manual }, { data: client }] = await Promise.all([
      supabase.from('client_manuals').select('*').eq('client_id', clientId).maybeSingle(),
      supabase.from('clients').select('name, instagram_url').eq('id', clientId).maybeSingle(),
    ])
    setData(manual)
    setClientInfo(client)
    setLoading(false)
  }

  useEffect(() => { load() }, [clientId])

  function openGenerator() {
    setGenName(clientInfo?.name || '')
    setGenInstagram(clientInfo?.instagram_url || '')
    setGenWebsite('')
    setGenDraft('')
    setGenError('')
    setShowGenerator(true)
  }

  async function runGenerate() {
    if (!genName.trim()) return
    setGenLoading(true); setGenError(''); setGenDraft('')
    try {
      const res = await fetch('/api/ai-manual', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name: genName, instagram: genInstagram, website: genWebsite }),
      })
      const json = await res.json()
      if (!res.ok || json.error) { setGenError(json.error || 'Erro ao gerar'); setGenLoading(false); return }
      // Valida que é JSON parseável antes de mostrar, mas guarda formatado (mais fácil de revisar)
      try {
        const parsed = JSON.parse(json.manual)
        setGenDraft(JSON.stringify(parsed, null, 2))
      } catch {
        setGenDraft(json.manual) // deixa cru pro usuário corrigir manualmente se vier malformado
      }
    } catch {
      setGenError('Erro de conexão ao gerar o rascunho')
    }
    setGenLoading(false)
  }

  async function saveGeneratedManual() {
    let parsed: any
    try { parsed = JSON.parse(genDraft) }
    catch { setGenError('JSON inválido — corrija antes de salvar.'); return }
    setGenSaving(true)
    const supabase = createClient()
    const { error } = await supabase.from('client_manuals').upsert({ client_id: clientId, ...parsed }, { onConflict: 'client_id' })
    setGenSaving(false)
    if (error) { setGenError('Erro ao salvar: ' + error.message); return }
    setShowGenerator(false)
    setLoading(true)
    await load()
  }

  if (loading) return (
    <div className="flex items-center justify-center h-40">
      <p className="text-sm text-[var(--color-text-muted)]">Carregando manual...</p>
    </div>
  )

  if (!data) return (
    <>
      <div className="flex flex-col items-center justify-center min-h-[360px] gap-4 text-center">
        <div className="w-16 h-16 rounded-2xl bg-[var(--color-bg-card)] border border-[var(--color-border)] flex items-center justify-center">
          <BookOpen size={28} className="text-[var(--color-text-faint)]" />
        </div>
        <div>
          <p className="font-semibold text-[var(--color-text-primary)]">Manual não disponível</p>
          <p className="text-sm text-[var(--color-text-muted)] mt-1 max-w-xs">
            Este cliente ainda não tem manual cadastrado.
          </p>
        </div>
        <button onClick={openGenerator}
          className="flex items-center gap-1.5 text-sm font-semibold px-4 py-2 rounded-xl text-white transition-opacity hover:opacity-90"
          style={{ background: '#8b5cf6' }}>
          <Sparkles size={14} /> Gerar rascunho com IA
        </button>
      </div>
      {showGenerator && <ManualGeneratorModal
        genName={genName} setGenName={setGenName}
        genInstagram={genInstagram} setGenInstagram={setGenInstagram}
        genWebsite={genWebsite} setGenWebsite={setGenWebsite}
        genLoading={genLoading} genError={genError} genDraft={genDraft} setGenDraft={setGenDraft}
        genSaving={genSaving}
        onGenerate={runGenerate} onSave={saveGeneratedManual} onClose={() => setShowGenerator(false)}
      />}
    </>
  )

  return (
    <div className="flex flex-col gap-0 max-w-4xl">
      {/* Header */}
      <div className="flex items-start justify-between gap-3 mb-5 pb-5 border-b border-[var(--color-border)]">
        <div>
          {data.tagline && (
            <p className="text-lg font-semibold text-[var(--color-text-primary)] mb-1">{data.tagline}</p>
          )}
          {data.concept && (
            <p className="text-sm text-[var(--color-text-muted)] leading-relaxed">{data.concept}</p>
          )}
        </div>
        <button onClick={openGenerator} title="Gerar novo rascunho com IA (sobrescreve ao salvar)"
          className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg flex-shrink-0 transition-colors"
          style={{ background: '#8b5cf618', color: '#8b5cf6' }}>
          <Sparkles size={12} /> Regerar com IA
        </button>
      </div>
      {showGenerator && <ManualGeneratorModal
        genName={genName} setGenName={setGenName}
        genInstagram={genInstagram} setGenInstagram={setGenInstagram}
        genWebsite={genWebsite} setGenWebsite={setGenWebsite}
        genLoading={genLoading} genError={genError} genDraft={genDraft} setGenDraft={setGenDraft}
        genSaving={genSaving}
        onGenerate={runGenerate} onSave={saveGeneratedManual} onClose={() => setShowGenerator(false)}
      />}

      {/* Section nav */}
      <div className="flex items-center gap-1 mb-5 overflow-x-auto pb-1">
        {TABS.map(t => (
          <button
            key={t.key}
            onClick={() => setActiveTab(t.key)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all whitespace-nowrap flex-shrink-0 ${
              activeTab === t.key
                ? 'bg-[var(--color-text-primary)] text-[var(--color-bg-page)]'
                : 'text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-subtle)]'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Content */}
      {activeTab === 'overview'    && <OverviewTab    data={data} />}
      {activeTab === 'visual'      && <VisualTab      data={data} />}
      {activeTab === 'operational' && <OperationalTab data={data} />}
      {activeTab === 'menu'        && <MenuTab        data={data} />}
      {activeTab === 'content'     && <ContentTab     data={data} />}
      {activeTab === 'voice'       && <VoiceTab       data={data} />}
    </div>
  )
}
