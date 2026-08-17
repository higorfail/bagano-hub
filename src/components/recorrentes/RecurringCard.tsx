'use client'

import { useDriveFolder } from '@/lib/useDriveFolder'
import {
  Recurring, RecurringLog, TYPE_LABEL,
  recurrenceLabel, timesLabel, occursOn, slotsFor, shiftISO, todayISO, WEEKDAY_LETTER, parseISO,
} from '@/lib/recurrings'
import { Camera, Image as ImageIcon, Clock, Layers, Pencil, PauseCircle, ImageOff } from 'lucide-react'

type Props = {
  rec: Recurring
  logs: RecurringLog[]
  onEdit: (rec: Recurring) => void
}

const TYPE_COLOR: Record<string, string> = { story: '#8b5cf6', post: '#f59e0b' }
const TYPE_ICON: Record<string, React.ElementType> = { story: Camera, post: ImageIcon }

/** Últimos 14 dias em que o recorrente DEVIA sair. Dia que ele não pedia
 *  postagem não vira bolinha — senão a fileira ficaria cheia de buraco falso
 *  pra qualquer recorrente que não é diário. */
function history(rec: Recurring, logs: RecurringLog[]) {
  const today = todayISO()
  const out: { iso: string; done: boolean; partial: boolean }[] = []
  for (let i = 13; i >= 0; i--) {
    const iso = shiftISO(today, -i)
    if (!occursOn(rec, iso)) continue
    const slots = slotsFor(rec, iso)
    const doneCount = slots.filter(s => logs.some(l => l.done_date === iso && l.slot === s)).length
    out.push({ iso, done: doneCount === slots.length, partial: doneCount > 0 && doneCount < slots.length })
  }
  return out
}

export default function RecurringCard({ rec, logs, onEdit }: Props) {
  const { files } = useDriveFolder(rec.drive_folder_url)
  const Icon = TYPE_ICON[rec.type]
  const times = timesLabel(rec)
  const days = history(rec, logs)

  return (
    <button
      onClick={() => onEdit(rec)}
      className={`text-left bg-[var(--color-bg-card)] border border-[var(--color-border)] rounded-xl p-3 flex gap-3 hover:border-[var(--color-border-hover)] transition-colors group ${rec.active ? '' : 'opacity-60'}`}>

      <div className="relative w-[60px] aspect-[4/5] flex-shrink-0 rounded-lg overflow-hidden bg-[var(--color-bg-alt)] flex items-center justify-center">
        {files[0]
          ? <img src={`/api/drive-thumb?id=${files[0].id}&sz=w200`} alt="" className="w-full h-full object-cover" />
          : <ImageOff size={16} className="text-[var(--color-text-faint)]" />}
      </div>

      <div className="min-w-0 flex-1 flex flex-col gap-1.5">
        <div className="flex items-start gap-1.5">
          <span className="text-[13px] font-semibold text-[var(--color-text-primary)] leading-tight flex-1 min-w-0">{rec.title}</span>
          <Pencil size={12} className="flex-shrink-0 mt-0.5 text-[var(--color-text-faint)] opacity-0 group-hover:opacity-100 transition-opacity" />
        </div>

        <div className="flex flex-wrap items-center gap-1">
          <span className="flex items-center gap-1 text-[9px] font-bold uppercase px-1.5 py-0.5 rounded"
            style={{ background: `${TYPE_COLOR[rec.type]}1a`, color: TYPE_COLOR[rec.type] }}>
            <Icon size={9} />{TYPE_LABEL[rec.type]}
          </span>
          {!rec.active && (
            <span className="flex items-center gap-1 text-[9px] font-bold uppercase px-1.5 py-0.5 rounded"
              style={{ background: 'var(--ds-warn-bg)', color: 'var(--ds-warn-text)' }}>
              <PauseCircle size={9} />Pausado
            </span>
          )}
        </div>

        <div className="text-[11px] text-[var(--color-text-muted)] flex flex-wrap items-center gap-x-2 gap-y-0.5">
          <span>{recurrenceLabel(rec)}</span>
          {times && <span className="flex items-center gap-0.5"><Clock size={10} />{times}</span>}
          <span className="flex items-center gap-0.5"><Layers size={10} />{files.length} arte{files.length === 1 ? '' : 's'}</span>
        </div>

        {days.length > 0 && (
          <div className="flex items-center gap-[3px]" title="Últimos 14 dias em que este recorrente pedia postagem">
            {days.map(d => (
              <span key={d.iso}
                title={`${WEEKDAY_LETTER[parseISO(d.iso).getDay()]} ${d.iso.slice(8)} — ${d.done ? 'postado' : d.partial ? 'parcial' : 'não postado'}`}
                className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                style={{ background: d.done ? 'var(--ds-success-accent)' : d.partial ? 'var(--ds-warn-accent)' : 'var(--color-border-strong)' }} />
            ))}
          </div>
        )}
      </div>
    </button>
  )
}
