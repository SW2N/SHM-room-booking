import { describe, expect, it } from 'vitest'
import { SLOTS, bkkDate, bkkTime, formatDate, formatMonth, toTimestamp } from './dates'

describe('dates', () => {
  it('formats Thai long with Buddhist year', () => {
    expect(formatDate('2026-11-24', { lang: 'th', year: 'BE', format: 'long' })).toBe('24-พ.ย.-69')
  })
  it('formats English numeric with Western year', () => {
    expect(formatDate('2026-11-24', { lang: 'en', year: 'CE', format: 'numeric' })).toBe('24/11/2026')
  })
  it('formats Thai numeric with Buddhist year', () => {
    expect(formatDate('2026-11-24', { lang: 'th', year: 'BE', format: 'numeric' })).toBe('24/11/2569')
  })
  it('the two formats the company uses: d-MMM-yy and d/m/yyyy, no leading zeros', () => {
    expect(formatDate('1998-04-07', { lang: 'en', year: 'CE', format: 'long' })).toBe('7-Apr-98')
    expect(formatDate('1998-04-07', { lang: 'th', year: 'BE', format: 'long' })).toBe('7-เม.ย.-41')
    expect(formatDate('1998-04-07', { lang: 'en', year: 'CE', format: 'numeric' })).toBe('7/4/1998')
    expect(formatDate('1998-04-07', { lang: 'th', year: 'BE', format: 'numeric' })).toBe('7/4/2541')
  })
  it('a month in the same two formats', () => {
    expect(formatMonth('2026-11-01', { lang: 'en', year: 'CE', format: 'long' })).toBe('Nov-26')
    expect(formatMonth('2026-11-01', { lang: 'th', year: 'BE', format: 'numeric' })).toBe('11/2569')
  })
  it('builds a Bangkok timestamp', () => {
    expect(toTimestamp('2026-11-24', '08:00')).toBe('2026-11-24T08:00:00+07:00')
  })
  it('reads Bangkok time whatever the browser time zone', () => {
    expect(bkkTime('2026-11-24T01:00:00Z')).toBe('08:00')
  })
  it('crosses midnight into the Bangkok date', () => {
    expect(bkkDate('2026-12-30T17:30:00Z')).toBe('2026-12-31')
  })
  it('has 30-minute slots from 08:00 to 20:00', () => {
    expect(SLOTS.length).toBe(25)
    expect(SLOTS[0]).toBe('08:00')
    expect(SLOTS[24]).toBe('20:00')
  })
})
