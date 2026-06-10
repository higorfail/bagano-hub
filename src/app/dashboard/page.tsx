'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import { ArrowRight } from 'lucide-react'

type Client = { id: string; name: string; color_hex: string }
type Post = { id: string; client_id: string; status: string; approval_status: string }
type SpecialDate = { id: string; title: string; date: string }

function getInitials(name: string) {
  return name.split(' ').slice(0, 2).map((w: string) => w[0]).join('').toUpperCase()
}

const MONTHS = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro']
const DAYS = ['Domingo','Segunda-feira','Terça-feira','Quarta-feira','Quinta-feira','Sexta-feira','Sábado']

function getDayGreeting() {
  const h = new Date().getHours()
  if (h < 12) return 'Bom dia'
  if (h < 18) return 'Boa tarde'
  return 'Boa noite'
}

export default function Inicio() {
  const router = useRouter()
  const supabase = createClient()
  const [clients, setClients] = useState<Client[]>([])
  const [posts, setPosts] = useState<Post[]>([])
  const [specialDates, setSpecialDates] = useState<SpecialDate[]>([])
  const [loading, setLoading] = useState(true)

  const now = new Date()
  const month = now.getMonth() + 1
  const year = now.getFullYear()

  useEffect(() => {
    async function load() {
      const [{ data: cls }, { data: ps }, { data: sd }] = await Promise.all([
        supabase.from('clients').select('id, name, color_hex').eq('status', 'active').order('name'),
        supabase.from('schedules').select('id, client_id, status, approval_status').eq('month', month).eq('year', year),
        supabase.from('special_dates').select('id, title, date').gte('date', now.toISOString().split('T')[0]).order('date').limit(5),
      ])
      setClients(cls || [])
      setPosts(ps || [])
      setSpecialDates(sd || [])
      setLoading(false)
    }
    load()
  }, [])

  const totalPosts = posts.length
  const published = posts.filter(p => p.status === 'publicado').length
  const approved = posts.filter(p => p.approval_status === 'aprovado').length
  const inProduction = posts.filter(p => p.status === 'em produção').length
  const notApproved = posts.filter(p => p.approval_status === 'não aprovado').length

  const metrics = [
    { label: 'Posts no mês',    value: totalPosts,     color: '#1A1916' },
    { label: 'Publicados',      value: published,      color: '#16a34a' },
    { label: 'Aprovados',       value: approved,       color: '#2563eb' },
    { label: 'Em produção',     value: inProduction,   color: '#d97706' },
    { label: 'Não aprovados',   value: notApproved,    color: '#dc2626' },
    { label: 'Clientes ativos', value: clients.length, color: '#7c3aed' },
  ]

  if (loading) return (
    <div className="flex items-center justify-center h-full">
      <div className="w-5 h-5 border-2 border-[#EBEAE5] border-t-[#1A1916] rounded-full animate-spin" />
    </div>
  )

  return (
    <div className="min-h-screen bg-[#F9F8F5]">
      <div className="max-w-7xl mx-auto px-8 py-10 space-y-10">

        {/* Header */}
        <div>
          <p className="text-sm text-[#A8A59E] mb-1.5">{DAYS[now.getDay()]}, {now.getDate()} de {MONTHS[now.getMonth()]} {year}</p>
          <h1 className="text-4xl font-bold text-[#1A1916] tracking-tight">{getDayGreeting()}, Higor 👋</h1>
        </div>

        {/* Métricas */}
        <div className="grid grid-cols-6 gap-4">
          {metrics.map(m => (
            <div key={m.label} className="bg-white rounded-2xl p-6 border border-[#EBEAE5]">
              <p className="text-xs font-medium text-[#A8A59E] uppercase tracking-wider mb-4">{m.label}</p>
              <p className="text-5xl font-bold tracking-tight" style={{ color: m.color }}>{m.value}</p>
            </div>
          ))}
        </div>

        {/* Datas especiais */}
        {specialDates.length > 0 && (
          <div className="bg-white rounded-2xl p-6 border border-[#EBEAE5] max-w-sm">
            <p className="text-xs font-semibold text-[#A8A59E] uppercase tracking-wider mb-5">Próximas datas</p>
            <div className="space-y-4">
              {specialDates.map(sd => {
                const d = new Date(sd.date + 'T12:00:00')
                const diff = Math.ceil((d.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
                return (
                  <div key={sd.id} className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-[#F9F8F5] border border-[#EBEAE5] flex flex-col items-center justify-center flex-shrink-0">
                      <span className="text-sm font-bold text-[#1A1916] leading-none">{d.getDate()}</span>
                      <span className="text-[9px] text-[#A8A59E] leading-none mt-0.5">{MONTHS[d.getMonth()].slice(0,3)}</span>
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-[#1A1916]">{sd.title}</p>
                      <p className="text-xs text-[#A8A59E]">em {diff} dia{diff !== 1 ? 's' : ''}</p>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* Clientes */}
        <div>
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-2xl font-bold text-[#1A1916]">Clientes — {MONTHS[now.getMonth()]}</h2>
            <button onClick={() => router.push('/dashboard/clientes')} className="flex items-center gap-1.5 text-sm text-[#A8A59E] hover:text-[#1A1916] transition-colors">
              Ver todos <ArrowRight size={14} />
            </button>
          </div>

          <div className="grid grid-cols-4 gap-4">
            {clients.map(client => {
              const clientPosts = posts.filter(p => p.client_id === client.id)
              const clientApproved = clientPosts.filter(p => p.approval_status === 'aprovado').length
              const clientTotal = clientPosts.length
              const progress = clientTotal > 0 ? (clientApproved / clientTotal) * 100 : 0
              const allApproved = clientTotal > 0 && clientApproved === clientTotal
              const hasIssues = clientPosts.some(p => p.approval_status === 'não aprovado')

              return (
                <button
                  key={client.id}
                  onClick={() => router.push(`/dashboard/clientes/${client.id}`)}
                  className="bg-white rounded-2xl p-5 border border-[#EBEAE5] text-left hover:border-[#D4D0C8] hover:-translate-y-0.5 transition-all duration-150 group"
                >
                  <div className="flex items-center gap-3 mb-4">
                    <div className="w-10 h-10 rounded-xl flex items-center justify-center text-white text-sm font-bold flex-shrink-0" style={{ background: client.color_hex }}>
                      {getInitials(client.name)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-[#1A1916] truncate text-sm">{client.name}</p>
                      <p className="text-xs text-[#A8A59E]">{clientTotal} post{clientTotal !== 1 ? 's' : ''}</p>
                    </div>
                    <ArrowRight size={14} className="text-[#EBEAE5] group-hover:text-[#A8A59E] transition-colors flex-shrink-0" />
                  </div>

                  <div className="h-1 bg-[#F2F0EB] rounded-full mb-3 overflow-hidden">
                    <div className="h-full rounded-full transition-all" style={{ width: `${progress}%`, background: client.color_hex }} />
                  </div>

                  <div className="flex items-center justify-between">
                    <span className="text-xs text-[#A8A59E]">{clientApproved}/{clientTotal} aprovados</span>
                    {clientTotal === 0 ? (
                      <span className="text-xs px-2 py-1 rounded-lg bg-[#F9F8F5] text-[#A8A59E]">sem posts</span>
                    ) : allApproved ? (
                      <span className="text-xs px-2 py-1 rounded-lg bg-green-50 text-green-600 font-medium">✓ tudo ok</span>
                    ) : hasIssues ? (
                      <span className="text-xs px-2 py-1 rounded-lg bg-red-50 text-red-500 font-medium">alteração</span>
                    ) : (
                      <span className="text-xs px-2 py-1 rounded-lg bg-[#F9F8F5] text-[#6B6963]">em andamento</span>
                    )}
                  </div>
                </button>
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
}
