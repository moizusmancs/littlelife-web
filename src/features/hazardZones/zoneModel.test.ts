import { describe, expect, it } from 'vitest'
import { detailToOverlayEntry, isReversedRange, rangeToParams, shortId, viewportBoundaryText, zoneTitle, zoneToOverlayEntry } from './zoneModel'
import { makeAdminZone, makeZoneDetail } from './testZones'

describe('zoneTitle', () => {
  it('calls a model zone a flood zone and a declared one a hazard zone, at its level', () => {
    expect(zoneTitle({ risk_level: 'high', source: 'ai_prediction' })).toBe('High-risk flood zone')
    expect(zoneTitle({ risk_level: 'low', source: 'manual_admin' })).toBe('Low-risk hazard zone')
    expect(zoneTitle({ risk_level: 'medium', source: 'manual_ngo' })).toBe('Medium-risk hazard zone')
  })

  it('tells zones apart by the start of their id', () => {
    expect(shortId('b7e1a2c3-1111-2222-3333-444455556666')).toBe('b7e1a2c3')
  })
})

describe('the date range', () => {
  it('turns each date into the start or end of that day, as RFC 3339', () => {
    const { from, to } = rangeToParams({ from: '2026-09-24', to: '2026-09-25' })
    expect(new Date(from as string).getTime()).toBe(new Date('2026-09-24T00:00:00').getTime())
    expect(new Date(to as string).getTime()).toBe(new Date('2026-09-25T23:59:59.999').getTime())
    expect(from).toMatch(/Z$/)
  })

  it('sends only what is set, and leaves out anything that is not a real date', () => {
    expect(rangeToParams({ from: '', to: '' })).toEqual({})
    expect(Object.keys(rangeToParams({ from: '2026-09-24', to: '' }))).toEqual(['from'])
    expect(rangeToParams({ from: '2026-13-45', to: 'yesterday' })).toEqual({})
  })

  it('knows a range that runs backwards, and only then', () => {
    expect(isReversedRange({ from: '2026-09-25', to: '2026-09-24' })).toBe(true)
    expect(isReversedRange({ from: '2026-09-24', to: '2026-09-24' })).toBe(false)
    expect(isReversedRange({ from: '2026-09-24', to: '' })).toBe(false)
  })
})

describe('viewportBoundaryText', () => {
  it('writes the visible box as a closed counter-clockwise Polygon to four decimals', () => {
    const geometry = JSON.parse(viewportBoundaryText({ west: 68.123456, south: 27.1, east: 69.5, north: 28.98761 }))
    expect(geometry).toEqual({ type: 'Polygon', coordinates: [[[68.1235, 27.1], [69.5, 27.1], [69.5, 28.9876], [68.1235, 28.9876], [68.1235, 27.1]]] })
  })
})

describe('map entries', () => {
  it('turns a table zone into the map’s entry — no confidence, since the table carries none', () => {
    const entry = zoneToOverlayEntry(makeAdminZone('z1', { risk_level: 'medium' }))
    expect(entry).toMatchObject({ hazard_zone_id: 'z1', risk_level: 'medium' })
    expect(entry).not.toHaveProperty('confidence_score')
  })

  it('keeps the confidence when a zone has one, and leaves the key out when it has none', () => {
    expect(detailToOverlayEntry(makeZoneDetail('z1'))).toMatchObject({ hazard_zone_id: 'z1', confidence_score: 0.87 })
    const manual = makeZoneDetail('z2', { source: 'manual_admin' })
    delete manual.confidence_score
    expect(detailToOverlayEntry(manual)).not.toHaveProperty('confidence_score')
  })
})
