import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../state/session', () => ({ useSession: () => ({ lang: 'en', setGuestLang: () => {}, doneRecovering: () => {} }) }))
const signIn = vi.hoisted(() => vi.fn().mockResolvedValue({ error: null }))
const signUp = vi.hoisted(() => vi.fn().mockResolvedValue({ error: null }))
const rpc = vi.hoisted(() => vi.fn().mockResolvedValue({ data: 'ok', error: null }))
vi.mock('../supabase', () => ({ supabase: { rpc, auth: { signInWithPassword: signIn, signUp } } }))
import { AuthScreen } from './AuthScreen'

beforeEach(() => localStorage.clear())
afterEach(cleanup)

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

describe('AuthScreen sign-up uses the staff list', () => {
  const fill = (c: HTMLElement, email: string) => {
    fireEvent.change(c.querySelector('input[type=email]')!, { target: { value: email } })
    fireEvent.change(c.querySelector('input[type=password]')!, { target: { value: 'secret1' } })
    fireEvent.submit(c.querySelector('form')!)
  }
  it('asks only for email and password: name and department come from the staff list', () => {
    render(<AuthScreen />)
    fireEvent.click(screen.getByRole('button', { name: 'No account yet? Create one' }))
    expect(screen.queryByLabelText('Display name')).toBeNull()
    expect(screen.queryByLabelText('Department')).toBeNull()
  })
  it('someone not on the staff list is told to ask an admin, and no account is created', async () => {
    rpc.mockResolvedValueOnce({ data: 'NOT_ON_STAFF_LIST', error: null })
    const { container } = render(<AuthScreen />)
    fireEvent.click(screen.getByRole('button', { name: 'No account yet? Create one' }))
    fill(container, 'new.person@sahamitproduct.com')
    expect(await screen.findByText(/isn't on the staff list/)).toBeTruthy()
    expect(rpc).toHaveBeenCalledWith('can_sign_up', { p_email: 'new.person@sahamitproduct.com' })
    expect(signUp).not.toHaveBeenCalled()
  })
  it('a disabled account trying to sign in is told so', async () => {
    signIn.mockResolvedValueOnce({ error: { message: 'User is banned' } })
    const { container } = render(<AuthScreen />)
    fill(container, 'ta@sahamitproduct.com')
    expect(await screen.findByText(/account has been disabled/)).toBeTruthy()
  })
})
