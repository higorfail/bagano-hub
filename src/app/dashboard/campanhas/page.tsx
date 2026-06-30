'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase'
import { Check, Trash2, Plus, ChevronDown, ChevronUp } from 'lucide-react'
import { useDarkMode } from '@/lib/useDarkMode'

const SEASONAL = [
  { type: 'natal',     name: 'Natal & Réveillon', emoji: '🎄', color: '#DC2626', month: 12, day: 25, leadDays: 60,
    theme: { bg: '#FEF2F2', border: '#FECACA', accent: '#DC2626', darkBg: '#450a0a', darkBorder: '#7f1d1d' } },
  { type: 'maes',      name: 'Dia das Mães',       emoji: '🌸', color: '#DB2777', month: 5,  day: 11, leadDays: 45,
    theme: { bg: '#FDF2F8', border: '#FBCFE8', accent: '#DB2777', darkBg: '#4a044e', darkBorder: '#701a75' } },
  { type: 'namorados', name: 'Dia dos Namorados',  emoji: '💕', color: '#E11D48', month: 6,  day: 12, leadDays: 45,
    theme: { bg: '#FFF1F2', border: '#FECDD3', accent: '#E11D48', darkBg: '#4c0519', darkBorder: '#881337' } },
  { type: 'pascoa',    name: 'Páscoa',             emoji: '🐣', color: '#D97706', month: 4,  day: 20, leadDays: 30,
    theme: { bg: '#FFFBEB', border: '#FDE68A', accent: '#D97706', darkBg: '#431407', darkBorder: '#78350f' } },
  { type: 'carnaval',  name: 'Carnaval',           emoji: '🎭', color: '#7C3AED', month: 2,  day: 28, leadDays: 30,
    theme: { bg: '#F5F3FF', border: '#DDD6FE', accent: '#7C3AED', darkBg: '#2e1065', darkBorder: '#4c1d95' } },
  { type: 'pais',      name: 'Dia dos Pais',       emoji: '👔', color: '#0369A1', month: 8,  day: 11, leadDays: 30,
    theme: { bg: '#EFF6FF', border: '#BFDBFE', accent: '#0369A1', darkBg: '#172554', darkBorder: '#1e3a5f' } },
]

