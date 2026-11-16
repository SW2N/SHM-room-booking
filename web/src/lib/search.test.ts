import { describe, expect, it } from 'vitest'
import { buildingTone } from './search'

describe('buildingTone', () => {
  it('Korn Thong is old-money blue, Academy old-money green', () => {
    expect(buildingTone('Korn Thong')).toBe('kt')
    expect(buildingTone('Academy')).toBe('ac')
  })
})
