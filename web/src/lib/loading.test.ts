import { afterEach, describe, expect, it, vi } from 'vitest'
import { fetchAllPages, makeKeyedDebouncer } from './loading'

describe('makeKeyedDebouncer', () => {
  afterEach(() => vi.useRealTimers())
  it('runs one pending reload per key, so a holds event never cancels a bookings reload', () => {
    vi.useFakeTimers()
    const later = makeKeyedDebouncer(150)
    const bookings = vi.fn()
    const holds = vi.fn()
    later('bookings', bookings)
    later('holds', holds)
    vi.advanceTimersByTime(200)
    expect(bookings).toHaveBeenCalledTimes(1)
    expect(holds).toHaveBeenCalledTimes(1)
  })
  it('collapses bursts on the same key', () => {
    vi.useFakeTimers()
    const later = makeKeyedDebouncer(150)
    const fn = vi.fn()
    later('bookings', fn)
    later('bookings', fn)
    vi.advanceTimersByTime(200)
    expect(fn).toHaveBeenCalledTimes(1)
  })
})

describe('fetchAllPages', () => {
  it('keeps reading pages until a short page', async () => {
    const page = vi.fn(async (from: number) => ({ data: Array.from({ length: from < 2000 ? 1000 : 3 }, (_, i) => from + i), error: null }))
    const rows = await fetchAllPages(page, 1000)
    expect(rows.length).toBe(2003)
    expect(page).toHaveBeenCalledTimes(3)
  })
  it('throws on an error so the screen can keep what it had', async () => {
    await expect(fetchAllPages(async () => ({ data: null, error: { message: 'offline' } }), 1000)).rejects.toMatchObject({ message: 'offline' })
  })
})
