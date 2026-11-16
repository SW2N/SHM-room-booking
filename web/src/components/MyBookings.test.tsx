import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

const api = vi.hoisted(() => ({ acknowledgeHandovers: vi.fn().mockResolvedValue(1), checkIn: vi.fn() }))
vi.mock('../lib/api', () => api)
const soon = new Date(Date.now() + 60_000)
const later = new Date(Date.now() + 3 * 24 * 3600_000)
const plus1h = (d: Date) => new Date(d.getTime() + 3600_000).toISOString()
const mk = (id: string, title: string, start: Date, unseen = false) => ({
  id, title, owner_id: 'me', status: 'confirmed', series_id: null, handover_unseen: unseen,
  starts_at: start.toISOString(), ends_at: plus1h(start), room_name_th: 'แชมป์', room_name_en: 'Champ', room_code: 'KT5-3',
})
vi.mock('../state/data', () => ({
  useData: () => ({
    bookings: [],
    mine: [mk('a', 'Weekly sync', later), mk('b', 'Handed meeting', later, true), mk('c', 'Today meeting', soon)],
    reload: vi.fn(),
  }),
}))
vi.mock('../state/session', () => ({
  useSession: () => ({ lang: 'en', opts: { lang: 'en', year: 'CE', format: 'long' }, profile: { id: 'me', role: 'user' } }),
}))
vi.mock('./Toast', () => ({ useToast: () => () => {} }))
import { MyBookings } from './MyBookings'

afterEach(() => { cleanup(); vi.clearAllMocks() })

describe('MyBookings', () => {
  it('lists handed-over bookings first, under their own heading', () => {
    render(<MyBookings onClose={() => {}} onOpenBooking={() => {}} />)
    const text = document.body.textContent ?? ''
    expect(text.indexOf('Handed to you')).toBeGreaterThan(-1)
    expect(text.indexOf('Handed meeting')).toBeLessThan(text.indexOf('Weekly sync'))
  })
  it('marks handed-over bookings as seen once when opened', () => {
    render(<MyBookings onClose={() => {}} onOpenBooking={() => {}} />)
    expect(api.acknowledgeHandovers).toHaveBeenCalledTimes(1)
    expect(api.acknowledgeHandovers).toHaveBeenCalledWith(['b'])
  })
  it("offers check-in for today's booking", () => {
    render(<MyBookings onClose={() => {}} onOpenBooking={() => {}} />)
    expect(screen.getAllByRole('button', { name: 'Check in' }).length).toBe(1)
  })
})
