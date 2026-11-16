import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('../state/data', () => ({ useData: () => ({ rooms: [], bookings: [], holds: [], holidays: [] }) }))
vi.mock('../state/session', () => ({
  useSession: () => ({ lang: 'en', opts: { lang: 'en', year: 'CE', format: 'long' }, profile: { id: 'me' }, isAdmin: false }),
}))
import { DayTimeline } from './DayTimeline'

afterEach(cleanup)
const search = { date: '2026-11-17', start: null, end: null, sizes: [] }
const noop = () => {}

describe('DayTimeline date buttons', () => {
  it('next and previous day move the date by one day', () => {
    const onDateChange = vi.fn()
    render(<DayTimeline search={search} selected="" onSelectRoom={noop} onSlotClick={noop} onEventClick={noop} onDateChange={onDateChange} />)
    fireEvent.click(screen.getByRole('button', { name: 'Next day' }))
    expect(onDateChange).toHaveBeenLastCalledWith('2026-11-18')
    fireEvent.click(screen.getByRole('button', { name: 'Previous day' }))
    expect(onDateChange).toHaveBeenLastCalledWith('2026-11-16')
  })
})
