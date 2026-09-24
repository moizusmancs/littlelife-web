import { apiClient } from '@/api/client'

/**
 * Geo — regions (province/district/tehsil), NGO operational-region coverage.
 * Backend doc: supporting-material/api/01-geo.md (built).
 * Built screen by screen per FRONTEND_IMPLEMENTATION_PLAN.md Phase 2: Admin Regions first
 * (`getRegions`, `createRegion`, `updateRegion`), then the NGO's own coverage routes for Organization
 * Settings. `GET /regions/{id}` isn't wrapped: the screens read the one list.
 */

export type RegionLevel = 'province' | 'district' | 'tehsil'

/** A GeoJSON geometry as the API returns it: a real nested object, `[longitude, latitude]` order. */
export interface GeoJsonGeometry {
  type: string
  coordinates: unknown
}

export interface Region {
  id: string
  name: string
  level: RegionLevel
  /** Omitted entirely (not `""`/`null`) for a region with no parent. */
  parent_region_id?: string
  boundary: GeoJsonGeometry
  created_at: string
  updated_at: string
}

export const REGIONS_QUERY_KEY = ['regions'] as const

/**
 * GET /regions — public, no auth, and **every region comes back with its full boundary**: there is
 * no way to ask for names only, no pagination, and (per the doc) the two optional filters are
 * `level` and `parent_region_id`. That's harmless for a handful of test regions and will not be for
 * a real import of a few hundred districts and tehsils; the fix belongs on the backend (an
 * `include_boundary=false` option), and this is the one function to adapt when it exists.
 */
export async function getRegions(params: { level?: RegionLevel; parentRegionId?: string } = {}): Promise<Region[]> {
  const res = await apiClient.get<Region[]>('/regions', {
    params: { level: params.level, parent_region_id: params.parentRegionId },
  })
  return res.data
}

export interface CreateRegionInput {
  name: string
  level: RegionLevel
  /** Omit (or `''`) for a top-level region. */
  parentRegionId?: string
  /** A real GeoJSON `Polygon` object — the column is `geometry(Polygon, 4326)`, so a `MultiPolygon`
   *  or a `Point` is a bare `500`. */
  boundary: GeoJsonGeometry
}

/**
 * POST /admin/regions — `admin`/`super_admin` only. The API checks almost nothing: `name` non-blank,
 * `level` in the enum, and that a given parent exists (`400 "parent region not found"`). It does
 * **not** check that the parent is one level up (a district can have a tehsil as its parent), that
 * a province has none, or that the boundary is a sound polygon — an open ring, a self-intersecting
 * bow-tie and longitude 200 all return `201` (verified). Anything PostGIS itself refuses is a
 * generic `500`. So callers do that validation themselves.
 */
export async function createRegion(input: CreateRegionInput): Promise<Region> {
  const res = await apiClient.post<Region>('/admin/regions', {
    name: input.name,
    level: input.level,
    parent_region_id: input.parentRegionId ?? '',
    boundary: input.boundary,
  })
  return res.data
}

export interface UpdateRegionInput {
  name?: string
  level?: RegionLevel
  /** `''` clears the parent (makes the region top-level); omitted leaves it alone. */
  parentRegionId?: string
  boundary?: GeoJsonGeometry
}

/**
 * PATCH /admin/regions/{id} — a real partial patch, so only the fields that changed are sent
 * (re-sending an untouched `parent_region_id: ""` would detach the region from its parent). Every
 * field omitted is `400 "at least one field must be provided to update"`. Beyond the create-time
 * gaps above, it will also accept a **cycle**: making a province's parent its own child returned
 * `200` (verified) — only "its own parent" is refused.
 */
export async function updateRegion(id: string, patch: UpdateRegionInput): Promise<Region> {
  const body: Record<string, unknown> = {}
  if (patch.name !== undefined) body.name = patch.name
  if (patch.level !== undefined) body.level = patch.level
  if (patch.parentRegionId !== undefined) body.parent_region_id = patch.parentRegionId
  if (patch.boundary !== undefined) body.boundary = patch.boundary
  const res = await apiClient.patch<Region>(`/admin/regions/${id}`, body)
  return res.data
}

export const MY_REGIONS_QUERY_KEY = ['ngo', 'me', 'regions'] as const

/**
 * GET /ngo/me/regions — the regions the caller's NGO covers, alphabetical, `[]` for none. Open to any
 * NGO staff (admin or volunteer); `403 "account is not affiliated with an ngo"` for anyone else.
 */
export async function getMyRegions(): Promise<Region[]> {
  const res = await apiClient.get<Region[]>('/ngo/me/regions')
  return res.data
}

/**
 * POST /ngo/me/regions — `ngo_admin` only. Adds one region (any level) to the NGO's coverage and
 * returns it. `409 "region already assigned to this ngo"`, and — the opposite of a bad parent on
 * `POST /admin/regions` — `404 "region not found"` for a well-formed id that doesn't exist.
 */
export async function assignRegion(regionId: string): Promise<Region> {
  const res = await apiClient.post<Region>('/ngo/me/regions', { region_id: regionId })
  return res.data
}

/**
 * DELETE /ngo/me/regions/{regionID} — `ngo_admin` only, `204` with an empty body. A region that was
 * never assigned, was already removed, or doesn't exist all give the same
 * `404 "region is not assigned to this ngo"`.
 */
export async function removeRegion(regionId: string): Promise<void> {
  await apiClient.delete(`/ngo/me/regions/${regionId}`)
}
