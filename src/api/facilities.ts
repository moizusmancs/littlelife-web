import { apiClient } from '@/api/client'

/**
 * Facilities — shelters, infrastructure, essential locations (offline map packages come later).
 * Backend doc: api/04-facilities.md (built). Filled in during Phase 3 with the public, read-only halves
 * the Citizen Map needs.
 *
 * **Every read here is scoped by `region_id`, and `region_id` is required** — there is no bbox and no
 * nationwide query, and a place's region is worked out by a spatial join at read time. Anything that lies
 * outside every region is therefore unreachable through the API.
 */

/** Embedded GeoJSON point — **`[longitude, latitude]`**, the reverse of Leaflet's `[lat, lng]`. */
export interface PointGeometry {
  type: 'Point'
  coordinates: [number, number]
}

export interface Shelter {
  id: string
  name: string
  type: 'shelter' | 'relief_center'
  location: PointGeometry
  region_id?: string
  capacity_total: number
  capacity_current: number
  certification_status: 'certified' | 'pending' | 'uncertified'
  /** The managing NGO's own operational status — separate from the crowdsourced status reports. */
  status: 'open' | 'closed'
  managed_by_ngo_id?: string
  created_at: string
  updated_at: string
}

export interface Infrastructure {
  id: string
  name: string
  type: 'hospital' | 'bridge' | 'utility'
  location: PointGeometry
  region_id?: string
  status: 'safe' | 'at_risk' | 'damaged'
  last_status_update: string
  created_at: string
}

export interface EssentialLocation {
  id: string
  name: string
  type: 'atm' | 'grocery_store' | 'pharmacy'
  location: PointGeometry
  region_id?: string
  /** The most recent crowdsourced report. **Omitted — not defaulted to open — when nobody has reported**, so absence means "unknown". */
  current_status?: 'open' | 'closed'
  status_reported_at?: string
  created_at: string
}

export type FacilityKind = 'shelters' | 'infrastructure' | 'essential-locations'

export const facilityQueryKey = (kind: FacilityKind, regionId: string) => ['map', kind, regionId] as const

const read =
  <T>(kind: FacilityKind) =>
  async (regionId: string): Promise<T[]> => {
    const res = await apiClient.get<T[]>(`/${kind}`, { params: { region_id: regionId } })
    return res.data
  }

/** GET /shelters?region_id= — public. `400` for a missing or malformed region id. */
export const getShelters = read<Shelter>('shelters')
/** GET /infrastructure?region_id= — public. */
export const getInfrastructure = read<Infrastructure>('infrastructure')
/** GET /essential-locations?region_id= — public, each enriched with its latest status report if any. */
export const getEssentialLocations = read<EssentialLocation>('essential-locations')

export const shelterQueryKey = (id: string) => ['shelter', id] as const

/** GET /shelters/{id} — public. `404` for an unknown id, `400` for one that isn't a UUID. */
export async function getShelter(id: string): Promise<Shelter> {
  const res = await apiClient.get<Shelter>(`/shelters/${encodeURIComponent(id)}`)
  return res.data
}

/** What an organisation manages: `GET /ngo/shelters`. Every write below is followed by a refetch of this list. */
export const MY_SHELTERS_QUERY_KEY = ['ngo', 'shelters'] as const

/**
 * GET /ngo/shelters — any NGO staff (admin or volunteer). Everything the caller's own organisation manages, by a direct filter on
 * `managed_by_ngo_id` rather than a region join, so there is no `region_id` here (and none on the rows, though the doc says the shape
 * is the public one) and a shelter outside every region is still listed. **Unordered** — sort in the browser. `403` for an account
 * with no organisation.
 */
export async function getMyShelters(): Promise<Shelter[]> {
  const res = await apiClient.get<Shelter[]>('/ngo/shelters')
  return res.data
}

/** Largest `capacity_total` the API stores: a Go `int` bound to a 32-bit column, so one more is a bare `500`. */
export const MAX_SHELTER_CAPACITY = 2_147_483_647

export interface RegisterShelterInput {
  name: string
  type: Shelter['type']
  /** `[longitude, latitude]` — GeoJSON order. */
  location: PointGeometry
  /** A positive whole number (`0`, a negative and a fraction are all `400`). */
  capacityTotal: number
}

/**
 * POST /ngo/shelters — `ngo_admin` only. It always starts `pending` certification, `open`, with nobody in it, and the managing
 * organisation is the caller's own (never a field). **The API checks the point barely at all:** longitude 200 / latitude 95 and a
 * latitude/longitude swap are both `201` (verified); a Polygon or a three-number point is a bare `500`, as is a capacity over
 * {@link MAX_SHELTER_CAPACITY}. Callers validate the coordinates themselves.
 */
export async function registerShelter(input: RegisterShelterInput): Promise<Shelter> {
  const res = await apiClient.post<Shelter>('/ngo/shelters', {
    name: input.name,
    type: input.type,
    location: input.location,
    capacity_total: input.capacityTotal,
  })
  return res.data
}

