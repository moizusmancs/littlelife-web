import { describe, expect, it } from 'vitest'
import { isOnScale, isScored, scorePercent } from './score'

describe('isScored', () => {
  it('is true only when the backend sent an updated_at — the mark of a stored row', () => {
    expect(isScored({ account_id: 'a', score: 42, updated_at: '2026-09-18T00:10:05Z' })).toBe(true)
    expect(isScored({ account_id: 'a', score: 0, updated_at: '2026-09-18T00:10:05Z' })).toBe(true) // a real score of zero
  })

  it('is false for the implicit zero of an account never scored, and while there is no answer yet', () => {
    expect(isScored({ account_id: 'a', score: 0 })).toBe(false)
    expect(isScored(undefined)).toBe(false)
  })
})

describe('scorePercent / isOnScale', () => {
  it('fills by the score, and stops at the ends of the scale', () => {
    expect(scorePercent(42)).toBe(42)
    expect(scorePercent(-5)).toBe(0)
    expect(scorePercent(250)).toBe(100)
  })

  it('knows a score outside 0–100 is not "out of 100"', () => {
    expect(isOnScale(0)).toBe(true)
    expect(isOnScale(100)).toBe(true)
    expect(isOnScale(-1)).toBe(false)
    expect(isOnScale(101)).toBe(false)
  })
})
