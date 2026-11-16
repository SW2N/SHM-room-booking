import { describe, expect, it } from 'vitest'
import { diffHolidays, fromHolidays, mergeRows, parseHolidayDate, sheetToRows, tableErrors } from './holidaySheet'

describe('parseHolidayDate', () => {
  it('reads Excel date cells and Excel serial numbers', () => {
    expect(parseHolidayDate(new Date(Date.UTC(2027, 3, 13)))).toBe('2027-04-13')
    expect(parseHolidayDate(46490)).toBe('2027-04-13')
  })
  it('reads the company formats in Thai or English, Buddhist or Western years', () => {
    expect(parseHolidayDate('13/4/2027')).toBe('2027-04-13')
    expect(parseHolidayDate('13/4/2570')).toBe('2027-04-13')
    expect(parseHolidayDate('13-Apr-27')).toBe('2027-04-13')
    expect(parseHolidayDate('13-เม.ย.-70')).toBe('2027-04-13')
    expect(parseHolidayDate('13 เมษายน 2570')).toBe('2027-04-13')
    expect(parseHolidayDate('2027-04-13')).toBe('2027-04-13')
  })
  it('rejects text that is not a real date', () => {
    expect(parseHolidayDate('31/2/2027')).toBeNull()
    expect(parseHolidayDate('Songkran')).toBeNull()
    expect(parseHolidayDate(null)).toBeNull()
  })
})

describe('sheetToRows', () => {
  it('finds the columns by their headings and reports rows it cannot read', () => {
    const r = sheetToRows([
      ['English name', 'Date', 'Thai name'],
      ['Songkran', '13/4/2570', 'วันสงกรานต์'],
      [null, null, null],
      ['Bad', 'someday', 'ผิด'],
      ['No Thai', '14/4/2570', ''],
    ])
    expect(r.rows).toEqual([{ day: '2027-04-13', name_th: 'วันสงกรานต์', name_en: 'Songkran' }])
    expect(r.bad).toEqual([4, 5])
  })
  it('without headings, takes date, Thai name, English name in that order', () => {
    expect(sheetToRows([[new Date(Date.UTC(2027, 0, 1)), 'วันขึ้นปีใหม่', "New Year's Day"]]).rows)
      .toEqual([{ day: '2027-01-01', name_th: 'วันขึ้นปีใหม่', name_en: "New Year's Day" }])
  })
})

const h = (day: string, name_th: string, name_en: string | null = null) => ({ day, name_th, name_en })

describe('mergeRows', () => {
  it('updates names on dates already listed and adds new dates, in date order', () => {
    const table = fromHolidays([h('2027-01-01', 'ปีใหม่'), h('2027-04-13', 'สงกรานต์')])
    const m = mergeRows(table, [{ day: '2027-04-13', name_th: 'วันสงกรานต์', name_en: 'Songkran' }, { day: '2027-02-10', name_th: 'มาฆบูชา', name_en: '' }])
    expect(m.added).toBe(1)
    expect(m.changed).toBe(1)
    expect(m.rows.map((r) => r.day)).toEqual(['2027-01-01', '2027-02-10', '2027-04-13'])
  })
})

describe('tableErrors', () => {
  it('flags a missing Thai name and the same date twice', () => {
    const rows = fromHolidays([h('2027-01-01', 'ปีใหม่')])
    rows.push({ key: 'n1', orig: null, day: '2027-01-01', name_th: '', name_en: '' })
    expect(tableErrors(rows)).toEqual({ n1: 'NAME_REQUIRED', '2027-01-01': 'DUPLICATE_DATE' })
  })
})

describe('diffHolidays', () => {
  const original = [h('2027-01-01', 'ปีใหม่'), h('2027-04-13', 'สงกรานต์'), h('2027-05-01', 'แรงงาน')]
  it('saves new and changed rows, deletes removed ones, and moves a row whose date changed', () => {
    const rows = fromHolidays(original)
      .filter((r) => r.day !== '2027-05-01')
      .map((r) => (r.day === '2027-04-13' ? { ...r, day: '2027-04-14' } : r))
    rows.push({ key: 'n1', orig: null, day: '2027-12-31', name_th: 'สิ้นปี', name_en: "New Year's Eve" })
    expect(diffHolidays(original, rows)).toEqual({
      upserts: [h('2027-04-14', 'สงกรานต์'), h('2027-12-31', 'สิ้นปี', "New Year's Eve")],
      deletes: ['2027-04-13', '2027-05-01'],
    })
  })
  it('no edits, nothing to save', () => {
    expect(diffHolidays(original, fromHolidays(original))).toEqual({ upserts: [], deletes: [] })
  })
})
