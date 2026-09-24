import type { AdminHazardZone, FloodPrediction, HazardZoneDetail } from '@/api/floodIntel'

const square = (x: number, y: number, size = 0.2) => ({ type: 'Polygon', coordinates: [[[x, y], [x + size, y], [x + size, y + size], [x, y + size], [x, y]]] })

export function makeAdminZone(id: string, overrides: Partial<AdminHazardZone> = {}): AdminHazardZone {
  return {
    id,
    source: 'ai_prediction',
    risk_level: 'high',
    boundary: square(68, 27),
    status: 'active',
    detected_at: new Date(Date.now() - 3 * 60_000).toISOString(),
    flood_prediction_id: `pred-${id}`,
    ...overrides,
  }
}

export function makePrediction(id: string, overrides: Partial<FloodPrediction> = {}): FloodPrediction {
  return {
    id,
    risk_level: 'high',
    confidence_score: 0.87,
    model_version: 'convlstm-unet-v3',
    valid_from: '2026-09-20T00:00:00Z',
    valid_until: '2026-09-21T00:00:00Z',
    generated_at: new Date(Date.now() - 10 * 60_000).toISOString(),
    ...overrides,
  }
}

export function makeZoneDetail(id: string, overrides: Partial<HazardZoneDetail> = {}): HazardZoneDetail {
  return {
    id,
    source: 'ai_prediction',
    risk_level: 'high',
    boundary: square(68, 27),
    status: 'active',
    detected_at: '2026-09-24T01:19:47Z',
    confidence_score: 0.87,
    model_version: 'convlstm-unet-v3',
    valid_from: '2026-09-20T00:00:00Z',
    valid_until: '2026-09-21T00:00:00Z',
    generated_at: '2026-09-20T05:58:00Z',
    ...overrides,
  }
}
