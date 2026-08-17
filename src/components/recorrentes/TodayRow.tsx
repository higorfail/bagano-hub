'use client'

import { useMemo, useState } from 'react'
import { useToast } from '@/lib/ToastContext'
import { copyTextAsync } from '@/lib/clipboard'
import { downloadDriveContent } from '@/lib/socialItems'
import { useDriveSequences, sequenceForDate } from '@/lib/useDriveFolder'
import SwipeAction from '@/components/SwipeAction'
import {
  Recurring, RecurringLog, TYPE_LABEL,
  lastUsedMap, lastUsedLabel, isLate, WEEKDAY_SHORT, parseISO,
} from '@/lib/recurrings'
import {
  Check, Copy, Download, FolderOpen, Play, Pencil,
  Clock, Shuffle, ImageOff, Undo2, AlertTriangle,
} from 'lucide-react'

type Props = {
  rec: Recurring
  slot: string
  iso: string
  log: RecurringLog | null
  logs: RecurringLog[]
  captions: Record<string, string>
  busy: boolean
  onToggle: (rec: Recurring, slot: string, sequenceId: string | null, done: boolean) => void
  onEdit: (rec: Recurring) => void
}

const TYPE_COLOR: Record<string, string> = { story: '#8b5cf6', post: '#f59e0b' }
const actionCls = 'flex items-center gap-1.5 text-[11px] font-semibold px-2.5 py-1.5 rounded-lg border border-[var(--color-border)] text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-subtle)] disabled:opacity-40 flex-shrink-0'

