import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

const api = vi.hoisted(() => ({
  createBooking: vi.fn().mockResolvedValue({ id: 'b1' }),
  createSeries: vi.fn().mockResolvedValue({ created: ['b1', 'b2'], skipped: [] }),
  updateBooking: vi.fn().mockResolvedValue({ id: 'b1' }),
}))
vi.mock('../lib/api', () => api)
vi.mock('../state/useHold', () => ({ useHold: () => ({ status: 'held', error: null }) }))
vi.mock('../state/data', () => ({
  useData: () => ({
    rooms: [
      { code: 'AC2-1', name_en: 'Gracie', name_th: 'เกรซี่', seats_min: 10, seats_max: 15 },
      { code: 'KT5-3', name_en: 'Champ', name_th: 'แชมป์', seats_min: 10, seats_max: 15 },
    ],
    reload: vi.fn().mockResolvedValue(undefined),
  }),
}))
vi.mock('../state/session', () => ({ useSession: () => ({ lang: 'en', opts: { lang: 'en', year: 'CE', format: 'long' }, isAdmin: false }) }))
vi.mock('./Toast', () => ({ useToast: () => () => {} }))
import { BookingForm } from './BookingForm'

afterEach(() => { cleanup(); vi.clearAllMocks() })
const init = { room: 'AC2-1', date: '2026-11-17', start: '15:00', end: '15:30', mode: 'new' as const }

describe('BookingForm tells the page where the booking went', () => {
  it('a booking moved to another room and date reports that room and date, so every view can show it', async () => {
    const onSaved = vi.fn()
    render(<BookingForm init={init} onClose={() => {}} onBanned={() => {}} onSaved={onSaved} />)
    fireEvent.change(screen.getByDisplayValue('Gracie · 10–15'), { target: { value: 'KT5-3' } })
    fireEvent.change(screen.getByLabelText('Date'), { target: { value: '2026-11-24' } })
    fireEvent.change(screen.getByLabelText('Meeting title'), { target: { value: 'MM Meeting' } })
    fireEvent.click(screen.getByRole('button', { name: 'Book' }))
    await waitFor(() => expect(onSaved).toHaveBeenCalledWith('KT5-3', '2026-11-24'))
  })

  it('a repeat booking reports its first date', async () => {
    const onSaved = vi.fn()
    render(<BookingForm init={init} onClose={() => {}} onBanned={() => {}} onSaved={onSaved} />)
    fireEvent.change(screen.getByLabelText('Meeting title'), { target: { value: 'Weekly' } })
    fireEvent.change(screen.getByDisplayValue("Doesn't repeat"), { target: { value: 'weekly' } })
    fireEvent.click(screen.getByRole('button', { name: 'Book' }))
    await waitFor(() => expect(onSaved).toHaveBeenCalledWith('AC2-1', '2026-11-17'))
  })
})