function getDaysUntil(month: number, day: number) {
  const now = new Date()
  const year = now.getMonth() + 1 > month || (now.getMonth() + 1 === month && now.getDate() > day)
    ? now.getFullYear() + 1 : now.getFullYear()
  const target = new Date(year, month - 1, day)
  return Math.ceil((target.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
}

const TYPE_LABEL: Record<string, string> = { reels: 'Reel', carrossel: 'Carrossel', post: 'Post', story: 'Story', carrossel_stories: 'C+S' }
const TYPE_BG_L: Record<string, string>  = { reels: '#FEE2E2', carrossel: '#DBEAFE', post: '#FEF3C7', story: '#EDE9FE', carrossel_stories: '#E0E7FF' }
const TYPE_BG_D: Record<string, string>  = { reels: '#450a0a', carrossel: '#172554', post: '#431407', story: '#2e1065', carrossel_stories: '#1e1b4b' }
const TYPE_TX_L: Record<string, string>  = { reels: '#B91C1C', carrossel: '#1E40AF', post: '#92400E', story: '#5B21B6', carrossel_stories: '#3730A3' }
const TYPE_TX_D: Record<string, string>  = { reels: '#fca5a5', carrossel: '#93c5fd', post: '#fde68a', story: '#d8b4fe', carrossel_stories: '#818cf8' }
const STATUS_BG_L: Record<string, string> = { producao: '#FEF3C7', aprovado: '#D1FAE5', publicado: '#D1FAE5', aguardando_aprovacao: '#FCE7F3', revisao_interna: '#EDE9FE', agendado: '#DBEAFE' }
const STATUS_BG_D: Record<string, string> = { producao: '#431407', aprovado: '#052e16', publicado: '#052e16', aguardando_aprovacao: '#4a044e', revisao_interna: '#2e1065', agendado: '#172554' }
const STATUS_TX_L: Record<string, string> = { producao: '#92400E', aprovado: '#065F46', publicado: '#065F46', aguardando_aprovacao: '#9D174D', revisao_interna: '#5B21B6', agendado: '#1E40AF' }
const STATUS_TX_D: Record<string, string> = { producao: '#fde68a', aprovado: '#4ade80', publicado: '#4ade80', aguardando_aprovacao: '#f9a8d4', revisao_interna: '#d8b4fe', agendado: '#93c5fd' }
const STATUS_LABEL: Record<string, string> = { producao: 'Produção', revisao_interna: 'Revisão', aguardando_aprovacao: 'Aguardando', aprovado: 'Aprovado', agendado: 'Agendado', publicado: 'Publicado' }

function getInitials(name: string) { return (name || '?').split(' ').map((w: string) => w[0]).join('').slice(0, 2).toUpperCase() }

export default function CampanhasPage() {
  const supabase = createClient()
  const isDark = useDarkMode()
  const [selected, setSelected] = useState('natal')
  const [campaigns, setCampaigns] = useState<any[]>([])
  const [clients, setClients] = useState<any[]>([])
  const [posts, setPosts] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [expanded, setExpanded] = useState<string | null>(null)
  const [addingExtra, setAddingExtra] = useState<string | null>(null)
  const [newExtraText, setNewExtraText] = useState<Record<string, string>>({})

  useEffect(() => { load() }, [])

  async function load() {
    const [{ data: camps }, { data: cls }, { data: ps }] = await Promise.all([
      supabase.from('campaigns').select('*, campaign_extras(*)').eq('active', true),
      supabase.from('clients').select('id, name, color_hex').eq('status', 'active').order('name'),
      supabase.from('schedules').select('id, client_id, post_number, title, post_type, status, campaign_type').not('campaign_type', 'is', null),
    ])
    setCampaigns(camps || [])
    setClients(cls || [])
    setPosts(ps || [])
    setLoading(false)
  }

  async function toggleExtra(campId: string, extraId: string, done: boolean) {
    await supabase.from('campaign_extras').update({ done: !done }).eq('id', extraId)
    setCampaigns(c => c.map(x => x.id === campId ? {
      ...x, campaign_extras: x.campaign_extras.map((e: any) => e.id === extraId ? { ...e, done: !done } : e)
    } : x))
  }

  async function addExtra(campId: string) {
    const text = newExtraText[campId]?.trim()
    if (!text) return
    const { data } = await supabase.from('campaign_extras').insert({ campaign_id: campId, title: text }).select().single()
    if (data) {
      setCampaigns(c => c.map(x => x.id === campId ? { ...x, campaign_extras: [...(x.campaign_extras || []), data] } : x))
      setNewExtraText(t => ({ ...t, [campId]: '' }))
      setAddingExtra(null)
    }
  }

  const seasonal = SEASONAL.find(s => s.type === selected)!
  const days = getDaysUntil(seasonal.month, seasonal.day)

  // Clientes com esta campanha ativa
  const activeCamps = campaigns.filter(c => c.type === selected)
  const activeClientIds = activeCamps.map(c => c.client_id)
  const activeClients = clients.filter(c => activeClientIds.includes(c.id))

  // Clientes sem esta campanha ainda
  const inactiveClients = clients.filter(c => !activeClientIds.includes(c.id))

  if (loading) return <div className="p-6 text-sm text-[var(--color-text-muted)]">Carregando campanhas...</div>

  return (
    <div className="p-6 flex flex-col gap-6 h-full overflow-y-auto">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-[var(--color-text-primary)] tracking-tight">Campanhas</h1>
        <p className="text-[var(--color-text-muted)] text-sm mt-0.5">Visão global · todos os clientes por campanha</p>
      </div>

      {/* Seletor de campanha */}
      <div className="flex gap-2 flex-wrap">
        {SEASONAL.map(s => {
          const d = getDaysUntil(s.month, s.day)
          const isUrgent = d >= 0 && d <= s.leadDays
          const activeCnt = campaigns.filter(c => c.type === s.type).length
          return (
            <button
              key={s.type}
              onClick={() => setSelected(s.type)}
              className="flex items-center gap-2 px-3 py-2 rounded-xl border transition-all text-sm"
              style={selected === s.type
                ? { background: isDark ? s.theme.darkBg : s.theme.bg, borderColor: isDark ? s.theme.darkBorder : s.theme.border, color: s.theme.accent, fontWeight: 500 }
                : { background: 'var(--color-bg-card)', borderColor: 'var(--color-border)', color: 'var(--color-text-secondary)' }
              }
            >
              <span>{s.emoji}</span>
              <span>{s.name}</span>
              {activeCnt > 0 && <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full" style={{ background: selected === s.type ? s.theme.accent : 'var(--color-bg-subtle)', color: selected === s.type ? 'white' : 'var(--color-text-secondary)' }}>{activeCnt}</span>}
              {isUrgent && <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: 'var(--ds-error-accent)' }} />}
            </button>
          )
        })}
      </div>

      {/* Banner da campanha selecionada */}
      <div className="rounded-2xl p-5 border" style={{ background: isDark ? seasonal.theme.darkBg : seasonal.theme.bg, borderColor: isDark ? seasonal.theme.darkBorder : seasonal.theme.border }}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-3xl">{seasonal.emoji}</span>
            <div>
              <h2 className="text-base font-semibold" style={{ color: seasonal.theme.accent }}>{seasonal.name}</h2>
              <p className="text-sm mt-0.5" style={{ color: seasonal.theme.accent, opacity: 0.7 }}>
                {days < 0 ? 'Já passou' : days === 0 ? 'Hoje!' : `Faltam ${days} dias · ${seasonal.day}/${seasonal.month}`}
              </p>
            </div>
          </div>
          <div className="text-right">
            <p className="text-2xl font-bold" style={{ color: seasonal.theme.accent }}>{activeClients.length}</p>
            <p className="text-xs" style={{ color: seasonal.theme.accent, opacity: 0.7 }}>clientes ativos</p>
          </div>
        </div>
      </div>

      {/* Grid de clientes ativos */}
      {activeClients.length > 0 && (
        <div>
          <p className="text-sm font-semibold text-[var(--color-text-primary)] mb-3">Clientes com esta campanha</p>
          <div className="grid grid-cols-2 gap-4">
            {activeClients.map(client => {
              const camp = activeCamps.find(c => c.client_id === client.id)!
              const campPosts = posts.filter(p => p.client_id === client.id && p.campaign_type === selected)
              const extras = camp.campaign_extras || []
              const doneExtras = extras.filter((e: any) => e.done).length
              const donePosts = campPosts.filter(p => ['aprovado', 'publicado'].includes(p.status)).length
              const isExp = expanded === camp.id

              return (
                <div key={client.id} className="bg-[var(--color-bg-card)] border border-[var(--color-border)] rounded-2xl overflow-hidden">
                  {/* Client header */}
                  <div
                    className="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-[var(--color-bg-alt)] transition-colors"
                    onClick={() => setExpanded(isExp ? null : camp.id)}
                  >
                    <div className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-semibold flex-shrink-0" style={{ background: client.color_hex }}>{getInitials(client.name)}</div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-[var(--color-text-primary)] truncate">{client.name}</p>
                      <p className="text-xs text-[var(--color-text-secondary)]">{campPosts.length} posts · {extras.length} extras</p>
                    </div>
                    {/* Progress */}
                    <div className="flex items-center gap-2 flex-shrink-0">
                      {campPosts.length > 0 && (
                        <div className="flex items-center gap-1.5">
                          <div className="w-16 h-1.5 bg-[var(--color-bg-subtle)] rounded-full overflow-hidden">
                            <div className="h-full rounded-full transition-all" style={{ width: `${(donePosts / campPosts.length) * 100}%`, background: seasonal.theme.accent }} />
                          </div>
                          <span className="text-[10px] text-[var(--color-text-muted)]">{donePosts}/{campPosts.length}</span>
                        </div>
                      )}
                      {isExp ? <ChevronUp size={14} className="text-[var(--color-text-muted)]" /> : <ChevronDown size={14} className="text-[var(--color-text-muted)]" />}
                    </div>
                  </div>

                  {/* Expanded */}
                  {isExp && (
                    <div className="border-t border-[var(--color-border)] p-4 flex flex-col gap-4">
                      {/* Posts */}
                      {campPosts.length > 0 && (
                        <div>
                          <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--color-text-muted)] mb-2">Posts</p>
                          <div className="flex flex-col gap-1.5">
                            {campPosts.map(p => (
                              <div key={p.id} className="flex items-center gap-2 text-xs">
                                <span className="font-bold text-[var(--color-text-muted)] w-5">#{p.post_number}</span>
                                <span className="text-[10px] font-medium px-1.5 py-0.5 rounded flex-shrink-0" style={{ background: (isDark ? TYPE_BG_D : TYPE_BG_L)[p.post_type] || 'var(--color-bg-subtle)', color: (isDark ? TYPE_TX_D : TYPE_TX_L)[p.post_type] || 'var(--color-text-secondary)' }}>{TYPE_LABEL[p.post_type] || p.post_type}</span>
                                <span className="flex-1 text-[var(--color-text-primary)] truncate">{p.title}</span>
                                <span className="text-[10px] font-medium px-1.5 py-0.5 rounded flex-shrink-0" style={{ background: (isDark ? STATUS_BG_D : STATUS_BG_L)[p.status] || 'var(--color-bg-subtle)', color: (isDark ? STATUS_TX_D : STATUS_TX_L)[p.status] || 'var(--color-text-secondary)' }}>{STATUS_LABEL[p.status] || p.status}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Extras */}
                      <div>
                        <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--color-text-muted)] mb-2">Extras {extras.length > 0 && `· ${doneExtras}/${extras.length}`}</p>
                        {extras.length > 0 && (
                          <div className="w-full h-1 bg-[var(--color-bg-subtle)] rounded-full mb-2 overflow-hidden">
                            <div className="h-full rounded-full" style={{ width: `${extras.length ? (doneExtras / extras.length) * 100 : 0}%`, background: seasonal.theme.accent }} />
                          </div>
                        )}
                        <div className="flex flex-col gap-1">
                          {extras.map((e: any) => (
                            <div key={e.id} className="flex items-center gap-2">
                              <button onClick={() => toggleExtra(camp.id, e.id, e.done)} className="w-3.5 h-3.5 rounded border flex items-center justify-center flex-shrink-0 transition-colors" style={e.done ? { background: seasonal.theme.accent, borderColor: seasonal.theme.accent } : { borderColor: 'var(--color-border-strong)' }}>
                                {e.done && <Check size={9} color="white" />}
                              </button>
                              <span className={`text-xs flex-1 ${e.done ? 'line-through text-[var(--color-text-muted)]' : 'text-[var(--color-text-primary)]'}`}>{e.title}</span>
                            </div>
                          ))}
                        </div>
                        {addingExtra === camp.id ? (
                          <div className="flex gap-2 mt-2">
                            <input autoFocus value={newExtraText[camp.id] || ''} onChange={e => setNewExtraText(t => ({ ...t, [camp.id]: e.target.value }))} onKeyDown={e => e.key === 'Enter' && addExtra(camp.id)} placeholder="Novo extra..." className="flex-1 text-xs border border-[var(--color-border)] rounded-lg px-2.5 py-1.5 outline-none focus:border-[var(--color-brand)]" />
                            <button onClick={() => addExtra(camp.id)} className="text-xs font-medium px-2.5 py-1.5 rounded-lg text-white" style={{ background: seasonal.theme.accent }}>+</button>
                            <button onClick={() => setAddingExtra(null)} className="text-xs text-[var(--color-text-muted)] px-1">×</button>
                          </div>
                        ) : (
                          <button onClick={() => setAddingExtra(camp.id)} className="flex items-center gap-1 text-xs text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] mt-1.5 transition-colors"><Plus size={11} /> Extra</button>
                        )}
                      </div>

                      {/* Briefing */}
                      {camp.briefing && (
                        <div>
                          <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--color-text-muted)] mb-1.5">Briefing</p>
                          <p className="text-xs text-[var(--color-text-secondary)] leading-relaxed bg-[var(--color-bg-alt)] rounded-lg px-3 py-2">{camp.briefing}</p>
                        </div>
                      )}

                      <a href={`/dashboard/clientes/${client.id}?tab=campanhas`} className="text-xs hover:underline" style={{ color: 'var(--ds-info-text)' }}>Abrir página do cliente →</a>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Clientes sem campanha ainda */}
      {inactiveClients.length > 0 && (
        <div>
          <p className="text-sm font-semibold text-[var(--color-text-muted)] mb-3">{inactiveClients.length} clientes sem esta campanha</p>
          <div className="flex flex-wrap gap-2">
            {inactiveClients.map(client => (
              <a key={client.id} href={`/dashboard/clientes/${client.id}?tab=campanhas`} className="flex items-center gap-2 bg-[var(--color-bg-card)] border border-[var(--color-border)] rounded-lg px-3 py-1.5 hover:border-[var(--color-border-hover)] transition-colors">
                <div className="w-5 h-5 rounded-full flex items-center justify-center text-white text-[8px] font-semibold" style={{ background: client.color_hex }}>{getInitials(client.name)}</div>
                <span className="text-xs text-[var(--color-text-secondary)]">{client.name}</span>
              </a>
            ))}
          </div>
        </div>
      )}

      {activeClients.length === 0 && (
        <div className="flex flex-col items-center justify-center h-48 text-center border border-dashed border-[var(--color-border)] rounded-2xl">
          <span className="text-3xl mb-2">{seasonal.emoji}</span>
          <p className="text-sm font-medium text-[var(--color-text-primary)]">Nenhum cliente com {seasonal.name} ainda</p>
          <p className="text-xs text-[var(--color-text-muted)] mt-1">Ative a campanha na página de cada cliente</p>
        </div>
      )}
    </div>
  )
}
