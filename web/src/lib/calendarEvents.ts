import type { EventInput } from '@fullcalendar/core'
import type { Booking, Hold } from './api'
import { isLiveHold } from './availability'
import { bkkDate, bkkTime, type Lang, toTimestamp } from './dates'
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
