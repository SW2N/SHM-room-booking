import { describe, expect, it } from 'vitest'
import { blockPosition, slotAt, hourBand } from './timeline'

describe('timeline', () => {
  it('places 08:00–09:00 at the start', () => {
    const p = blockPosition('2026-11-24T08:00:00+07:00', '2026-11-24T09:00:00+07:00')
    expect(p.left).toBeCloseTo(0, 2)
    expect(p.width).toBeCloseTo(8.333, 2)
  })
  it('places 19:30–20:00 at the end', () => {
    const p = blockPosition('2026-11-24T19:30:00+07:00', '2026-11-24T20:00:00+07:00')
    expect(p.left).toBeCloseTo(95.833, 2)
    expect(p.width).toBeCloseTo(4.167, 2)
  })
  it('clamps a block running past 20:00', () => {
    const p = blockPosition('2026-11-24T19:00:00+07:00', '2026-11-24T21:00:00+07:00')
    expect(p.left + p.width).toBeCloseTo(100, 2)
  })
  it('finds the 30-minute slot under a click', () => {
    expect(slotAt(50)).toBe('14:00')
    expect(slotAt(99.9)).toBe('19:30')
    expect(slotAt(0)).toBe('08:00')
  })
})

describe('hourBand', () => {
  it('alternates by hour: 9:00 light, 10:00 shaded, 11:00 light', () => {
    expect([8, 9, 10, 11, 19].map(hourBand)).toEqual(['hour-shade', 'hour-light', 'hour-shade', 'hour-light', 'hour-light'])
  })
})
