import type { GeoJsonGeometry } from '@/api/geo'

/** `[longitude, latitude]`, GeoJSON order. */
export type Position = [number, number]

export interface PolygonGeometry {
  type: 'Polygon'
  coordinates: Position[][]
}

export interface BoundarySummary {
  rings: number
  points: number
  /** `[minLng, minLat, maxLng, maxLat]` */
  bbox: [number, number, number, number]
}

export type ParsedBoundary =
  | {
      ok: true
      polygon: PolygonGeometry
      summary: BoundarySummary
      /** True when the input had a third (altitude) value per point that was dropped, because the
       *  column only holds 2-D geometry. */
      droppedAltitude: boolean
      /** What was wrapped around the geometry, if anything. */
      wrappedIn: 'Feature' | 'FeatureCollection' | null
    }
  | { ok: false; errors: string[] }

const isNumber = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value)

/** Orientation of the triple (a, b, c): >0 counter-clockwise, <0 clockwise, 0 collinear. */
const cross = (a: Position, b: Position, c: Position) => (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0])

const onSegment = (a: Position, b: Position, p: Position) =>
  Math.min(a[0], b[0]) <= p[0] && p[0] <= Math.max(a[0], b[0]) && Math.min(a[1], b[1]) <= p[1] && p[1] <= Math.max(a[1], b[1])

/** Whether segments a–b and c–d share any point (crossing, touching, or overlapping). */
function segmentsIntersect(a: Position, b: Position, c: Position, d: Position): boolean {
  const d1 = cross(c, d, a)
  const d2 = cross(c, d, b)
  const d3 = cross(a, b, c)
  const d4 = cross(a, b, d)
  if (((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))) return true
  return (d1 === 0 && onSegment(c, d, a)) || (d2 === 0 && onSegment(c, d, b)) || (d3 === 0 && onSegment(a, b, c)) || (d4 === 0 && onSegment(a, b, d))
}

const areNeighbours = (i: number, j: number, segments: number) => j === i + 1 || (i === 0 && j === segments - 1)

/** Whether segments i and j (i < j) of a ring cross or touch, other than neighbours meeting at their shared end point. */
const segmentsClash = (ring: Position[], i: number, j: number, segments: number) =>
  !areNeighbours(i, j, segments) && segmentsIntersect(ring[i], ring[i + 1], ring[j], ring[j + 1])

/** Every pair of segments — simple and obviously right; quadratic, so only for small rings. */
export function bruteForceSelfIntersects(ring: Position[]): boolean {
  const segments = ring.length - 1
  for (let i = 0; i < segments; i += 1) {
    for (let j = i + 1; j < segments; j += 1) {
      if (segmentsClash(ring, i, j, segments)) return true
    }
  }
  return false
}

/** A segment whose bounding box would span more grid cells than this is tested against every other segment instead. */
const MAX_CELLS_PER_SEGMENT = 64

/**
 * The same answer without comparing every pair: segments are dropped into a sparse grid by their
 * bounding boxes, and only segments sharing a cell are tested. Cells are as wide as the average
 * segment, which keeps a cell holding a handful of segments however many points the outline has —
 * a boundary only occupies a thin band of any grid, so cells sized to the bounding box would each be
 * crowded. That makes it roughly linear where the pairwise version would freeze the form on a
 * district with tens of thousands of points. The few segments far longer than average (they'd fill
 * hundreds of cells) are compared with everything directly.
 */
