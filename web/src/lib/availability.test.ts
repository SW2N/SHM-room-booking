import { describe, expect, it } from 'vitest'
import { overlaps, roomState } from './availability'
import type { Booking, Hold } from './api'

const bk = (start: string, end: string, status: Booking['status'] = 'confirmed'): Booking =>
  ({ id: 'b', room_code: 'KT5-1', starts_at: start, ends_at: end, status }) as Booking
const hold = (start: string, end: string, user: string, expires: string): Hold =>
  ({ id: 'h', room_code: 'KT5-1', starts_at: start, ends_at: end, user_id: user, booking_id: null, expires_at: expires, holder_name: 'X' })

const S = '2026-11-24T14:00:00+07:00'
const E = '2026-11-24T15:30:00+07:00'
const future = new Date(Date.now() + 60_000).toISOString()
const past = new Date(Date.now() - 60_000).toISOString()

describe('availability', () => {
  it('treats ranges as half-open', () => {
    expect(overlaps('2026-11-24T13:00:00+07:00', '2026-11-24T14:00:00+07:00', S, E)).toBe(false)
  })
  it('a booking overlapping the end of the chosen time makes it taken', () => {
    expect(roomState('KT5-1', S, E, [bk('2026-11-24T15:00:00+07:00', '2026-11-24T16:00:00+07:00')], [], 'me')).toBe('taken')
  })
  it('a booking ending exactly at the start leaves it free', () => {
    expect(roomState('KT5-1', S, E, [bk('2026-11-24T13:00:00+07:00', S)], [], 'me')).toBe('free')
  })
  it('a cancelled booking does not block', () => {
    expect(roomState('KT5-1', S, E, [bk(S, E, 'cancelled')], [], 'me')).toBe('free')
  })
  it("someone else's live hold shows as held", () => {
    expect(roomState('KT5-1', S, E, [], [hold(S, E, 'other', future)], 'me')).toBe('held')
  })
  it('my own hold does not block me', () => {
    expect(roomState('KT5-1', S, E, [], [hold(S, E, 'me', future)], 'me')).toBe('free')
  })
  it('an expired hold does not block', () => {
    expect(roomState('KT5-1', S, E, [], [hold(S, E, 'other', past)], 'me')).toBe('free')
  })
})