export default function TodayRow({ rec, slot, iso, log, logs, captions, busy, onToggle, onEdit }: Props) {
  const { toast } = useToast()
  const [override, setOverride] = useState<string | null>(null)
  const [progress, setProgress] = useState(0)
  const [showFullCaption, setShowFullCaption] = useState(false)

  const probe = useDriveSequences(rec.drive_folder_url, { expand: null })
  const lastUsed = useMemo(() => lastUsedMap(logs), [logs])
  const target =
    log?.drive_file_id ||
    override ||
    sequenceForDate(probe.mode, probe.sequences, iso, lastUsed)?.id ||
    null
  const { mode, sequences, loading } = useDriveSequences(rec.drive_folder_url, { expand: target })

  const current = sequences.find(s => s.id === target) || null
  const files = current?.files || []
  const done = !!log
  const late = !done && isLate(iso, slot)
  const caption = (target && captions[target]) || rec.caption || ''
  const missingWeekday = mode === 'weekday' && !current && !loading && sequences.length > 0

  async function copyCaption() {
    const ok = await copyTextAsync(async () => caption)
    toast(ok ? 'Legenda copiada' : 'Não consegui copiar', ok ? 'success' : 'error')
  }

  // Um por vez: disparar 6 downloads juntos faz o navegador bloquear os
  // últimos como "múltiplos downloads automáticos".
  async function downloadAll() {
    if (!files.length) return
    setProgress(1)
    for (let i = 0; i < files.length; i++) {
      setProgress(i + 1)
      const r = await downloadDriveContent(`https://drive.google.com/file/d/${files[i].id}/view`)
      if (!r.ok) { toast(r.message, 'error'); break }
    }
    setProgress(0)
  }

  function shuffle() {
    if (sequences.length < 2) return
    const i = sequences.findIndex(s => s.id === target)
    setOverride(sequences[(i + 1) % sequences.length].id)
  }

  const toggle = () => onToggle(rec, slot, target, done)

  // ── Feito: encolhe pra uma linha ────────────────────────────────────────
  // A lista existe pra mostrar o que FALTA. Quem já foi ao ar vira registro,
  // não trabalho — some da frente e devolve a tela pro que ainda não saiu.
  if (done) {
    return (
      <div className="flex items-center gap-2.5 px-3 md:px-4 py-1.5 border-b border-[var(--color-border)] last:border-b-0">
        <button onClick={toggle} disabled={busy}
          className="w-5 h-5 flex-shrink-0 rounded-md flex items-center justify-center bg-[var(--ds-success-accent)] disabled:opacity-40">
          <Check size={13} color="#fff" strokeWidth={3} />
        </button>
        <span className="text-[13px] text-[var(--color-text-muted)] line-through truncate">{rec.title}</span>
        <span className="text-[11px] text-[var(--ds-success-text)] font-medium flex-shrink-0">
          postado{log?.done_by ? ` · ${log.done_by}` : ''}{slot ? ` · ${slot}` : ''}
        </span>
        <button onClick={toggle} disabled={busy}
          className="ml-auto flex items-center gap-1 text-[11px] text-[var(--color-text-faint)] hover:text-[var(--color-text-secondary)] flex-shrink-0">
          <Undo2 size={11} />desfazer
        </button>
      </div>
    )
  }

  // ── Pendente: tudo aberto, sem clique pra ver ───────────────────────────
  const thumbs = files.length > 0 && (
    // Quebra de linha, não rolagem horizontal: rolar o strip pro lado seria o
    // mesmo gesto de arrastar a linha pra marcar como postado, e um comeria o
    // outro. Quebrando, todas as artes aparecem sem gesto nenhum.
    <div className="flex flex-wrap gap-1 flex-shrink-0 md:max-w-[220px] lg:max-w-[320px]">
      {files.map((f, i) => (
        <a key={f.id} href={`https://drive.google.com/file/d/${f.id}/view`} target="_blank" rel="noopener noreferrer"
          title={`${i + 1} de ${files.length}`}
          className="relative w-11 md:w-12 aspect-[4/5] flex-shrink-0 rounded-md overflow-hidden bg-[var(--color-bg-alt)] block">
          {/* height inline junto do object-cover: sem ela a imagem não ocupa a
              caixa inteira e a miniatura sai partida ao meio. */}
          <img src={`/api/drive-thumb?id=${f.id}&sz=w160`} alt="" className="w-full h-full object-cover" style={{ height: '100%' }} />
          {f.isVideo && <Play size={12} fill="#fff" color="#fff" className="absolute inset-0 m-auto" />}
          {files.length > 1 && (
            <span className="absolute top-0 left-0 text-[9px] font-bold w-3.5 h-3.5 rounded-br flex items-center justify-center bg-black/65 text-white">{i + 1}</span>
          )}
        </a>
      ))}
    </div>
  )

  const actions = (
    <div className="flex flex-wrap items-center gap-1.5 flex-shrink-0">
      <button onClick={copyCaption} disabled={!caption} className={actionCls} title={caption ? undefined : 'Nenhuma legenda cadastrada'}>
        <Copy size={12} />Legenda
      </button>
      <button onClick={downloadAll} disabled={!files.length || progress > 0} className={actionCls}>
        <Download size={12} />
        {progress > 0 ? `${progress}/${files.length}` : files.length > 1 ? `Baixar as ${files.length}` : 'Baixar'}
      </button>
      {(current?.folderUrl || rec.drive_folder_url) && (
        <a href={current?.folderUrl || rec.drive_folder_url!} target="_blank" rel="noopener noreferrer" className={actionCls}>
          <FolderOpen size={12} /><span className="hidden md:inline">{current?.folderUrl ? current.name : 'Pasta'}</span><span className="md:hidden">Pasta</span>
        </a>
      )}
      {mode === 'rotation' && sequences.length > 1 && (
        <button onClick={shuffle} className={actionCls}><Shuffle size={12} />Trocar</button>
      )}
    </div>
  )

  const meta = (
    <div className="flex items-center gap-1.5 text-[11px] flex-wrap">
      {slot && (
        <span className={`flex items-center gap-0.5 font-semibold ${late ? 'text-[var(--ds-error-text)]' : 'text-[var(--color-text-muted)]'}`}>
          <Clock size={10} />{late ? `atrasado · ${slot}` : `até ${slot}`}
        </span>
      )}
      <span className="text-[var(--color-text-faint)]">
        {current ? `${current.name}${files.length > 1 ? ` · ${files.length} artes` : ''}` : loading ? 'lendo pasta…' : ''}
      </span>
      {mode === 'rotation' && target && (
        <span className="text-[var(--color-text-faint)]">· {lastUsedLabel(target, logs)}</span>
      )}
    </div>
  )

  const body = (
    <div className={`px-3 md:px-4 py-2.5 ${late ? 'bg-[var(--ds-error-bg)]' : ''}`}>
      {/* Celular empilha, desktop usa a largura que sobra: a linha inteira cabe
          numa faixa só, e a legenda ocupa o vazio no meio. */}
      <div className="flex flex-col md:flex-row md:items-center gap-2 md:gap-3">

        <div className="flex items-start gap-2.5 md:w-52 md:flex-shrink-0">
          <button onClick={toggle} disabled={busy}
            title="Marcar como postado"
            className="w-6 h-6 md:w-5 md:h-5 mt-0.5 flex-shrink-0 rounded-md border-2 border-[var(--color-border-strong)] hover:border-[var(--ds-success-accent)] transition-colors disabled:opacity-40" />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5">
              <span className="text-[13px] font-semibold text-[var(--color-text-primary)] truncate">{rec.title}</span>
              <span className="text-[9px] font-bold uppercase px-1.5 py-0.5 rounded flex-shrink-0"
                style={{ background: `${TYPE_COLOR[rec.type]}1a`, color: TYPE_COLOR[rec.type] }}>
                {TYPE_LABEL[rec.type]}
              </span>
              <button onClick={() => onEdit(rec)} title="Editar"
                className="md:hidden ml-auto p-1 text-[var(--color-text-faint)] flex-shrink-0"><Pencil size={13} /></button>
            </div>
            {meta}
          </div>
        </div>

        {missingWeekday ? (
          <div className="flex items-center gap-1.5 text-[11px] font-semibold px-2.5 py-2 rounded-lg flex-1"
            style={{ background: 'var(--ds-error-bg)', color: 'var(--ds-error-text)' }}>
            <AlertTriangle size={13} className="flex-shrink-0" />
            Sem pasta de {WEEKDAY_SHORT[parseISO(iso).getDay()]} — a pasta tem {sequences.map(s => s.name).join(', ')}.
          </div>
        ) : files.length === 0 && !loading ? (
          <div className="text-[11px] text-[var(--ds-warn-text)] flex items-center gap-1.5 flex-1">
            <ImageOff size={13} />Nenhuma arte nesta pasta.
          </div>
        ) : (
          <>
            {thumbs}
            {caption && (
              <button onClick={() => setShowFullCaption(v => !v)}
                className={`text-[11px] text-[var(--color-text-secondary)] text-left leading-relaxed flex-1 min-w-0 ${showFullCaption ? 'whitespace-pre-wrap' : 'line-clamp-2 md:line-clamp-3'}`}>
                {caption}
              </button>
            )}
          </>
        )}

        <div className="md:ml-auto flex items-center gap-1.5">
          {actions}
          <button onClick={() => onEdit(rec)} title="Editar"
            className="hidden md:flex p-1.5 rounded-lg text-[var(--color-text-faint)] hover:text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-subtle)]"><Pencil size={13} /></button>
        </div>
      </div>

      {rec.notes && <p className="text-[11px] text-[var(--color-text-muted)] mt-1.5 md:ml-[42px]">📌 {rec.notes}</p>}
    </div>
  )

  return (
    <div className="border-b border-[var(--color-border)] last:border-b-0">
      {/* Arrastar pra marcar: 15 postagens em 15 gestos, sem mirar na caixinha.
          No desktop o mesmo está no clique — gesto nunca é o único caminho. */}
      <SwipeAction left={{ label: 'Postado', icon: <Check size={16} />, color: 'var(--ds-success-accent)', onAction: toggle }}>
        <div className="bg-[var(--color-bg-card)]">{body}</div>
      </SwipeAction>
    </div>
  )
}
