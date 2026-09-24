import { describe, expect, it } from 'vitest'
import { bruteForceSelfIntersects, gridSelfIntersects, parseBoundary, polygonFromGeometry, ringSelfIntersects, summarizePolygon, type Position } from './geojson'

const square = (x = 0, y = 0, s = 1): Position[] => [[x, y], [x + s, y], [x + s, y + s], [x, y + s], [x, y]]
const polygon = (...rings: Position[][]) => ({ type: 'Polygon', coordinates: rings })
const parse = (value: unknown) => parseBoundary(JSON.stringify(value))
const errorsOf = (value: unknown) => {
  const result = parse(value)
  if (result.ok) throw new Error('expected a failure')
  return result.errors
}

describe('parseBoundary', () => {
  it('accepts a closed polygon and summarises it', () => {
    const result = parse(polygon(square(67, 24, 2)))
    if (!result.ok) throw new Error('expected success')
    expect(result.summary).toEqual({ rings: 1, points: 5, bbox: [67, 24, 69, 26] })
    expect(result.polygon.coordinates[0]).toHaveLength(5)
    expect(result.wrappedIn).toBeNull()
    expect(result.droppedAltitude).toBe(false)
  })

  it('unwraps a Feature and a single-feature FeatureCollection, as most tools export', () => {
    const feature = { type: 'Feature', properties: { name: 'x' }, geometry: polygon(square()) }
    const fromFeature = parse(feature)
    const fromCollection = parse({ type: 'FeatureCollection', features: [feature] })
    if (!fromFeature.ok || !fromCollection.ok) throw new Error('expected success')
    expect(fromFeature.wrappedIn).toBe('Feature')
    expect(fromCollection.wrappedIn).toBe('FeatureCollection')
    expect(fromFeature.polygon).toEqual(fromCollection.polygon)
  })

  it('refuses a FeatureCollection with zero or several features', () => {
    const feature = { type: 'Feature', geometry: polygon(square()) }
    expect(errorsOf({ type: 'FeatureCollection', features: [] })[0]).toMatch(/has 0 features/)
    expect(errorsOf({ type: 'FeatureCollection', features: [feature, feature] })[0]).toMatch(/has 2 features/)
  })

  it("refuses a MultiPolygon with the reason, since the column holds a single Polygon (it would be a bare 500)", () => {
    const errors = errorsOf({ type: 'MultiPolygon', coordinates: [[square()], [square(5, 5)]] })
    expect(errors[0]).toMatch(/MultiPolygon can't be saved/)
  })

  it('refuses any other geometry type, and non-geometries', () => {
    expect(errorsOf({ type: 'Point', coordinates: [1, 2] })[0]).toBe('Expected a Polygon, but this is a Point.')
    expect(errorsOf({ hello: 'world' })[0]).toBe('Expected a Polygon, but this is not a GeoJSON geometry.')
    expect(errorsOf({ type: 'Feature', geometry: null })[0]).toBe('No geometry found. Expected a GeoJSON Polygon.')
  })

  it('refuses empty text and invalid JSON without throwing', () => {
    expect(parseBoundary('   ')).toEqual({ ok: false, errors: ['Paste a GeoJSON Polygon, or upload a .geojson file.'] })
    const bad = parseBoundary('{"type": "Polygon",')
    if (bad.ok) throw new Error('expected failure')
    expect(bad.errors[0]).toMatch(/isn't valid JSON/)
  })

  it('refuses a ring that is open — the API accepts it, and it is invalid geometry', () => {
    expect(errorsOf(polygon([[0, 0], [1, 0], [1, 1], [0, 1]]))[0]).toMatch(/isn't closed/)
  })

  it('refuses a ring with too few points', () => {
    expect(errorsOf(polygon([[0, 0], [1, 1], [0, 0]]))[0]).toMatch(/needs at least 4 points \(the last repeating the first\); it has 3/)
  })

  it('refuses points outside longitude ±180 / latitude ±90 — the API returns 201 for these', () => {
    expect(errorsOf(polygon(square(200, 95)))[0]).toMatch(/outside longitude ±180 or latitude ±90/)
    expect(errorsOf(polygon(square(0, -91)))[0]).toMatch(/outside longitude/)
  })

  it('refuses a bow-tie, which the API also accepts', () => {
    expect(errorsOf(polygon([[0, 0], [1, 1], [1, 0], [0, 1], [0, 0]]))[0]).toMatch(/crosses or touches itself/)
  })

  it('refuses points that are not number pairs', () => {
    expect(errorsOf(polygon([[0, 0], ['a', 1], [1, 1], [0, 0]] as never))[0]).toMatch(/isn't a pair of numbers/)
  })

  it('accepts a polygon with a hole, and reports a bad hole by number', () => {
    const outer = square(0, 0, 10)
    const goodHole: Position[] = [[2, 2], [2, 4], [4, 4], [4, 2], [2, 2]]
    const good = parse(polygon(outer, goodHole))
    if (!good.ok) throw new Error('expected success')
    expect(good.summary.rings).toBe(2)

    expect(errorsOf(polygon(outer, [[2, 2], [2, 4], [4, 4]]))[0]).toMatch(/^Hole 1 needs at least 4 points/)
  })

  it('reports every problem at once, each naming its ring', () => {
    const errors = errorsOf(polygon([[0, 0], [1, 0], [1, 1], [0, 1]], [[5, 5], [6, 5], [6, 6], [5, 6]]))
    expect(errors).toHaveLength(2)
    expect(errors[0]).toMatch(/^The outer ring isn't closed/)
    expect(errors[1]).toMatch(/^Hole 1 isn't closed/)
  })

  it('drops a third (altitude) value per point and says so, since the column is 2-D', () => {
    const result = parse(polygon(square().map(([x, y]) => [x, y, 100] as unknown as Position)))
    if (!result.ok) throw new Error('expected success')
    expect(result.droppedAltitude).toBe(true)
    expect(result.polygon.coordinates[0].every((p) => p.length === 2)).toBe(true)
  })
})

describe('ringSelfIntersects', () => {
  it('is false for a simple ring, including a concave one', () => {
    expect(ringSelfIntersects(square())).toBe(false)
    expect(ringSelfIntersects([[0, 0], [4, 0], [4, 4], [2, 1], [0, 4], [0, 0]])).toBe(false)
  })

  it('is true for a bow-tie and for a ring pinched onto its own vertex', () => {
    expect(ringSelfIntersects([[0, 0], [1, 1], [1, 0], [0, 1], [0, 0]])).toBe(true)
    expect(ringSelfIntersects([[0, 0], [2, 0], [1, 1], [2, 2], [0, 2], [1, 1], [0, 0]])).toBe(true)
  })

  const circle = (n: number): Position[] => {
    const ring: Position[] = Array.from({ length: n }, (_, i) => [Math.cos((2 * Math.PI * i) / n), Math.sin((2 * Math.PI * i) / n)])
    ring.push(ring[0])
    return ring
  }

  it('checks a 200,000-point outline in seconds rather than the minutes the pairwise check would take', () => {
    const ring = circle(200000)
    const started = Date.now()
    expect(ringSelfIntersects(ring)).toBe(false)
    expect(Date.now() - started).toBeLessThan(4000)
  })

  it('finds a single crossing hidden in a huge outline', () => {
    const ring = circle(60000)
    ring.splice(30000, 0, [0, 0])
    ring.splice(30001, 0, [0.9, 0.9])
    expect(ringSelfIntersects(ring)).toBe(true)
  })

  it('still finds a crossing made by a few very long edges among many short ones', () => {
    const ring = circle(3000)
    ring.splice(1500, 0, [5, 5], [-5, 5], [5, -5])
    expect(gridSelfIntersects(ring)).toBe(bruteForceSelfIntersects(ring))
    expect(gridSelfIntersects(ring)).toBe(true)
  })

  it('agrees with the pairwise check on random rings, both simple and tangled', () => {
    let seed = 12345
    const random = () => {
      seed = (seed * 1664525 + 1013904223) % 4294967296
      return seed / 4294967296
    }
    let crossed = 0
    for (let trial = 0; trial < 300; trial += 1) {
      const n = 4 + Math.floor(random() * 40)
      const points: Position[] = Array.from({ length: n }, () => [Math.round(random() * 20), Math.round(random() * 20)])
      const ring: Position[] = [...points, points[0]]
      const expected = bruteForceSelfIntersects(ring)
      if (expected) crossed += 1
      expect(gridSelfIntersects(ring)).toBe(expected)
    }
    expect(crossed).toBeGreaterThan(0)
    expect(crossed).toBeLessThan(300)
  })
})

describe('summarizePolygon / polygonFromGeometry', () => {
  it('sums points across rings and reports the bounding box', () => {
    const summary = summarizePolygon({ type: 'Polygon', coordinates: [square(0, 0, 10), [[2, 2], [2, 4], [4, 4], [4, 2], [2, 2]]] })
    expect(summary).toEqual({ rings: 2, points: 10, bbox: [0, 0, 10, 10] })
  })

  it('reads a stored Polygon, and returns null for anything malformed or another type', () => {
    expect(polygonFromGeometry({ type: 'Polygon', coordinates: [square()] })?.coordinates).toHaveLength(1)
    expect(polygonFromGeometry({ type: 'MultiPolygon', coordinates: [] })).toBeNull()
    expect(polygonFromGeometry({ type: 'Polygon', coordinates: 'nope' })).toBeNull()
    expect(polygonFromGeometry({ type: 'Polygon', coordinates: [[[0, 'x']]] })).toBeNull()
  })
})
