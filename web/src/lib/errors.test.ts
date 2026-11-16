import { describe, expect, it } from 'vitest'
import { errorMessage } from './errors'

describe('errorMessage', () => {
  it('explains a held slot in Thai', () => {
    expect(errorMessage({ message: 'ROOM_HELD' }, 'th')).toContain('กำลังจอง')
  })
  it('explains a held slot in English', () => {
    expect(errorMessage({ message: 'ROOM_HELD' }, 'en')).toBe('Someone is booking this room right now. Pick another time or room.')
  })
  it('falls back to a generic message', () => {
    expect(errorMessage({ message: 'something odd' }, 'en')).toBe('Something went wrong. Try again.')
  })
})
