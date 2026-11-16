import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('../state/session', () => ({ useSession: () => ({ lang: 'en' }) }))
import { Legend } from './Legend'

afterEach(cleanup)

describe('Legend', () => {
  it('explains the booking colours', () => {
    render(<Legend />)
    for (const label of ['My bookings', "Others' bookings", 'Being booked', 'Closed']) expect(screen.getByText(label)).toBeTruthy()
  })
})
