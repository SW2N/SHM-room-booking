import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import type { Booking, Hold, Holiday, Room } from '../lib/api'
import { addDays, todayBkk, toTimestamp } from '../lib/dates'
import { supabase } from '../supabase'
import { useSession } from './session'

type DataValue = {
  rooms: Room[]
  holidays: Holiday[]
  bookings: Booking[]
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
  const { session } = useSession()
  const [rooms, setRooms] = useState<Room[]>([])
  const [holidays, setHolidays] = useState<Holiday[]>([])
  const [bookings, setBookings] = useState<Booking[]>([])
  const [holds, setHolds] = useState<Hold[]>([])
  const [loading, setLoading] = useState(true)
  const [range, setRangeState] = useState(() => ({ from: addDays(todayBkk(), -7), to: addDays(todayBkk(), 45) }))
  const rangeRef = useRef(range)
  rangeRef.current = range

  const loadBookings = useCallback(async () => {
    const { from, to } = rangeRef.current
    const { data } = await supabase
      .from('booking_details')
      .select('*')
      .gte('starts_at', toTimestamp(from, '00:00'))
      .lt('starts_at', toTimestamp(addDays(to, 1), '00:00'))
      .order('starts_at')
    setBookings((data as Booking[]) ?? [])
  }, [])

  const loadHolds = useCallback(async () => {
    const { data } = await supabase.from('hold_details').select('*').gt('expires_at', new Date().toISOString())
    setHolds((data as Hold[]) ?? [])
  }, [])

  const reload = useCallback(async () => {
    await Promise.all([loadBookings(), loadHolds()])
  }, [loadBookings, loadHolds])

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

  // Live updates: refetch when anyone changes bookings or holds; drop expired holds from view every 30 s.
  useEffect(() => {
    if (!session) return
    let timer: ReturnType<typeof setTimeout> | undefined
    const soon = (fn: () => Promise<void>) => {
      clearTimeout(timer)
      timer = setTimeout(() => void fn(), 150)
    }
    const channel = supabase
      .channel('live')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'bookings' }, () => soon(loadBookings))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'holds' }, () => soon(loadHolds))
      .subscribe()
    const tick = setInterval(() => setHolds((hs) => hs.filter((h) => new Date(h.expires_at) > new Date())), 30_000)
    return () => {
      clearTimeout(timer)
      clearInterval(tick)
      void supabase.removeChannel(channel)
    }
  }, [session, loadBookings, loadHolds])

  const setRange = useCallback((from: string, to: string) => {
    setRangeState((r) => (from < r.from || to > r.to ? { from: from < r.from ? from : r.from, to: to > r.to ? to : r.to } : r))
  }, [])

  const value = useMemo(
    () => ({ rooms, holidays, bookings, holds, loading, setRange, reload }),
    [rooms, holidays, bookings, holds, loading, setRange, reload],
  )
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useData(): DataValue {
  const v = useContext(Ctx)
  if (!v) throw new Error('useData outside DataProvider')
  return v
}
