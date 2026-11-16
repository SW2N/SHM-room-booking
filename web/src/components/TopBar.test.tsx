import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

const signOut = vi.hoisted(() => vi.fn())
vi.mock('../state/session', () => ({ useSession: () => ({ lang: 'en', isAdmin: true, profile: { display_name: 'SW Admin' }, signOut }) }))
import { TopBar } from './TopBar'

afterEach(cleanup)

describe('TopBar on a phone', () => {
  it('the ☰ menu holds Admin, Settings and Sign out', () => {
    const onSettings = vi.fn()
    render(<TopBar handedCount={0} onMyBookings={() => {}} onSettings={onSettings} onAdmin={() => {}} />)
    expect(screen.queryByRole('menu')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Menu' }))
    const menu = screen.getByRole('menu')
    expect(within(menu).getByRole('menuitem', { name: 'Admin' })).toBeTruthy()
    fireEvent.click(within(menu).getByRole('menuitem', { name: 'Settings' }))
    expect(onSettings).toHaveBeenCalled()
    expect(screen.queryByRole('menu')).toBeNull()
  })
})
