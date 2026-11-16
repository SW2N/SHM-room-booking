import { describe, expect, it } from 'vitest'
import type { Booking, Hold } from './api'
import { toEvents } from './calendarEvents'

const b = (id: string, status: Booking['status'], owner = 'other'): Booking =>
  ({ id, room_code: 'KT5-3', starts_at: '2026-11-24T10:00:00+07:00', ends_at: '2026-11-24T11:00:00+07:00', status, title: 'Sales', owner_id: owner, owner_name: 'Nok' }) as Booking
const future = new Date(Date.now() + 60_000).toISOString()
const hold: Hold = { id: 'h1', room_code: 'KT5-3', starts_at: '2026-11-24T13:00:00+07:00', ends_at: '2026-11-24T14:00:00+07:00', user_id: 'other', booking_id: null, expires_at: future, holder_name: 'Ploy' }

describe('toEvents', () => {
  it('leaves out cancelled and no-show bookings', () => {
    const ev = toEvents('KT5-3', [b('1', 'confirmed'), b('2', 'cancelled'), b('3', 'no_show'), b('4', 'checked_in')], [], 'me', 'en')
    expect(ev.map((e) => e.id)).toEqual(['1', '4'])
  })
  it("shows someone else's live hold as one held event with their name", () => {
    const ev = toEvents('KT5-3', [], [hold], 'me', 'en')
    expect(ev.length).toBe(1)
    expect(ev[0].classNames).toContain('ev-held')
    expect(ev[0].title).toBe('Being booked by Ploy')
  })
  it('titles bookings with the owner name and marks my own', () => {
    const ev = toEvents('KT5-3', [b('1', 'confirmed', 'me')], [], 'me', 'en')
    expect(ev[0].title).toBe('Sales · Nok')
    expect(ev[0].classNames).toContain('ev-mine')
  })
  it('only includes the given room', () => {
    expect(toEvents('KT5-1', [b('1', 'confirmed')], [hold], 'me', 'en')).toEqual([])
  })
})

import { fromFloating, toFloating } from './calendarEvents'
describe('Bangkok wall-clock conversion for the calendar', () => {
  it('turns a moment into Bangkok wall-clock text', () => {
    expect(toFloating('2026-11-24T01:00:00Z')).toBe('2026-11-24T08:00:00')
  })
  it('turns a calendar slot back into a Bangkok timestamp', () => {
    expect(fromFloating(new Date('2026-11-24T08:30:00Z'))).toBe('2026-11-24T08:30:00+07:00')
  })
})