/**
 * PATCH /shelters/{id}/occupancy — any NGO staff of the organisation that manages the shelter. `capacity_current` must be a whole
 * number from `0` to `capacity_total` (`400` otherwise — so a shelter can't record being over-full). **The field is not really
 * required:** an empty body is `200` and sets it to `0`, so always send a number. `404` unknown shelter, `403` another
 * organisation's.
 */
export async function updateShelterOccupancy(id: string, capacityCurrent: number): Promise<Shelter> {
  const res = await apiClient.patch<Shelter>(`/shelters/${encodeURIComponent(id)}/occupancy`, { capacity_current: capacityCurrent })
  return res.data
}

export interface ShelterChanges {
  certification_status?: Shelter['certification_status']
  status?: Shelter['status']
}

/**
 * PATCH /shelters/{id} — `ngo_admin` of the managing organisation. A real partial patch of **exactly two fields**; anything else in
 * the body (a new name, capacity or location) is ignored with a `200` and no change, so a shelter's name, capacity and place can
 * never be corrected after registration. At least one field is required (`400`).
 */
export async function updateShelter(id: string, changes: ShelterChanges): Promise<Shelter> {
  const res = await apiClient.patch<Shelter>(`/shelters/${encodeURIComponent(id)}`, changes)
  return res.data
}

export type ReportedStatus = 'open' | 'closed'

export interface EssentialStatusReport {
  id: string
  essential_location_id: string
  status: ReportedStatus
  created_at: string
}

/**
 * POST /essential-locations/{id}/status-reports — any signed-in account. A time-series log, not a vote: nothing stops the same person
 * reporting again, and the most recent report is what `current_status` on the list then says. The reporter is stored but never returned.
 * `404` if the place no longer exists, `400` for a status that isn't `open`/`closed`.
 */
export async function reportEssentialLocationStatus(id: string, status: ReportedStatus): Promise<EssentialStatusReport> {
  const res = await apiClient.post<EssentialStatusReport>(`/essential-locations/${encodeURIComponent(id)}/status-reports`, { status })
  return res.data
}

export type InfrastructureType = Infrastructure['type']
export type InfrastructureStatus = Infrastructure['status']

export interface AddInfrastructureInput {
  name: string
  type: InfrastructureType
  /** `[longitude, latitude]` — GeoJSON order. */
  location: PointGeometry
}

/**
 * POST /admin/infrastructure — `admin` / `super_admin` only (`403 "insufficient permissions"` for an NGO admin or a citizen, verified). It always starts
 * `safe`: the route has no way to set another initial status. **It checks almost nothing about the point** — longitude 200 / latitude 95, a swapped pair and a
 * point outside every region are all `201` (verified); a Polygon or a three-number point is a bare `500` — and there is **no route to list, edit or delete** what
 * it made outside a region, so a bad point is permanent. Callers validate the coordinates themselves.
 */
export async function addInfrastructure(input: AddInfrastructureInput): Promise<Infrastructure> {
  const res = await apiClient.post<Infrastructure>('/admin/infrastructure', { name: input.name, type: input.type, location: input.location })
  return res.data
}

/**
 * PATCH /admin/infrastructure/{id}/status — `admin` / `super_admin`. Not a partial patch: it only sets the status, in any direction (`at_risk` → `safe` → `at_risk` is a
 * normal cycle), and **setting the status it already has is a `200` that still moves `last_status_update`** (verified). `404` for an unknown id, `400` for a
 * malformed one or a status outside the three.
 */
export async function updateInfrastructureStatus(id: string, status: InfrastructureStatus): Promise<Infrastructure> {
  const res = await apiClient.patch<Infrastructure>(`/admin/infrastructure/${encodeURIComponent(id)}/status`, { status })
  return res.data
}

export type EssentialType = EssentialLocation['type']

export interface AddEssentialLocationInput {
  name: string
  type: EssentialType
  location: PointGeometry
}

/**
 * POST /admin/essential-locations — `admin` / `super_admin` only. The manual fallback: the intended way these arrive is a bulk import. The place has **no status at all** —
 * only a citizen's report ever gives it one — and, as for infrastructure, the point is barely checked (`201` outside every region and for longitude 200; a Polygon is a bare `500`).
 */
export async function addEssentialLocation(input: AddEssentialLocationInput): Promise<EssentialLocation> {
  const res = await apiClient.post<EssentialLocation>('/admin/essential-locations', { name: input.name, type: input.type, location: input.location })
  return res.data
}

/** One entry of a place's report log: what was reported and when. **Nothing about who** — the reporter is stored server-side and never returned. */
export interface EssentialReportEntry {
  id: string
  status: ReportedStatus
  created_at: string
}

export const essentialReportsQueryKey = (id: string) => ['essential-reports', id] as const

/**
 * GET /essential-locations/{id}/status-reports — public, the whole log newest first. **Never a `404`**: an unknown id is `[]` (a `400` only for one that isn't a UUID), so
 * "no reports" and "no such place" look the same.
 */
export async function getEssentialReports(id: string): Promise<EssentialReportEntry[]> {
  const res = await apiClient.get<EssentialReportEntry[]>(`/essential-locations/${encodeURIComponent(id)}/status-reports`)
  return res.data
}
