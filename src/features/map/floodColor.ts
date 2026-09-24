import type { MapOverlayEntry, RiskLevel } from '@/api/floodIntel'

/**
 * The colour ramp the ML team's own heatmaps use (and `map-preview/` validated): near-white green →
 * green → yellow → red as the value rises. Stops as `[value, [r, g, b]]`.
 */
const STOPS: ReadonlyArray<readonly [number, readonly [number, number, number]]> = [
  [0, [247, 252, 245]],
  [0.33, [65, 171, 93]],
  [0.66, [255, 255, 51]],
  [1, [227, 26, 28]],
]

/** A continuous colour for a probability-like value in `[0, 1]` (clamped; NaN reads as 0). */
export function probabilityToColor(value: number): string {
  const p = Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : 0
  for (let i = 0; i < STOPS.length - 1; i += 1) {
    const [from, fromColor] = STOPS[i]
    const [to, toColor] = STOPS[i + 1]
    if (p <= to) {
      const t = to === from ? 0 : (p - from) / (to - from)
      return `rgb(${fromColor.map((channel, index) => Math.round(channel + t * (toColor[index] - channel))).join(',')})`
    }
  }
  return `rgb(${STOPS[STOPS.length - 1][1].join(',')})`
}

/** The design system's status colours, as the raw hex Leaflet needs: low → caution, medium → high, high → critical. */
export const RISK_COLOR: Record<RiskLevel, string> = {
  low: '#e0a100',
  medium: '#f0740b',
  high: '#d42e2e',
}

export const RISK_LABEL: Record<RiskLevel, string> = { low: 'Low', medium: 'Medium', high: 'High' }

/** Highest first. */
/** The confidence below which the server never returns a model zone to a citizen (`GET /map/flood-overlay`) — declared-by-hand zones are exempt. */
export const CITIZEN_MODEL_FLOOR = 0.34

export const RISK_RANK: Record<RiskLevel, number> = { low: 0, medium: 1, high: 2 }

export interface HazardPathStyle {
  color: string
  weight: number
  fillColor: string
  fillOpacity: number
}

/**
 * How to draw one hazard zone (`Path` options for Leaflet). The **outline is always the risk level's colour**
 * so the level reads at a glance. The **fill** follows the plan's corrected flood-visualisation spec: when the
 * model gave a confidence, fill by that value on the continuous ramp and let opacity rise with it; a manually
 * declared zone has no confidence (the field is absent), so it gets a flat fill in the risk colour instead of
 * an invented gradient. A selected zone is drawn heavier.
 */
export function hazardStyle(entry: Pick<MapOverlayEntry, 'risk_level' | 'confidence_score'>, selected = false): HazardPathStyle {
  const outline = RISK_COLOR[entry.risk_level]
  const confidence = entry.confidence_score
  const hasConfidence = typeof confidence === 'number' && Number.isFinite(confidence)
  const fillColor = hasConfidence ? probabilityToColor(confidence) : outline
  const fillOpacity = hasConfidence ? 0.25 + 0.5 * Math.min(1, Math.max(0, confidence)) : 0.35
  return {
    color: outline,
    weight: selected ? 4 : 2,
    fillColor,
    fillOpacity: Math.min(0.9, fillOpacity + (selected ? 0.15 : 0)),
  }
}

/** `0.87` → `87`. */
export const confidencePercent = (confidence: number) => Math.round(Math.min(1, Math.max(0, confidence)) * 100)
