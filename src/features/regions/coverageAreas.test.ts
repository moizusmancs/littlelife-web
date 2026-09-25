import { describe, expect, it } from 'vitest'
import { areaChoices, coverageBounds, drawableAreas } from './coverageAreas'
import { makeRegion, sampleRegions } from './testRegion'

const box = (west: number, south: number, east: number, north: number) => ({ type: 'Polygon', coordinates: [[[west, south], [east, south], [east, north], [west, north], [west, south]]] })
const point = { type: 'Point', coordinates: [67.5, 24.5] }

describe('drawableAreas', () => {
  it('draws the widest level first, so a district is painted over its province — and keeps the API order within a level', () => {
    const areas = drawableAreas([
      makeRegion('city', 'Sukkur City', 'tehsil', 'sukkur'),
      makeRegion('larkana', 'Larkana', 'district', 'sindh'),
      makeRegion('punjab', 'Punjab', 'province'),
      makeRegion('sukkur', 'Sukkur', 'district', 'sindh'),
      makeRegion('sindh', 'Sindh', 'province'),
    ])
    expect(areas.map((area) => area.id)).toEqual(['punjab', 'sindh', 'larkana', 'sukkur', 'city'])
  })

  it('reads a boundary as Leaflet positions ([lat, lng]) with the box around it', () => {
    const [area] = drawableAreas([makeRegion('a', 'Alpha', 'province', undefined, { boundary: box(67, 24, 68.5, 25.5) })])
    expect(area.bounds).toEqual([
      [24, 67],
      [25.5, 68.5],
    ])
    expect(area.positions).toEqual([
      [
        [24, 67],
        [24, 68.5],
        [25.5, 68.5],
        [25.5, 67],
        [24, 67],
      ],
    ])
  })

  it('leaves out a region whose boundary cannot be drawn — the API stores whatever it was given', () => {
    const areas = drawableAreas([makeRegion('ok', 'Fine', 'province'), makeRegion('bad', 'Odd', 'province', undefined, { boundary: point })])
    expect(areas.map((area) => area.id)).toEqual(['ok'])
  })

  it('is empty for no regions', () => {
    expect(drawableAreas([])).toEqual([])
  })
})

describe('coverageBounds', () => {
  it('is the box around every area', () => {
    const areas = drawableAreas([
      makeRegion('a', 'Alpha', 'province', undefined, { boundary: box(67, 24, 68, 25) }),
      makeRegion('b', 'Beta', 'province', undefined, { boundary: box(74, 31, 74.1, 31.1) }),
    ])
    expect(coverageBounds(areas)).toEqual([
      [24, 67],
      [31.1, 74.1],
    ])
  })

  it('is null when there is nothing to draw', () => {
    expect(coverageBounds([])).toBeNull()
  })
})

describe('areaChoices', () => {
  it('lists every region in tree order (provinces first, as the Regions screen does), each by its whole path, so two districts with one name can be told apart', () => {
    expect(areaChoices(sampleRegions).map((choice) => choice.label)).toEqual([
      'Punjab',
      'Sindh',
      'Sindh › Larkana',
      'Sindh › Sukkur',
      'Sindh › Sukkur › Sukkur City',
      'Orphan District',
    ])
  })

  it('carries the box to jump to', () => {
    const [choice] = areaChoices([makeRegion('a', 'Alpha', 'province', undefined, { boundary: box(67, 24, 68.5, 25.5) })])
    expect(choice).toMatchObject({ id: 'a', label: 'Alpha', bounds: [[24, 67], [25.5, 68.5]] })
  })

  it('skips a region that cannot be drawn but still lists what is inside it, under its name', () => {
    const labels = areaChoices([
      makeRegion('p', 'Province', 'province', undefined, { boundary: point }),
      makeRegion('d', 'District', 'district', 'p'),
    ]).map((choice) => choice.label)
    expect(labels).toEqual(['Province › District'])
  })

  it('is empty for no regions', () => {
    expect(areaChoices([])).toEqual([])
  })
})
