import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const api = vi.hoisted(() => ({
  placeHold: vi.fn(),
  renewHold: vi.fn(),
  releaseHold: vi.fn(),
}))
vi.mock('../lib/api', () => api)
import { useHold } from './useHold'

const S = '2026-11-24T10:00:00+07:00'
const E = '2026-11-24T11:00:00+07:00'

describe('useHold', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    api.placeHold.mockResolvedValue({ id: 'h1' })
    api.renewHold.mockResolvedValue({ id: 'h1' })
    api.releaseHold.mockResolvedValue(undefined)
  })
  afterEach(() => {
    vi.useRealTimers()
    vi.clearAllMocks()
  })

  it('places once, renews every 60 s and releases on close', async () => {
    const { result, unmount } = renderHook(() => useHold('KT5-1', S, E))
    await act(async () => {})
    expect(api.placeHold).toHaveBeenCalledTimes(1)
    expect(result.current.status).toBe('held')
    await act(async () => { vi.advanceTimersByTime(60_000) })
    expect(api.renewHold).toHaveBeenCalledWith('h1')
    unmount()
    expect(api.releaseHold).toHaveBeenCalledWith('h1')
  })

  it("reports blocked when someone else is booking the slot", async () => {
    api.placeHold.mockRejectedValue({ message: 'ROOM_HELD' })
    const { result } = renderHook(() => useHold('KT5-1', S, E))
    await act(async () => {})
    expect(result.current.status).toBe('blocked')
  })
})
