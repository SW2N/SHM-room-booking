import { cleanup, fireEvent, render, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../state/session', () => ({ useSession: () => ({ lang: 'en', setGuestLang: () => {}, doneRecovering: () => {} }) }))
const signIn = vi.hoisted(() => vi.fn().mockResolvedValue({ error: null }))
vi.mock('../supabase', () => ({ supabase: { auth: { signInWithPassword: signIn } } }))
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
