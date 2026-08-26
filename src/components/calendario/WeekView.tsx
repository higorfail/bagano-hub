'use client'

import { useMemo, useRef, useEffect } from 'react'
import ItemChip from './ItemChip'
import {
  minutos, fimEfetivo, repartirColunas, temHora, ordenarDoDia, type CalItem,
} from '@/lib/calendarItems'

// Visão de semana e de dia — a mesma grade, mudando quantas colunas tem.
//
// Duas faixas, e a separação é o ponto todo: o que tem hora ocupa altura
// proporcional na grade horária (dá pra ver que a captação das 15h come quatro
// horas do dia da Gee), e o que só tem data — post, criação — fica na tira de
// cima. Empilhar as duas coisas na mesma lista é o que a visão de mês já faz, e
// é justamente o que não cabe.

const HORA_ALT = 44          // px por hora
const DIAS_CURTOS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb']

export default function WeekView({ dias, itens, hoje, onOpen, onDia }: {
  dias: Date[]
  itens: CalItem[]
  hoje: string
  onOpen: (item: CalItem) => void
  onDia: (iso: string) => void
}) {
  const scrollRef = useRef<HTMLDivElement>(null)

  const iso = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

  const porDia = useMemo(() => {
    const m = new Map<string, CalItem[]>()
    for (const d of dias) m.set(iso(d), [])
    for (const i of itens) m.get(i.date)?.push(i)
    return m
  }, [dias, itens])

  // A janela de horas se ajusta ao que existe: fixar 00h–24h faria a captação
  // das 15h ficar perdida no meio de dezenas de faixas vazias, e obrigaria a
  // rolar pra achar qualquer coisa. Mínimo das 7h às 20h pra não pular de
  // tamanho a cada semana.
  const [horaIni, horaFim] = useMemo(() => {
    const comHora = itens.filter(temHora)
    if (!comHora.length) return [7, 20]
    const ini = Math.min(7, Math.floor(Math.min(...comHora.map(i => minutos(i.startTime))) / 60))
    const fim = Math.max(20, Math.ceil(Math.max(...comHora.map(i => fimEfetivo(i))) / 60))
    return [Math.max(0, ini), Math.min(24, fim)]
  }, [itens])

  const horas = Array.from({ length: horaFim - horaIni }, (_, i) => horaIni + i)
  const alturaTotal = horas.length * HORA_ALT

  // Abre já mostrando as 8h. Sem isto a grade abre no topo da janela, que pode
  // ser 0h quando alguém marcou algo de madrugada.
  useEffect(() => {
    const el = scrollRef.current
    if (el) el.scrollTop = Math.max(0, (8 - horaIni) * HORA_ALT - 20)
  }, [horaIni])

  return (
    <div className="bg-[var(--color-bg-card)] border border-[var(--color-border)] rounded-2xl overflow-hidden">

      {/* Cabeçalho + tira de dia inteiro. Fica FORA da área que rola: o dia da
          semana precisa continuar visível quando a pessoa desce pras 18h. */}
      <div className="flex border-b border-[var(--color-border)]">
        <div className="w-12 flex-shrink-0 border-r border-[var(--color-border)]" />
        {dias.map(d => {
          const k = iso(d)
          const doDia = (porDia.get(k) || [])
          const semHora = doDia.filter(i => !temHora(i)).sort(ordenarDoDia)
          const ehHoje = k === hoje
          return (
            <div key={k} className="flex-1 min-w-0 border-r border-[var(--color-border)] last:border-r-0">
              <button onClick={() => onDia(k)}
                className="w-full px-1 py-1.5 flex flex-col items-center gap-0.5 hover:bg-[var(--color-bg-subtle)] transition-colors">
                <span className="text-[10px] text-[var(--color-text-faint)] uppercase">{DIAS_CURTOS[d.getDay()]}</span>
                <span className={`text-sm font-semibold w-6 h-6 flex items-center justify-center rounded-full ${
                  ehHoje ? 'bg-[var(--ds-error-bg,#ef4444)] text-white' : 'text-[var(--color-text-primary)]'}`}>
                  {d.getDate()}
                </span>
              </button>
              <div className="px-0.5 pb-1 flex flex-col gap-0.5 min-h-[26px]">
                {semHora.slice(0, 3).map(i => (
                  <ItemChip key={i.key} item={i} onClick={() => onOpen(i)} className="!text-[9px] !py-px" />
                ))}
                {semHora.length > 3 && (
                  <button onClick={() => onDia(k)}
                    className="text-[9px] text-[var(--color-text-faint)] hover:text-[var(--color-text-primary)] text-left px-1 transition-colors">
                    +{semHora.length - 3} mais
                  </button>
                )}
              </div>
            </div>
          )
        })}
      </div>

      {/* Grade horária */}
      <div ref={scrollRef} className="overflow-y-auto max-h-[62vh]">
        <div className="flex" style={{ height: alturaTotal }}>
          <div className="w-12 flex-shrink-0 border-r border-[var(--color-border)] relative">
            {horas.map((h, idx) => (
              <div key={h} className="absolute right-1 text-[9px] text-[var(--color-text-faint)]"
                style={{ top: idx * HORA_ALT - 5 }}>
                {idx === 0 ? '' : `${String(h).padStart(2, '0')}:00`}
              </div>
            ))}
          </div>

          {dias.map(d => {
            const k = iso(d)
            const doDia = (porDia.get(k) || []).filter(temHora)
            const colunas = repartirColunas(doDia)
            return (
              <div key={k} className="flex-1 min-w-0 border-r border-[var(--color-border)] last:border-r-0 relative">
                {horas.map((_, idx) => (
                  <div key={idx} className="absolute left-0 right-0 border-t border-[var(--color-border)] opacity-40"
                    style={{ top: idx * HORA_ALT }} />
                ))}

                {doDia.map(i => {
                  const ini = minutos(i.startTime)
                  const dur = fimEfetivo(i) - ini
                  const { col, de } = colunas.get(i.key) || { col: 0, de: 1 }
                  return (
                    <div key={i.key} className="absolute px-px"
                      style={{
                        top: ((ini - horaIni * 60) / 60) * HORA_ALT,
                        height: Math.max(16, (dur / 60) * HORA_ALT - 2),
                        // Divide a largura entre os que se sobrepõem — sem isto
                        // duas captações no mesmo horário ficam uma em cima da
                        // outra e a de baixo desaparece.
                        left:  `${(col / de) * 100}%`,
                        width: `${(1 / de) * 100}%`,
                      }}>
                      <ItemChip item={i} onClick={() => onOpen(i)}
                        className="!h-full !items-start !text-[9px] !py-0.5 overflow-hidden" />
                    </div>
                  )
                })}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
