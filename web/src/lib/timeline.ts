import { SLOTS, bkkTime } from './dates'

const DAY_START = 8 * 60
const DAY_LEN = 12 * 60

function minutes(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number)
  return h * 60 + m
}

/** Left offset and width, in % of the 08:00–20:00 day, for a block (Bangkok time), clamped to the day. */
export function blockPosition(startIso: string, endIso: string): { left: number; width: number } {
  const s = Math.max(0, Math.min(DAY_LEN, minutes(bkkTime(startIso)) - DAY_START))
  const endMin = minutes(bkkTime(endIso)) - DAY_START
  const e = Math.max(s, Math.min(DAY_LEN, endMin <= -DAY_START ? DAY_LEN : endMin))
  return { left: (s / DAY_LEN) * 100, width: ((e - s) / DAY_LEN) * 100 }
}

/** The 30-minute slot start under a horizontal position (0–100 %). */
export function slotAt(xPercent: number): string {
  const i = Math.min(SLOTS.length - 2, Math.max(0, Math.floor((xPercent / 100) * (DAY_LEN / 30))))
  return SLOTS[i]
}

/** Alternating hour stripes so rows are easy to follow: 9:00 light, 10:00 shaded, 11:00 light, and so on. */
export function hourBand(hour: number): 'hour-light' | 'hour-shade' {
  return hour % 2 === 0 ? 'hour-shade' : 'hour-light'
}
