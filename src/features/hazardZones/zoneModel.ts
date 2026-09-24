import type { AdminHazardZone, HazardSource, HazardZoneDetail, MapOverlayEntry } from '@/api/floodIntel'
import { RISK_LABEL } from '@/features/map/floodColor'
import type { ViewportBounds } from '@/features/map/mapGeo'

export const SOURCE_LABEL: Record<HazardSource, string> = {
  ai_prediction: 'Model forecast',
  manual_admin: 'Declared by an admin',
  manual_ngo: 'Declared by an NGO',
}

/** A zone has no name, so it is described by what it is: "High-risk flood zone" for a model zone, "…hazard zone" for a declared one. */
export const zoneTitle = (zone: Pick<AdminHazardZone, 'risk_level' | 'source'>) => `${RISK_LABEL[zone.risk_level]}-risk ${zone.source === 'ai_prediction' ? 'flood zone' : 'hazard zone'}`

/** The start of an id, enough to tell rows with the same title apart. */
export const shortId = (id: string) => id.slice(0, 8)

/** The two dates of the range filter, as an `<input type="date">` holds them (`YYYY-MM-DD`, or empty). */
export interface DateRange {
  from: string
  to: string
}

const DAY = /^\d{4}-\d{2}-\d{2}$/

/** A range whose start is after its end — which would match nothing, so the page says so instead of asking. */
export const isReversedRange = ({ from, to }: DateRange) => DAY.test(from) && DAY.test(to) && from > to

/**
 * The range as the API wants it: RFC 3339 timestamps, `from` at the start of its day and `to` at the end of its day, in the viewer's
 * time zone. The API answers a malformed value with a hard `400`, so a value that isn't a real date is left out rather than sent.
 */
export function rangeToParams({ from, to }: DateRange): { from?: string; to?: string } {
  const params: { from?: string; to?: string } = {}
  const start = DAY.test(from) ? new Date(`${from}T00:00:00`) : null
  const end = DAY.test(to) ? new Date(`${to}T23:59:59.999`) : null
  if (start && !Number.isNaN(start.getTime())) params.from = start.toISOString()
  if (end && !Number.isNaN(end.getTime())) params.to = end.toISOString()
  return params
}

/** The visible box as a GeoJSON `Polygon` (counter-clockwise, closed, four decimals ≈ 10 m) — a starting point for declaring a zone. */
export function viewportBoundaryText(view: ViewportBounds): string {
  const r = (value: number) => Number(value.toFixed(4))
  const [w, s, e, n] = [r(view.west), r(view.south), r(view.east), r(view.north)]
  return JSON.stringify({ type: 'Polygon', coordinates: [[[w, s], [e, s], [e, n], [w, n], [w, s]]] }, null, 2)
}

/** A zone from the admin table as the map's own entry — no confidence (the table doesn't carry one), so it is drawn flat. */
export const zoneToOverlayEntry = (zone: Pick<AdminHazardZone, 'id' | 'risk_level' | 'boundary' | 'detected_at'>): MapOverlayEntry => ({
  hazard_zone_id: zone.id,
  risk_level: zone.risk_level,
  boundary: zone.boundary,
  detected_at: zone.detected_at,
})

/** A zone from the detail route as the map's entry, keeping the confidence when it has one. */
export const detailToOverlayEntry = (detail: HazardZoneDetail): MapOverlayEntry => ({
  hazard_zone_id: detail.id,
  risk_level: detail.risk_level,
  boundary: detail.boundary,
  detected_at: detail.detected_at,
  ...(detail.confidence_score === undefined ? {} : { confidence_score: detail.confidence_score }),
})
