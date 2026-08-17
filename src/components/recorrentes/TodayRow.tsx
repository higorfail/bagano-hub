'use client'

import { useMemo, useState } from 'react'
import { useToast } from '@/lib/ToastContext'
import { copyTextAsync } from '@/lib/clipboard'
import { downloadDriveContent } from '@/lib/socialItems'
import { useDriveFolder } from '@/lib/useDriveFolder'
import {
  Recurring, RecurringLog, TYPE_LABEL,
  pickVariant, lastUsedLabel, isLate,
} from '@/lib/recurrings'
import {
  Check, ChevronDown, Copy, Download, FolderOpen, Play,
  Pencil, Clock, Shuffle, ImageOff,
} from 'lucide-react'

type Props = {
  rec: Recurring
  slot: string
  iso: string
  /** A marcação deste compromisso, se já foi feito. */
  log: RecurringLog | null
  /** Todo o histórico DESTE recorrente — é o que decide a rotação das artes. */
  logs: RecurringLog[]
  captions: Record<string, string>
  busy: boolean
  onToggle: (rec: Recurring, slot: string, fileId: string | null, done: boolean) => void
  onEdit: (rec: Recurring) => void
}

const TYPE_COLOR: Record<string, string> = { story: '#8b5cf6', post: '#f59e0b' }

