import { cleanup, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

const api = vi.hoisted(() => ({ acknowledgeHandovers: vi.fn().mockResolvedValue(1), checkIn: vi.fn() }))
vi.mock('../lib/api', () => api)
const soon = new Date(Date.now() + 60_000)
const later = new Date(Date.now() + 3 * 24 * 3600_000)
const soon2 = new Date(Date.now() + 2 * 60_000)
const muchLater = new Date(Date.now() + 9 * 24 * 3600_000)
const plus1h = (d: Date) => new Date(d.getTime() + 3600_000).toISOString()
const mk = (id: string, title: string, start: Date, unseen = false) => ({
  id, title, owner_id: 'me', status: 'confirmed', series_id: null, handover_unseen: unseen,
  starts_at: start.toISOString(), ends_at: plus1h(start), room_name_th: 'แชมป์', room_name_en: 'Champ', room_code: 'KT5-3',
})
vi.mock('../state/data', () => ({
  useData: () => ({
    bookings: [],
    mine: [mk('a', 'Weekly sync', later), mk('b', 'Handed meeting', later, true), mk('c', 'Today meeting', soon),
      mk('d', 'Second today', soon2), mk('e', 'Same day as sync', new Date(later.getTime() + 2 * 3600_000)), mk('f', 'Far meeting', muchLater)],
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
    expect(screen.getAllByRole('button', { name: 'Check in' }).length).toBe(2)
  })

  it('groups bookings under a heading per day, only for days that have bookings', () => {
    render(<MyBookings onClose={() => {}} onOpenBooking={() => {}} />)
    const upcoming = screen.getByRole('heading', { level: 3, name: 'Upcoming' }).parentElement!
    const days = within(upcoming).getAllByRole('heading', { level: 4 }).map((h) => h.textContent)
    expect(days.length).toBe(3) // today, the day of "Weekly sync", the far day
    expect(days[0]).toMatch(/^Today/)
    const syncDay = screen.getByText('Weekly sync').closest('section')!
    expect(syncDay.textContent).toContain('Same day as sync')
  })

  it("checks in all of today's bookings at once", async () => {
    render(<MyBookings onClose={() => {}} onOpenBooking={() => {}} />)
    screen.getByRole('button', { name: 'Check in all (2)' }).click()
    await vi.waitFor(() => expect(api.checkIn).toHaveBeenCalledTimes(2))
    expect(api.checkIn.mock.calls.map((c) => c[0]).sort()).toEqual(['c', 'd'])
  })
})
