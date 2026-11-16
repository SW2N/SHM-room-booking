import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import type { Booking, Hold, Holiday, Room } from '../lib/api'
import { addDays, todayBkk, toTimestamp } from '../lib/dates'
import { fetchAllPages, makeKeyedDebouncer } from '../lib/loading'
import { supabase } from '../supabase'
import { useSession } from './session'

type DataValue = {
  rooms: Room[]
  holidays: Holiday[]
  bookings: Booking[]
  /** The signed-in person's own upcoming bookings, with no date limit. */
  mine: Booking[]
  holds: Hold[]
  loading: boolean
  setRange: (from: string, to: string) => void
  reload: () => Promise<void>
}

const Ctx = createContext<DataValue | null>(null)

/**
 * Loads rooms, holidays, bookings for the visible range and live holds, and keeps them current:
 * any change to bookings or holds by anyone triggers a refetch (Supabase Realtime), so no screen polls.
 */
export function DataProvider({ children }: { children: ReactNode }) {
  const { session, profile } = useSession()
  const myId = profile?.id
  const [rooms, setRooms] = useState<Room[]>([])
  const [holidays, setHolidays] = useState<Holiday[]>([])
  const [bookings, setBookings] = useState<Booking[]>([])
  const [mine, setMine] = useState<Booking[]>([])
  const [holds, setHolds] = useState<Hold[]>([])
  const [loading, setLoading] = useState(true)
  const [range, setRangeState] = useState(() => ({ from: addDays(todayBkk(), -7), to: addDays(todayBkk(), 45) }))
  const rangeRef = useRef(range)
  rangeRef.current = range

  // Each loader keeps what is on screen if the request fails (e.g. a phone waking up offline).
  const loadBookings = useCallback(async () => {
    const { from, to } = rangeRef.current
    try {
      const rows = await fetchAllPages<Booking>((a, b) =>
        supabase
          .from('booking_details')
          .select('*')
          .in('status', ['confirmed', 'checked_in'])
          .gte('starts_at', toTimestamp(from, '00:00'))
          .lt('starts_at', toTimestamp(addDays(to, 1), '00:00'))
          .order('starts_at')
          .order('id')
          .range(a, b),
      )
      setBookings(rows)
    } catch {
      /* keep the previous data */
    }
  }, [])

  const loadMine = useCallback(async () => {
    if (!myId) return
    try {
      const rows = await fetchAllPages<Booking>((a, b) =>
        supabase
          .from('booking_details')
          .select('*')
          .eq('owner_id', myId)
          .in('status', ['confirmed', 'checked_in'])
          .gt('ends_at', new Date().toISOString())
          .order('starts_at')
          .order('id')
          .range(a, b),
      )
      setMine(rows)
    } catch {
      /* keep the previous data */
    }
  }, [myId])

  const loadHolds = useCallback(async () => {
    const { data, error } = await supabase.from('hold_details').select('*').gt('expires_at', new Date().toISOString())
    if (!error) setHolds((data as Hold[]) ?? [])
  }, [])

  const reload = useCallback(async () => {
    await Promise.all([loadBookings(), loadMine(), loadHolds()])
  }, [loadBookings, loadMine, loadHolds])

  useEffect(() => {
    if (!session) return
    let alive = true
    ;(async () => {
      const [r, h] = await Promise.all([
        supabase.from('rooms').select('*').order('sort'),
        supabase.from('holidays').select('*').order('day'),
      ])
      if (!alive) return
      setRooms((r.data as Room[]) ?? [])
      setHolidays((h.data as Holiday[]) ?? [])
      await reload()
      if (alive) setLoading(false)
    })()
    return () => {
      alive = false
    }
  }, [session, reload])

  useEffect(() => {
    if (session) void loadBookings()
  }, [range, session, loadBookings])

  // Live updates: refetch when anyone changes bookings or holds (one pending reload per table), catch up after
  // the connection comes back or the tab becomes visible, and drop lapsed holds from view every 30 s.
  useEffect(() => {
    if (!session) return
    const later = makeKeyedDebouncer(150)
    const channel = supabase
      .channel('live')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'bookings' }, () => {
        later('bookings', () => void loadBookings())
        later('mine', () => void loadMine())
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'holds' }, () => later('holds', () => void loadHolds()))
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') void reload()
      })
    const catchUp = () => {
      if (document.visibilityState === 'visible') void reload()
    }
    document.addEventListener('visibilitychange', catchUp)
    window.addEventListener('online', catchUp)
    const tick = setInterval(() => setHolds((hs) => hs.filter((h) => new Date(h.expires_at) > new Date())), 30_000)
    return () => {
      later.cancelAll()
      clearInterval(tick)
      document.removeEventListener('visibilitychange', catchUp)
      window.removeEventListener('online', catchUp)
      void supabase.removeChannel(channel)
    }
  }, [session, loadBookings, loadMine, loadHolds, reload])

  const setRange = useCallback((from: string, to: string) => {
    setRangeState((r) => (from < r.from || to > r.to ? { from: from < r.from ? from : r.from, to: to > r.to ? to : r.to } : r))
  }, [])

  const value = useMemo(
    () => ({ rooms, holidays, bookings, mine, holds, loading, setRange, reload }),
    [rooms, holidays, bookings, mine, holds, loading, setRange, reload],
  )
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useData(): DataValue {
  const v = useContext(Ctx)
  if (!v) throw new Error('useData outside DataProvider')
  return v
}
