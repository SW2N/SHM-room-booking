// Typed wrappers for every back-end call. Each throws the Supabase error unchanged (see errors.ts for messages).
import { supabase } from '../supabase'

export type Room = {
  code: string
  building: 'Academy' | 'Korn Thong'
  name_en: string
  name_th: string
  floor: number
  seats_min: number
  seats_max: number
  size_class: 'S' | 'M' | 'L' | 'XL'
  sort: number
}
export type Holiday = { day: string; name_th: string; name_en: string | null }
export type Booking = {
  id: string
  room_code: string
  owner_id: string
  series_id: string | null
  /** Who set up the series this booking belongs to; null for a one-off booking. */
  series_owner_id: string | null
  title: string
  starts_at: string
  ends_at: string
  status: 'confirmed' | 'checked_in' | 'no_show' | 'cancelled'
  checked_in_at: string | null
  handover_unseen: boolean
  room_name_en: string
  room_name_th: string
  building: string
  floor: number
  owner_name: string
  owner_department: string | null
  owner_email: string
}
export type Hold = {
  id: string
  room_code: string
  starts_at: string
  ends_at: string
  user_id: string
  booking_id: string | null
  expires_at: string
  holder_name: string
}
export type Rule = { freq: 'daily' | 'weekly' | 'monthly'; interval: number; weekdays?: number[]; until: string }
export type SeriesResult = { series_id: string | null; created: string[]; skipped: { date: string; reason: string }[] }

async function rpc<T>(fn: string, args: Record<string, unknown> = {}): Promise<T> {
  const { data, error } = await supabase.rpc(fn, args)
  if (error) throw error
  return data as T
}

export const createBooking = (room: string, start: string, end: string, title: string) =>
  rpc<Booking>('create_booking', { p_room: room, p_starts: start, p_ends: end, p_title: title })
export const updateBooking = (id: string, room: string, start: string, end: string, title: string) =>
  rpc<Booking>('update_booking', { p_id: id, p_room: room, p_starts: start, p_ends: end, p_title: title })
export const cancelBooking = (id: string) => rpc<Booking>('cancel_booking', { p_id: id })
export const createSeries = (room: string, title: string, firstDate: string, start: string, end: string, rule: Rule) =>
  rpc<SeriesResult>('create_series', { p_room: room, p_title: title, p_first_date: firstDate, p_start: start, p_end: end, p_rule: rule })
export const cancelSeries = (seriesId: string) => rpc<number>('cancel_series', { p_series_id: seriesId })
export const checkIn = (id: string) => rpc<Booking>('check_in', { p_id: id })
export const handOver = (id: string, wholeSeries: boolean, email: string) =>
  rpc<number>('hand_over', { p_booking_id: id, p_whole_series: wholeSeries, p_to_email: email })
export const acknowledgeHandovers = (ids: string[]) => rpc<number>('acknowledge_handovers', { p_ids: ids })
export const placeHold = (room: string, start: string, end: string, bookingId?: string) =>
  rpc<Hold>('place_hold', { p_room: room, p_starts: start, p_ends: end, p_booking_id: bookingId ?? null })
export const renewHold = (id: string) => rpc<Hold>('renew_hold', { p_id: id })
export const releaseHold = (id: string) => rpc<void>('release_hold', { p_id: id })
// The signed-in person's access token, kept current so a hold can be released while the page is closing,
// when there is no time to wait for an async lookup.
let accessToken: string | null = null
void supabase.auth.getSession().then(({ data }) => { accessToken = data.session?.access_token ?? accessToken })
supabase.auth.onAuthStateChange((_e, session) => { accessToken = session?.access_token ?? null })

/** Releases a hold as the page closes: a keepalive request outlives the page, unlike a normal one. */
export function releaseHoldOnExit(id: string) {
  if (!accessToken) return
  void fetch(`${import.meta.env.VITE_SUPABASE_URL}/rest/v1/rpc/release_hold`, {
    method: 'POST',
    keepalive: true,
    headers: {
      apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ p_id: id }),
  }).catch(() => {})
}
export const adminLiftBan = (userId: string) => rpc<void>('admin_lift_ban', { p_user: userId })
export const adminRemoveUser = (userId: string) => rpc<void>('admin_remove_user', { p_user: userId })

export async function addHoliday(day: string, nameTh: string, nameEn: string) {
  const { error } = await supabase.from('holidays').insert({ day, name_th: nameTh, name_en: nameEn || null })
  if (error) throw error
}
export async function deleteHoliday(day: string) {
  const { error } = await supabase.from('holidays').delete().eq('day', day)
  if (error) throw error
}
export async function findProfileByEmail(email: string) {
  const { data, error } = await supabase
    .from('profiles')
    .select('id, email, display_name, department')
    .eq('email', email.trim().toLowerCase())
    .maybeSingle()
  if (error) throw error
  return data
}
