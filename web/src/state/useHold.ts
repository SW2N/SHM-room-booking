import { useEffect, useState } from 'react'
import { placeHold, releaseHold, renewHold } from '../lib/api'

export type HoldStatus = 'pending' | 'held' | 'blocked' | 'error'

/**
 * Holds a room and time for the person while a form is open: placed on open or when the slot changes,
 * renewed every 60 s (the back end lets an untouched hold lapse after 5 minutes), released on close.
 */
export function useHold(room: string, startIso: string, endIso: string, bookingId?: string, enabled = true) {
  const [status, setStatus] = useState<HoldStatus>('pending')
  const [error, setError] = useState<unknown>(null)

  useEffect(() => {
    if (!enabled || !room || !startIso || !endIso || endIso <= startIso) return
    let holdId: string | null = null
    let closed = false
    setStatus('pending')
    setError(null)
    placeHold(room, startIso, endIso, bookingId)
      .then((h) => {
        if (closed) return void releaseHold(h.id).catch(() => {})
        holdId = h.id
        setStatus('held')
      })
      .catch((e) => {
        if (closed) return
        const code = (e as { message?: string })?.message ?? ''
        setStatus(code === 'ROOM_HELD' || code === 'ROOM_TAKEN' ? 'blocked' : 'error')
        setError(e)
      })
    const timer = setInterval(() => {
      if (holdId) void renewHold(holdId).catch(() => {})
    }, 60_000)
    return () => {
      closed = true
      clearInterval(timer)
      if (holdId) void releaseHold(holdId).catch(() => {})
    }
  }, [room, startIso, endIso, bookingId, enabled])

  return { status, error }
}
