import type { GeoJsonGeometry } from '@/api/geo'

/** Leaflet's order: `[latitude, longitude]`. (GeoJSON is the reverse.) */
export type LatLng = [number, number]
/** `[[south, west], [north, east]]` — what `map.fitBounds` takes. */
export type BoundsTuple = [[number, number], [number, number]]

/** A rough frame of Pakistan, used when there is nothing more specific to show. */
export const PAKISTAN_BOUNDS: BoundsTuple = [
  [23.5, 60.8],
  [37.2, 77.9],
]

/** The map can't be dragged far outside the country — there is nothing to see there. */
export const MAP_MAX_BOUNDS: BoundsTuple = [
  [15, 52],
  [42, 88],
]

const isPair = (value: unknown): value is [number, number] =>
  Array.isArray(value) && value.length >= 2 && typeof value[0] === 'number' && typeof value[1] === 'number' && Number.isFinite(value[0]) && Number.isFinite(value[1])

const toRing = (ring: unknown): LatLng[] | null => {
  if (!Array.isArray(ring)) return null
  const points: LatLng[] = []
  for (const point of ring) {
    if (!isPair(point)) return null
    points.push([point[1], point[0]])
  }
  return points.length > 0 ? points : null
}

/**
 * A GeoJSON `Polygon` or `MultiPolygon` as Leaflet positions (swapping each `[lng, lat]` to `[lat, lng]`).
 * `null` for anything else or anything malformed — the API stores whatever it was given, so a caller must
 * cope with a boundary that can't be drawn.
 */
export function boundaryToLatLngs(boundary: GeoJsonGeometry): LatLng[][] | LatLng[][][] | null {
  const { type, coordinates } = boundary
  if (!Array.isArray(coordinates)) return null
  if (type === 'Polygon') {
    const rings = coordinates.map(toRing)
    return rings.length > 0 && rings.every((ring): ring is LatLng[] => ring !== null) ? rings : null
  }
  if (type === 'MultiPolygon') {
    const polygons = coordinates.map((polygon) => {
      if (!Array.isArray(polygon)) return null
      const rings = polygon.map(toRing)
      return rings.length > 0 && rings.every((ring): ring is LatLng[] => ring !== null) ? rings : null
    })
    return polygons.length > 0 && polygons.every((polygon): polygon is LatLng[][] => polygon !== null) ? polygons : null
  }
  return null
}

/** Every point of a boundary, whether it is one polygon (rings of points) or several (polygons of rings). */
const flatten = (positions: LatLng[][] | LatLng[][][]): LatLng[] => {
  const isPolygon = typeof (positions as LatLng[][])[0]?.[0]?.[0] === 'number'
  return (isPolygon ? (positions as LatLng[][]).flat(1) : (positions as LatLng[][][]).flat(2)) as LatLng[]
}

/** The box around a boundary, or `null` if it can't be read. */
export function boundaryBounds(boundary: GeoJsonGeometry): BoundsTuple | null {
  const positions = boundaryToLatLngs(boundary)
  if (!positions) return null
  const points = flatten(positions)
  if (points.length === 0) return null
  let south = Infinity
  let west = Infinity
  let north = -Infinity
  let east = -Infinity
  for (const [lat, lng] of points) {
    south = Math.min(south, lat)
    north = Math.max(north, lat)
    west = Math.min(west, lng)
    east = Math.max(east, lng)
  }
  return [
    [south, west],
    [north, east],
  ]
}

/** The smallest box holding every given box; `null` for none. */
export function unionBounds(boxes: ReadonlyArray<BoundsTuple | null>): BoundsTuple | null {
  const real = boxes.filter((box): box is BoundsTuple => box !== null)
  if (real.length === 0) return null
  return [
    [Math.min(...real.map((b) => b[0][0])), Math.min(...real.map((b) => b[0][1]))],
    [Math.max(...real.map((b) => b[1][0])), Math.max(...real.map((b) => b[1][1]))],
  ]
}

export interface ViewportBounds {
  west: number
  south: number
  east: number
  north: number
}

/**
 * A viewport as the `bbox=west,south,east,north` query the overlay route takes. It is **rounded outwards** to a
 * grid (0.1° by default, about 11 km) and clamped to valid ranges, so a tiny pan doesn't change the query — the
 * result is also the cache key, and without this every pixel of dragging would be a new request. Returns `null`
 * if the box isn't a real area (the route would answer `400`).
 */
export function viewportToBBox(view: ViewportBounds, step = 0.1): string | null {
  const values = [view.west, view.south, view.east, view.north]
  if (!values.every(Number.isFinite)) return null
  const down = (value: number) => Math.floor(value / step + 1e-9) * step
  const up = (value: number) => Math.ceil(value / step - 1e-9) * step
  const round = (value: number) => Number(value.toFixed(6))
  const west = round(Math.max(-180, down(view.west)))
  const south = round(Math.max(-90, down(view.south)))
  const east = round(Math.min(180, up(view.east)))
  const north = round(Math.min(90, up(view.north)))
  if (west >= east || south >= north) return null
  return `${west},${south},${east},${north}`
}

/** Whether a position lies inside a box. */
export const boundsContain = ([[south, west], [north, east]]: BoundsTuple, [lat, lng]: LatLng) =>
  lat >= south && lat <= north && lng >= west && lng <= east

/** Great-circle distance in metres between two `[lat, lng]` points. */
export function distanceMeters(a: LatLng, b: LatLng): number {
  const radius = 6_371_000
  const rad = (degrees: number) => (degrees * Math.PI) / 180
  const dLat = rad(b[0] - a[0])
  const dLng = rad(b[1] - a[1])
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a[0])) * Math.cos(rad(b[0])) * Math.sin(dLng / 2) ** 2
  return 2 * radius * Math.asin(Math.min(1, Math.sqrt(h)))
}

/** "850 m", "4.2 km", "125 km". */
export function formatDistance(meters: number): string {
  if (!Number.isFinite(meters) || meters < 0) return ''
  if (meters < 1000) return `${Math.max(10, Math.round(meters / 10) * 10)} m`
  const km = meters / 1000
  return km < 10 ? `${km.toFixed(1)} km` : `${Math.round(km)} km`
}

/** "27.706° N, 68.858° E" — a position as people read it on a map, four decimals (about 10 m). */
export function formatCoordinates([lat, lng]: LatLng): string {
  const part = (value: number, positive: string, negative: string) => `${Math.abs(value).toFixed(4)}° ${value >= 0 ? positive : negative}`
  return `${part(lat, 'N', 'S')}, ${part(lng, 'E', 'W')}`
}
