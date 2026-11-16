import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

const api = vi.hoisted(() => ({
  addHoliday: vi.fn().mockResolvedValue(undefined),
  deleteHoliday: vi.fn().mockResolvedValue(undefined),
  adminLiftBan: vi.fn(),
  adminRemoveUser: vi.fn(),
  findProfileByEmail: vi.fn(),
}))
vi.mock('../lib/api', () => api)
const reload = vi.hoisted(() => vi.fn().mockResolvedValue(undefined))
vi.mock('../state/data', () => ({ useData: () => ({ holidays: [{ day: '2099-01-02', name_th: 'ทดสอบ', name_en: 'Test' }], reload }) }))
vi.mock('../state/session', () => ({ useSession: () => ({ lang: 'en', opts: { lang: 'en', year: 'CE', format: 'long' } }) }))
vi.mock('./Toast', () => ({ useToast: () => () => {} }))
// Any query the panel makes resolves to no rows.
vi.mock('../supabase', () => {
  const chain: Record<string, unknown> = {}
  const q = new Proxy(chain, { get: (_, k) => (k === 'then' ? (r: (v: unknown) => void) => r({ data: [] }) : () => q) })
  return { supabase: { from: () => q } }
})
import { AdminPanel } from './AdminPanel'

afterEach(() => { cleanup(); vi.clearAllMocks() })

describe('AdminPanel holidays', () => {
  it('deleting a holiday refreshes the calendars, not just the admin list', async () => {
    render(<AdminPanel onClose={() => {}} />)
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }))
    await waitFor(() => expect(reload).toHaveBeenCalled())
  })
})
