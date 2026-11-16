import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

const api = vi.hoisted(() => ({ cancelSeries: vi.fn().mockResolvedValue(3), cancelBooking: vi.fn(), checkIn: vi.fn(), handOver: vi.fn() }))
vi.mock('../lib/api', () => api)
const start = new Date(Date.now() + 5 * 24 * 3600_000)
vi.mock('../state/data', () => ({
  useData: () => ({
    bookings: [{ id: 'b3', owner_id: 'me', status: 'confirmed', series_id: 's1', title: 'MM', room_name_en: 'Champ', room_name_th: 'แชมป์', floor: 5,
      owner_name: 'Me', owner_department: null, starts_at: start.toISOString(), ends_at: new Date(start.getTime() + 3600_000).toISOString() }],
    reload: vi.fn(),
  }),
}))
vi.mock('../state/session', () => ({ useSession: () => ({ lang: 'en', opts: { lang: 'en', year: 'CE', format: 'long' }, profile: { id: 'me', role: 'user' } }) }))
vi.mock('./Toast', () => ({ useToast: () => () => {} }))
import { BookingDetails } from './BookingDetails'

afterEach(cleanup)

describe('BookingDetails', () => {
  it('"Whole series" cancels the whole series, not just from the clicked date', () => {
    render(<BookingDetails bookingId="b3" onClose={() => {}} onEdit={() => {}} />)
    fireEvent.click(screen.getByRole('button', { name: 'Cancel booking' }))
    fireEvent.click(screen.getByRole('button', { name: 'Whole series' }))
    expect(api.cancelSeries).toHaveBeenCalledWith('s1')
  })
})