export default function TodayRow({ rec, slot, iso, log, logs, captions, busy, onToggle, onEdit }: Props) {
  const { toast } = useToast()
  const [open, setOpen] = useState(false)
  const [override, setOverride] = useState<string | null>(null)
  const { files } = useDriveFolder(rec.drive_folder_url)

  const done = !!log
  const late = !done && isLate(iso, slot)

  // Depois de marcado, a arte mostrada é a que FOI usada — não a sugestão de
  // agora. Sem isso a linha trocava de imagem sozinha assim que o log entrava,
  // e ninguém conseguia conferir o que tinha acabado de postar.
  const suggested = useMemo(() => pickVariant(files.map(f => f.id), logs), [files, logs])
  const currentId = log?.drive_file_id || override || suggested
  const current = files.find(f => f.id === currentId) || null
  const caption = (currentId && captions[currentId]) || rec.caption || ''

  async function copyCaption() {
    if (!caption) { toast('Este recorrente não tem legenda cadastrada.', 'error'); return }
    const ok = await copyTextAsync(async () => caption)
    toast(ok ? 'Legenda copiada' : 'Não consegui copiar', ok ? 'success' : 'error')
  }

  async function download() {
    if (!currentId) { toast('Nenhuma arte pra baixar.', 'error'); return }
    const r = await downloadDriveContent(`https://drive.google.com/file/d/${currentId}/view`)
    if (!r.ok) toast(r.message, 'error')
  }

  function shuffle() {
    if (files.length < 2) return
    const i = files.findIndex(f => f.id === currentId)
    setOverride(files[(i + 1) % files.length].id)
  }

  return (
    <div className={`border-b border-[var(--color-border)] last:border-b-0 transition-colors ${late ? 'bg-[var(--ds-error-bg)]' : ''}`}>

      {/* Linha compacta — é o que a social media varre de manhã. Tudo que não
          for decidir "já postei isso?" fica escondido atrás da seta. */}
      <div className="flex items-center gap-2.5 px-3 md:px-4 py-2">
        <button
          onClick={() => onToggle(rec, slot, currentId, done)}
          disabled={busy}
          title={done ? 'Desmarcar' : 'Marcar como postado'}
          className={`w-5 h-5 flex-shrink-0 rounded-md border-2 flex items-center justify-center transition-colors disabled:opacity-40 ${
            done ? 'bg-[var(--ds-success-accent)] border-[var(--ds-success-accent)]' : 'border-[var(--color-border-strong)] hover:border-[var(--ds-success-accent)]'
          }`}>
          {done && <Check size={13} color="#fff" strokeWidth={3} />}
        </button>

        <button onClick={() => setOpen(o => !o)} className="flex items-center gap-2.5 flex-1 min-w-0 text-left">
          <div className="relative w-8 h-10 flex-shrink-0 rounded-md overflow-hidden bg-[var(--color-bg-alt)] flex items-center justify-center">
            {current
              ? <>
                  <img src={`/api/drive-thumb?id=${current.id}&sz=w120`} alt="" className="w-full h-full object-cover" />
                  {current.isVideo && <Play size={11} fill="#fff" color="#fff" className="absolute" />}
                </>
              : <ImageOff size={13} className="text-[var(--color-text-faint)]" />}
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
            <div className="flex items-center gap-1.5 text-[11px] mt-0.5">
              {slot && (
                <span className={`flex items-center gap-0.5 font-medium ${late ? 'text-[var(--ds-error-text)]' : 'text-[var(--color-text-muted)]'}`}>
                  <Clock size={10} />{late && !done ? `atrasado · ${slot}` : `até ${slot}`}
                </span>
              )}
              {done && <span className="text-[var(--ds-success-text)] font-medium">postado{log?.done_by ? ` · ${log.done_by}` : ''}</span>}
              {!done && !slot && <span className="text-[var(--color-text-faint)]">sem hora marcada</span>}
            </div>
          </div>

          <ChevronDown size={15} className="flex-shrink-0 text-[var(--color-text-faint)] transition-transform" style={{ transform: open ? 'rotate(180deg)' : 'none' }} />
        </button>
      </div>

      {/* Expandido inline, não modal: abrir uma janela por item quebra o ritmo
          de quem está resolvendo cinco postagens seguidas. */}
      {open && (
        <div className="px-3 md:px-4 pb-3 pl-[42px] md:pl-[50px] flex flex-col gap-2.5">

          {caption
            ? <p className="text-xs text-[var(--color-text-secondary)] whitespace-pre-wrap leading-relaxed bg-[var(--color-bg-subtle)] rounded-lg px-3 py-2">{caption}</p>
            : <p className="text-xs text-[var(--color-text-faint)] italic">Sem legenda cadastrada.</p>}

          {rec.notes && <p className="text-[11px] text-[var(--color-text-muted)]">📌 {rec.notes}</p>}

          {files.length > 0 && (
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-[10px] font-bold uppercase tracking-wide text-[var(--color-text-faint)]">
                  {files.length} arte{files.length === 1 ? '' : 's'} · sugerida: {currentId ? lastUsedLabel(currentId, logs) : '—'}
                </span>
                {files.length > 1 && !done && (
                  <button onClick={shuffle} className="flex items-center gap-1 text-[11px] font-semibold text-[var(--color-accent)] hover:underline">
                    <Shuffle size={11} />trocar
                  </button>
                )}
              </div>
              {/* Rolagem horizontal: a pasta pode ter 20 artes e a lista não
                  pode empurrar as outras postagens do dia pra fora da tela. */}
              <div className="flex gap-1.5 overflow-x-auto pb-1">
                {files.map(f => {
                  const isCurrent = f.id === currentId
                  return (
                    <button key={f.id} onClick={() => !done && setOverride(f.id)} title={lastUsedLabel(f.id, logs)}
                      className={`relative w-[54px] aspect-[4/5] flex-shrink-0 rounded-lg overflow-hidden bg-[var(--color-bg-alt)] transition-all ${
                        isCurrent ? 'ring-2 ring-[var(--color-accent)] ring-offset-1 ring-offset-[var(--color-bg-card)]' : 'opacity-60 hover:opacity-100'
                      }`}>
                      <img src={`/api/drive-thumb?id=${f.id}&sz=w160`} alt="" className="w-full h-full object-cover" />
                      {f.isVideo && <Play size={12} fill="#fff" color="#fff" className="absolute inset-0 m-auto" />}
                    </button>
                  )
                })}
              </div>
            </div>
          )}

          <div className="flex flex-wrap gap-1.5">
            <button onClick={copyCaption} className="flex items-center gap-1.5 text-[11px] font-semibold px-2.5 py-1.5 rounded-lg border border-[var(--color-border)] text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-subtle)]">
              <Copy size={12} />Legenda
            </button>
            <button onClick={download} disabled={!currentId} className="flex items-center gap-1.5 text-[11px] font-semibold px-2.5 py-1.5 rounded-lg border border-[var(--color-border)] text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-subtle)] disabled:opacity-40">
              <Download size={12} />Baixar
            </button>
            {rec.drive_folder_url && (
              <a href={rec.drive_folder_url} target="_blank" rel="noopener noreferrer"
                className="flex items-center gap-1.5 text-[11px] font-semibold px-2.5 py-1.5 rounded-lg border border-[var(--color-border)] text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-subtle)]">
                <FolderOpen size={12} />Pasta
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
