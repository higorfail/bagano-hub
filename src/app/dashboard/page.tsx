'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'

type Client = { id: string; name: string; color_hex: string }
type Post = { id: string; title: string; post_number: number; status: string; approval_status: string; scheduled_date: string; client_id: string }

function getInitials(name: string) { return name.split(' ').map(w=>w[0]).join('').slice(0,2).toUpperCase() }

function getGreeting() {
  const h = new Date().getHours()
  if (h < 12) return 'Bom dia'
  if (h < 18) return 'Boa tarde'
  return 'Boa noite'
}

const TODAY = new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long' })

const SPECIAL_DATES = [
  { emoji: '🍕', name: 'Dia da Pizza', date: new Date(new Date().getFullYear(), 6, 10) },
  { emoji: '🍣', name: 'Dia do Sushi', date: new Date(new Date().getFullYear(), 10, 1) },
  { emoji: '❤️', name: 'Dia dos Namorados', date: new Date(new Date().getFullYear(), 5, 12) },
  { emoji: '👨', name: 'Dia dos Pais', date: new Date(new Date().getFullYear(), 7, 10) },
  { emoji: '🎄', name: 'Natal', date: new Date(new Date().getFullYear(), 11, 25) },
]

export default function InicioPage() {
  const router = useRouter()
  const [clients, setClients] = useState<Client[]>([])
  const [posts, setPosts] = useState<Post[]>([])
  const [loading, setLoading] = useState(true)
  const month = new Date().getMonth() + 1
  const year = new Date().getFullYear()

  useEffect(() => {
    async function load() {
      const supabase = createClient()
      const [{ data: clientData }, { data: postData }] = await Promise.all([
        supabase.from('clients').select('id, name, color_hex').eq('status', 'active').order('name'),
        supabase.from('schedules').select('id, title, post_number, status, approval_status, scheduled_date, client_id').eq('month', month).eq('year', year),
      ])
      setClients(clientData || [])
      setPosts(postData || [])
      setLoading(false)
    }
    load()
  }, [])

  // Alertas
  const notApproved = posts.filter(p => p.approval_status === 'não aprovado')
  const overdue = posts.filter(p => p.scheduled_date && new Date(p.scheduled_date + 'T12:00:00') < new Date() && p.status !== 'publicado')
  
  const alerts = [
    ...notApproved.map(p => {
      const c = clients.find(c => c.id === p.client_id)
      return { color: '#EF4444', emoji: '🔴', title: `${c?.name} — ${p.title}`, desc: 'Cliente não aprovou', id: p.id, clientId: p.client_id }
    }),
    ...overdue.filter(p => p.approval_status !== 'não aprovado').map(p => {
      const c = clients.find(c => c.id === p.client_id)
      return { color: '#F59E0B', emoji: '🟡', title: `${c?.name} — ${p.title}`, desc: 'DDS passou', id: p.id, clientId: p.client_id }
    }),
  ].slice(0, 5)

  // Próxima data especial
  const today = new Date()
  const nextDate = SPECIAL_DATES
    .map(d => ({ ...d, diff: Math.ceil((d.date.getTime() - today.getTime()) / (1000*60*60*24)) }))
    .filter(d => d.diff > 0)
    .sort((a,b) => a.diff - b.diff)[0]

  if (nextDate) {
    alerts.push({ color: '#3B82F6', emoji: nextDate.emoji, title: `${nextDate.name} em ${nextDate.diff} dias`, desc: nextDate.date.toLocaleDateString('pt-BR', { day: '2-digit', month: 'long' }), id: 'date', clientId: '' })
  }

  if (loading) return <div className="p-6 text-sm text-[var(--color-text-muted)]">Carregando...</div>

  return (
    <div className="p-6 flex flex-col gap-8">
      {/* Saudação */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-[var(--color-text-primary)]">{getGreeting()}, Higor 👋</h1>
          <p className="text-sm text-[var(--color-text-muted)] mt-0.5 capitalize">{TODAY}</p>
        </div>
        <div className="flex items-center gap-3 text-sm text-[var(--color-text-secondary)]">
          <span className="font-semibold text-[var(--color-text-primary)]">{posts.length}</span> posts em junho
          <span className="font-semibold text-[var(--color-text-primary)]">{posts.filter(p=>p.status==='publicado').length}</span> publicados
          <span className="font-semibold text-[var(--color-text-primary)]">{posts.filter(p=>p.approval_status==='aprovado').length}</span> aprovados
        </div>
      </div>

      <div className="grid grid-cols-3 gap-4">
        {/* Atenção do dia */}
        <div>
          <h2 className="text-sm font-semibold text-[var(--color-text-primary)] mb-3">⚡ Precisa de atenção agora</h2>
          {alerts.length === 0 ? (
            <div className="bg-green-50 border border-green-100 rounded-2xl p-4 flex items-center gap-3">
              <span className="text-xl">✅</span>
              <div>
                <p className="text-sm font-semibold text-green-700">Tudo em dia!</p>
                <p className="text-xs text-green-600">Nenhum alerta no momento.</p>
              </div>
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              {alerts.map((alert, i) => (
                <button
                  key={i}
                  onClick={() => alert.clientId && router.push(`/dashboard/clientes/${alert.clientId}`)}
                  className="bg-white border border-[var(--color-border)] rounded-2xl p-4 flex items-start gap-3 text-left hover:shadow-sm transition-all w-full"
                  style={{ borderLeftWidth: 3, borderLeftColor: alert.color }}
                >
                  <span className="text-base flex-shrink-0 mt-0.5">{alert.emoji}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-[var(--color-text-primary)] truncate">{alert.title}</p>
                    <p className="text-xs text-[var(--color-text-muted)] mt-0.5">{alert.desc}</p>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Resumo rápido */}
        <div>
          <h2 className="text-sm font-semibold text-[var(--color-text-primary)] mb-3">📊 Junho em números</h2>
          <div className="grid grid-cols-3 gap-3">
            {[
              { label: 'Total de posts', value: posts.length, color: 'var(--color-text-primary)' },
              { label: 'Publicados', value: posts.filter(p=>p.status==='publicado').length, color: '#22C55E' },
              { label: 'Aprovados', value: posts.filter(p=>p.approval_status==='aprovado').length, color: '#3B82F6' },
              { label: 'Não aprovados', value: posts.filter(p=>p.approval_status==='não aprovado').length, color: '#EF4444' },
              { label: 'Em produção', value: posts.filter(p=>p.status==='em produção').length, color: '#F59E0B' },
              { label: 'Clientes ativos', value: clients.length, color: '#8B5CF6' },
            ].map(item => (
              <div key={item.label} className="bg-white border border-[var(--color-border)] rounded-xl p-3">
                <p className="text-2xl font-black" style={{ color: item.color }}>{item.value}</p>
                <p className="text-xs text-[var(--color-text-muted)] mt-0.5">{item.label}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Clientes ativos */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-[var(--color-text-primary)]">🗂 Clientes ativos — Junho</h2>
          <button onClick={() => router.push('/dashboard/clientes')} className="text-xs text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]">Ver todos →</button>
        </div>
        <div className="grid grid-cols-5 gap-3">
          {clients.map(client => {
            const clientPosts = posts.filter(p => p.client_id === client.id)
            const approvedCount = clientPosts.filter(p => p.approval_status === 'aprovado').length
            const notApprovedCount = clientPosts.filter(p => p.approval_status === 'não aprovado').length
            const publishedCount = clientPosts.filter(p => p.status === 'publicado').length
            const progress = clientPosts.length > 0 ? (approvedCount / clientPosts.length) * 100 : 0

            let statusLabel = 'sem posts'
            let statusColor = 'bg-[var(--color-bg-subtle)] text-[var(--color-text-secondary)]'
            if (clientPosts.length > 0) {
              if (notApprovedCount > 0) { statusLabel = `${notApprovedCount} alt.`; statusColor = 'bg-red-50 text-red-600' }
              else if (approvedCount === clientPosts.length) { statusLabel = '✓ tudo ok'; statusColor = 'bg-green-50 text-green-600' }
              else if (publishedCount === clientPosts.length) { statusLabel = '✓ publicado'; statusColor = 'bg-green-50 text-green-600' }
              else { statusLabel = 'em andamento'; statusColor = 'bg-[var(--color-bg-subtle)] text-[var(--color-text-secondary)]' }
            }

            return (
              <button
                key={client.id}
                onClick={() => router.push(`/dashboard/clientes/${client.id}`)}
                className="bg-white border border-[var(--color-border)] rounded-2xl p-4 text-left hover:shadow-md transition-all"
                style={{ borderLeftWidth: 3, borderLeftColor: client.color_hex }}
              >
                <div className="flex items-center gap-2 mb-3">
                  <div className="w-8 h-8 rounded-xl flex items-center justify-center text-white text-xs font-bold flex-shrink-0" style={{ background: client.color_hex }}>
                    {getInitials(client.name)}
                  </div>
                  <p className="text-sm font-semibold text-[var(--color-text-primary)] truncate">{client.name}</p>
                </div>
                <p className="text-xs text-[var(--color-text-muted)] mb-2">{clientPosts.length} posts</p>
                <div className="w-full bg-[var(--color-bg-subtle)] rounded-full h-1 mb-2">
                  <div className="h-1 rounded-full transition-all" style={{ width: `${progress}%`, background: client.color_hex }} />
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-[var(--color-text-muted)]">{approvedCount}/{clientPosts.length}</span>
                  <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${statusColor}`}>{statusLabel}</span>
                </div>
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}
