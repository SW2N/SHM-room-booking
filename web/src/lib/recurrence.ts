import type { Rule } from './api'
import { addDays, type DateOpts, formatDate, formatMonth, isoWeekday } from './dates'
import { errorMessage } from './errors'
import { t } from './i18n'

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

/** The repeat section's starting values: no repeat yet, weekly on the first date's weekday, ending 4 weeks on. */
export function defaultRepeat(firstDate: string): RepeatForm {
  return { kind: 'none', interval: 1, weekdays: [isoWeekday(firstDate)], until: addDays(firstDate, 28) }
}

/** One line for a date a repeat could not book. A monthly repeat from the 29th–31st skips months without that day. */
export function skipText(s: { date: string; reason: string }, opts: DateOpts): string {
  const [y, m, d] = s.date.split('-').map(Number)
  const real = new Date(Date.UTC(y, m - 1, d)).getUTCDate() === d
  if (!real) return `${formatMonth(s.date, opts)} · ${t('noSuchDay', opts.lang).replace('{n}', String(d))}`
  return `${formatDate(s.date, opts)} · ${errorMessage(s.reason, opts.lang)}`
}
