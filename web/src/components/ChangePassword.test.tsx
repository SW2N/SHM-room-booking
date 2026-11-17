import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

const updateUser = vi.hoisted(() => vi.fn().mockResolvedValue({ error: null }))
const rpc = vi.hoisted(() => vi.fn().mockResolvedValue({ error: null }))
vi.mock('../supabase', () => ({ supabase: { rpc, auth: { updateUser } } }))
const refreshProfile = vi.hoisted(() => vi.fn().mockResolvedValue(undefined))
const must = vi.hoisted(() => ({ value: true }))
vi.mock('../state/session', () => ({
  useSession: () => ({ lang: 'en', refreshProfile, profile: { id: 'me', must_change_password: must.value } }),
}))
vi.mock('./Toast', () => ({ useToast: () => () => {} }))
import { ChangePasswordForm, PasswordGate } from './ChangePassword'

afterEach(() => { cleanup(); vi.clearAllMocks() })

const fill = (a: string, b: string) => {
  fireEvent.change(screen.getByLabelText('New password'), { target: { value: a } })
  fireEvent.change(screen.getByLabelText('Confirm new password'), { target: { value: b } })
  fireEvent.click(screen.getByRole('button', { name: 'Change password' }))
}

describe('ChangePasswordForm', () => {
  it('the two passwords must match', async () => {
    render(<ChangePasswordForm onDone={() => {}} />)
    fill('newpass1', 'newpass2')
    expect(await screen.findByText("The passwords don't match.")).toBeTruthy()
    expect(updateUser).not.toHaveBeenCalled()
  })
  it('sets the new password and clears the reminder', async () => {
    const onDone = vi.fn()
    render(<ChangePasswordForm onDone={onDone} />)
    fill('newpass1', 'newpass1')
    await waitFor(() => expect(onDone).toHaveBeenCalled())
    expect(updateUser).toHaveBeenCalledWith({ password: 'newpass1' })
    expect(rpc).toHaveBeenCalledWith('password_changed')
    expect(refreshProfile).toHaveBeenCalled()
  })
})

describe('PasswordGate', () => {
  it('after an admin reset, the person must set their own password before using the app', () => {
    must.value = true
    render(<PasswordGate />)
    expect(screen.getByRole('dialog', { name: 'Choose your own password' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'close' })).toBeNull()
  })
  it('shows nothing otherwise', () => {
    must.value = false
    render(<PasswordGate />)
    expect(screen.queryByRole('dialog')).toBeNull()
  })
})
