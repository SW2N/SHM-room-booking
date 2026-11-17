import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../state/session', () => ({ useSession: () => ({ lang: 'en', setGuestLang: () => {}, doneRecovering: () => {} }) }))
const signIn = vi.hoisted(() => vi.fn().mockResolvedValue({ error: null }))
const signUp = vi.hoisted(() => vi.fn().mockResolvedValue({ error: null }))
const resetPasswordForEmail = vi.hoisted(() => vi.fn().mockResolvedValue({ error: null }))
const updateUser = vi.hoisted(() => vi.fn().mockResolvedValue({ error: null }))
const rpc = vi.hoisted(() => vi.fn().mockResolvedValue({ data: 'listed', error: null }))
vi.mock('../supabase', () => ({ supabase: { rpc, auth: { signInWithPassword: signIn, signUp, resetPasswordForEmail, updateUser } } }))
import { AuthScreen } from './AuthScreen'

beforeEach(() => localStorage.clear())
afterEach(() => { cleanup(); vi.clearAllMocks() })

describe('AuthScreen remembers the email', () => {
  it('after a successful sign-in, the email is filled in next time', async () => {
    const { container } = render(<AuthScreen />)
    fireEvent.change(container.querySelector('input[type=email]')!, { target: { value: 'alin.s@sahamitproduct.com' } })
    fireEvent.change(container.querySelector('input[type=password]')!, { target: { value: 'secret1' } })
    fireEvent.submit(container.querySelector('form')!)
    await waitFor(() => expect(signIn).toHaveBeenCalled())
    cleanup()
    const again = render(<AuthScreen />)
    expect((again.container.querySelector('input[type=email]') as HTMLInputElement).value).toBe('alin.s@sahamitproduct.com')
  })
  it('the email box is marked as the username, so browsers offer to save the password', () => {
    const { container } = render(<AuthScreen />)
    expect(container.querySelector('input[type=email]')!.getAttribute('autocomplete')).toBe('username')
  })
})

describe('AuthScreen sign-up', () => {
  const fill = (c: HTMLElement, email: string) => {
    fireEvent.change(c.querySelector('input[type=email]')!, { target: { value: email } })
    fireEvent.change(c.querySelector('input[type=password]')!, { target: { value: 'secret1' } })
    fireEvent.submit(c.querySelector('form')!)
  }
  const open = () => fireEvent.click(screen.getByRole('button', { name: 'No account yet? Create one' }))

  it('someone already on the staff list signs up with just email and password', async () => {
    const { container } = render(<AuthScreen />)
    open()
    expect(screen.queryByLabelText('Display name')).toBeNull()
    fill(container, 'ploy@sahamitproduct.com')
    await waitFor(() => expect(signUp).toHaveBeenCalledWith({ email: 'ploy@sahamitproduct.com', password: 'secret1' }))
  })

  it('someone new is asked for their name and department, then the account is created', async () => {
    rpc.mockResolvedValue({ data: 'new', error: null })
    const { container } = render(<AuthScreen />)
    open()
    fill(container, 'new.person@sahamitproduct.com')
    const name = await screen.findByLabelText('Display name')
    expect(signUp).not.toHaveBeenCalled()
    fireEvent.change(name, { target: { value: 'New Person' } })
    fireEvent.change(screen.getByLabelText('Department'), { target: { value: 'MKT' } })
    fireEvent.submit(container.querySelector('form')!)
    await waitFor(() => expect(signUp).toHaveBeenCalledWith({
      email: 'new.person@sahamitproduct.com', password: 'secret1',
      options: { data: { display_name: 'New Person', department: 'MKT' } },
    }))
    rpc.mockResolvedValue({ data: 'listed', error: null })
  })

  it('a disabled email is told so and no account is created', async () => {
    rpc.mockResolvedValueOnce({ data: 'ACCOUNT_DISABLED', error: null })
    const { container } = render(<AuthScreen />)
    open()
    fill(container, 'ta@sahamitproduct.com')
    expect(await screen.findByText(/account has been disabled/)).toBeTruthy()
    expect(signUp).not.toHaveBeenCalled()
  })

  it('a disabled account trying to sign in is told so', async () => {
    signIn.mockResolvedValueOnce({ error: { message: 'User is banned' } })
    const { container } = render(<AuthScreen />)
    fill(container, 'ta@sahamitproduct.com')
    expect(await screen.findByText(/account has been disabled/)).toBeTruthy()
  })
})

describe('AuthScreen forgot password', () => {
  it('emails a reset link to the address typed, which comes back to this page', async () => {
    const { container } = render(<AuthScreen />)
    fireEvent.click(screen.getByRole('button', { name: 'Forgot password' }))
    fireEvent.change(container.querySelector('input[type=email]')!, { target: { value: ' ploy@sahamitproduct.com ' } })
    fireEvent.click(screen.getByRole('button', { name: 'Send reset link' }))
    await waitFor(() => expect(resetPasswordForEmail).toHaveBeenCalledWith('ploy@sahamitproduct.com', { redirectTo: 'https://sw2n.github.io/SHM-room-booking/' }))
    expect(await screen.findByText('Check your email for the reset link.')).toBeTruthy()
    expect(container.querySelector('input[type=password]')).toBeNull()
  })
  it('still mentions that an admin can reset it', () => {
    render(<AuthScreen />)
    fireEvent.click(screen.getByRole('button', { name: 'Forgot password' }))
    expect(screen.getByText(/No email\? An admin can also reset your password/)).toBeTruthy()
  })
})

describe('AuthScreen new password from the email link', () => {
  it('saves the password and clears any temporary-password flag from an admin reset', async () => {
    const { container } = render(<AuthScreen reset />)
    fireEvent.change(container.querySelector('input[type=password]')!, { target: { value: 'newpass1' } })
    fireEvent.submit(container.querySelector('form')!)
    await waitFor(() => expect(updateUser).toHaveBeenCalledWith({ password: 'newpass1' }))
    await waitFor(() => expect(rpc).toHaveBeenCalledWith('password_changed'))
  })
})
