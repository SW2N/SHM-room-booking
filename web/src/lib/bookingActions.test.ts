import { describe, expect, it } from 'vitest'
import type { Booking } from './api'
import { allowedActions } from './bookingActions'

const b = (p: Partial<Booking> = {}): Booking =>
  ({ id: 'b', owner_id: 'me', status: 'confirmed', series_id: null, starts_at: '2026-11-24T14:00:00+07:00', ends_at: '2026-11-24T15:00:00+07:00', ...p }) as Booking
const me = { id: 'me', role: 'user' as const }
const admin = { id: 'boss', role: 'admin' as const }
const at = (iso: string) => new Date(iso)

describe('allowedActions', () => {
  it('owner can check in from midnight on the day', () => {
    expect(allowedActions(b(), me, at('2026-11-24T00:05:00+07:00')).checkIn).toBe(true)
  })
  it('not the day before', () => {
    expect(allowedActions(b(), me, at('2026-11-23T23:59:00+07:00')).checkIn).toBe(false)
  })
  it('not more than 15 minutes after the start', () => {
    expect(allowedActions(b(), me, at('2026-11-24T14:16:00+07:00')).checkIn).toBe(false)
  })
  it('someone else gets nothing', () => {
    expect(allowedActions(b(), { id: 'x', role: 'user' }, at('2026-11-24T10:00:00+07:00'))).toEqual({ checkIn: false, edit: false, cancel: false, handOver: false, isSeries: false })
  })
  it('an admin can act on anyone’s booking', () => {
    const a = allowedActions(b(), admin, at('2026-11-24T10:00:00+07:00'))
    expect(a).toEqual({ checkIn: true, edit: 'full', cancel: true, handOver: true, isSeries: false })
  })
  it('a started booking: title and end only, no handover', () => {
    const a = allowedActions(b(), me, at('2026-11-24T14:05:00+07:00'))
    expect(a.edit).toBe('titleEnd')
    expect(a.handOver).toBe(false)
  })
  it('a checked-in booking: no check-in, title and end only', () => {
    const a = allowedActions(b({ status: 'checked_in' }), me, at('2026-11-24T13:00:00+07:00'))
    expect(a.checkIn).toBe(false)
    expect(a.edit).toBe('titleEnd')
  })
  it('flags a series', () => {
    expect(allowedActions(b({ series_id: 's1', series_owner_id: 'me' }), me, at('2026-11-24T10:00:00+07:00')).isSeries).toBe(true)
  })
})

describe('whole-series options', () => {
  const now = at('2026-11-24T10:00:00+07:00')
  it('the series owner gets them', () => {
    expect(allowedActions(b({ series_id: 's1', series_owner_id: 'me' }), me, now).isSeries).toBe(true)
  })
  it('someone handed one date of another person’s series does not', () => {
    expect(allowedActions(b({ series_id: 's1', series_owner_id: 'other' }), me, now).isSeries).toBe(false)
  })
  it('an admin does', () => {
    expect(allowedActions(b({ series_id: 's1', series_owner_id: 'other' }), admin, now).isSeries).toBe(true)
  })
})
