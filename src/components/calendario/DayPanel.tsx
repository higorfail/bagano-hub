'use client'

import { X, Plus } from 'lucide-react'
import ItemChip, { rotulo } from './ItemChip'
import { ordenarDoDia, temHora, type CalItem } from '@/lib/calendarItems'
import ModalPortal from '@/components/ModalPortal'

// O painel do dia — o que faltava pra chegar no que a célula do mês esconde.
//
// A célula mostra 3 itens e o resto virava "+6 mais" escrito num <span>: não
// era botão, não abria nada, não havia outro caminho. Medido em agosto: 162
// posts em 31 dias, média 5,2 e pico de 10 — 76 itens, 46% do mês, sem
// NENHUMA forma de serem vistos.

const MESES = ['janeiro','fevereiro','março','abril','maio','junho','julho','agosto','setembro','outubro','novembro','dezembro']
const DIAS  = ['domingo','segunda-feira','terça-feira','quarta-feira','quinta-feira','sexta-feira','sábado']

export default function DayPanel({ date, items, onClose, onOpen, onNovoEvento }: {
  date: string
  items: CalItem[]
  onClose: () => void
  onOpen: (item: CalItem) => void
  onNovoEvento: (date: string) => void
}) {
  const d = new Date(date + 'T12:00:00')
  const ordenados = [...items].sort(ordenarDoDia)
  const comHora = ordenados.filter(temHora)
  const semHora = ordenados.filter(i => !temHora(i))

  return (
    <ModalPortal>
      <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-[70] p-4"
        onClick={e => { if (e.target === e.currentTarget) onClose() }}>
        <div className="bg-[var(--color-bg-card)] rounded-2xl w-full max-w-md flex flex-col max-h-[85vh] shadow-pop">

          <div className="px-5 py-4 border-b border-[var(--color-border)] flex items-center justify-between">
            <div>
              <h2 className="text-sm font-semibold text-[var(--color-text-primary)]">
                {d.getDate()} de {MESES[d.getMonth()]}
              </h2>
              <p className="text-xs text-[var(--color-text-muted)] mt-0.5 capitalize">
                {DIAS[d.getDay()]} · {items.length} {items.length === 1 ? 'item' : 'itens'}
              </p>
            </div>
            <div className="flex items-center gap-1">
              <button onClick={() => onNovoEvento(date)} title="Novo evento"
                className="w-8 h-8 rounded-lg hover:bg-[var(--color-bg-subtle)] flex items-center justify-center text-[var(--color-text-muted)] transition-colors">
                <Plus size={15} />
              </button>
              <button onClick={onClose}
                className="w-8 h-8 rounded-lg hover:bg-[var(--color-bg-subtle)] flex items-center justify-center text-[var(--color-text-muted)] transition-colors">
                <X size={16} />
              </button>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-3">
            {items.length === 0 && (
              <p className="text-xs text-[var(--color-text-muted)] text-center py-6">Nada neste dia.</p>
            )}

            {comHora.length > 0 && (
              <Secao titulo="Com horário">
                {comHora.map(i => <Linha key={i.key} item={i} onOpen={onOpen} />)}
              </Secao>
            )}

            {/* Sem horário vem depois de propósito: o que tem hora manda no dia
                da pessoa, o resto é o que precisa sair naquela data. */}
            {semHora.length > 0 && (
              <Secao titulo="Sem horário">
                {semHora.map(i => <Linha key={i.key} item={i} onOpen={onOpen} />)}
              </Secao>
            )}
          </div>
        </div>
      </div>
    </ModalPortal>
  )
}

function Secao({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-[10px] font-semibold text-[var(--color-text-faint)] uppercase tracking-wide mb-1.5">{titulo}</p>
      <div className="flex flex-col gap-1">{children}</div>
    </div>
  )
}

function Linha({ item, onOpen }: { item: CalItem; onOpen: (i: CalItem) => void }) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-[10px] text-[var(--color-text-faint)] w-16 flex-shrink-0 text-right">
        {item.startTime ? `${item.startTime}${item.endTime ? '–' + item.endTime : ''}` : rotulo(item.kind)}
      </span>
      <div className="flex-1 min-w-0">
        <ItemChip item={item} onClick={() => onOpen(item)} className="!text-[11px] !py-1" />
        {item.clientName && (
          <span className="text-[10px] text-[var(--color-text-faint)] pl-1.5">{item.clientName}</span>
        )}
      </div>
    </div>
  )
}
