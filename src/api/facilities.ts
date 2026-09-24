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
