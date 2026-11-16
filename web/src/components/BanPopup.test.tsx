import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('../state/session', () => ({
  useSession: () => ({ lang: 'en', opts: { lang: 'en', year: 'CE', format: 'long' }, profile: { id: 'me', banned_until: '2026-11-24T14:00:00+07:00' } }),
}))
vi.mock('../supabase', () => {
  const row = { missed: [], ends_at: '2026-11-24T14:00:00+07:00', cancelled_count: 3 }
  const q: Record<string, unknown> = new Proxy({}, { get: (_, k) => (k === 'then' ? (r: (v: unknown) => void) => r({ data: [row] }) : () => q) })
  return { supabase: { from: () => q } }
})
import { BanPopup } from './BanPopup'

afterEach(cleanup)

describe('BanPopup', () => {
  it('says how many future bookings were cancelled', async () => {
    render(<BanPopup open onClose={() => {}} />)
    expect(await screen.findByText(/3 upcoming bookings were cancelled/)).toBeTruthy()
  })
})
