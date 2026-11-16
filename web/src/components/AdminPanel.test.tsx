import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

const api = vi.hoisted(() => ({
  addHoliday: vi.fn().mockResolvedValue(undefined),
  deleteHoliday: vi.fn().mockResolvedValue(undefined),
  saveHolidays: vi.fn().mockResolvedValue(undefined),
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
const sheet = vi.hoisted(() => ({ readSheet: vi.fn() }))
vi.mock('read-excel-file/browser', () => sheet)
vi.mock('write-excel-file/browser', () => ({ default: vi.fn(() => ({ toFile: vi.fn() })) }))
import { AdminPanel } from './AdminPanel'

afterEach(() => { cleanup(); vi.clearAllMocks() })

describe('AdminPanel holiday table', () => {
  it('editing a name and saving writes only that row, then refreshes the calendars', async () => {
    render(<AdminPanel onClose={() => {}} />)
    fireEvent.change(screen.getByDisplayValue('Test'), { target: { value: 'New name' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }))
    await waitFor(() => expect(api.saveHolidays).toHaveBeenCalledWith({ upserts: [{ day: '2099-01-02', name_th: 'ทดสอบ', name_en: 'New name' }], deletes: [] }))
    await waitFor(() => expect(reload).toHaveBeenCalled())
  })

  it('removing a row and saving deletes that holiday', async () => {
    render(<AdminPanel onClose={() => {}} />)
    fireEvent.click(screen.getByRole('button', { name: 'Remove row' }))
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }))
    await waitFor(() => expect(api.saveHolidays).toHaveBeenCalledWith({ upserts: [], deletes: ['2099-01-02'] }))
  })

  it('an uploaded Excel file is added to the table, to check before saving', async () => {
    sheet.readSheet.mockResolvedValue([['Date', 'Thai name', 'English name'], ['3/1/2099', 'วันทดสอบ', 'Test day']])
    render(<AdminPanel onClose={() => {}} />)
    const file = new File(['x'], 'holidays.xlsx')
    fireEvent.change(screen.getByLabelText('Upload Excel'), { target: { files: [file] } })
    expect(await screen.findByDisplayValue('วันทดสอบ')).toBeTruthy()
    expect(api.saveHolidays).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }))
    await waitFor(() => expect(api.saveHolidays).toHaveBeenCalledWith({ upserts: [{ day: '2099-01-03', name_th: 'วันทดสอบ', name_en: 'Test day' }], deletes: [] }))
  })
})
