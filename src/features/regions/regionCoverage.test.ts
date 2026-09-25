import { describe, expect, it } from 'vitest'
import type { Region } from '@/api/geo'
import { regionContains, regionPathFor } from './regionCoverage'

const box = (west: number, south: number, east: number, north: number) => [[[west, south], [east, south], [east, north], [west, north], [west, south]]]

function region(id: string, name: string, level: Region['level'], boundary: Region['boundary'], parent?: string): Region {
  return { id, name, level, boundary, ...(parent ? { parent_region_id: parent } : {}), created_at: '', updated_at: '' }
}

const sindh = region('p', 'Sindh', 'province', { type: 'Polygon', coordinates: box(66, 24, 71, 29) })
const sukkur = region('d', 'Sukkur', 'district', { type: 'Polygon', coordinates: box(68.5, 27.4, 69.2, 28) }, 'p')
const city = region('t', 'Sukkur City', 'tehsil', { type: 'Polygon', coordinates: box(68.8, 27.6, 69, 27.8) }, 'd')

describe('regionContains — the boundary belongs to the region', () => {
  const square = region('s', 'Square', 'province', { type: 'Polygon', coordinates: box(70, 16, 70.5, 16.5) })
  const holed = region('h', 'Holed', 'province', { type: 'Polygon', coordinates: [box(70, 16, 71, 17)[0], box(70.4, 16.4, 70.6, 16.6)[0]] })

  it('counts every edge and corner as inside — the API lists a place on the shared edge of two regions for both, so a screen must not refuse it (ray casting alone counts two edges out)', () => {
    for (const [name, point] of [
      ['west edge', [16.25, 70]],
      ['east edge', [16.25, 70.5]],
      ['south edge', [16, 70.25]],
      ['north edge', [16.5, 70.25]],
      ['south-west corner', [16, 70]],
      ['north-east corner', [16.5, 70.5]],
    ] as const) expect(regionContains(square, [point[0], point[1]]), name).toBe(true)
  })

  it('a point on the shared edge of two neighbouring regions is inside both', () => {
    const left = region('l', 'Left', 'province', { type: 'Polygon', coordinates: box(70, 16, 70.5, 16.5) })
    const right = region('r', 'Right', 'province', { type: 'Polygon', coordinates: box(70.5, 16, 71, 16.5) })
    expect(regionContains(left, [16.25, 70.5])).toBe(true)
    expect(regionContains(right, [16.25, 70.5])).toBe(true)
  })

  it('with includeBoundary off (a hazard zone, as the server\'s risk check counts it) the edge, the corners and the rim of a hole are outside, the inside still inside', () => {
    const strict = { includeBoundary: false }
    expect(regionContains(square, [16.25, 70.25], strict)).toBe(true)
    for (const point of [[16.25, 70], [16.25, 70.5], [16, 70.25], [16.5, 70.25], [16, 70], [16.5, 70.5]] as const) expect(regionContains(square, [point[0], point[1]], strict), String(point)).toBe(false)
    expect(regionContains(holed, [16.5, 70.4], strict)).toBe(false) // the rim of the hole
    expect(regionContains(holed, [16.5, 70.5], strict)).toBe(false) // in the hole
    expect(regionContains(holed, [16.2, 70.2], strict)).toBe(true)
  })

  it('a point just off the edge is outside — the tolerance is far smaller than a coordinate anyone can type', () => {
    expect(regionContains(square, [16.25, 70.500001])).toBe(false)
    expect(regionContains(square, [16.500001, 70.25])).toBe(false)
    expect(regionContains(square, [15.999999, 70.25])).toBe(false)
  })

  it('the rim of a hole is inside the region, the hole itself is not', () => {
    expect(regionContains(holed, [16.5, 70.4])).toBe(true) // on the hole's west edge
    expect(regionContains(holed, [16.5, 70.5])).toBe(false) // in the hole
    expect(regionContains(holed, [16.2, 70.2])).toBe(true)
  })
})

describe('regionContains', () => {
  it('is true inside a polygon and false outside it — points are [lat, lng]', () => {
    expect(regionContains(sindh, [26, 68])).toBe(true)
    expect(regionContains(sindh, [30, 68])).toBe(false)
    expect(regionContains(sindh, [26, 72])).toBe(false)
  })

  it('leaves out a hole', () => {
    const donut = region('x', 'Donut', 'province', {
      type: 'Polygon',
      coordinates: [...box(0, 0, 10, 10), ...box(4, 4, 6, 6)],
    })
    expect(regionContains(donut, [2, 2])).toBe(true)
    expect(regionContains(donut, [5, 5])).toBe(false)
  })

  it('handles a MultiPolygon, defensively', () => {
    const twin = region('m', 'Twin', 'province', { type: 'MultiPolygon', coordinates: [box(0, 0, 1, 1), box(10, 10, 11, 11)] })
    expect(regionContains(twin, [0.5, 0.5])).toBe(true)
    expect(regionContains(twin, [10.5, 10.5])).toBe(true)
    expect(regionContains(twin, [5, 5])).toBe(false)
  })

  it('holds nothing when the boundary cannot be read', () => {
    expect(regionContains(region('b', 'Broken', 'province', { type: 'Polygon', coordinates: 'nope' }), [1, 1])).toBe(false)
    expect(regionContains(region('c', 'Point', 'province', { type: 'Point', coordinates: [1, 1] }), [1, 1])).toBe(false)
  })
})

describe('regionPathFor', () => {
  const regions = [sindh, sukkur, city]

  it('names the most specific region with its parents', () => {
    expect(regionPathFor(regions, [27.7, 68.9])).toBe('Sindh › Sukkur › Sukkur City')
  })

  it('stops at the district when the point is outside the tehsil', () => {
    expect(regionPathFor(regions, [27.5, 68.6])).toBe('Sindh › Sukkur')
  })

  it('names just the province when it is the only one containing the point', () => {
    expect(regionPathFor(regions, [25, 67])).toBe('Sindh')
  })

  it('is null outside every region — the place a citizen can never be shown', () => {
    expect(regionPathFor(regions, [18.3, 72.3])).toBeNull()
    expect(regionPathFor([], [27.7, 68.9])).toBeNull()
  })
})
