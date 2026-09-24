import { apiClient } from '@/api/client'
import type { GeoJsonGeometry } from '@/api/geo'

/**
 * Flood Intelligence — hazard zones and the map overlay.
 * Backend doc: api/03-flood-intelligence.md (built). Filled in during Phase 3 (the Citizen Map).
 *
 * The doc is explicit that **a "hazard zone" comes in three different shapes that are not
 * interchangeable** — the map-rendering one names its id `hazard_zone_id`, the tooltip one flattens
 * the paired prediction's fields onto the zone, and the aggregate (admin) one is a third shape. They
 * are three types here on purpose. Only the first two are used so far.
 */

export type RiskLevel = 'low' | 'medium' | 'high'

/** One entry of `GET /map/flood-overlay` — the bulk map-rendering shape (`hazard_zone_id`, not `id`). */
export interface MapOverlayEntry {
  hazard_zone_id: string
  risk_level: RiskLevel
  boundary: GeoJsonGeometry
  /**
   * The model's confidence in this zone's classification for its forecast horizon — **not** the fraction
   * of the area flooded, and the backend derives `risk_level` from it with fixed thresholds. Omitted
   * entirely for a manually declared zone, which has no paired prediction (so: draw it flat).
   */
  confidence_score?: number
  detected_at: string
}

/** A viewport is `west,south,east,north` — the order Leaflet's `getBounds().toBBoxString()` produces. */
export const floodOverlayQueryKey = (bbox: string) => ['map', 'flood-overlay', bbox] as const

/**
 * GET /map/flood-overlay?bbox=west,south,east,north — public. Only `status: "active"` zones intersecting
 * the rectangle, newest data as returned. There is **no server-side size cap**: a huge bbox just returns a
 * lot, so callers pass the real viewport.
 */
export async function getFloodOverlay(bbox: string): Promise<MapOverlayEntry[]> {
  const res = await apiClient.get<MapOverlayEntry[]>('/map/flood-overlay', { params: { bbox } })
  return res.data
}

export type HazardSource = 'ai_prediction' | 'manual_admin' | 'manual_ngo'

/** `GET /hazard-zones/{id}` — the map-tooltip shape. The five prediction fields are omitted for a manual zone. */
export interface HazardZoneDetail {
  id: string
  source: HazardSource
  risk_level: RiskLevel
  boundary: GeoJsonGeometry
  status: 'active' | 'resolved'
  detected_at: string
  resolved_at?: string
  confidence_score?: number
  model_version?: string
  valid_from?: string
  valid_until?: string
  generated_at?: string
}

export const hazardZoneQueryKey = (id: string) => ['map', 'hazard-zone', id] as const

/** GET /hazard-zones/{id} — public. `400` for a malformed id, `404 "hazard zone not found"`. */
export async function getHazardZone(id: string): Promise<HazardZoneDetail> {
  const res = await apiClient.get<HazardZoneDetail>(`/hazard-zones/${id}`)
  return res.data
}

/** `POST /hazard-zones/risk-check`. `hazard_zone_id`/`risk_level` are omitted when no active zone exists anywhere. */
export interface RiskCheckResult {
  inside_hazard_zone: boolean
  hazard_zone_id?: string
  risk_level?: RiskLevel
  distance_meters: number
}

export const riskCheckQueryKey = (lat: number, lng: number) => ['map', 'risk-check', lat, lng] as const

/**
 * POST /hazard-zones/risk-check — public, and a `POST` on purpose so the live GPS position never lands in a
 * URL or an access log; nothing is stored. **`lat`/`lng` have no presence validation on the server**: leaving
 * one out silently means `0`, a valid point in the Atlantic that gets a normal `200`. So this only ever
 * sends two finite numbers, and refuses to call otherwise.
 */
export async function checkRisk(lat: number, lng: number): Promise<RiskCheckResult> {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) throw new Error('A risk check needs real coordinates.')
  const res = await apiClient.post<RiskCheckResult>('/hazard-zones/risk-check', { lat, lng })
  return res.data
}

// ---------------------------------------------------------------------------------------------------------------------------------
// Admin — the zone table, the predictions table, the unfiltered overlay, and declaring / resolving a zone.
// ---------------------------------------------------------------------------------------------------------------------------------

/**
 * A zone in the admin table, and what declaring and resolving return — the third shape, "the full aggregate". `region_id`,
 * `created_by` and `flood_prediction_id` are **omitted entirely** when they don't apply (a model zone has no `created_by`, a declared
 * one no prediction), and `resolved_at` only once resolved. Note it carries no confidence: that lives on the paired prediction.
 */
