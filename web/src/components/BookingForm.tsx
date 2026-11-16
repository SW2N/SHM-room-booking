import { useState } from 'react'
import { createBooking, createSeries, updateBooking, type SeriesResult } from '../lib/api'
import { addDays, formatDate, SLOTS, toTimestamp } from '../lib/dates'
import { errorMessage } from '../lib/errors'
import { t } from '../lib/i18n'
import { toRule, type RepeatForm } from '../lib/recurrence'
import { roomName } from '../lib/search'
import { useData } from '../state/data'
import { useSession } from '../state/session'
import { useHold } from '../state/useHold'
import { Modal } from './Modal'
import { useToast } from './Toast'

export type FormInit = {
  room: string
  date: string
  start: string
  end: string
  title?: string
  bookingId?: string
  /** 'titleEnd' once a booking has started: only the title and end time can change. */
  mode?: 'new' | 'full' | 'titleEnd'
}

const WEEKDAYS = [1, 2, 3, 4, 5, 6, 7]
const DAY_LABEL = { th: ['จ', 'อ', 'พ', 'พฤ', 'ศ', 'ส', 'อา'], en: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] }

export function BookingForm({ init, onClose, onBanned }: { init: FormInit; onClose: () => void; onBanned: () => void }) {
  const { lang, opts, isAdmin } = useSession()
  const { rooms, reload } = useData()
  const toast = useToast()
  const mode = init.mode ?? 'new'
  const [room, setRoom] = useState(init.room)
  const [date, setDate] = useState(init.date)
  const [start, setStart] = useState(init.start)
  const [end, setEnd] = useState(init.end)
  const [title, setTitle] = useState(init.title ?? '')
  const [repeat, setRepeat] = useState<RepeatForm>({ kind: 'none', interval: 1, weekdays: [], until: addDays(init.date, 28) })
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<SeriesResult | null>(null)

  const startIso = toTimestamp(date, start)
  const endIso = toTimestamp(date, end)
  const hold = useHold(room, startIso, endIso, init.bookingId, mode !== 'titleEnd' && !result)
  const blocked = hold.status === 'blocked'
  const ends = SLOTS.filter((s) => s > start)
  const days = isAdmin ? WEEKDAYS : WEEKDAYS.slice(0, 5)

  async function save() {
    setError('')
    if (!title.trim()) return setError(t('required', lang))
    const rule = toRule(repeat, date)
    if (!rule.ok) return setError(t(rule.error, lang))
    setBusy(true)
    try {
      if (init.bookingId) {
        await updateBooking(init.bookingId, room, startIso, endIso, title.trim())
      } else if (rule.rule) {
        const r = await createSeries(room, title.trim(), date, start, end, rule.rule)
        await reload()
        if (r.skipped.length) return setResult(r)
      } else {
        await createBooking(room, startIso, endIso, title.trim())
      }
      await reload()
      toast(init.bookingId ? t('saved', lang) : t('booked', lang))
      onClose()
    } catch (e) {
      if ((e as { message?: string })?.message === 'BANNED') onBanned()
      setError(errorMessage(e, lang))
    } finally {
      setBusy(false)
    }
  }

  if (result) {
    return (
      <Modal open title={t('notBooked', lang)} onClose={onClose}>
        <p>{t('booked', lang)}: {result.created.length}</p>
        <ul className="plain">
          {result.skipped.map((s) => (
            <li key={s.date}>{formatDate(s.date, opts)} · {errorMessage(s.reason, lang)}</li>
          ))}
        </ul>
        <div className="actions"><button className="primary" onClick={onClose}>{t('close', lang)}</button></div>
      </Modal>
    )
  }

  const locked = mode === 'titleEnd'
  return (
    <Modal open title={init.bookingId ? t('edit', lang) : t('book', lang)} onClose={onClose}>
      <div className="form">
        <label>{t('room', lang)}
          <select value={room} disabled={locked} onChange={(e) => setRoom(e.target.value)}>
            {rooms.map((r) => <option key={r.code} value={r.code}>{roomName(r, lang)} · {r.seats_min}–{r.seats_max}</option>)}
          </select>
        </label>
        <div className="row">
          <label>{t('date', lang)}
            <input type="date" value={date} disabled={locked} onChange={(e) => e.target.value && setDate(e.target.value)} />
          </label>
          <label>{t('start', lang)}
            <select value={start} disabled={locked} onChange={(e) => {
              const s = e.target.value
              setStart(s)
              if (end <= s) setEnd(SLOTS[SLOTS.indexOf(s) + 1])
            }}>
              {SLOTS.slice(0, -1).map((s) => <option key={s}>{s}</option>)}
            </select>
          </label>
          <label>{t('end', lang)}
            <select value={end} onChange={(e) => setEnd(e.target.value)}>
              {ends.map((s) => <option key={s}>{s}</option>)}
            </select>
          </label>
        </div>
        <label>{t('title', lang)}
          <input value={title} maxLength={120} onChange={(e) => setTitle(e.target.value)} autoFocus />
        </label>
        {!init.bookingId && (
          <fieldset className="repeat">
            <legend>{t('repeat', lang)}</legend>
            <select value={repeat.kind} onChange={(e) => setRepeat({ ...repeat, kind: e.target.value as RepeatForm['kind'] })}>
              <option value="none">{t('repeatNone', lang)}</option>
              <option value="daily">{t('repeatDaily', lang)}</option>
              <option value="weekly">{t('repeatWeekly', lang)}</option>
              <option value="monthly">{t('repeatMonthly', lang)}</option>
            </select>
            {repeat.kind !== 'none' && repeat.kind !== 'daily' && (
              <label className="inline">{t('every', lang)}
                <input type="number" min={1} max={12} value={repeat.interval} onChange={(e) => setRepeat({ ...repeat, interval: Number(e.target.value) })} />
                {repeat.kind === 'weekly' ? t('weeks', lang) : t('months', lang)}
              </label>
            )}
            {repeat.kind === 'weekly' && (
              <div className="row" role="group" aria-label={t('onDays', lang)}>
                {days.map((d) => {
                  const on = repeat.weekdays.includes(d)
                  return (
                    <button key={d} type="button" className={on ? 'chip on' : 'chip'} aria-pressed={on}
                      onClick={() => setRepeat({ ...repeat, weekdays: on ? repeat.weekdays.filter((x) => x !== d) : [...repeat.weekdays, d] })}>
                      {DAY_LABEL[lang][d - 1]}
                    </button>
                  )
                })}
              </div>
            )}
            {repeat.kind !== 'none' && (
              <label>{t('until', lang)}
                <input type="date" value={repeat.until} onChange={(e) => setRepeat({ ...repeat, until: e.target.value })} />
              </label>
            )}
          </fieldset>
        )}
        {hold.status === 'held' && <p className="muted small">{t('holdingSlot', lang)}</p>}
        {(blocked || hold.status === 'error') && <p className="error" role="alert">{errorMessage(hold.error, lang)}</p>}
        {error && <p className="error" role="alert">{error}</p>}
        <div className="actions">
          <button onClick={onClose}>{t('cancel', lang)}</button>
          <button className="primary" onClick={save} disabled={busy || blocked}>
            {init.bookingId ? t('save', lang) : t('book', lang)}
          </button>
        </div>
      </div>
    </Modal>
  )
}
