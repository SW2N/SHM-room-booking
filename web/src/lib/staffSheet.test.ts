import { describe, expect, it } from 'vitest'
import { diffStaff, fromStaff, mergeStaff, sheetToStaff, staffErrors, type StaffEntry } from './staffSheet'

const e = (email: string, display_name: string, department = 'BD', role: 'user' | 'admin' = 'user', active = true): StaffEntry =>
  ({ email, display_name, department, role, active, has_account: false, user_id: null, last_sign_in: null, upcoming: 0, paused_until: null })

describe('sheetToStaff', () => {
  it('finds columns by heading (Thai or English, any order) and reads roles, departments and status loosely', () => {
    const r = sheetToStaff([
      ['ชื่อ', 'Email', 'แผนก', 'Role', 'Status'],
      ['Ploy', ' Ploy.K@SahamitProduct.com ', 'pcb', 'Admin', 'Active'],
      ['Ta', 'ta@sahamitproduct.com', 'Food', 'staff', 'ปิดใช้งาน'],
      ['Nok', 'nok@sahamitproduct.com', 'NF', '', ''],
    ])
    expect(r.rows).toEqual([
      { email: 'ploy.k@sahamitproduct.com', display_name: 'Ploy', department: 'PCB', role: 'admin', active: true },
      { email: 'ta@sahamitproduct.com', display_name: 'Ta', department: 'FOOD', role: 'user', active: false },
      { email: 'nok@sahamitproduct.com', display_name: 'Nok', department: 'NF', role: 'user', active: true },
    ])
    expect(r.bad).toEqual([])
  })
  it('lists rows it cannot use: not a company email, unknown department, no name', () => {
    const r = sheetToStaff([
      ['Email', 'Name', 'Department'],
      ['x@gmail.com', 'X', 'BD'],
      ['y@sahamitproduct.com', 'Y', 'Marketing'],
      ['z@sahamitproduct.com', '', 'BD'],
      ['ok@sahamitproduct.com', 'Ok', 'others'],
    ])
    expect(r.rows.map((x) => x.email)).toEqual(['ok@sahamitproduct.com'])
    expect(r.bad).toEqual([2, 3, 4])
  })
})

describe('mergeStaff', () => {
  it('updates people already listed and adds new ones; nobody is removed', () => {
    const table = fromStaff([e('a@sahamitproduct.com', 'A'), e('b@sahamitproduct.com', 'B')])
    const m = mergeStaff(table, [
      { email: 'b@sahamitproduct.com', display_name: 'B', department: 'HR', role: 'user', active: true },
      { email: 'c@sahamitproduct.com', display_name: 'C', department: 'TA', role: 'user', active: true },
    ])
    expect(m.changed).toBe(1)
    expect(m.added).toBe(1)
    expect(m.rows.map((r) => r.email)).toEqual(['a@sahamitproduct.com', 'b@sahamitproduct.com', 'c@sahamitproduct.com'])
  })
})

describe('staffErrors', () => {
  it('flags a bad email, a missing name and the same email twice', () => {
    const rows = fromStaff([e('a@sahamitproduct.com', 'A')])
    rows.push({ ...rows[0], key: 'n1', orig: null })
    rows.push({ ...rows[0], key: 'n2', orig: null, email: 'x@gmail.com' })
    rows.push({ ...rows[0], key: 'n3', orig: null, email: 'c@sahamitproduct.com', display_name: ' ' })
    expect(staffErrors(rows)).toEqual({ 'a@sahamitproduct.com': 'DUPLICATE_EMAIL', n1: 'DUPLICATE_EMAIL', n2: 'BAD_EMAIL', n3: 'STAFF_NAME_REQUIRED' })
  })
})

describe('diffStaff', () => {
  it('saves only new or changed rows, and names who is being disabled', () => {
    const original = [e('a@sahamitproduct.com', 'A'), e('b@sahamitproduct.com', 'B'), e('c@sahamitproduct.com', 'C', 'BD', 'user', false)]
    const rows = fromStaff(original).map((r) =>
      r.email === 'a@sahamitproduct.com' ? { ...r, active: false } : r.email === 'c@sahamitproduct.com' ? { ...r, active: true } : r)
    rows.push({ ...rows[1], key: 'n1', orig: null, email: 'd@sahamitproduct.com', display_name: 'D', department: 'TA' })
    const d = diffStaff(original, rows)
    expect(d.saves.map((s) => [s.email, s.active])).toEqual([
      ['a@sahamitproduct.com', false], ['c@sahamitproduct.com', true], ['d@sahamitproduct.com', true],
    ])
    expect(d.disabling).toEqual(['a@sahamitproduct.com'])
  })
})
