'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import { useToast } from '@/lib/ToastContext'
import { useUser } from '@/lib/UserContext'
import { logActivity } from '@/lib/activity'
import { dbError } from '@/lib/dbError'
import ModalPortal from '@/components/ModalPortal'
import { useDriveSequences, invalidateDriveFolder } from '@/lib/useDriveFolder'
import {
  Recurring, RecurringVariant, RecurrenceMode, RecurringType,
  TYPE_LABEL, WEEKDAY_LETTER, WEEKDAY_SHORT, WEEKDAY_FULL, ORDINAL_LABEL,
  humanDate, todayISO, isOrdinalWeekday, parseISO, shiftISO,
} from '@/lib/recurrings'
import { Camera, Image as ImageIcon, Plus, X, Trash2, Play, FolderOpen, CalendarDays, Shuffle, Layers } from 'lucide-react'

type Client = { id: string; name: string; color_hex: string }

type Props = {
  editing?: Recurring | null
  fixedClientId?: string | null
  clients: Client[]
  onClose: () => void
  onSaved: () => void
  onDeleted?: (id: string) => void
}

const MODE_OPTIONS: { value: RecurrenceMode; label: string; wide?: boolean }[] = [
  { value: 'daily',     label: 'Todo dia' },
  { value: 'weekdays',  label: 'Dias da semana' },
  { value: 'monthdays', label: 'Dia do mês' },
  { value: 'ordinal',   label: 'Ordem no mês' },
  { value: 'dates',     label: 'Datas específicas', wide: true },
]

const ORDINAL_WEEKS = [1, 2, 3, 4, -1]

const TYPE_OPTIONS: { value: RecurringType; icon: React.ElementType; color: string }[] = [
  { value: 'story', icon: Camera,    color: '#8b5cf6' },
  { value: 'post',  icon: ImageIcon, color: '#f59e0b' },
]

const inputCls = 'w-full border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm text-[var(--color-text-primary)] bg-[var(--color-bg-card)] outline-none focus:border-[var(--color-brand)]'
const labelCls = 'text-xs text-[var(--color-text-muted)] mb-1 block'

