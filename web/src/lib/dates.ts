// Bangkok time helpers. All times shown and chosen in the app are Asia/Bangkok, whatever the browser's zone.
export const TZ = 'Asia/Bangkok'
export type Lang = 'th' | 'en'
export type DateOpts = { lang: Lang; year: 'BE' | 'CE'; format: 'long' | 'numeric' }

const TH_MONTHS = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.']
const EN_MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const TH_DAYS = ['อา.', 'จ.', 'อ.', 'พ.', 'พฤ.', 'ศ.', 'ส.']
const EN_DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

const dateFmt = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' })
const timeFmt = new Intl.DateTimeFormat('en-GB', { timeZone: TZ, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })

/** Bangkok calendar date of a moment, as YYYY-MM-DD. */
export function bkkDate(ts: Date | string): string {
  return dateFmt.format(new Date(ts))
}

/** Bangkok clock time of a moment, as HH:MM. */
export function bkkTime(ts: Date | string): string {
  return timeFmt.format(new Date(ts))
}

/** A Bangkok date + HH:MM as an ISO timestamp with +07:00. */
export function toTimestamp(date: string, hhmm: string): string {
  return `${date}T${hhmm}:00+07:00`
}

/** 30-minute steps from 08:00 to 20:00. */
export const SLOTS: string[] = Array.from({ length: 25 }, (_, i) => {
  const m = 8 * 60 + i * 30
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`
})

export function todayBkk(): string {
  return bkkDate(new Date())
}

export function addDays(date: string, n: number): string {
  const d = new Date(`${date}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}

/** ISO weekday 1 (Mon) … 7 (Sun) of a YYYY-MM-DD date. */
export function isoWeekday(date: string): number {
  const d = new Date(`${date}T00:00:00Z`).getUTCDay()
  return d === 0 ? 7 : d
}

const yy = (year: number) => String(year % 100).padStart(2, '0')

/** The company's two date formats: d-MMM-yy (7-Apr-98, 7-เม.ย.-41) or d/m/yyyy (7/4/1998, 7/4/2541). */
export function formatDate(date: string, opts: DateOpts): string {
  const [y, m, d] = date.split('-').map(Number)
  const year = y + (opts.year === 'BE' ? 543 : 0)
  if (opts.format === 'numeric') return `${d}/${m}/${year}`
  return `${d}-${(opts.lang === 'th' ? TH_MONTHS : EN_MONTHS)[m - 1]}-${yy(year)}`
}

/** A month in the same two formats: MMM-yy (Nov-26) or mm/yyyy (11/2569). */
export function formatMonth(date: string, opts: DateOpts): string {
  const [y, m] = date.split('-').map(Number)
  const year = y + (opts.year === 'BE' ? 543 : 0)
  if (opts.format === 'numeric') return `${String(m).padStart(2, '0')}/${year}`
  return `${(opts.lang === 'th' ? TH_MONTHS : EN_MONTHS)[m - 1]}-${yy(year)}`
}

export function weekdayName(date: string, lang: Lang): string {
  const i = isoWeekday(date) % 7
  return (lang === 'th' ? TH_DAYS : EN_DAYS)[i]
}

export function formatRange(startIso: string, endIso: string, opts: DateOpts): string {
  const day = bkkDate(startIso)
  return `${weekdayName(day, opts.lang)} ${formatDate(day, opts)} ${bkkTime(startIso)}–${bkkTime(endIso)}`
}
