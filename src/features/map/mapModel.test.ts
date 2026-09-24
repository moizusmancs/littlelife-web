import { describe, expect, it } from 'vitest'
import { capacityInfo, collapseDuplicateZones, dedupePlaces, drawOrder, essentialPlace, hazardBasis, hazardMatches, hazardTitle, infrastructurePlace, placeMatches, shelterPlace, sortHazards } from './mapModel'
import { makeEssential, makeHazard, makeInfrastructure, makeShelter } from './testMap'

describe('places', () => {
  it('turns a GeoJSON [lng, lat] point into Leaflet [lat, lng]', () => {
    expect(shelterPlace(makeShelter('s1', 'GBHS Johi', { location: { type: 'Point', coordinates: [68.86, 27.7] } })).position).toEqual([27.7, 68.86])
  })

  it('reads a shelter’s type and open/closed state into labels and a tone', () => {
    const open = shelterPlace(makeShelter('s1', 'A'))
    const closedRelief = shelterPlace(makeShelter('s2', 'B', { type: 'relief_center', status: 'closed' }))
    expect([open.typeLabel, open.statusLabel, open.tone]).toEqual(['Shelter', 'Open', 'safe'])
    expect([closedRelief.typeLabel, closedRelief.statusLabel, closedRelief.tone]).toEqual(['Relief center', 'Closed', 'critical'])
  })

  it('maps infrastructure status to safe / caution / critical', () => {
    expect(infrastructurePlace(makeInfrastructure('i1', 'H', { status: 'safe' })).tone).toBe('safe')
    expect(infrastructurePlace(makeInfrastructure('i2', 'B', { type: 'bridge', status: 'at_risk' })).tone).toBe('caution')
    const damaged = infrastructurePlace(makeInfrastructure('i3', 'U', { type: 'utility', status: 'damaged' }))
    expect([damaged.typeLabel, damaged.statusLabel, damaged.tone]).toEqual(['Utility', 'Damaged', 'critical'])
  })

  it('treats an essential location nobody has reported as unknown — never assumed open', () => {
    const never = essentialPlace(makeEssential('e1', 'Corner Pharmacy'))
    expect([never.statusLabel, never.tone]).toEqual(['Status unknown', 'neutral'])
    expect(essentialPlace(makeEssential('e2', 'A', { current_status: 'open' })).tone).toBe('safe')
    expect(essentialPlace(makeEssential('e3', 'B', { current_status: 'closed', type: 'atm' })).statusLabel).toBe('Closed')
  })

  it('keys places by kind, so equal ids of different kinds never collide, and dedupes repeats (a place inside a district is also inside its province)', () => {
    const a = shelterPlace(makeShelter('same', 'Shelter'))
    const b = infrastructurePlace(makeInfrastructure('same', 'Hospital'))
    expect(a.key).not.toBe(b.key)
    expect(dedupePlaces([a, b, shelterPlace(makeShelter('same', 'Shelter (again)'))])).toHaveLength(2)
    expect(dedupePlaces([a, shelterPlace(makeShelter('same', 'later'))])[0].name).toBe('Shelter')
  })
})

describe('placeMatches', () => {
  const pharmacy = essentialPlace(makeEssential('e1', 'Corner Pharmacy', { current_status: 'open' }))

  it('matches name, type and status case-insensitively', () => {
    expect(placeMatches(pharmacy, 'corner')).toBe(true)
    expect(placeMatches(pharmacy, 'PHARM')).toBe(true)
    expect(placeMatches(pharmacy, 'open')).toBe(true)
    expect(placeMatches(pharmacy, 'hospital')).toBe(false)
  })

  it('matches everything for an empty or blank search', () => {
    expect(placeMatches(pharmacy, '')).toBe(true)
    expect(placeMatches(pharmacy, '   ')).toBe(true)
  })
})

