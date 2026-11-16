import type { Rule } from './api'

export type RepeatForm = { kind: 'none' | 'daily' | 'weekly' | 'monthly'; interval: number; weekdays: number[]; until: string }
export type RuleResult = { ok: true; rule: Rule | null } | { ok: false; error: 'UNTIL_BEFORE_START' | 'NO_WEEKDAYS' | 'BAD_INTERVAL' }

/** The repeat section of the booking form → the back end's rule JSON, or the form error to show. */
export function toRule(form: RepeatForm, firstDate: string): RuleResult {
  if (form.kind === 'none') return { ok: true, rule: null }
  if (!Number.isInteger(form.interval) || form.interval < 1) return { ok: false, error: 'BAD_INTERVAL' }
  if (!form.until || form.until < firstDate) return { ok: false, error: 'UNTIL_BEFORE_START' }
  if (form.kind === 'weekly') {
    const weekdays = [...new Set(form.weekdays)].sort((a, b) => a - b)
    if (!weekdays.length) return { ok: false, error: 'NO_WEEKDAYS' }
    return { ok: true, rule: { freq: 'weekly', interval: form.interval, weekdays, until: form.until } }
  }
  return { ok: true, rule: { freq: form.kind, interval: form.interval, until: form.until } }
}