export interface AdminHazardZone {
  id: string
  source: HazardSource
  risk_level: RiskLevel
  boundary: GeoJsonGeometry
  region_id?: string
  status: 'active' | 'resolved'
  created_by?: string
  detected_at: string
  resolved_at?: string
  flood_prediction_id?: string
}

/** The admin tables are **paginated envelopes** now, not bare arrays; `total` counts what matches the filters, not just this page. */
export interface AdminZonesPage {
  zones: AdminHazardZone[]
  total: number
  limit: number
  offset: number
}

export interface ZoneFilters {
  /** RFC 3339, on `detected_at`. Invalid values are a hard `400`, so callers send only real timestamps. */
  from?: string
  to?: string
  status?: 'active' | 'resolved'
  limit: number
  offset: number
}

export const adminZonesQueryKey = (filters: ZoneFilters) => ['admin', 'hazard-zones', filters] as const

/**
 * GET /admin/hazard-zones — admin / super_admin. Newest first, and **no implicit status filter** (omitted means every zone, resolved
 * too). `limit` is 1–100 and anything else is silently replaced with 20 by the server, so callers stay inside it.
 */
export async function getAdminHazardZones(filters: ZoneFilters): Promise<AdminZonesPage> {
  const res = await apiClient.get<AdminZonesPage>('/admin/hazard-zones', { params: filters })
  return res.data
}

/** One model run's output for one tile — `GET /admin/flood-predictions`. `uncertainty_score` and `probability_raster_url` are omitted when null. */
export interface FloodPrediction {
  id: string
  risk_level: RiskLevel
  confidence_score: number
  uncertainty_score?: number
  probability_raster_url?: string
  model_version: string
  valid_from: string
  valid_until: string
  generated_at: string
}

export interface PredictionsPage {
  predictions: FloodPrediction[]
  total: number
  limit: number
  offset: number
}

export interface PredictionFilters {
  /** RFC 3339, on `generated_at`. */
  from?: string
  to?: string
  limit: number
  offset: number
}

export const adminPredictionsQueryKey = (filters: PredictionFilters) => ['admin', 'flood-predictions', filters] as const

/** GET /admin/flood-predictions — admin / super_admin. Newest first, the full history (no validity window), same paging rules as the zones. */
export async function getAdminFloodPredictions(filters: PredictionFilters): Promise<PredictionsPage> {
  const res = await apiClient.get<PredictionsPage>('/admin/flood-predictions', { params: filters })
  return res.data
}

/** An entry of the admin overlay: the citizen's shape plus who made the zone. */
export interface AdminOverlayEntry extends MapOverlayEntry {
  source: HazardSource
}

export const adminOverlayQueryKey = (bbox: string, minConfidence: number) => ['admin', 'flood-overlay', bbox, minConfidence] as const

/**
 * GET /admin/map/flood-overlay — admin / super_admin. **Every** active zone in the box, low-confidence model output included (the
 * citizen overlay never returns model zones under 0.34). `min_confidence` (0–1, inclusive) is the slider: model zones below it are
 * dropped, declared zones always stay. Sent only when above zero, since omitting it means "everything".
 */
export async function getAdminFloodOverlay(bbox: string, minConfidence: number): Promise<AdminOverlayEntry[]> {
  const res = await apiClient.get<AdminOverlayEntry[]>('/admin/map/flood-overlay', { params: { bbox, ...(minConfidence > 0 ? { min_confidence: minConfidence } : {}) } })
  return res.data
}

export interface DeclareZoneInput {
  boundary: GeoJsonGeometry
  risk_level: RiskLevel
}

/**
 * POST /admin/hazard-zones — admin, super_admin **or ngo_admin** (a broader list than the rest of the path). `source` is never sent:
 * the server derives it from the caller's role. Always created active. `400` for a missing boundary or a `risk_level` that isn't low, medium or high.
 */
export async function declareHazardZone(input: DeclareZoneInput): Promise<AdminHazardZone> {
  const res = await apiClient.post<AdminHazardZone>('/admin/hazard-zones', input)
  return res.data
}

/**
 * PATCH /admin/hazard-zones/{id}/resolve — admin / super_admin only (an NGO admin can't resolve even their own). No body. An already
 * resolved zone is a `400 "hazard zone is not active"` — not the `409` other double transitions use — and an unknown one a `404`.
 */
export async function resolveHazardZone(id: string): Promise<AdminHazardZone> {
  const res = await apiClient.patch<AdminHazardZone>(`/admin/hazard-zones/${encodeURIComponent(id)}/resolve`)
  return res.data
}
