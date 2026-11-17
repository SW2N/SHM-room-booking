import type { EventInput } from '@fullcalendar/core'
import type { Booking, Hold } from './api'
import { isLiveHold } from './availability'
import { addDays, bkkDate, bkkTime, type DateOpts, formatDate, formatMonth, isoWeekday, type Lang, toTimestamp, weekdayName } from './dates'
import { t } from './i18n'

// The calendar runs in "UTC" with Bangkok wall-clock times fed in, so every browser shows Bangkok time
// without a time-zone plugin. These two convert in and out.
export function toFloating(iso: string): string {
  return `${bkkDate(iso)}T${bkkTime(iso)}:00`
}
export function fromFloating(d: Date): string {
  const s = d.toISOString()
  return toTimestamp(s.slice(0, 10), s.slice(11, 16))
}

/** "Now" for the calendar: Bangkok's wall-clock time, so Today and the current day are Bangkok's in any browser. */
export function calendarNow(now: Date = new Date()): string {
  return toFloating(now.toISOString())
}

/** The calendar's heading in the person's language and year system: a day, a date range, or a month. */
export function calendarTitle(start: Date, end: Date | undefined, opts: DateOpts): string {
  const first = start.toISOString().slice(0, 10)
  let last = end ? end.toISOString().slice(0, 10) : first
  if (end && end > start && end.toISOString().slice(11) === '00:00:00.000Z') last = addDays(last, -1)
  if (last <= first) return `${weekdayName(first, opts.lang)} ${formatDate(first, opts)}`
  if (first.endsWith('-01') && last.slice(0, 7) === first.slice(0, 7) && addDays(last, 1).endsWith('-01')) return formatMonth(first, opts)
  return `${formatDate(first, opts)} – ${formatDate(last, opts)}`
}

/**
 * The date the rest of the page should show after the calendar moves. The day view's own day; in week and
 * month views the calendar's current date (where Today, ‹ › or a view switch put it) while it is on screen,
 * else the first day shown. A weekend moves to the next weekday shown, or the last one before it.
 */
export function viewDate(viewType: string, viewStart: string, current: string, viewEnd: string): string {
  if (viewType === 'timeGridDay') return viewStart
  const day = current >= viewStart && current < viewEnd ? current : viewStart
  const wd = isoWeekday(day)
  if (wd <= 5) return day
  const next = addDays(day, 8 - wd)
  return next < viewEnd ? next : addDays(day, 5 - wd)
}

const ACTIVE = new Set(['confirmed', 'checked_in'])

export function toEvents(roomCode: string, bookings: Booking[], holds: Hold[], myId: string, lang: Lang): EventInput[] {
  const own = bookings
    .filter((b) => b.room_code === roomCode && ACTIVE.has(b.status))
    .map((b) => ({
      id: b.id,
      title: `${b.title} · ${b.owner_name}`,
      start: toFloating(b.starts_at),
      end: toFloating(b.ends_at),
      classNames: [b.owner_id === myId ? 'ev-mine' : 'ev-other', ...(b.status === 'checked_in' ? ['ev-checked'] : [])],
    }))
  const held = holds
    .filter((h) => h.room_code === roomCode && h.user_id !== myId && isLiveHold(h))
    .map((h) => ({
      id: `hold-${h.id}`,
      title: `${t('beingBookedBy', lang)} ${h.holder_name}`,
      start: toFloating(h.starts_at),
      end: toFloating(h.ends_at),
      classNames: ['ev-held'],
    }))
  return [...own, ...held]
}
