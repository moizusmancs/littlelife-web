import { describe, expect, it } from 'vitest'
import { getInitials } from './utils'

describe('getInitials', () => {
  it('takes the first letter of the first two words, uppercased', () => {
    expect(getInitials('Hina Khan')).toBe('HK')
    expect(getInitials('al-khidmat foundation karachi')).toBe('AF')
  })

  it('handles a single word and stray whitespace', () => {
    expect(getInitials('Madonna')).toBe('M')
    expect(getInitials('  Hina   Khan  ')).toBe('HK')
  })

  it('returns an empty string for a blank name', () => {
    expect(getInitials('')).toBe('')
    expect(getInitials('   ')).toBe('')
  })
})
