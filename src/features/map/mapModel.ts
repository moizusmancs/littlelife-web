import type { EssentialLocation, Infrastructure, Shelter } from '@/api/facilities'
import type { MapOverlayEntry, RiskLevel } from '@/api/floodIntel'
import { RISK_LABEL, RISK_RANK, confidencePercent } from './floodColor'
import type { LatLng } from './mapGeo'

/** The colour family a marker or badge uses; `neutral` is "nobody has said". */
export type Tone = 'safe' | 'caution' | 'critical' | 'neutral'

export type PlaceKind = 'shelter' | 'infrastructure' | 'essential'

interface PlaceBase {
  /** `kind:id` — unique across kinds, since ids are only unique within one. */
  key: string
  name: string
  /** `[lat, lng]` — Leaflet's order, already swapped from the API's GeoJSON. */
  position: LatLng
  typeLabel: string
  statusLabel: string
  tone: Tone
}

export type MapPlace =
  | (PlaceBase & { kind: 'shelter'; id: string; data: Shelter })
  | (PlaceBase & { kind: 'infrastructure'; id: string; data: Infrastructure })
  | (PlaceBase & { kind: 'essential'; id: string; data: EssentialLocation })

/** A GeoJSON point is `[lng, lat]`. */
const position = (point: { coordinates: [number, number] }): LatLng => [point.coordinates[1], point.coordinates[0]]

const SHELTER_TYPE = { shelter: 'Shelter', relief_center: 'Relief center' } as const
const INFRA_TYPE = { hospital: 'Hospital', bridge: 'Bridge', utility: 'Utility' } as const
const INFRA_STATUS = { safe: 'Safe', at_risk: 'At risk', damaged: 'Damaged' } as const
const INFRA_TONE = { safe: 'safe', at_risk: 'caution', damaged: 'critical' } as const
const ESSENTIAL_TYPE = { atm: 'ATM', grocery_store: 'Grocery store', pharmacy: 'Pharmacy' } as const

export function shelterPlace(shelter: Shelter): MapPlace {
  return {
    kind: 'shelter',
    id: shelter.id,
    key: `shelter:${shelter.id}`,
    name: shelter.name,
    position: position(shelter.location),
    typeLabel: SHELTER_TYPE[shelter.type] ?? 'Shelter',
    statusLabel: shelter.status === 'open' ? 'Open' : 'Closed',
    tone: shelter.status === 'open' ? 'safe' : 'critical',
    data: shelter,
  }
}

export function infrastructurePlace(item: Infrastructure): MapPlace {
  return {
    kind: 'infrastructure',
    id: item.id,
    key: `infrastructure:${item.id}`,
    name: item.name,
    position: position(item.location),
    typeLabel: INFRA_TYPE[item.type] ?? 'Infrastructure',
    statusLabel: INFRA_STATUS[item.status] ?? item.status,
    tone: INFRA_TONE[item.status] ?? 'neutral',
    data: item,
  }
}

/** No report means "unknown", never "open": the API omits `current_status` rather than defaulting it. */
export function essentialPlace(item: EssentialLocation): MapPlace {
  const reported = item.current_status
  return {
    kind: 'essential',
    id: item.id,
    key: `essential:${item.id}`,
    name: item.name,
    position: position(item.location),
    typeLabel: ESSENTIAL_TYPE[item.type] ?? 'Essential',
    statusLabel: reported === 'open' ? 'Open' : reported === 'closed' ? 'Closed' : 'Status unknown',
    tone: reported === 'open' ? 'safe' : reported === 'closed' ? 'critical' : 'neutral',
    data: item,
  }
}

/** Places from several regions can repeat (a place inside a district is also inside its province). First one wins. */
export function dedupePlaces(places: readonly MapPlace[]): MapPlace[] {
  const seen = new Set<string>()
  return places.filter((place) => (seen.has(place.key) ? false : (seen.add(place.key), true)))
}

/** Case-insensitive search over a place's name, type and status — "hosp" finds hospitals, "open" open ones. */
export function placeMatches(place: MapPlace, query: string): boolean {
  const needle = query.trim().toLowerCase()
  if (needle === '') return true
  return [place.name, place.typeLabel, place.statusLabel].some((text) => text.toLowerCase().includes(needle))
}

