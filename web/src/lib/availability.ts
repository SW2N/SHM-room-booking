import type { Booking, Hold } from './api'

const ACTIVE = new Set(['confirmed', 'checked_in'])

/** Half-open ranges [start, end): touching ends do not overlap. */
export function overlaps(aStart: string, aEnd: string, bStart: string, bEnd: string): boolean {
  return new Date(aStart) < new Date(bEnd) && new Date(bStart) < new Date(aEnd)
}

export function isLiveHold(h: Hold, now = new Date()): boolean {
  return new Date(h.expires_at) > now
}

export function roomState(
  room: string, start: string, end: string, bookings: Booking[], holds: Hold[], myId: string,
): 'free' | 'taken' | 'held' {
  if (bookings.some((b) => b.room_code === room && ACTIVE.has(b.status) && overlaps(b.starts_at, b.ends_at, start, end))) return 'taken'
  if (holds.some((h) => h.room_code === room && h.user_id !== myId && isLiveHold(h) && overlaps(h.starts_at, h.ends_at, start, end))) return 'held'
  return 'free'
}
