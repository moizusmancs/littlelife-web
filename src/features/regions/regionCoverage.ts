import type { Region, RegionLevel } from '@/api/geo'
import { boundaryToLatLngs, type LatLng } from '@/features/map/mapGeo'
import { pathTo } from './regionTree'

/** Ray casting on one ring of `[lat, lng]` points: a point is inside when a ray from it crosses the ring an odd number of times. */
function insideRing([lat, lng]: LatLng, ring: readonly LatLng[]): boolean {
  let inside = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [latI, lngI] = ring[i]
    const [latJ, lngJ] = ring[j]
    if (lngI > lng !== lngJ > lng && lat < ((latJ - latI) * (lng - lngI)) / (lngJ - lngI) + latI) inside = !inside
  }
  return inside
}

const EPSILON = 1e-9

/** Whether the point lies on one of the ring's segments (collinear with it and within its box). */
function onRing([lat, lng]: LatLng, ring: readonly LatLng[]): boolean {
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [latI, lngI] = ring[i]
    const [latJ, lngJ] = ring[j]
    if (Math.abs((lngJ - lngI) * (lat - latI) - (latJ - latI) * (lng - lngI)) > EPSILON) continue
    if (lat >= Math.min(latI, latJ) - EPSILON && lat <= Math.max(latI, latJ) + EPSILON && lng >= Math.min(lngI, lngJ) - EPSILON && lng <= Math.max(lngI, lngJ) + EPSILON) return true
  }
  return false
}

/**
 * A polygon's first ring is its outline and any others are holes, so a point in a hole is outside. **Whether the boundary itself belongs to the polygon is the caller's
 * choice** (`includeBoundary`): ray casting alone is inconsistent about it (it counts two of a square's edges), so it is decided here instead of left to chance.
 */
const insidePolygon = (point: LatLng, rings: readonly LatLng[][], includeBoundary: boolean) => {
  if (rings.length === 0) return false
  if (rings.some((ring) => onRing(point, ring))) return includeBoundary
  return insideRing(point, rings[0]) && !rings.slice(1).some((hole) => insideRing(point, hole))
}

/**
 * Whether a boundary (a Polygon, or defensively a MultiPolygon) holds the point. An unreadable boundary holds nothing. **The edge counts as inside by default**, because that is what
 * the API's own spatial join says for a *region* — a place on the shared edge of two regions is listed for both, and a screen that refused it would be refusing a place the platform
 * can show. A **hazard zone** is the opposite: the server's risk check treats a point exactly on a zone's edge as outside, so that check passes `includeBoundary: false` to agree with it.
 */
export function regionContains(region: Pick<Region, 'boundary'>, point: LatLng, { includeBoundary = true }: { includeBoundary?: boolean } = {}): boolean {
  const positions = boundaryToLatLngs(region.boundary)
  if (!positions) return false
  return region.boundary.type === 'MultiPolygon'
    ? (positions as LatLng[][][]).some((polygon) => insidePolygon(point, polygon, includeBoundary))
    : insidePolygon(point, positions as LatLng[][], includeBoundary)
}

const DEPTH: Record<RegionLevel, number> = { province: 0, district: 1, tehsil: 2 }

/**
 * Where a point lies among the platform's regions: the **most specific** region that contains it, written as its path
 * (`Sindh › Sukkur › Sukkur City`), or `null` when it is inside none. The facility routes answer per region by a spatial join, so a
 * place outside every region is never returned to a citizen — this is how a screen can say so before it is saved.
 */
export function regionPathFor(regions: readonly Region[], point: LatLng): string | null {
  const containing = regions.filter((region) => regionContains(region, point))
  if (containing.length === 0) return null
  const deepest = containing.reduce((best, region) => (DEPTH[region.level] > DEPTH[best.level] ? region : best))
  return (
    pathTo(regions as Region[], deepest.id)
      .map((region) => region.name)
      .join(' › ') || deepest.name
  )
}
