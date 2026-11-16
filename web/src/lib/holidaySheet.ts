import type { Holiday } from './api'

/** One row of the holiday table. `orig` is the date the row had when loaded (null for a new row). */
export type HolidayRow = { key: string; orig: string | null; day: string; name_th: string; name_en: string }
export type SheetRow = { day: string; name_th: string; name_en: string }
export type RowError = 'NAME_REQUIRED' | 'DUPLICATE_DATE' | 'DATE_REQUIRED'

const EN_MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec']
const TH_SHORT = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.']
const TH_LONG = ['มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน', 'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม']
const strip = (s: string) => s.replace(/\./g, '').trim()

function iso(y: number, m: number, d: number): string | null {
  const dt = new Date(Date.UTC(y, m - 1, d))
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return null
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`
}

// A 4-digit year above 2400 is Buddhist. A 2-digit year is Buddhist with a Thai month name, Western otherwise.
function fullYear(raw: string, thai: boolean): number {
  const n = Number(raw)
  if (raw.length <= 2) return thai ? 2500 + n - 543 : 2000 + n
  return n > 2400 ? n - 543 : n
}

function monthOf(name: string): { m: number; thai: boolean } | null {
  const s = strip(name).toLowerCase()
  const en = EN_MONTHS.findIndex((x) => s.startsWith(x))
  if (en >= 0) return { m: en + 1, thai: false }
  const th = TH_SHORT.findIndex((x) => strip(x) === s)
  if (th >= 0) return { m: th + 1, thai: true }
  const thl = TH_LONG.indexOf(s)
  return thl >= 0 ? { m: thl + 1, thai: true } : null
}

/** A date from a spreadsheet cell: an Excel date or serial number, or text in the formats the company uses. */
export function parseHolidayDate(v: unknown): string | null {
  if (v instanceof Date) return isNaN(v.getTime()) ? null : iso(v.getUTCFullYear(), v.getUTCMonth() + 1, v.getUTCDate())
  if (typeof v === 'number') {
    if (!Number.isFinite(v) || v < 1) return null
    const dt = new Date(Date.UTC(1899, 11, 30) + Math.floor(v) * 86_400_000)
    return iso(dt.getUTCFullYear(), dt.getUTCMonth() + 1, dt.getUTCDate())
  }
  if (typeof v !== 'string') return null
  const s = v.trim()
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/)
  if (m) return iso(fullYear(m[1], false), Number(m[2]), Number(m[3]))
  m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})$/)
  if (m) return iso(fullYear(m[3], false), Number(m[2]), Number(m[1]))
  m = s.match(/^(\d{1,2})[\s-]+([^\s\d-]+)[\s-]+(\d{2}|\d{4})$/)
  if (m) {
    const mon = monthOf(m[2])
    return mon ? iso(fullYear(m[3], mon.thai), mon.m, Number(m[1])) : null
  }
  return null
}

const text = (v: unknown) => (v === null || v === undefined ? '' : v instanceof Date ? '' : String(v).trim())

/**
 * Holiday rows from a sheet's cells. Columns are found by their headings (date / Thai / English, in either
 * language); without headings they are taken as date, Thai name, English name. `bad` lists sheet row numbers
 * that have content but no readable date or no Thai name.
 */
export function sheetToRows(data: unknown[][]): { rows: SheetRow[]; bad: number[] } {
  let cols = { day: 0, th: 1, en: 2 }
  let first = 0
  const head = (data[0] ?? []).map((c) => text(c).toLowerCase())
  if (data.length && parseHolidayDate(data[0]?.[0]) === null && head.some((h) => /date|วัน/.test(h))) {
    const find = (re: RegExp, fallback: number) => {
      const i = head.findIndex((h) => re.test(h))
      return i >= 0 ? i : fallback
    }
    const day = find(/date|วันที่/, 0)
    const en = find(/english|eng|อังกฤษ/, 2)
    const th = head.findIndex((h, i) => i !== day && i !== en && /thai|ไทย|name|ชื่อ/.test(h))
    cols = { day, th: th >= 0 ? th : 1, en }
    first = 1
  }
  const rows: SheetRow[] = []
  const bad: number[] = []
  data.slice(first).forEach((r, i) => {
    if (!r || r.every((c) => text(c) === '' && !(c instanceof Date))) return
    const day = parseHolidayDate(r[cols.day])
    const name_th = text(r[cols.th])
    if (!day || !name_th) return void bad.push(i + first + 1)
    rows.push({ day, name_th, name_en: text(r[cols.en]) })
  })
  return { rows, bad }
}

export function fromHolidays(holidays: Holiday[]): HolidayRow[] {
  return holidays.map((h) => ({ key: h.day, orig: h.day, day: h.day, name_th: h.name_th, name_en: h.name_en ?? '' }))
}

let seq = 0
export const newRow = (day = ''): HolidayRow => ({ key: `new-${++seq}`, orig: null, day, name_th: '', name_en: '' })

/** Puts uploaded rows into the table: a date already listed gets the new names, a new date is added. */
export function mergeRows(table: HolidayRow[], incoming: SheetRow[]): { rows: HolidayRow[]; added: number; changed: number } {
  const rows = table.map((r) => ({ ...r }))
  let added = 0
  let changed = 0
  for (const s of incoming) {
    const hit = rows.find((r) => r.day === s.day)
    if (!hit) {
      rows.push({ ...newRow(s.day), name_th: s.name_th, name_en: s.name_en })
      added++
    } else if (hit.name_th !== s.name_th || hit.name_en !== s.name_en) {
      hit.name_th = s.name_th
      hit.name_en = s.name_en
      changed++
    }
  }
  rows.sort((a, b) => (a.day || '9999').localeCompare(b.day || '9999'))
  return { rows, added, changed }
}

/** What is wrong with each row, by row key: no date, no Thai name, or a date used twice. */
export function tableErrors(rows: HolidayRow[]): Record<string, RowError> {
  const errs: Record<string, RowError> = {}
  const seen = new Map<string, number>()
  for (const r of rows) if (r.day) seen.set(r.day, (seen.get(r.day) ?? 0) + 1)
  for (const r of rows) {
    if (!r.day) errs[r.key] = 'DATE_REQUIRED'
    else if (!r.name_th.trim()) errs[r.key] = 'NAME_REQUIRED'
    else if ((seen.get(r.day) ?? 0) > 1) errs[r.key] = 'DUPLICATE_DATE'
  }
  return errs
}

/** The writes that turn the original holidays into the table: rows to save, and dates to delete. */
export function diffHolidays(original: Holiday[], rows: HolidayRow[]): { upserts: Holiday[]; deletes: string[] } {
  const byDay = new Map(original.map((h) => [h.day, h]))
  const upserts: Holiday[] = []
  for (const r of rows) {
    const h: Holiday = { day: r.day, name_th: r.name_th.trim(), name_en: r.name_en.trim() || null }
    const was = r.orig ? byDay.get(r.orig) : undefined
    if (!was || was.day !== h.day || was.name_th !== h.name_th || (was.name_en ?? null) !== h.name_en) upserts.push(h)
  }
  const kept = new Set(rows.map((r) => r.day))
  const deletes = original.map((h) => h.day).filter((d) => !kept.has(d))
  upserts.sort((a, b) => a.day.localeCompare(b.day))
  return { upserts, deletes: deletes.sort() }
}