export function gridSelfIntersects(ring: Position[]): boolean {
  const segments = ring.length - 1
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const [x, y] of ring) {
    minX = Math.min(minX, x)
    maxX = Math.max(maxX, x)
    minY = Math.min(minY, y)
    maxY = Math.max(maxY, y)
  }
  let totalLength = 0
  for (let i = 0; i < segments; i += 1) totalLength += Math.hypot(ring[i + 1][0] - ring[i][0], ring[i + 1][1] - ring[i][1])
  const extent = Math.max(maxX - minX, maxY - minY) || 1
  const cell = Math.max(totalLength / segments, extent / 100000) || extent
  const rowLength = Math.floor(extent / cell) + 1

  const buckets = new Map<number, number[]>()
  const long: number[] = []
  for (let i = 0; i < segments; i += 1) {
    const [a, b] = [ring[i], ring[i + 1]]
    const x0 = Math.floor((Math.min(a[0], b[0]) - minX) / cell)
    const x1 = Math.floor((Math.max(a[0], b[0]) - minX) / cell)
    const y0 = Math.floor((Math.min(a[1], b[1]) - minY) / cell)
    const y1 = Math.floor((Math.max(a[1], b[1]) - minY) / cell)
    if ((x1 - x0 + 1) * (y1 - y0 + 1) > MAX_CELLS_PER_SEGMENT) {
      long.push(i)
      continue
    }
    for (let cx = x0; cx <= x1; cx += 1) {
      for (let cy = y0; cy <= y1; cy += 1) {
        const key = cy * rowLength + cx
        const bucket = buckets.get(key)
        if (bucket) bucket.push(i)
        else buckets.set(key, [i])
      }
    }
  }

  for (const i of long) {
    for (let j = 0; j < segments; j += 1) {
      if (j !== i && segmentsClash(ring, Math.min(i, j), Math.max(i, j), segments)) return true
    }
  }

  const tested = new Set<number>()
  for (const bucket of buckets.values()) {
    for (let x = 0; x < bucket.length; x += 1) {
      for (let y = x + 1; y < bucket.length; y += 1) {
        const [i, j] = [bucket[x], bucket[y]]
        const pair = i * segments + j
        if (tested.has(pair)) continue
        tested.add(pair)
        if (segmentsClash(ring, i, j, segments)) return true
      }
    }
  }
  return false
}

const GRID_THRESHOLD = 400

/**
 * Whether a closed ring crosses or touches itself: any two segments that aren't neighbours sharing
 * an end point meet. That is stricter than "self-intersecting" on purpose — a ring that pinches
 * onto its own vertex is invalid for PostGIS too.
 */
export function ringSelfIntersects(ring: Position[]): boolean {
  return ring.length - 1 > GRID_THRESHOLD ? gridSelfIntersects(ring) : bruteForceSelfIntersects(ring)
}

export function summarizePolygon(polygon: PolygonGeometry): BoundarySummary {
  let minLng = Infinity
  let minLat = Infinity
  let maxLng = -Infinity
  let maxLat = -Infinity
  let points = 0
  for (const ring of polygon.coordinates) {
    for (const [lng, lat] of ring) {
      points += 1
      minLng = Math.min(minLng, lng)
      maxLng = Math.max(maxLng, lng)
      minLat = Math.min(minLat, lat)
      maxLat = Math.max(maxLat, lat)
    }
  }
  return { rings: polygon.coordinates.length, points, bbox: [minLng, minLat, maxLng, maxLat] }
}

/**
 * A stored region's boundary, if it is a well-formed `Polygon` — for showing a summary without
 * re-validating what the server already holds. Returns `null` for anything else (the API has
 * accepted some malformed shapes, so the caller must cope).
 */
export function polygonFromGeometry(geometry: GeoJsonGeometry): PolygonGeometry | null {
  if (geometry.type !== 'Polygon' || !Array.isArray(geometry.coordinates)) return null
  const rings = geometry.coordinates as unknown[]
  const out: Position[][] = []
  for (const ring of rings) {
    if (!Array.isArray(ring)) return null
    const positions: Position[] = []
    for (const point of ring as unknown[]) {
      if (!Array.isArray(point) || !isNumber(point[0]) || !isNumber(point[1])) return null
      positions.push([point[0], point[1]])
    }
    out.push(positions)
  }
  return out.length > 0 ? { type: 'Polygon', coordinates: out } : null
}

/**
 * Parses and validates a pasted or uploaded boundary — the checks the backend doesn't make. A bare
 * `Polygon` is expected, but a GeoJSON `Feature` holding one, or a `FeatureCollection` with exactly
 * one such feature, is unwrapped (that's what most tools export). Rejected, each with a message
 * that says what to do: invalid JSON, anything but a `Polygon` (a `MultiPolygon` would be a `500`
 * — the column holds a single polygon), a ring that isn't closed or has fewer than four points, a
 * point outside ±180° / ±90°, and a ring that crosses or touches itself. A third value per point
 * (altitude) is dropped, since the column is 2-D. All problems are reported together. `subject` names what the boundary belongs to
 * in the two messages that say so (a region, by default; a hazard zone).
 */
