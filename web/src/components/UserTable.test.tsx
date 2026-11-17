import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

const person = (email: string, display_name: string, department: string, extra: object = {}) => ({
  email, display_name, department, role: 'user', active: true, has_account: true, user_id: `id-${display_name}`,
  last_sign_in: '2026-11-17T02:00:00Z', upcoming: 0, paused_until: null, ...extra,
})
const api = vi.hoisted(() => ({
  staffList: vi.fn(),
  saveStaff: vi.fn().mockResolvedValue(1),
  upcomingBookingsOf: vi.fn().mockResolvedValue([]),
  handOver: vi.fn().mockResolvedValue(1),
  adminResetPassword: vi.fn().mockResolvedValue('Ab3dEfGh2k'),
}))
vi.mock('../lib/api', () => api)
vi.mock('../state/session', () => ({
  useSession: () => ({ lang: 'en', opts: { lang: 'en', year: 'CE', format: 'long' }, profile: { id: 'id-SW', email: 'sw@sahamitproduct.com', role: 'admin' } }),
}))
vi.mock('../state/data', () => ({ useData: () => ({ reload: vi.fn().mockResolvedValue(undefined) }) }))
vi.mock('./Toast', () => ({ useToast: () => () => {} }))
vi.mock('read-excel-file/browser', () => ({ readSheet: vi.fn() }))
vi.mock('write-excel-file/browser', () => ({ default: vi.fn(() => ({ toFile: vi.fn() })) }))
import { UserTable } from './UserTable'

afterEach(() => { cleanup(); vi.clearAllMocks() })
const LIST = [
  person('sw@sahamitproduct.com', 'SW', 'BD', { role: 'admin' }),
  person('ploy@sahamitproduct.com', 'Ploy', 'PCB', { upcoming: 2 }),
  person('nok@sahamitproduct.com', 'Nok', 'NF', { has_account: false, user_id: null, last_sign_in: null }),
]
const rowOf = (name: string) => screen.getByDisplayValue(name).closest('tr')!

describe('UserTable', () => {
  it('shows who has signed up, and saves an edited department', async () => {
    api.staffList.mockResolvedValue(LIST)
    render(<UserTable />)
    await screen.findByDisplayValue('Ploy')
    expect(within(rowOf('Nok')).getByText('Not yet')).toBeTruthy()
    fireEvent.change(within(rowOf('Ploy')).getByLabelText('Department'), { target: { value: 'HR' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }))
    await waitFor(() => expect(api.saveStaff).toHaveBeenCalledWith([
      { email: 'ploy@sahamitproduct.com', display_name: 'Ploy', department: 'HR', role: 'user', active: true },
    ]))
  })

  it('filters by department', async () => {
    api.staffList.mockResolvedValue(LIST)
    render(<UserTable />)
    await screen.findByDisplayValue('Ploy')
    fireEvent.change(screen.getByLabelText('Filter by department'), { target: { value: 'NF' } })
    expect(screen.queryByDisplayValue('Ploy')).toBeNull()
    expect(screen.getByDisplayValue('Nok')).toBeTruthy()
  })

  it('disabling someone first shows their upcoming bookings; ticked ones are handed over, then the change is saved', async () => {
    api.staffList.mockResolvedValue(LIST)
    api.upcomingBookingsOf.mockResolvedValue([
      { id: 'b1', title: 'Supplier call', room_name_en: 'Champ', room_name_th: 'แชมป์', starts_at: '2026-11-24T02:30:00Z', ends_at: '2026-11-24T03:30:00Z' },
      { id: 'b2', title: 'Training', room_name_en: 'Wow', room_name_th: 'ว้าว', starts_at: '2026-11-25T02:30:00Z', ends_at: '2026-11-25T03:30:00Z' },
    ])
    render(<UserTable />)
    await screen.findByDisplayValue('Ploy')
    fireEvent.change(within(rowOf('Ploy')).getByLabelText('Status'), { target: { value: 'disabled' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }))
    const review = await screen.findByRole('dialog', { name: /Before disabling/ })
    expect(within(review).getByText('Supplier call')).toBeTruthy()
    fireEvent.click(within(review).getByRole('checkbox', { name: /Supplier call/ }))
    fireEvent.change(within(review).getByLabelText('Hand ticked bookings to (email)'), { target: { value: 'nok@sahamitproduct.com' } })
    fireEvent.click(within(review).getByRole('button', { name: 'Disable and save' }))
    await waitFor(() => expect(api.handOver).toHaveBeenCalledWith('b1', false, 'nok@sahamitproduct.com'))
    expect(api.handOver).toHaveBeenCalledTimes(1)
    await waitFor(() => expect(api.saveStaff).toHaveBeenCalledWith([
      { email: 'ploy@sahamitproduct.com', display_name: 'Ploy', department: 'PCB', role: 'user', active: false },
    ]))
  })

  it("your own role and status can't be changed", async () => {
    api.staffList.mockResolvedValue(LIST)
    render(<UserTable />)
    await screen.findByDisplayValue('SW')
    expect((within(rowOf('SW')).getByLabelText('Role') as HTMLSelectElement).disabled).toBe(true)
    expect((within(rowOf('SW')).getByLabelText('Status') as HTMLSelectElement).disabled).toBe(true)
  })

  it('an admin resets someone\'s password and sees the temporary one to pass on', async () => {
    api.staffList.mockResolvedValue(LIST)
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    render(<UserTable />)
    await screen.findByDisplayValue('Ploy')
    expect(within(rowOf('Nok')).queryByRole('button', { name: 'Reset password' })).toBeNull() // no account yet
    fireEvent.click(within(rowOf('Ploy')).getByRole('button', { name: 'Reset password' }))
    await waitFor(() => expect(api.adminResetPassword).toHaveBeenCalledWith('ploy@sahamitproduct.com'))
    const d = await screen.findByRole('dialog', { name: /Temporary password/ })
    expect(within(d).getByText('Ab3dEfGh2k')).toBeTruthy()
  })
})
