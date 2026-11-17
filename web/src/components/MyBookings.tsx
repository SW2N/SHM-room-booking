import { useEffect, useRef, useState } from 'react'
import { acknowledgeHandovers, checkIn, type Booking } from '../lib/api'
import { allowedActions } from '../lib/bookingActions'
import { addDays, bkkDate, bkkTime, formatDate, todayBkk, weekdayName } from '../lib/dates'
import { errorMessage } from '../lib/errors'
import { t } from '../lib/i18n'
import { useData } from '../state/data'
import { useSession } from '../state/session'
import { Modal } from './Modal'
import { useToast } from './Toast'

/** Your upcoming bookings; ones handed to you come first. Opening it counts as having seen them. */
export function MyBookings({ onClose, onOpenBooking }: { onClose: () => void; onOpenBooking: (id: string) => void }) {
  const { lang, opts, profile } = useSession()
  const { mine: own, reload } = useData()
  const toast = useToast()
  const acked = useRef(false)
  const now = new Date()
  const mine = own.filter((b) => new Date(b.ends_at) > now)
  // Keep the handed-to-you list as it was when the panel opened, so it doesn't vanish once marked seen.
  const [handedIds] = useState(() => new Set(mine.filter((b) => b.handover_unseen).map((b) => b.id)))
  const handed = mine.filter((b) => handedIds.has(b.id))
  const rest = mine.filter((b) => !handedIds.has(b.id))

  useEffect(() => {
    if (acked.current) return
    acked.current = true
    if (!handedIds.size) return
    void acknowledgeHandovers([...handedIds]).then(() => reload()).catch(() => {})
  }, [reload, handedIds])

  async function doCheckIn(b: Booking) {
    try {
      await checkIn(b.id)
      await reload()
      toast(t('checkedIn', lang))
    } catch (e) {
      toast(errorMessage(e, lang), 'error')
    }
  }

  // Check in every booking of today that can still be checked in, in one press at the start of the day.
  async function checkInAll(list: Booking[]) {
    const results = await Promise.allSettled(list.map((b) => checkIn(b.id)))
    await reload()
    const ok = results.filter((r) => r.status === 'fulfilled').length
    const failed = results.find((r): r is PromiseRejectedResult => r.status === 'rejected')
    if (failed) toast(errorMessage(failed.reason, lang), 'error')
    else toast(t('checkedInAll', lang).replace('{n}', String(ok)))
  }

  const today = todayBkk()
  const dayLabel = (d: string) =>
    `${d === today ? `${t('today', lang)} · ` : d === addDays(today, 1) ? `${t('tomorrow', lang)} · ` : ''}${weekdayName(d, lang)} ${formatDate(d, opts)}`
  const canCheckIn = (b: Booking) => Boolean(profile && allowedActions(b, profile, now).checkIn)

  // One heading per day that has bookings (no empty days), its meetings underneath in time order.
  const days = (list: Booking[]) => {
    const byDay = new Map<string, Booking[]>()
    for (const b of [...list].sort((x, y) => x.starts_at.localeCompare(y.starts_at))) {
      const d = bkkDate(b.starts_at)
      byDay.set(d, [...(byDay.get(d) ?? []), b])
    }
    return [...byDay.entries()].map(([d, items]) => {
      const due = items.filter(canCheckIn)
      return (
        <section key={d} className={d === today ? 'mine-day today' : 'mine-day'}>
          <div className="mine-day-head">
            <h4>{dayLabel(d)}</h4>
            {due.length > 1 && <button className="primary" onClick={() => void checkInAll(due)}>{t('checkInAll', lang).replace('{n}', String(due.length))}</button>}
          </div>
          <ul className="plain">{items.map(row)}</ul>
        </section>
      )
    })
  }

  const row = (b: Booking) => {
    const can = profile ? allowedActions(b, profile, now) : null
    return (
      <li key={b.id} className="mine-row">
        <button className="link mine-title" onClick={() => onOpenBooking(b.id)}>{b.title}</button>
        <span className="muted small">{bkkTime(b.starts_at)}–{bkkTime(b.ends_at)} · {lang === 'th' ? b.room_name_th : b.room_name_en}</span>
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
          {days(handed)}
        </section>
      )}
      <section>
        <h3>{t('upcoming', lang)}</h3>
        {rest.length ? days(rest) : <p className="muted">{t('noUpcoming', lang)}</p>}
      </section>
    </Modal>
  )
}
