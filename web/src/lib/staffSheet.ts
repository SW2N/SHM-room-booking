import { DEPARTMENTS, type Department } from './departments'

/** One person on the staff list, as admin_staff_list() returns it. */
export type StaffEntry = {
  email: string
  display_name: string
  department: string
  role: 'user' | 'admin'
  active: boolean
  has_account: boolean
  user_id: string | null
  last_sign_in: string | null
  upcoming: number
  paused_until: string | null
}
/** The editable part of a row, and what is sent to admin_save_staff(). */
export type StaffInput = Pick<StaffEntry, 'email' | 'display_name' | 'department' | 'role' | 'active'>
/** A table row; `orig` is the person as loaded (null for a new row). */
export type StaffRow = StaffInput & { key: string; orig: StaffEntry | null }
export type StaffError = 'BAD_EMAIL' | 'STAFF_NAME_REQUIRED' | 'DUPLICATE_EMAIL'

const SHM = /^[^\s@]+@sahamitproduct\.com$/
const text = (v: unknown) => (v === null || v === undefined ? '' : String(v).trim())
export const normEmail = (v: unknown) => text(v).toLowerCase()

/** A department from a cell: any case, must be on the fixed list. */
export function parseDepartment(v: unknown): Department | null {
  const d = text(v).toUpperCase()
  return (DEPARTMENTS as readonly string[]).includes(d) ? (d as Department) : null
}
/** Admin or staff from a cell, in Thai or English; empty means staff. */
export function parseRole(v: unknown): 'user' | 'admin' | null {
  const s = text(v).toLowerCase()
  if (!s || ['user', 'staff', 'พนักงาน', 'ผู้ใช้'].includes(s)) return 'user'
  if (['admin', 'ผู้ดูแล', 'ผู้ดูแลระบบ'].includes(s)) return 'admin'
  return null
}
/** Active or disabled from a cell, in Thai or English; empty means active. */
export function parseActive(v: unknown): boolean | null {
  const s = text(v).toLowerCase()
  if (!s) return true
  if (/disabled|inactive|ปิด|ระงับ|ลาออก/.test(s)) return false
  if (/active|ใช้งาน|เปิด/.test(s)) return true
  return null
}

/**
 * People from a sheet's cells. Columns are found by their headings (Thai or English, any order); without
 * headings they are taken as Email, Name, Department, Role, Status. `bad` lists sheet row numbers that can't
 * be used: not a company email, no name, a department not on the list, or an unreadable role or status.
 */
export function sheetToStaff(data: unknown[][]): { rows: StaffInput[]; bad: number[] } {
  const head = (data[0] ?? []).map((c) => text(c).toLowerCase())
  const has = (re: RegExp) => head.findIndex((h) => re.test(h))
  const emailCol = has(/e-?mail|อีเมล/)
  let cols = { email: 0, name: 1, dept: 2, role: 3, status: 4 }
  let first = 0
  if (emailCol >= 0) {
    cols = {
      email: emailCol,
      name: has(/name|ชื่อ/),
      dept: has(/dep|แผนก|ฝ่าย/),
      role: has(/role|บทบาท|สิทธิ์/),
      status: has(/status|สถานะ/),
    }
    first = 1
  }
  const cell = (r: unknown[], i: number) => (i >= 0 ? r[i] : '')
  const rows: StaffInput[] = []
  const bad: number[] = []
  data.slice(first).forEach((r, i) => {
    if (!r || r.every((c) => text(c) === '')) return
    const email = normEmail(cell(r, cols.email))
    const display_name = text(cell(r, cols.name))
    const department = parseDepartment(cell(r, cols.dept))
    const role = parseRole(cell(r, cols.role))
    const active = parseActive(cell(r, cols.status))
    if (!SHM.test(email) || !display_name || !department || !role || active === null) return void bad.push(i + first + 1)
    rows.push({ email, display_name, department, role, active })
  })
  return { rows, bad }
}

export function fromStaff(list: StaffEntry[]): StaffRow[] {
  return list.map((s) => ({ key: s.email, orig: s, email: s.email, display_name: s.display_name, department: s.department, role: s.role, active: s.active }))
}

let seq = 0
export const newStaffRow = (): StaffRow =>
  ({ key: `new-${++seq}`, orig: null, email: '', display_name: '', department: 'OTHERS', role: 'user', active: true })

const same = (a: StaffInput, b: StaffInput) =>
  a.display_name === b.display_name && a.department === b.department && a.role === b.role && a.active === b.active

/** Puts uploaded people into the table by email: listed people are updated, new ones added. Nobody is removed. */
export function mergeStaff(table: StaffRow[], incoming: StaffInput[]): { rows: StaffRow[]; added: number; changed: number } {
  const rows = table.map((r) => ({ ...r }))
  let added = 0
  let changed = 0
  for (const s of incoming) {
    const hit = rows.find((r) => normEmail(r.email) === s.email)
    if (!hit) {
      rows.push({ ...newStaffRow(), ...s })
      added++
    } else if (!same(hit, s)) {
      Object.assign(hit, s)
      changed++
    }
  }
  return { rows, added, changed }
}

/** What is wrong with each row, by row key. */
export function staffErrors(rows: StaffRow[]): Record<string, StaffError> {
  const errs: Record<string, StaffError> = {}
  const seen = new Map<string, number>()
  for (const r of rows) seen.set(normEmail(r.email), (seen.get(normEmail(r.email)) ?? 0) + 1)
  for (const r of rows) {
    if (!SHM.test(normEmail(r.email))) errs[r.key] = 'BAD_EMAIL'
    else if (!r.display_name.trim()) errs[r.key] = 'STAFF_NAME_REQUIRED'
    else if ((seen.get(normEmail(r.email)) ?? 0) > 1) errs[r.key] = 'DUPLICATE_EMAIL'
  }
  return errs
}

/** Rows to save (new or changed), and the emails of people being switched from active to disabled. */
export function diffStaff(original: StaffEntry[], rows: StaffRow[]): { saves: StaffInput[]; disabling: string[] } {
  const byEmail = new Map(original.map((s) => [s.email, s]))
  const saves: StaffInput[] = []
  const disabling: string[] = []
  for (const r of rows) {
    const s: StaffInput = { email: normEmail(r.email), display_name: r.display_name.trim(), department: r.department, role: r.role, active: r.active }
    const was = byEmail.get(s.email)
    if (!was || !same(was, s)) saves.push(s)
    if (was?.active && !s.active) disabling.push(s.email)
  }
  return { saves, disabling }
}
