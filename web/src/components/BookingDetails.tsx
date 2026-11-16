import { useState } from 'react'
import { cancelBooking, cancelSeries, checkIn, handOver } from '../lib/api'
import { allowedActions } from '../lib/bookingActions'
import { bkkDate, bkkTime, formatRange } from '../lib/dates'
import { errorMessage } from '../lib/errors'
import { t, type StringKey } from '../lib/i18n'
import { useData } from '../state/data'
import { useSession } from '../state/session'
import type { FormInit } from './BookingForm'
import { Modal } from './Modal'
import { useToast } from './Toast'

type Step = 'main' | 'cancel' | 'handover'

export function BookingDetails({ bookingId, onClose, onEdit }: {
  bookingId: string
  onClose: () => void
  onEdit: (init: FormInit) => void
}) {
  const { lang, opts, profile } = useSession()
  const { bookings, reload } = useData()
  const toast = useToast()
  const [step, setStep] = useState<Step>('main')
  const [email, setEmail] = useState('')
  const [whole, setWhole] = useState(false)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const b = bookings.find((x) => x.id === bookingId)
  if (!b || !profile) return null
  const can = allowedActions(b, profile, new Date())

  async function run(fn: () => Promise<unknown>, done: string) {
    setError('')
    setBusy(true)
    try {
      await fn()
      await reload()
      toast(done)
      onClose()
    } catch (e) {
      setError(errorMessage(e, lang))
    } finally {
      setBusy(false)
    }
  }

  const room = lang === 'th' ? b.room_name_th : b.room_name_en
  return (
    <Modal open title={b.title} onClose={onClose}>
      <dl className="details">
        <dt>{t('room', lang)}</dt><dd>{room} · {t('floor', lang)} {b.floor}</dd>
        <dt>{t('date', lang)}</dt><dd>{formatRange(b.starts_at, b.ends_at, opts)}</dd>
        <dt>{t('bookedBy', lang)}</dt><dd>{b.owner_name}{b.owner_department ? ` · ${b.owner_department}` : ''}</dd>
        <dt>{t('status', lang)}</dt><dd>{t(`st_${b.status}` as StringKey, lang)}{b.series_id ? ` · ${t('repeat', lang)}` : ''}</dd>
      </dl>

      {step === 'main' && (
        <div className="actions wrap">
          {can.checkIn && <button className="primary" disabled={busy} onClick={() => run(() => checkIn(b.id), t('checkedIn', lang))}>{t('checkIn', lang)}</button>}
          {can.edit && (
            <button onClick={() => onEdit({
              room: b.room_code, date: bkkDate(b.starts_at), start: bkkTime(b.starts_at), end: bkkTime(b.ends_at),
              title: b.title, bookingId: b.id, mode: can.edit === 'titleEnd' ? 'titleEnd' : 'full',
            })}>{t('edit', lang)}</button>
          )}
          {can.handOver && <button onClick={() => setStep('handover')}>{t('handOver', lang)}</button>}
          {can.cancel && <button className="danger" onClick={() => setStep('cancel')}>{t('cancelBooking', lang)}</button>}
        </div>
      )}

      {step === 'cancel' && (
        <div className="form">
          <p>{t('cancelBooking', lang)}?</p>
          <div className="actions wrap">
            <button onClick={() => setStep('main')}>{t('close', lang)}</button>
            {can.isSeries && b.series_id && (
              <button className="danger" disabled={busy} onClick={() => run(() => cancelSeries(b.series_id!, bkkDate(b.starts_at)), t('cancelled', lang))}>
                {t('wholeSeries', lang)}
              </button>
            )}
            <button className="danger" disabled={busy} onClick={() => run(() => cancelBooking(b.id), t('cancelled', lang))}>
              {can.isSeries ? t('thisDateOnly', lang) : t('cancelBooking', lang)}
            </button>
          </div>
        </div>
      )}

      {step === 'handover' && (
        <form className="form" onSubmit={(e) => {
          e.preventDefault()
          if (!email.trim()) return setError(t('required', lang))
          void run(() => handOver(b.id, whole, email.trim()), t('handedOver', lang))
        }}>
          <label>{t('colleagueEmail', lang)}
            <input type="email" placeholder="name@sahamitproduct.com" value={email} onChange={(e) => setEmail(e.target.value)} autoFocus />
          </label>
          {can.isSeries && (
            <div className="row" role="radiogroup">
              <label className="inline"><input type="radio" checked={!whole} onChange={() => setWhole(false)} />{t('thisDateOnly', lang)}</label>
              <label className="inline"><input type="radio" checked={whole} onChange={() => setWhole(true)} />{t('wholeSeries', lang)}</label>
            </div>
          )}
          <div className="actions">
            <button type="button" onClick={() => setStep('main')}>{t('close', lang)}</button>
            <button className="primary" type="submit" disabled={busy}>{t('handOver', lang)}</button>
          </div>
        </form>
      )}
      {error && <p className="error" role="alert">{error}</p>}
    </Modal>
  )
}