describe('capacityInfo', () => {
  it('reports the ratio, with the tone rising as the shelter fills', () => {
    expect(capacityInfo({ capacity_current: 210, capacity_total: 400 })).toMatchObject({ percent: 53, barPercent: 53, over: false, tone: 'safe' })
    expect(capacityInfo({ capacity_current: 320, capacity_total: 400 }).tone).toBe('caution')
    expect(capacityInfo({ capacity_current: 380, capacity_total: 400 }).tone).toBe('critical')
  })

  it('handles the boundary values: empty, exactly full, and the tone thresholds', () => {
    expect(capacityInfo({ capacity_current: 0, capacity_total: 100 })).toMatchObject({ percent: 0, barPercent: 0, tone: 'safe' })
    expect(capacityInfo({ capacity_current: 100, capacity_total: 100 })).toMatchObject({ percent: 100, barPercent: 100, over: false, tone: 'critical' })
    expect(capacityInfo({ capacity_current: 74, capacity_total: 100 }).tone).toBe('safe')
    expect(capacityInfo({ capacity_current: 75, capacity_total: 100 }).tone).toBe('caution')
    expect(capacityInfo({ capacity_current: 89, capacity_total: 100 }).tone).toBe('caution')
    expect(capacityInfo({ capacity_current: 90, capacity_total: 100 }).tone).toBe('critical')
  })

  it('flags over-capacity honestly while holding the bar at full', () => {
    expect(capacityInfo({ capacity_current: 130, capacity_total: 100 })).toMatchObject({ percent: 130, barPercent: 100, over: true, tone: 'critical' })
  })

  it('does not divide by zero for a shelter with no capacity recorded', () => {
    expect(capacityInfo({ capacity_current: 5, capacity_total: 0 })).toMatchObject({ percent: 0, barPercent: 0, over: false })
  })
})

describe('hazards', () => {
  it('sorts worst first: risk, then confidence (a manual zone, having none, after a model zone), then newest', () => {
    const low = makeHazard('low', 'low', 0.04)
    const manualHigh = makeHazard('manual-high', 'high')
    const modelHigh = makeHazard('model-high', 'high', 0.87)
    const modelHighLess = makeHazard('model-high-less', 'high', 0.81)
    const medium = makeHazard('medium', 'medium', 0.6)
    expect(sortHazards([low, manualHigh, medium, modelHighLess, modelHigh]).map((h) => h.hazard_zone_id)).toEqual([
      'model-high',
      'model-high-less',
      'manual-high',
      'medium',
      'low',
    ])
  })

  it('collapses repeats of the same boundary to one — the worst risk, then the most confident, then the newest', () => {
    const at: [number, number] = [70, 25]
    const older = { ...makeHazard('old', 'low', 0.1, at), detected_at: '2026-09-20T00:00:00Z' }
    const newer = { ...makeHazard('new', 'low', 0.1, at), detected_at: '2026-09-24T00:00:00Z' }
    const worse = makeHazard('worse', 'high', 0.5, at)
    const elsewhere = makeHazard('elsewhere', 'low', 0.1, [71, 26])
    const ids = (entries: ReturnType<typeof collapseDuplicateZones>) => entries.map((h) => h.hazard_zone_id).sort()
    expect(ids(collapseDuplicateZones([older, newer, elsewhere]))).toEqual(['elsewhere', 'new'])
    expect(ids(collapseDuplicateZones([older, newer, worse, elsewhere]))).toEqual(['elsewhere', 'worse'])
  })

  it('keeps a zone drawn over another when their boundaries differ, and handles no zones', () => {
    const model = makeHazard('model', 'medium', 0.6, [70, 25])
    const manual = makeHazard('manual', 'medium', undefined, [70.1, 25.1])
    expect(collapseDuplicateZones([model, manual])).toHaveLength(2)
    expect(collapseDuplicateZones([])).toEqual([])
  })

  it('draws the least severe first so the worst sits on top', () => {
    const order = drawOrder([makeHazard('m', 'medium', 0.6, [1, 1]), makeHazard('h', 'high', 0.9, [2, 2]), makeHazard('l', 'low', 0.1, [3, 3])])
    expect(order.map((h) => h.hazard_zone_id)).toEqual(['l', 'm', 'h'])
  })

  it('does not reorder the caller’s array', () => {
    const input = [makeHazard('a', 'low'), makeHazard('b', 'high')]
    sortHazards(input)
    expect(input.map((h) => h.hazard_zone_id)).toEqual(['a', 'b'])
  })

  it('describes a zone by what it is: model confidence for a model zone, "declared by staff" for a manual one', () => {
    expect(hazardTitle(makeHazard('a', 'high', 0.87))).toBe('High-risk flood zone')
    expect(hazardBasis(makeHazard('a', 'high', 0.87))).toBe('87% model confidence')
    expect(hazardTitle(makeHazard('b', 'medium'))).toBe('Medium-risk hazard zone')
    expect(hazardBasis(makeHazard('b', 'medium'))).toBe('Declared by staff')
  })

  it('matches a search on risk, kind and basis', () => {
    const zone = makeHazard('a', 'high', 0.87)
    expect(hazardMatches(zone, 'high')).toBe(true)
    expect(hazardMatches(zone, 'flood')).toBe(true)
    expect(hazardMatches(zone, '87%')).toBe(true)
    expect(hazardMatches(zone, 'pharmacy')).toBe(false)
    expect(hazardMatches(zone, '')).toBe(true)
  })
})