export function parseBoundary(text: string, subject = 'region'): ParsedBoundary {
  if (text.trim() === '') return { ok: false, errors: ['Paste a GeoJSON Polygon, or upload a .geojson file.'] }

  let value: unknown
  try {
    value = JSON.parse(text)
  } catch (error) {
    return { ok: false, errors: [`That isn't valid JSON (${error instanceof Error ? error.message : 'parse error'}).`] }
  }

  let wrappedIn: 'Feature' | 'FeatureCollection' | null = null
  let geometry: unknown = value
  if (typeof value === 'object' && value !== null) {
    const node = value as { type?: unknown; features?: unknown; geometry?: unknown }
    if (node.type === 'FeatureCollection') {
      const features = Array.isArray(node.features) ? node.features : []
      if (features.length !== 1) {
        return {
          ok: false,
          errors: [`This FeatureCollection has ${features.length} features. A ${subject} has exactly one boundary, so give it a single polygon.`],
        }
      }
      wrappedIn = 'FeatureCollection'
      geometry = (features[0] as { geometry?: unknown } | null)?.geometry
    } else if (node.type === 'Feature') {
      wrappedIn = 'Feature'
      geometry = node.geometry
    }
  }

  if (typeof geometry !== 'object' || geometry === null) {
    return { ok: false, errors: ['No geometry found. Expected a GeoJSON Polygon.'] }
  }
  const { type, coordinates } = geometry as { type?: unknown; coordinates?: unknown }
  if (type === 'MultiPolygon') {
    return {
      ok: false,
      errors: [`A MultiPolygon can't be saved: a ${subject}'s boundary is stored as a single Polygon. Use one polygon (for example, the largest part).`],
    }
  }
  if (type !== 'Polygon') {
    return { ok: false, errors: [`Expected a Polygon, but this is ${typeof type === 'string' ? `a ${type}` : 'not a GeoJSON geometry'}.`] }
  }
  if (!Array.isArray(coordinates) || coordinates.length === 0) {
    return { ok: false, errors: ['This Polygon has no rings.'] }
  }

  const errors: string[] = []
  const rings: Position[][] = []
  let droppedAltitude = false

  coordinates.forEach((rawRing: unknown, ringIndex: number) => {
    const label = ringIndex === 0 ? 'The outer ring' : `Hole ${ringIndex}`
    if (!Array.isArray(rawRing)) {
      errors.push(`${label} isn't a list of points.`)
      return
    }
    const ring: Position[] = []
    for (const point of rawRing as unknown[]) {
      if (!Array.isArray(point) || !isNumber(point[0]) || !isNumber(point[1])) {
        errors.push(`${label} has a point that isn't a pair of numbers ([longitude, latitude]).`)
        return
      }
      if (point.length > 2) droppedAltitude = true
      ring.push([point[0], point[1]])
    }
    if (ring.length < 4) {
      errors.push(`${label} needs at least 4 points (the last repeating the first); it has ${ring.length}.`)
      return
    }
    const [first, last] = [ring[0], ring[ring.length - 1]]
    if (first[0] !== last[0] || first[1] !== last[1]) {
      errors.push(`${label} isn't closed: its last point must repeat the first.`)
      return
    }
    if (ring.some(([lng, lat]) => lng < -180 || lng > 180 || lat < -90 || lat > 90)) {
      errors.push(`${label} has a point outside longitude ±180 or latitude ±90. Are the two swapped? GeoJSON is [longitude, latitude].`)
      return
    }
    if (ringSelfIntersects(ring)) {
      errors.push(`${label} crosses or touches itself, like a bow-tie. Fix the outline so it doesn't.`)
      return
    }
    rings.push(ring)
  })

  if (errors.length > 0) return { ok: false, errors }
  const polygon: PolygonGeometry = { type: 'Polygon', coordinates: rings }
  return { ok: true, polygon, summary: summarizePolygon(polygon), droppedAltitude, wrappedIn }
}
