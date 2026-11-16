import type { Booking } from './api'
import { bkkDate, toTimestamp } from './dates'

export type Actions = { checkIn: boolean; edit: 'full' | 'titleEnd' | false; cancel: boolean; handOver: boolean; isSeries: boolean }

/** What the person may do with a booking right now — mirrors the back-end rules so buttons only show when they'd work. */
export function allowedActions(b: Booking, me: { id: string; role: 'user' | 'admin' }, now: Date): Actions {
  // Whole-series actions are for whoever set up the series (or an admin), not someone handed one date of it.
  const isSeries = Boolean(b.series_id) && (b.series_owner_id === me.id || me.role === 'admin')
  if (b.owner_id !== me.id && me.role !== 'admin') return { checkIn: false, edit: false, cancel: false, handOver: false, isSeries: false }
  const start = new Date(b.starts_at)
  const end = new Date(b.ends_at)
  const dayStart = new Date(toTimestamp(bkkDate(b.starts_at), '00:00'))
  const active = b.status === 'confirmed' || b.status === 'checked_in'
  const started = now >= start
  const ended = now >= end
  return {
    checkIn: b.status === 'confirmed' && now >= dayStart && now.getTime() <= start.getTime() + 15 * 60_000,
    edit: !active || ended ? false : started || b.status === 'checked_in' ? 'titleEnd' : 'full',
    cancel: active && !ended,
    handOver: b.status === 'confirmed' && !started,
    isSeries,
  }
}
