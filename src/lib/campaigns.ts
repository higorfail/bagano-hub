'use client'

// As datas de campanha do hub.
//
// Estavam escritas dentro de DOIS arquivos — a página de Campanhas e a aba do
// cliente — como uma lista fixa de seis. Acrescentar o Dia do Cliente exigia
// editar código nos dois lugares, então na prática ninguém acrescentava: o
// jeito que sobrava era criar uma campanha "personalizada" de um cliente só,
// com a data enfiada no nome ("Dia do Cliente 15.09"). E campanha assim nasce
// sem data de verdade: sem contagem regressiva, sem entrar na ordenação por
// proximidade, e invisível na página geral.
//
// Agora a lista vive na tabela `campaign_dates` e vale pra todos os clientes,
// como o Natal sempre valeu. A lista abaixo é o padrão de fábrica: ela cobre o
// hub enquanto a tabela não existe, e é a mesma que o SQL de criação semeia.

import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase'
import { campaignDaysUntil } from '@/lib/campaignPeriod'

export type CampaignDate = {
  type: string
  name: string
  month: number
  day: number
  leadDays: number
  color: string
}

/**
 * Datas móveis (Carnaval, Páscoa, Mães, Pais, Black Friday) entram com o dia
 * aproximado do ano corrente — é o que já valia antes. Com a lista no banco, dá
 * pra corrigir o dia certo de cada ano pela tela, sem deploy.
 */
export const DEFAULT_CAMPAIGN_DATES: CampaignDate[] = [
  { type: 'carnaval',     name: 'Carnaval',            month: 2,  day: 28, leadDays: 30, color: '#7C3AED' },
  { type: 'mulher',       name: 'Dia da Mulher',       month: 3,  day: 8,  leadDays: 21, color: '#C026D3' },
  { type: 'pascoa',       name: 'Páscoa',              month: 4,  day: 20, leadDays: 30, color: '#D97706' },
  { type: 'maes',         name: 'Dia das Mães',        month: 5,  day: 11, leadDays: 45, color: '#DB2777' },
  { type: 'namorados',    name: 'Dia dos Namorados',   month: 6,  day: 12, leadDays: 45, color: '#E11D48' },
  { type: 'juninas',      name: 'Festas Juninas',      month: 6,  day: 24, leadDays: 30, color: '#EA580C' },
  { type: 'pais',         name: 'Dia dos Pais',        month: 8,  day: 11, leadDays: 30, color: '#0369A1' },
  { type: 'cliente',      name: 'Dia do Cliente',      month: 9,  day: 15, leadDays: 30, color: '#0891B2' },
  { type: 'criancas',     name: 'Dia das Crianças',    month: 10, day: 12, leadDays: 30, color: '#F59E0B' },
  { type: 'halloween',    name: 'Halloween',           month: 10, day: 31, leadDays: 21, color: '#9A3412' },
  { type: 'black_friday', name: 'Black Friday',        month: 11, day: 27, leadDays: 45, color: '#334155' },
  { type: 'natal',        name: 'Natal & Réveillon',   month: 12, day: 25, leadDays: 60, color: '#DC2626' },
]

/**
 * Fundo e borda saem do acento, não de uma paleta escrita à mão por campanha.
 *
 * Antes cada campanha carregava seis cores fixas (bg, border, accent, e as três
 * versões escuras). Isso funcionava enquanto a lista era fixa: campanha criada
 * por você não teria como nascer com essa paleta, e ia parecer de segunda
 * classe ao lado das outras. Derivando por transparência, qualquer cor nova já
 * chega com a mesma cara — e no escuro também.
 */
export function campaignTheme(color: string, dark: boolean) {
  return {
    accent: color,
    bg: color + (dark ? '24' : '12'),
    border: color + (dark ? '4D' : '33'),
  }
}

/** Data no formato curto do card: "15 set". */
export function campaignDateLabel(d: Pick<CampaignDate, 'month' | 'day'>) {
  return new Date(2000, d.month - 1, d.day).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' }).replace('.', '')
}

export function orderByProximity<T extends Pick<CampaignDate, 'month' | 'day'>>(list: T[]): T[] {
  return [...list].sort((a, b) => campaignDaysUntil(a.month, a.day) - campaignDaysUntil(b.month, b.day))
}

/** Só letras, números e underline — é chave, entra em `campaign_type` dos posts. */
export function slugifyCampaignType(name: string) {
  return name.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 40)
}

/**
 * Se a tabela não existir ainda, ou a consulta falhar, o hub segue com a lista
 * padrão em vez de ficar sem campanha nenhuma na tela. Coluna/tabela ausente
 * derruba a consulta INTEIRA no PostgREST, e já derrubamos uma tela assim.
 */
export function useCampaignDates() {
  const [dates, setDates] = useState<CampaignDate[]>(DEFAULT_CAMPAIGN_DATES)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    const supabase = createClient()
    const { data, error } = await supabase
      .from('campaign_dates')
      .select('type, name, month, day, lead_days, color')
      .eq('active', true)
    if (!error && data && data.length) {
      setDates(data.map((d: any) => ({
        type: d.type, name: d.name, month: d.month, day: d.day,
        leadDays: d.lead_days ?? 30, color: d.color || '#6B7280',
      })))
    }
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  return { dates, loading, reload: load }
}

export async function createCampaignDate(d: CampaignDate) {
  const supabase = createClient()
  return supabase.from('campaign_dates').insert({
    type: d.type, name: d.name, month: d.month, day: d.day,
    lead_days: d.leadDays, color: d.color, active: true,
  })
}
