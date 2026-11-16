import { useEffect, useRef, useState } from 'react'
import { acknowledgeHandovers, checkIn, type Booking } from '../lib/api'
import { allowedActions } from '../lib/bookingActions'
import { formatRange } from '../lib/dates'
import { errorMessage } from '../lib/errors'
import { t } from '../lib/i18n'
import { useData } from '../state/data'
import { useSession } from '../state/session'
import { Modal } from './Modal'
import { useToast } from './Toast'

/** Your upcoming bookings; ones handed to you come first. Opening it counts as having seen them. */
export function MyBookings({ onClose, onOpenBooking }: { onClose: () => void; onOpenBooking: (id: string) => void }) {
  const { lang, opts, profile } = useSession()
  const { bookings, reload } = useData()
  const toast = useToast()
  const acked = useRef(false)
  const now = new Date()
  const mine = bookings.filter(
    (b) => b.owner_id === profile?.id && (b.status === 'confirmed' || b.status === 'checked_in') && new Date(b.ends_at) > now,
  )
  // Keep the handed-to-you list as it was when the panel opened, so it doesn't vanish once marked seen.
  const [handedIds] = useState(() => new Set(mine.filter((b) => b.handover_unseen).map((b) => b.id)))
  const handed = mine.filter((b) => handedIds.has(b.id))
  const rest = mine.filter((b) => !handedIds.has(b.id))

  useEffect(() => {
    if (acked.current) return
    acked.current = true
    void acknowledgeHandovers().then(() => reload()).catch(() => {})
  }, [reload])

  async function doCheckIn(b: Booking) {
    try {
      await checkIn(b.id)
      await reload()
      toast(t('checkedIn', lang))
    } catch (e) {
      toast(errorMessage(e, lang), 'error')
    }
  }

  const row = (b: Booking) => {
    const can = profile ? allowedActions(b, profile, now) : null
    return (
      <li key={b.id} className="mine-row">
        <button className="link mine-title" onClick={() => onOpenBooking(b.id)}>{b.title}</button>
        <span className="muted small">{lang === 'th' ? b.room_name_th : b.room_name_en} · {formatRange(b.starts_at, b.ends_at, opts)}</span>
        {b.status === 'checked_in' && <span className="state free">{t('checkedIn', lang)}</span>}
        {can?.checkIn && <button className="primary" onClick={() => doCheckIn(b)}>{t('checkIn', lang)}</button>}
      </li>
    )
  }

  return (
    <Modal open wide title={t('myBookings', lang)} onClose={onClose}>
      {handed.length > 0 && (
        <section className="handed">
          <h3>{t('handedToYou', lang)}</h3>
          <ul className="plain">{handed.map(row)}</ul>
        </section>
      )}
      <section>
        <h3>{t('upcoming', lang)}</h3>
        {rest.length ? <ul className="plain">{rest.map(row)}</ul> : <p className="muted">{t('noUpcoming', lang)}</p>}
      </section>
    </Modal>
  )
}
