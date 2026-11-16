import { describe, expect, it } from 'vitest'
import { defaultRepeat, skipText, toRule, type RepeatForm } from './recurrence'

const f = (p: Partial<RepeatForm>): RepeatForm => ({ kind: 'weekly', interval: 1, weekdays: [2], until: '2027-01-31', ...p })

describe('toRule', () => {
  it('weekly on Tuesday every 2 weeks', () => {
    expect(toRule(f({ interval: 2 }), '2026-11-24')).toEqual({ ok: true, rule: { freq: 'weekly', interval: 2, weekdays: [2], until: '2027-01-31' } })
  })
  it('monthly from the 31st (the server skips missing dates)', () => {
    expect(toRule(f({ kind: 'monthly', until: '2027-06-30' }), '2026-12-31')).toEqual({ ok: true, rule: { freq: 'monthly', interval: 1, until: '2027-06-30' } })
  })
  it('daily', () => {
    expect(toRule(f({ kind: 'daily' }), '2026-11-24')).toEqual({ ok: true, rule: { freq: 'daily', interval: 1, until: '2027-01-31' } })
  })
  it('rejects an end date before the first date', () => {
    expect(toRule(f({ until: '2026-11-01' }), '2026-11-24')).toEqual({ ok: false, error: 'UNTIL_BEFORE_START' })
  })
  it('rejects weekly with no days', () => {
    expect(toRule(f({ weekdays: [] }), '2026-11-24')).toEqual({ ok: false, error: 'NO_WEEKDAYS' })
  })
  it('rejects an interval of 0', () => {
    expect(toRule(f({ interval: 0 }), '2026-11-24')).toEqual({ ok: false, error: 'BAD_INTERVAL' })
  })
  it('no repeat gives no rule', () => {
    expect(toRule(f({ kind: 'none' }), '2026-11-24')).toEqual({ ok: true, rule: null })
  })
  it('sorts and de-duplicates weekdays', () => {
    expect(toRule(f({ weekdays: [4, 2, 2] }), '2026-11-24')).toMatchObject({ ok: true, rule: { weekdays: [2, 4] } })
  })
})

describe('defaultRepeat', () => {
  it('weekly repeat starts on the first date’s weekday, ending 4 weeks later', () => {
    expect(defaultRepeat('2026-11-26')).toEqual({ kind: 'none', interval: 1, weekdays: [4], until: '2026-12-24' })
  })
})

describe('skipText', () => {
  const en = { lang: 'en' as const, year: 'CE' as const, format: 'long' as const }
  it('a month with no such day says so, naming the month', () => {
    expect(skipText({ date: '2027-02-31', reason: 'BAD_RULE' }, en)).toBe('Feb 2027 · This month has no day 31.')
  })
  it('other reasons show the date and the reason', () => {
    expect(skipText({ date: '2027-01-04', reason: 'HOLIDAY' }, en)).toBe("4 Jan 2027 · Holidays can't be booked.")
  })
})