export default function RecurringFormModal({ editing, fixedClientId, clients, onClose, onSaved, onDeleted }: Props) {
  const { toast } = useToast()
  const { currentMember } = useUser()
  const [saving, setSaving] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)

  const [clientId, setClientId]   = useState(editing?.client_id || fixedClientId || '')
  const [title, setTitle]         = useState(editing?.title || '')
  const [type, setType]           = useState<RecurringType>(editing?.type || 'story')
  const [mode, setMode]           = useState<RecurrenceMode>(editing?.recurrence_mode || 'daily')
  const [weekdays, setWeekdays]   = useState<number[]>(editing?.weekdays || [1, 2, 3, 4, 5])
  const [monthDays, setMonthDays] = useState<number[]>(editing?.month_days || [])
  const [ordWeek, setOrdWeek]     = useState<number>(editing?.ordinal_week ?? -1)
  const [ordDay, setOrdDay]       = useState<number>(editing?.ordinal_weekday ?? 0)
  const [dates, setDates]         = useState<string[]>(editing?.specific_dates || [])
  const [newDate, setNewDate]     = useState('')
  const [times, setTimes]         = useState<string[]>(editing?.times || [])
  const [folderUrl, setFolderUrl] = useState(editing?.drive_folder_url || '')
  const [caption, setCaption]     = useState(editing?.caption || '')
  const [notes, setNotes]         = useState(editing?.notes || '')
  const [active, setActive]       = useState(editing?.active ?? true)

  // Legenda por sequência. Carrega o que já existe e guarda em memória enquanto
  // o modal está aberto — só grava no salvar, junto com o resto.
  const [variants, setVariants] = useState<Record<string, string>>({})
  // 'all': é aqui que a pessoa cadastra a legenda de cada dia, então precisa
  // ver o conteúdo de todas as subpastas, não só a de hoje.
  const { mode: seqMode, sequences, ignored, loading: filesLoading, folderId } = useDriveSequences(folderUrl, { expand: 'all' })

  // Dia que a recorrência cobra mas a pasta não tem — o buraco que só aparece
  // no dia em que a social media abre e não acha arte nenhuma.
  const missingDays = (() => {
    if (seqMode !== 'weekday') return []
    const covered = new Set(sequences.map(s => s.weekday))
    const needed =
      mode === 'weekdays' ? weekdays :
      mode === 'daily'    ? [0, 1, 2, 3, 4, 5, 6] :
      mode === 'ordinal'  ? [ordDay] : []
    return needed.filter(d => !covered.has(d))
  })()

  useEffect(() => {
    if (!editing) return
    createClient()
      .from('recurring_variants')
      .select('drive_file_id, caption')
      .eq('recurring_id', editing.id)
      .then(({ data }) => {
        const map: Record<string, string> = {}
        ;(data as RecurringVariant[] | null)?.forEach(v => { map[v.drive_file_id] = v.caption || '' })
        setVariants(map)
      })
  }, [editing?.id])

  function toggle(list: number[], value: number, set: (v: number[]) => void) {
    set(list.includes(value) ? list.filter(v => v !== value) : [...list, value].sort((a, b) => a - b))
  }

  // O que a recorrência exige pra fazer sentido. Sem isso dá pra salvar um
  // "dias da semana" com nenhum dia marcado — o recorrente some da tela e
  // ninguém entende por quê.
  function validationError(): string | null {
    if (!clientId) return 'Escolha o cliente.'
    if (!title.trim()) return 'Dê um nome ao recorrente.'
    if (mode === 'weekdays'  && !weekdays.length)  return 'Marque pelo menos um dia da semana.'
    if (mode === 'monthdays' && !monthDays.length) return 'Marque pelo menos um dia do mês.'
    if (mode === 'dates'     && !dates.length)     return 'Adicione pelo menos uma data.'
    return null
  }

  async function save() {
    const invalid = validationError()
    if (invalid) { toast(invalid, 'error'); return }
    setSaving(true)
    const supabase = createClient()

    const payload = {
      client_id: clientId,
      title: title.trim(),
      type,
      recurrence_mode: mode,
      // Só o campo do modo escolhido vai preenchido: guardar os outros faria a
      // tela de "Todos" descrever uma regra que não está valendo.
      weekdays:        mode === 'weekdays'  ? weekdays  : [],
      month_days:      mode === 'monthdays' ? monthDays : [],
      specific_dates:  mode === 'dates'     ? dates     : [],
      ordinal_week:    mode === 'ordinal'   ? ordWeek   : null,
      ordinal_weekday: mode === 'ordinal'   ? ordDay    : null,
      times: times.filter(Boolean).sort(),
      drive_folder_url: folderUrl.trim() || null,
      caption: caption.trim() || null,
      notes: notes.trim() || null,
      active,
    }

    let recId = editing?.id
    if (editing) {
      const { error } = await supabase.from('recurrings').update(payload).eq('id', editing.id)
      if (dbError(error, toast, 'salvar recorrente')) { setSaving(false); return }
    } else {
      const { data, error } = await supabase.from('recurrings').insert(payload).select('id').single()
      if (dbError(error, toast, 'criar recorrente')) { setSaving(false); return }
      recId = data!.id
    }

    // Legendas das artes: só as preenchidas viram linha. upsert pela chave
    // (recorrente, arquivo) — reeditar a mesma arte atualiza em vez de duplicar.
    const filled = Object.entries(variants).filter(([, c]) => c.trim())
    if (recId && filled.length) {
      const { error } = await supabase.from('recurring_variants').upsert(
        filled.map(([drive_file_id, c]) => ({ recurring_id: recId, drive_file_id, caption: c.trim() })),
        { onConflict: 'recurring_id,drive_file_id' },
      )
      if (error) console.error('[recorrentes] legendas não gravaram:', error)
    }
    // Legenda apagada some da tabela — senão o texto antigo continuaria sendo
    // sugerido mesmo depois de a pessoa limpar o campo.
    const cleared = Object.entries(variants).filter(([, c]) => !c.trim()).map(([id]) => id)
    if (recId && cleared.length) {
      await supabase.from('recurring_variants').delete().eq('recurring_id', recId).in('drive_file_id', cleared)
    }

    if (recId) {
      logActivity({
        tableName: 'recurrings', recordId: recId, clientId,
        action: editing ? 'updated' : 'created',
        actorName: currentMember?.name, actorId: currentMember?.id,
        description: `${editing ? 'Editou' : 'Criou'} o recorrente "${title.trim()}"`,
      })
    }

    invalidateDriveFolder(folderUrl)
    setSaving(false)
    toast(editing ? 'Recorrente salvo' : 'Recorrente criado')
    onSaved()
    onClose()
  }

  async function remove() {
    if (!editing) return
    setSaving(true)
    // Sem lixeira: recorrente é configuração de rotina, não conteúdo. O que se
    // perderia é a regra — e quem só quer parar por um tempo usa "pausado".
    const { error } = await createClient().from('recurrings').delete().eq('id', editing.id)
    if (dbError(error, toast, 'excluir recorrente')) { setSaving(false); return }
    logActivity({
      tableName: 'recurrings', recordId: editing.id, clientId: editing.client_id,
      action: 'deleted', actorName: currentMember?.name, actorId: currentMember?.id,
      description: `Excluiu o recorrente "${editing.title}"`,
    })
    toast('Recorrente excluído')
    onDeleted?.(editing.id)
    onClose()
  }

  return (
    <ModalPortal>
      <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-[70] p-4" onClick={e => { if (e.target === e.currentTarget) onClose() }}>
        <div className="bg-[var(--color-bg-card)] rounded-2xl w-full max-w-lg flex flex-col max-h-[92vh] shadow-pop">

          <div className="p-5 border-b border-[var(--color-border)] flex items-center justify-between">
            <h2 className="text-sm font-semibold text-[var(--color-text-primary)]">{editing ? 'Editar recorrente' : 'Novo recorrente'}</h2>
            <button onClick={onClose} className="text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]"><X size={18} /></button>
          </div>

          <div className="flex-1 overflow-y-auto p-5 flex flex-col gap-4">

            <div>
              <label className={labelCls}>Nome *</label>
              <input value={title} onChange={e => setTitle(e.target.value)} placeholder="Ex: Aberto hoje · Almoço executivo" className={inputCls} />
            </div>

            <div className="grid grid-cols-2 gap-3">
              {!fixedClientId && (
                <div>
                  <label className={labelCls}>Cliente *</label>
                  <select value={clientId} onChange={e => setClientId(e.target.value)} className={inputCls}>
                    <option value="">Selecione…</option>
                    {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>
              )}
              <div>
                <label className={labelCls}>Tipo</label>
                <div className="flex gap-2">
                  {TYPE_OPTIONS.map(opt => (
                    <button key={opt.value} type="button" onClick={() => setType(opt.value)}
                      className="flex-1 flex items-center justify-center gap-1.5 text-xs font-semibold py-2 rounded-lg border transition-colors"
                      style={type === opt.value
                        ? { background: opt.color, borderColor: opt.color, color: '#fff' }
                        : { borderColor: 'var(--color-border)', color: 'var(--color-text-secondary)' }}>
                      <opt.icon size={13} />{TYPE_LABEL[opt.value]}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* ── Recorrência ───────────────────────────────────────────── */}
            <div>
              <label className={labelCls}>Quando repete</label>
              <div className="grid grid-cols-2 gap-1 bg-[var(--color-bg-subtle)] rounded-lg p-1 mb-2.5">
                {MODE_OPTIONS.map(opt => (
                  <button key={opt.value} type="button" onClick={() => setMode(opt.value)}
                    className={`text-[11px] font-semibold px-2 py-1.5 rounded-md transition-colors ${opt.wide ? 'col-span-2' : ''} ${
                      mode === opt.value ? 'bg-[var(--color-bg-card)] text-[var(--color-text-primary)] shadow-sm' : 'text-[var(--color-text-muted)]'
                    }`}>
                    {opt.label}
                  </button>
                ))}
              </div>

              {mode === 'daily' && (
                <p className="text-xs text-[var(--color-text-muted)]">Aparece na lista de hoje todos os dias, inclusive fim de semana.</p>
              )}

              {mode === 'weekdays' && (
                <div className="flex gap-1.5">
                  {WEEKDAY_LETTER.map((letter, i) => (
                    <button key={i} type="button" onClick={() => toggle(weekdays, i, setWeekdays)}
                      title={WEEKDAY_SHORT[i]}
                      className={`flex-1 h-9 text-xs font-bold rounded-lg border transition-colors ${
                        weekdays.includes(i)
                          ? 'bg-[var(--color-accent)] border-[var(--color-accent)] text-white'
                          : 'border-[var(--color-border)] text-[var(--color-text-muted)] hover:bg-[var(--color-bg-subtle)]'
                      }`}>
                      {letter}
                    </button>
                  ))}
                </div>
              )}

              {mode === 'monthdays' && (
                <div className="grid grid-cols-7 gap-1">
                  {Array.from({ length: 31 }, (_, i) => i + 1).map(d => (
                    <button key={d} type="button" onClick={() => toggle(monthDays, d, setMonthDays)}
                      className={`h-8 text-[11px] font-semibold rounded-md border transition-colors ${
                        monthDays.includes(d)
                          ? 'bg-[var(--color-accent)] border-[var(--color-accent)] text-white'
                          : 'border-[var(--color-border)] text-[var(--color-text-muted)] hover:bg-[var(--color-bg-subtle)]'
                      }`}>
                      {d}
                    </button>
                  ))}
                  {monthDays.some(d => d > 28) && (
                    <p className="col-span-7 text-[11px] text-[var(--ds-warn-text)] mt-1">
                      Dia 29, 30 ou 31 não existe em todo mês — nesses meses o recorrente simplesmente não aparece.
                    </p>
                  )}
                </div>
              )}

              {mode === 'ordinal' && (
                <div className="flex flex-col gap-2">
                  <div className="grid grid-cols-2 gap-2">
                    <select value={ordWeek} onChange={e => setOrdWeek(Number(e.target.value))} className={inputCls}>
                      {ORDINAL_WEEKS.map(w => <option key={w} value={w}>{ORDINAL_LABEL[w]}</option>)}
                    </select>
                    <select value={ordDay} onChange={e => setOrdDay(Number(e.target.value))} className={inputCls}>
                      {WEEKDAY_FULL.map((d, i) => <option key={i} value={i}>{d}</option>)}
                    </select>
                  </div>
                  {/* Mostra as próximas de verdade: "último domingo" é fácil de
                      errar de cabeça, e ver as três datas confirma na hora. */}
                  <p className="text-[11px] text-[var(--color-text-muted)]">
                    Próximas: {(() => {
                      const out: string[] = []
                      let cur = todayISO()
                      for (let i = 0; i < 400 && out.length < 3; i++) {
                        if (isOrdinalWeekday(parseISO(cur), ordWeek, ordDay)) out.push(humanDate(cur))
                        cur = shiftISO(cur, 1)
                      }
                      return out.join(' · ')
                    })()}
                  </p>
                  {ordWeek === -1 && (
                    <p className="text-[11px] text-[var(--color-text-faint)]">
                      “Último” não é o mesmo que “quarto”: mês com cinco {WEEKDAY_FULL[ordDay]}s tem um quarto que não é o último.
                    </p>
                  )}
                </div>
              )}

              {mode === 'dates' && (
                <div className="flex flex-col gap-2">
                  <div className="flex gap-2">
                    <input type="date" value={newDate} onChange={e => setNewDate(e.target.value)} className={inputCls} />
                    <button type="button" disabled={!newDate || dates.includes(newDate)}
                      onClick={() => { setDates([...dates, newDate].sort()); setNewDate('') }}
                      className="px-3 rounded-lg bg-[var(--color-brand)] text-[var(--color-brand-fg)] text-sm font-semibold disabled:opacity-40 flex-shrink-0">
                      <Plus size={16} />
                    </button>
                  </div>
                  {dates.length > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                      {dates.map(d => (
                        <span key={d} className={`flex items-center gap-1 text-[11px] font-medium px-2 py-1 rounded-md ${d < todayISO() ? 'opacity-50' : ''}`}
                          style={{ background: 'var(--color-bg-subtle)', color: 'var(--color-text-secondary)' }}>
                          {humanDate(d)}
                          <button type="button" onClick={() => setDates(dates.filter(x => x !== d))} className="hover:text-[var(--ds-error-text)]"><X size={11} /></button>
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* ── Horários ──────────────────────────────────────────────── */}
            <div>
              <label className={labelCls}>Horários do dia</label>
              <div className="flex flex-wrap gap-2 items-center">
                {times.map((t, i) => (
                  <div key={i} className="flex items-center gap-1 border border-[var(--color-border)] rounded-lg pl-2 pr-1 py-1">
                    <input type="time" value={t}
                      onChange={e => setTimes(times.map((x, j) => j === i ? e.target.value : x))}
                      className="text-sm bg-transparent text-[var(--color-text-primary)] outline-none" />
                    <button type="button" onClick={() => setTimes(times.filter((_, j) => j !== i))}
                      className="text-[var(--color-text-faint)] hover:text-[var(--ds-error-text)]"><X size={13} /></button>
                  </div>
                ))}
                <button type="button" onClick={() => setTimes([...times, '10:00'])}
                  className="flex items-center gap-1 text-xs font-semibold px-2.5 py-2 rounded-lg border border-dashed border-[var(--color-border-strong)] text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-subtle)]">
                  <Plus size={13} />Horário
                </button>
              </div>
              <p className="text-[11px] text-[var(--color-text-faint)] mt-1.5">
                {times.length > 1
                  ? `${times.length} compromissos separados por dia — marcar um não dá o outro por feito.`
                  : 'Sem horário, ele aparece o dia todo e só atrasa quando o dia vira.'}
              </p>
            </div>

            {/* ── Pasta do Drive + legendas por arte ────────────────────── */}
            <div>
              <label className={labelCls}>Pasta do Drive com as artes</label>
              <input value={folderUrl} onChange={e => setFolderUrl(e.target.value)}
                placeholder="https://drive.google.com/drive/folders/…" className={inputCls} />
              <p className="text-[11px] text-[var(--color-text-faint)] mt-1.5">
                Aponte pra pasta de cima. Subpasta com nome de dia (ter, qua, qui…) vira a sequência daquele dia;
                sem subpasta, cada arquivo é uma opção e o hub roda entre elas.
              </p>

              {folderUrl && !folderId && (
                <p className="text-[11px] text-[var(--ds-error-text)] mt-1.5">Esse link não parece uma pasta do Drive.</p>
              )}
              {filesLoading && <p className="text-[11px] text-[var(--color-text-muted)] mt-2">Lendo a pasta…</p>}
              {folderId && !filesLoading && sequences.length === 0 && (
                <p className="text-[11px] text-[var(--ds-warn-text)] mt-2">
                  Nada encontrado. Confira se a pasta está compartilhada como “qualquer pessoa com o link”.
                </p>
              )}

              {sequences.length > 0 && (
                <div className="mt-3">
                  <div className="flex items-center justify-between mb-2">
                    <span className="flex items-center gap-1.5 text-xs font-semibold text-[var(--color-text-primary)]">
                      {seqMode === 'weekday'
                        ? <><CalendarDays size={12} />Uma pasta por dia da semana</>
                        : <><Shuffle size={12} />{sequences.length} opç{sequences.length === 1 ? 'ão' : 'ões'} em rotação</>}
                    </span>
                    <a href={folderUrl} target="_blank" rel="noopener noreferrer"
                      className="flex items-center gap-1 text-[11px] text-[var(--color-accent)] hover:underline">
                      <FolderOpen size={12} />abrir
                    </a>
                  </div>

                  {/* Diagnóstico do "por que não está trocando de pasta": em
                      rotação, o nome de cada opção diz na cara se o hub
                      reconheceu os dias ou não. */}
                  {seqMode === 'rotation' && sequences.some(s => s.folderUrl) && (
                    <p className="text-[11px] px-2.5 py-1.5 rounded-lg mb-2"
                      style={{ background: 'var(--ds-info-bg)', color: 'var(--ds-info-text)' }}>
                      Nenhum nome de subpasta foi reconhecido como dia da semana, então elas entram em rotação
                      (uma por dia, na ordem). Pra amarrar cada pasta a um dia, renomeie pra <b>seg</b>, <b>ter</b>,
                      <b> qua</b>… (aceita “Terça-feira”, “3 - Terça”).
                    </p>
                  )}

                  {ignored.length > 0 && (
                    <p className="text-[11px] px-2.5 py-1.5 rounded-lg mb-2"
                      style={{ background: 'var(--color-bg-subtle)', color: 'var(--color-text-muted)' }}>
                      Fora do esquema de dias: {ignored.map(s => s.name).join(', ')} — o hub não usa essas.
                    </p>
                  )}

                  {missingDays.length > 0 && (
                    <p className="text-[11px] font-medium px-2.5 py-1.5 rounded-lg mb-2"
                      style={{ background: 'var(--ds-error-bg)', color: 'var(--ds-error-text)' }}>
                      Sem pasta pra {missingDays.map(d => WEEKDAY_SHORT[d]).join(', ')} — nesses dias a lista de hoje abre sem arte.
                    </p>
                  )}

                  <div className="flex flex-col gap-2.5">
                    {[...sequences]
                      // Por dia da semana, a ordem é a da semana — não a que o
                      // Drive devolveu (alfabética: dom, qua, qui, sáb, seg…).
                      .sort((a, b) => (a.weekday ?? 99) - (b.weekday ?? 99))
                      .map(s => (
                        <div key={s.id} className="flex gap-2.5 items-start">
                          <div className="flex-shrink-0 w-[52px]">
                            <div className="relative w-full aspect-[4/5] rounded-lg overflow-hidden bg-[var(--color-bg-alt)] flex items-center justify-center">
                              {s.files[0]
                                ? <>
                                    <img src={`/api/drive-thumb?id=${s.files[0].id}&sz=w200`} alt="" className="w-full h-full object-cover" />
                                    {s.files[0].isVideo && <Play size={14} fill="#fff" color="#fff" className="absolute" />}
                                  </>
                                : <span className="text-[9px] text-[var(--ds-error-text)] font-bold text-center px-1">vazia</span>}
                            </div>
                            <div className="text-[10px] font-semibold text-[var(--color-text-secondary)] mt-1 truncate text-center" title={s.name}>
                              {s.weekday !== null ? WEEKDAY_SHORT[s.weekday] : s.name}
                            </div>
                            {s.files.length > 1 && (
                              <div className="flex items-center justify-center gap-0.5 text-[9px] text-[var(--color-text-faint)]">
                                <Layers size={8} />{s.files.length}
                              </div>
                            )}
                          </div>
                          <textarea
                            value={variants[s.id] ?? ''}
                            onChange={e => setVariants(v => ({ ...v, [s.id]: e.target.value }))}
                            rows={3}
                            placeholder={`Legenda${s.weekday !== null ? ` de ${WEEKDAY_SHORT[s.weekday]}` : ''}${caption ? ' (vazio = usa a padrão)' : ''}`}
                            className={`${inputCls} resize-none text-xs flex-1`} />
                        </div>
                      ))}
                  </div>
                </div>
              )}
            </div>

            <div>
              <label className={labelCls}>Legenda padrão</label>
              <textarea value={caption} onChange={e => setCaption(e.target.value)} rows={3}
                placeholder="Usada quando a arte do dia não tem legenda própria." className={`${inputCls} resize-none`} />
            </div>

            <div>
              <label className={labelCls}>Observações</label>
              <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2}
                placeholder="Ex: sempre marcar o perfil do chef." className={`${inputCls} resize-none`} />
            </div>

            <button type="button" onClick={() => setActive(a => !a)}
              className="flex items-center justify-between px-3 py-2.5 rounded-lg border border-[var(--color-border)] hover:bg-[var(--color-bg-subtle)] transition-colors">
              <span className="text-left">
                <span className="text-sm font-medium text-[var(--color-text-primary)] block">{active ? 'Ativo' : 'Pausado'}</span>
                <span className="text-[11px] text-[var(--color-text-muted)]">
                  {active ? 'Aparece na lista de hoje' : 'Fica guardado, sem cobrar postagem — o histórico continua aí'}
                </span>
              </span>
              <span className={`w-9 h-5 rounded-full flex-shrink-0 relative transition-colors ${active ? 'bg-[var(--ds-success-accent)]' : 'bg-[var(--color-border-strong)]'}`}>
                <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all ${active ? 'left-[18px]' : 'left-0.5'}`} />
              </span>
            </button>
          </div>

          <div className="p-5 border-t border-[var(--color-border)] flex gap-3 items-center">
            {editing && (
              confirmDelete ? (
                <div className="flex gap-2 items-center mr-auto">
                  <button onClick={remove} disabled={saving} className="text-xs font-semibold px-2.5 py-1.5 rounded-lg text-white" style={{ background: 'var(--ds-error-accent)' }}>Excluir mesmo</button>
                  <button onClick={() => setConfirmDelete(false)} className="text-xs text-[var(--color-text-muted)]">cancelar</button>
                </div>
              ) : (
                <button onClick={() => setConfirmDelete(true)}
                  className="mr-auto flex items-center gap-1.5 text-xs text-[var(--color-text-muted)] hover:text-[var(--ds-error-text)]">
                  <Trash2 size={13} />Excluir
                </button>
              )
            )}
            <button onClick={onClose} className="px-4 py-2 text-sm text-[var(--color-text-secondary)] border border-[var(--color-border)] rounded-lg hover:bg-[var(--color-bg-subtle)]">Cancelar</button>
            <button onClick={save} disabled={saving || !title.trim() || !clientId}
              className="px-4 py-2 text-sm text-[var(--color-brand-fg)] bg-[var(--color-brand)] rounded-lg disabled:opacity-50 font-semibold">
              {saving ? 'Salvando…' : editing ? 'Salvar' : 'Criar recorrente'}
            </button>
          </div>
        </div>
      </div>
    </ModalPortal>
  )
}
