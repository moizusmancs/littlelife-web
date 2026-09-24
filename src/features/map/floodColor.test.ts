import { describe, expect, it } from 'vitest'
import { RISK_COLOR, confidencePercent, hazardStyle, probabilityToColor } from './floodColor'

describe('probabilityToColor', () => {
  it('hits the ramp’s own stops exactly: near-white green, green, yellow, red', () => {
    expect(probabilityToColor(0)).toBe('rgb(247,252,245)')
    expect(probabilityToColor(0.33)).toBe('rgb(65,171,93)')
    expect(probabilityToColor(0.66)).toBe('rgb(255,255,51)')
    expect(probabilityToColor(1)).toBe('rgb(227,26,28)')
  })

  it('blends linearly between stops', () => {
    // halfway between 0.66 (255,255,51) and 1 (227,26,28) is at 0.83
    const mid = probabilityToColor(0.83)
    const [r, g, b] = mid.match(/\d+/g)!.map(Number)
    expect(r).toBeGreaterThan(227)
    expect(r).toBeLessThan(255)
    expect(g).toBeGreaterThan(26)
    expect(g).toBeLessThan(255)
    expect(b).toBeGreaterThan(28)
    expect(b).toBeLessThan(51)
  })

  it('clamps out-of-range values and treats NaN as 0', () => {
    expect(probabilityToColor(-3)).toBe(probabilityToColor(0))
    expect(probabilityToColor(7)).toBe(probabilityToColor(1))
    expect(probabilityToColor(NaN)).toBe(probabilityToColor(0))
  })
})

describe('hazardStyle', () => {
  it('outlines every zone in its risk colour, whether or not the model gave a confidence', () => {
    expect(hazardStyle({ risk_level: 'high', confidence_score: 0.87 }).color).toBe(RISK_COLOR.high)
    expect(hazardStyle({ risk_level: 'low' }).color).toBe(RISK_COLOR.low)
  })

  it('fills a model zone by its confidence on the ramp, with opacity rising with it', () => {
    const faint = hazardStyle({ risk_level: 'low', confidence_score: 0.04 })
    const strong = hazardStyle({ risk_level: 'high', confidence_score: 0.9 })
    expect(faint.fillColor).toBe(probabilityToColor(0.04))
    expect(strong.fillColor).toBe(probabilityToColor(0.9))
    expect(strong.fillOpacity).toBeGreaterThan(faint.fillOpacity)
    expect(faint.fillOpacity).toBeGreaterThanOrEqual(0.25)
  })

  it('draws a manual zone (no confidence) flat in its risk colour rather than inventing a gradient', () => {
    const manual = hazardStyle({ risk_level: 'medium' })
    expect(manual.fillColor).toBe(RISK_COLOR.medium)
    expect(manual.fillOpacity).toBe(0.35)
  })

  it('draws a selected zone heavier, without ever going fully opaque', () => {
    const normal = hazardStyle({ risk_level: 'high', confidence_score: 1 })
    const selected = hazardStyle({ risk_level: 'high', confidence_score: 1 }, true)
    expect(selected.weight).toBeGreaterThan(normal.weight)
    expect(selected.fillOpacity).toBeGreaterThan(normal.fillOpacity)
    expect(selected.fillOpacity).toBeLessThanOrEqual(0.9)
  })
})

describe('confidencePercent', () => {
  it('rounds to a whole percent and clamps', () => {
    expect(confidencePercent(0.87)).toBe(87)
    expect(confidencePercent(0.808108)).toBe(81)
    expect(confidencePercent(1.4)).toBe(100)
    expect(confidencePercent(-1)).toBe(0)
  })
})
