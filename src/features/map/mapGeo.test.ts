import { describe, expect, it } from 'vitest'
import { boundaryBounds, boundaryToLatLngs, boundsContain, distanceMeters, formatCoordinates, formatDistance, unionBounds, viewportToBBox } from './mapGeo'

const square = { type: 'Polygon', coordinates: [[[67, 24], [68, 24], [68, 25], [67, 25], [67, 24]]] }

describe('boundaryToLatLngs', () => {
  it('swaps GeoJSON [lng, lat] into Leaflet [lat, lng], ring by ring', () => {
    expect(boundaryToLatLngs(square)).toEqual([[[24, 67], [24, 68], [25, 68], [25, 67], [24, 67]]])
  })

  it('reads a MultiPolygon as a list of polygons', () => {
    const multi = { type: 'MultiPolygon', coordinates: [square.coordinates, [[[70, 30], [71, 30], [71, 31], [70, 30]]]] }
    const positions = boundaryToLatLngs(multi) as unknown[][][]
    expect(positions).toHaveLength(2)
    expect(positions[1][0]).toEqual([[30, 70], [30, 71], [31, 71], [30, 70]])
  })

  it('returns null for anything it cannot draw — the API stores whatever it was given', () => {
    expect(boundaryToLatLngs({ type: 'Point', coordinates: [1, 2] })).toBeNull()
    expect(boundaryToLatLngs({ type: 'Polygon', coordinates: [] })).toBeNull()
    expect(boundaryToLatLngs({ type: 'Polygon', coordinates: 'nope' })).toBeNull()
    expect(boundaryToLatLngs({ type: 'Polygon', coordinates: [[[1, 'x']]] })).toBeNull()
    expect(boundaryToLatLngs({ type: 'MultiPolygon', coordinates: [null] })).toBeNull()
  })
})

describe('boundaryBounds / unionBounds', () => {
  it('finds the box around a boundary, and unions boxes, ignoring the unreadable ones', () => {
    const a = boundaryBounds(square)
    const b = boundaryBounds({ type: 'Polygon', coordinates: [[[70, 30], [71, 30], [71, 31], [70, 30]]] })
    expect(a).toEqual([[24, 67], [25, 68]])
    expect(unionBounds([a, null, b])).toEqual([[24, 67], [31, 71]])
    expect(unionBounds([null])).toBeNull()
    expect(boundaryBounds({ type: 'Point', coordinates: [1, 2] })).toBeNull()
  })
})

describe('viewportToBBox', () => {
  it('rounds outwards to a grid so a tiny pan keeps the same query (which is also the cache key)', () => {
    const a = viewportToBBox({ west: 67.02, south: 24.03, east: 68.41, north: 25.02 })
    const b = viewportToBBox({ west: 67.09, south: 24.01, east: 68.49, north: 25.08 })
    expect(a).toBe('67,24,68.5,25.1')
    expect(b).toBe(a)
  })

  it('always covers the viewport it was given', () => {
    const view = { west: 61.234, south: 25.987, east: 70.456, north: 33.001 }
    const [w, s, e, n] = (viewportToBBox(view) as string).split(',').map(Number)
    expect(w).toBeLessThanOrEqual(view.west)
    expect(s).toBeLessThanOrEqual(view.south)
    expect(e).toBeGreaterThanOrEqual(view.east)
    expect(n).toBeGreaterThanOrEqual(view.north)
  })

  it('clamps to valid ranges and refuses a box the route would answer 400 for', () => {
    expect(viewportToBBox({ west: -200, south: -95, east: 200, north: 95 })).toBe('-180,-90,180,90')
    expect(viewportToBBox({ west: 70, south: 24, east: 70, north: 25 })).toBeNull()
    expect(viewportToBBox({ west: NaN, south: 24, east: 70, north: 25 })).toBeNull()
  })

  it('does not drift by a whole step from floating-point noise on an exact grid value', () => {
    expect(viewportToBBox({ west: 67.1, south: 24.3, east: 68.2, north: 25.4 })).toBe('67.1,24.3,68.2,25.4')
  })
})

describe('distance', () => {
  it('measures great-circle metres (Karachi to Hyderabad is about 145 km)', () => {
    const meters = distanceMeters([24.8607, 67.0011], [25.396, 68.3578])
    expect(meters).toBeGreaterThan(140_000)
    expect(meters).toBeLessThan(155_000)
    expect(distanceMeters([24, 67], [24, 67])).toBe(0)
  })

  it('formats short distances in metres, medium in tenths of a km, long in whole km', () => {
    expect(formatDistance(4)).toBe('10 m')
    expect(formatDistance(842)).toBe('840 m')
    expect(formatDistance(4200)).toBe('4.2 km')
    expect(formatDistance(125_400)).toBe('125 km')
    expect(formatDistance(-1)).toBe('')
    expect(formatDistance(NaN)).toBe('')
  })
})

describe('boundsContain', () => {
  it('is inclusive on the edges', () => {
    const box: [[number, number], [number, number]] = [[24, 67], [25, 68]]
    expect(boundsContain(box, [24.5, 67.5])).toBe(true)
    expect(boundsContain(box, [24, 67])).toBe(true)
    expect(boundsContain(box, [26, 67.5])).toBe(false)
  })
})

describe('formatCoordinates', () => {
  it('reads a position as latitude then longitude with hemispheres, to four decimals', () => {
    expect(formatCoordinates([27.706, 68.858])).toBe('27.7060° N, 68.8580° E')
    expect(formatCoordinates([-33.8688, -70.6693])).toBe('33.8688° S, 70.6693° W')
    expect(formatCoordinates([0, 0])).toBe('0.0000° N, 0.0000° E')
  })
})
