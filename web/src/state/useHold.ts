import { useEffect, useState } from 'react'
import { placeHold, releaseHold, releaseHoldOnExit, renewHold } from '../lib/api'

export type HoldStatus = 'pending' | 'held' | 'blocked' | 'error'

const RENEW_MS = 60_000
const RETRY_MS = 10_000
const codeOf = (e: unknown) => (e as { message?: string })?.message ?? ''

/**
 * Holds a room and time for the person while a form is open: placed on open or when the slot changes,
 * renewed every 60 s (the back end lets an untouched hold lapse after 5 minutes), released on close.
 * While someone else holds the slot it tries again every 10 s, so the form unlocks once they leave.
 * Closing the tab or leaving the page releases the hold too.
 */
export function useHold(room: string, startIso: string, endIso: string, bookingId?: string, enabled = true) {
  const [status, setStatus] = useState<HoldStatus>('pending')
  const [error, setError] = useState<unknown>(null)

  useEffect(() => {
    if (!enabled || !room || !startIso || !endIso || endIso <= startIso) return
    let holdId: string | null = null
    let closed = false
    let placing = false
    let blocked = false
    setStatus('pending')
    setError(null)

    const fail = (e: unknown) => {
      if (closed) return
      blocked = codeOf(e) === 'ROOM_HELD' || codeOf(e) === 'ROOM_TAKEN'
      setStatus(blocked ? 'blocked' : 'error')
      setError(e)
    }
    const place = () => {
      placing = true
      placeHold(room, startIso, endIso, bookingId)
        .then((h) => {
          if (closed) return void releaseHold(h.id).catch(() => {})
          holdId = h.id
          blocked = false
          setStatus('held')
          setError(null)
        })
        .catch(fail)
        .finally(() => { placing = false })
    }
    place()

    const renew = setInterval(() => {
      if (!holdId) return
      const id = holdId
      renewHold(id).catch((e) => {
        if (codeOf(e) === 'HOLD_EXPIRED') return fail(e)
        // The hold lapsed or was cleared: try to take the slot again.
        holdId = null
        place()
      })
    }, RENEW_MS)
    const retry = setInterval(() => {
      if (blocked && !holdId && !placing) place()
    }, RETRY_MS)
    const onExit = () => {
      if (holdId) releaseHoldOnExit(holdId)
    }
    window.addEventListener('pagehide', onExit)

    return () => {
      closed = true
      clearInterval(renew)
      clearInterval(retry)
      window.removeEventListener('pagehide', onExit)
      if (holdId) void releaseHold(holdId).catch(() => {})
    }
  }, [room, startIso, endIso, bookingId, enabled])

  return { status, error }
}
