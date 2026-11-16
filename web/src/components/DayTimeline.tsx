import type { MouseEvent } from 'react'
import { isLiveHold } from '../lib/availability'
import { bkkDate, formatDate, isoWeekday, SLOTS, toTimestamp, weekdayName } from '../lib/dates'
import { t } from '../lib/i18n'
import { roomName, roomsForSearch, type Search } from '../lib/search'
import { blockPosition, slotAt } from '../lib/timeline'
import { useData } from '../state/data'
import { useSession } from '../state/session'

const HOURS = Array.from({ length: 12 }, (_, i) => `${String(8 + i).padStart(2, '0')}:00`)
const ACTIVE = new Set(['confirmed', 'checked_in'])

export function DayTimeline({ search, selected, onSelectRoom, onSlotClick, onEventClick }: {
  search: Search
  selected: string
  onSelectRoom: (code: string) => void
  onSlotClick: (code: string, startIso: string, endIso: string) => void
  onEventClick: (bookingId: string) => void
}) {
  const { lang, opts, profile, isAdmin } = useSession()
  const { rooms, bookings, holds, holidays } = useData()
  const day = search.date
  const holiday = holidays.find((h) => h.day === day)
  const dayOff = isoWeekday(day) > 5 || Boolean(holiday)
  const canBook = isAdmin || !dayOff
  const shown = roomsForSearch(rooms, search)
  const timed = Boolean(search.start && search.end)
  const band = timed ? blockPosition(toTimestamp(day, search.start!), toTimestamp(day, search.end!)) : null
  const myId = profile?.id ?? ''

  function clickTrack(code: string, e: MouseEvent<HTMLDivElement>) {
    if (!canBook || e.target !== e.currentTarget) return
    const rect = e.currentTarget.getBoundingClientRect()
    const x = ((e.clientX - rect.left) / rect.width) * 100
    if (band && x >= band.left && x <= band.left + band.width) {
      return onSlotClick(code, toTimestamp(day, search.start!), toTimestamp(day, search.end!))
    }
    const start = slotAt(x)
    onSlotClick(code, toTimestamp(day, start), toTimestamp(day, SLOTS[SLOTS.indexOf(start) + 1]))
  }

  return (
    <section className="timeline panel" aria-label={t('allRoomsToday', lang)}>
      <h3>
        {t('allRoomsToday', lang)} · {weekdayName(day, lang)} {formatDate(day, opts)}
        {holiday && <span className="muted"> · {(lang === 'en' && holiday.name_en) || holiday.name_th}</span>}
      </h3>
      <div className="tl-scroll">
        <div className="tl-grid">
          <div className="tl-head">
            <span />
            <div className="tl-hours">{HOURS.map((h) => <span key={h}>{h}</span>)}</div>
          </div>
          {shown.map((r) => (
            <div key={r.code} className={r.code === selected ? 'tl-row selected' : 'tl-row'}>
              <button className="tl-label" onClick={() => onSelectRoom(r.code)}>
                {roomName(r, lang)} <span className="muted">{r.seats_min}–{r.seats_max}</span>
              </button>
              <div className={dayOff ? 'tl-track off' : 'tl-track'} onClick={(e) => clickTrack(r.code, e)}>
                {band && <div className="tl-band" style={{ left: `${band.left}%`, width: `${band.width}%` }} />}
                {bookings
                  .filter((b) => b.room_code === r.code && ACTIVE.has(b.status) && bkkDate(b.starts_at) === day)
                  .map((b) => {
                    const p = blockPosition(b.starts_at, b.ends_at)
                    return (
                      <button
                        key={b.id}
                        className={`tl-block ${b.owner_id === myId ? 'mine' : 'other'}`}
                        style={{ left: `${p.left}%`, width: `${p.width}%` }}
                        title={`${b.title} · ${b.owner_name}`}
                        onClick={() => onEventClick(b.id)}
                      >
                        {b.title}
                      </button>
                    )
                  })}
                {holds
                  .filter((h) => h.room_code === r.code && h.user_id !== myId && isLiveHold(h) && bkkDate(h.starts_at) === day)
                  .map((h) => {
                    const p = blockPosition(h.starts_at, h.ends_at)
                    return (
                      <div key={h.id} className="tl-block held" style={{ left: `${p.left}%`, width: `${p.width}%` }} title={`${t('beingBookedBy', lang)} ${h.holder_name}`}>
                        {h.holder_name}
                      </div>
                    )
                  })}
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