export interface CapacityInfo {
  current: number
  total: number
  /** The honest ratio — may exceed 100. */
  percent: number
  /** What the bar can show: `percent` held to 0–100. */
  barPercent: number
  over: boolean
  tone: Tone
}

/**
 * A shelter's occupancy. The tone rises with how full it is (under 75% safe, under 90% caution, then critical);
 * a shelter reporting more people than places is flagged `over` while its bar stays full rather than overflowing;
 * a shelter with no capacity recorded reads as 0%, not NaN.
 */
export function capacityInfo(shelter: Pick<Shelter, 'capacity_current' | 'capacity_total'>): CapacityInfo {
  const current = Math.max(0, shelter.capacity_current)
  const total = Math.max(0, shelter.capacity_total)
  const percent = total > 0 ? Math.round((current / total) * 100) : 0
  return {
    current,
    total,
    percent,
    barPercent: Math.min(100, percent),
    over: total > 0 && current > total,
    tone: percent < 75 ? 'safe' : percent < 90 ? 'caution' : 'critical',
  }
}

/** "Certified", "Pending certification", "Not certified". */
export const CERTIFICATION_LABEL: Record<Shelter['certification_status'], string> = {
  certified: 'Certified',
  pending: 'Pending certification',
  uncertified: 'Not certified',
}

/** Hazard zones, worst first: high before medium before low, then the model's confidence, then the newest. */
export function sortHazards<T extends MapOverlayEntry>(entries: readonly T[]): T[] {
  return [...entries].sort(
    (a, b) =>
      RISK_RANK[b.risk_level] - RISK_RANK[a.risk_level] ||
      (b.confidence_score ?? -1) - (a.confidence_score ?? -1) ||
      Date.parse(b.detected_at) - Date.parse(a.detected_at),
  )
}

/**
 * The overlay can return the same polygon many times over: each run of the flood pipeline writes a fresh zone for every cell
 * and nothing resolves the old ones, so one grid cell can be there dozens of times (a real database held ~20,000 active zones
 * for ~650 distinct cells). Drawn as they come they stack into a heavy pile and list as dozens of identical rows, so this keeps
 * one zone per distinct boundary — the worst risk, then the most confident, then the newest, the same order the list uses. A
 * manual zone drawn over a model zone has a different boundary and is not affected.
 */
export function collapseDuplicateZones<T extends MapOverlayEntry>(entries: readonly T[]): T[] {
  const best = new Map<string, T>()
  for (const entry of sortHazards(entries)) {
    const key = JSON.stringify(entry.boundary)
    if (!best.has(key)) best.set(key, entry)
  }
  return [...best.values()]
}

/** The order to *draw* zones in: the least severe first, so the worst sits on top and stays clickable. */
export const drawOrder = <T extends MapOverlayEntry>(entries: readonly T[]): T[] => sortHazards(entries).reverse()

/**
 * A zone has no name, so it is described by what it is. The overlay doesn't say who made a zone, but a model
 * zone always carries a confidence and a manual one never does, so that tells them apart.
 */
export const hazardTitle = (entry: Pick<MapOverlayEntry, 'risk_level' | 'confidence_score'>) =>
  `${RISK_LABEL[entry.risk_level]}-risk ${typeof entry.confidence_score === 'number' ? 'flood zone' : 'hazard zone'}`

/** "87% model confidence" for a model zone, "Declared by an admin or NGO" for a manual one. */
export const hazardBasis = (entry: Pick<MapOverlayEntry, 'confidence_score'>) =>
  typeof entry.confidence_score === 'number' ? `${confidencePercent(entry.confidence_score)}% model confidence` : 'Declared by staff'

/** Whether a hazard matches the search text (its title, risk and basis) — an empty search matches everything. */
export function hazardMatches(entry: MapOverlayEntry, query: string): boolean {
  const needle = query.trim().toLowerCase()
  if (needle === '') return true
  return [hazardTitle(entry), hazardBasis(entry), 'hazard flood'].some((text) => text.toLowerCase().includes(needle))
}

export const riskTone = (risk: RiskLevel): Tone => (risk === 'high' ? 'critical' : risk === 'medium' ? 'caution' : 'safe')
