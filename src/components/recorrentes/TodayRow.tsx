'use client'

import { useMemo, useState } from 'react'
import { useToast } from '@/lib/ToastContext'
import { copyTextAsync } from '@/lib/clipboard'
import { downloadDriveContent } from '@/lib/socialItems'
import { useDriveSequences, sequenceForDate } from '@/lib/useDriveFolder'
import {
  Recurring, RecurringLog, TYPE_LABEL,
  lastUsedMap, lastUsedLabel, isLate, WEEKDAY_SHORT, parseISO,
} from '@/lib/recurrings'
import {
  Check, ChevronDown, Copy, Download, FolderOpen, Play,
  Pencil, Clock, Shuffle, ImageOff, Layers,
} from 'lucide-react'

type Props = {
  rec: Recurring
  slot: string
  iso: string
  log: RecurringLog | null
  /** Todo o histórico DESTE recorrente — é o que decide a rotação. */
  logs: RecurringLog[]
  captions: Record<string, string>
  busy: boolean
  onToggle: (rec: Recurring, slot: string, sequenceId: string | null, done: boolean) => void
  onEdit: (rec: Recurring) => void
}

const TYPE_COLOR: Record<string, string> = { story: '#8b5cf6', post: '#f59e0b' }

export default function TodayRow({ rec, slot, iso, log, logs, captions, busy, onToggle, onEdit }: Props) {
  const { toast } = useToast()
  const [open, setOpen] = useState(false)
  const [override, setOverride] = useState<string | null>(null)
  const [downloading, setDownloading] = useState(false)

  // Duas passadas de propósito. A primeira lê só o índice da pasta (rápido, e é
  // o que diz se o esquema é por dia da semana); com isso a gente já sabe QUAL
  // subpasta interessa e manda abrir só ela — em vez das sete.
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

  // Sem subpasta pro dia de hoje é um buraco real de produção: o cliente espera
  // story e não tem arte. Melhor gritar do que mostrar uma linha em branco.
  const missingWeekday = mode === 'weekday' && !current && !loading && sequences.length > 0

  async function copyCaption() {
    if (!caption) { toast('Este recorrente não tem legenda cadastrada.', 'error'); return }
    const ok = await copyTextAsync(async () => caption)
    toast(ok ? 'Legenda copiada' : 'Não consegui copiar', ok ? 'success' : 'error')
  }

  // Um por vez, aguardando cada um: disparar 5 downloads juntos faz o navegador
  // bloquear os últimos como "múltiplos downloads automáticos".
  async function downloadAll() {
    if (!files.length) { toast('Nenhuma arte pra baixar.', 'error'); return }
    setDownloading(true)
    for (const f of files) {
      const r = await downloadDriveContent(`https://drive.google.com/file/d/${f.id}/view`)
      if (!r.ok) { toast(r.message, 'error'); break }
    }
    setDownloading(false)
  }

  function shuffle() {
    if (sequences.length < 2) return
    const i = sequences.findIndex(s => s.id === target)
    setOverride(sequences[(i + 1) % sequences.length].id)
  }

  return (
    <div className={`border-b border-[var(--color-border)] last:border-b-0 transition-colors ${late ? 'bg-[var(--ds-error-bg)]' : ''}`}>

      <div className="flex items-center gap-2.5 px-3 md:px-4 py-2">
        <button
          onClick={() => onToggle(rec, slot, target, done)}
          disabled={busy}
          title={done ? 'Desmarcar' : 'Marcar como postado'}
          className={`w-5 h-5 flex-shrink-0 rounded-md border-2 flex items-center justify-center transition-colors disabled:opacity-40 ${
            done ? 'bg-[var(--ds-success-accent)] border-[var(--ds-success-accent)]' : 'border-[var(--color-border-strong)] hover:border-[var(--ds-success-accent)]'
          }`}>
          {done && <Check size={13} color="#fff" strokeWidth={3} />}
        </button>

        <button onClick={() => setOpen(o => !o)} className="flex items-center gap-2.5 flex-1 min-w-0 text-left">
          {/* Capa empilhada: dá pra ver de relance que é uma sequência de 3, não
              uma arte só — sem precisar abrir a linha. */}
          <div className="relative w-8 h-10 flex-shrink-0">
            {files.length > 1 && (
              <div className="absolute -right-[3px] -top-[3px] w-full h-full rounded-md bg-[var(--color-bg-alt)] border border-[var(--color-border)]" />
            )}
            <div className="relative w-full h-full rounded-md overflow-hidden bg-[var(--color-bg-alt)] flex items-center justify-center">
              {files[0]
                ? <>
                    <img src={`/api/drive-thumb?id=${files[0].id}&sz=w120`} alt="" className="w-full h-full object-cover" />
                    {files[0].isVideo && <Play size={11} fill="#fff" color="#fff" className="absolute" />}
                  </>
                : <ImageOff size={13} className="text-[var(--color-text-faint)]" />}
            </div>
            {files.length > 1 && (
              <span className="absolute -bottom-1 -left-1 text-[9px] font-bold px-1 rounded bg-[var(--color-text-primary)] text-[var(--color-bg-card)]">
                {files.length}
              </span>
            )}
          </div>

          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5">
              <span className={`text-[13px] font-semibold truncate ${done ? 'text-[var(--color-text-muted)] line-through' : 'text-[var(--color-text-primary)]'}`}>
                {rec.title}
              </span>
              <span className="text-[9px] font-bold uppercase px-1.5 py-0.5 rounded flex-shrink-0"
                style={{ background: `${TYPE_COLOR[rec.type]}1a`, color: TYPE_COLOR[rec.type] }}>
                {TYPE_LABEL[rec.type]}
              </span>
            </div>
            <div className="flex items-center gap-1.5 text-[11px] mt-0.5 flex-wrap">
              {slot && (
                <span className={`flex items-center gap-0.5 font-medium ${late ? 'text-[var(--ds-error-text)]' : 'text-[var(--color-text-muted)]'}`}>
                  <Clock size={10} />{late && !done ? `atrasado · ${slot}` : `até ${slot}`}
                </span>
              )}
              {files.length > 1 && (
                <span className="flex items-center gap-0.5 text-[var(--color-text-muted)]">
                  <Layers size={10} />sequência de {files.length}
                </span>
              )}
              {missingWeekday && (
                <span className="font-semibold text-[var(--ds-error-text)]">
                  sem pasta de {WEEKDAY_SHORT[parseISO(iso).getDay()]}
                </span>
              )}
              {done && <span className="text-[var(--ds-success-text)] font-medium">postado{log?.done_by ? ` · ${log.done_by}` : ''}</span>}
              {!done && !slot && !missingWeekday && files.length <= 1 && <span className="text-[var(--color-text-faint)]">sem hora marcada</span>}
            </div>
          </div>

          <ChevronDown size={15} className="flex-shrink-0 text-[var(--color-text-faint)] transition-transform" style={{ transform: open ? 'rotate(180deg)' : 'none' }} />
        </button>
      </div>

      {open && (
        <div className="px-3 md:px-4 pb-3 pl-[42px] md:pl-[50px] flex flex-col gap-2.5">

          {caption
            ? <p className="text-xs text-[var(--color-text-secondary)] whitespace-pre-wrap leading-relaxed bg-[var(--color-bg-subtle)] rounded-lg px-3 py-2">{caption}</p>
            : <p className="text-xs text-[var(--color-text-faint)] italic">Sem legenda cadastrada.</p>}

          {rec.notes && <p className="text-[11px] text-[var(--color-text-muted)]">📌 {rec.notes}</p>}

          {missingWeekday && (
            <p className="text-[11px] font-medium px-2.5 py-1.5 rounded-lg" style={{ background: 'var(--ds-error-bg)', color: 'var(--ds-error-text)' }}>
              A pasta tem {sequences.map(s => s.name).join(', ')} — nenhuma pra {WEEKDAY_SHORT[parseISO(iso).getDay()]}.
            </p>
          )}

          {/* A sequência do dia, na ordem em que sai. Numerada porque a ordem
              importa: story 1 chama o 2. */}
          {files.length > 0 && (
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-[10px] font-bold uppercase tracking-wide text-[var(--color-text-faint)]">
                  {mode === 'weekday'
                    ? `pasta ${current?.name} · ${files.length} arte${files.length === 1 ? '' : 's'}`
                    : `${files.length} arte${files.length === 1 ? '' : 's'} · ${target ? lastUsedLabel(target, logs) : ''}`}
                </span>
                {mode === 'rotation' && sequences.length > 1 && !done && (
                  <button onClick={shuffle} className="flex items-center gap-1 text-[11px] font-semibold text-[var(--color-accent)] hover:underline">
                    <Shuffle size={11} />trocar
                  </button>
                )}
              </div>
              <div className="flex gap-1.5 overflow-x-auto pb-1">
                {files.map((f, i) => (
                  <a key={f.id} href={`https://drive.google.com/file/d/${f.id}/view`} target="_blank" rel="noopener noreferrer"
                    className="relative w-[54px] aspect-[4/5] flex-shrink-0 rounded-lg overflow-hidden bg-[var(--color-bg-alt)]">
                    <img src={`/api/drive-thumb?id=${f.id}&sz=w160`} alt="" className="w-full h-full object-cover" />
                    {f.isVideo && <Play size={12} fill="#fff" color="#fff" className="absolute inset-0 m-auto" />}
                    {files.length > 1 && (
                      <span className="absolute top-0.5 left-0.5 text-[9px] font-bold w-4 h-4 rounded flex items-center justify-center bg-black/60 text-white">{i + 1}</span>
                    )}
                  </a>
                ))}
              </div>
            </div>
          )}

          {/* Na rotação, as outras opções ficam à mão. Por dia da semana não:
              trocar a segunda pela quinta não é escolha, é engano. */}
          {mode === 'rotation' && sequences.length > 1 && (
            <div className="flex flex-wrap gap-1">
              {sequences.map(s => (
                <button key={s.id} onClick={() => !done && setOverride(s.id)} title={lastUsedLabel(s.id, logs)}
                  className={`text-[10px] font-semibold px-2 py-1 rounded-md border transition-colors ${
                    s.id === target
                      ? 'border-[var(--color-accent)] text-[var(--color-accent)] bg-[var(--color-accent)]/8'
                      : 'border-[var(--color-border)] text-[var(--color-text-muted)] hover:bg-[var(--color-bg-subtle)]'
                  }`}>
                  {s.name}
                </button>
              ))}
            </div>
          )}

          <div className="flex flex-wrap gap-1.5">
            <button onClick={copyCaption} className="flex items-center gap-1.5 text-[11px] font-semibold px-2.5 py-1.5 rounded-lg border border-[var(--color-border)] text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-subtle)]">
              <Copy size={12} />Legenda
            </button>
            <button onClick={downloadAll} disabled={!files.length || downloading}
              className="flex items-center gap-1.5 text-[11px] font-semibold px-2.5 py-1.5 rounded-lg border border-[var(--color-border)] text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-subtle)] disabled:opacity-40">
              <Download size={12} />{downloading ? 'Baixando…' : files.length > 1 ? `Baixar as ${files.length}` : 'Baixar'}
            </button>
            {(current?.folderUrl || rec.drive_folder_url) && (
              <a href={current?.folderUrl || rec.drive_folder_url!} target="_blank" rel="noopener noreferrer"
                className="flex items-center gap-1.5 text-[11px] font-semibold px-2.5 py-1.5 rounded-lg border border-[var(--color-border)] text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-subtle)]">
                <FolderOpen size={12} />{current?.folderUrl ? `Pasta ${current.name}` : 'Pasta'}
              </a>
            )}
            <button onClick={() => onEdit(rec)} className="flex items-center gap-1.5 text-[11px] font-semibold px-2.5 py-1.5 rounded-lg border border-[var(--color-border)] text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-subtle)] ml-auto">
              <Pencil size={12} />Editar
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
