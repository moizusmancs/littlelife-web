import type { EssentialLocation, Infrastructure, Shelter } from '@/api/facilities'
import type { MapOverlayEntry } from '@/api/floodIntel'

const square = (lng: number, lat: number, size = 0.1) => ({
  type: 'Polygon',
  coordinates: [[[lng, lat], [lng + size, lat], [lng + size, lat + size], [lng, lat + size], [lng, lat]]],
})

/** A hazard-zone overlay entry for tests; `confidence` omitted (undefined) makes it a manual zone. */
export function makeHazard(id: string, risk: MapOverlayEntry['risk_level'], confidence?: number, at: [number, number] = [68.8, 27.6]): MapOverlayEntry {
  return {
    hazard_zone_id: id,
    risk_level: risk,
    boundary: square(at[0], at[1]),
    ...(confidence === undefined ? {} : { confidence_score: confidence }),
    detected_at: '2026-09-24T01:19:47Z',
  }
}

export function makeShelter(id: string, name: string, overrides: Partial<Shelter> = {}): Shelter {
  return {
    id,
    name,
    type: 'shelter',
    location: { type: 'Point', coordinates: [68.86, 27.7] },
    capacity_total: 400,
    capacity_current: 210,
    certification_status: 'certified',
    status: 'open',
    created_at: '2026-09-18T00:00:00Z',
    updated_at: '2026-09-24T06:00:00Z',
    ...overrides,
  }
}

export function makeInfrastructure(id: string, name: string, overrides: Partial<Infrastructure> = {}): Infrastructure {
  return {
    id,
    name,
    type: 'hospital',
    location: { type: 'Point', coordinates: [68.87, 27.71] },
    status: 'safe',
    last_status_update: '2026-09-24T06:00:00Z',
    created_at: '2026-09-18T00:00:00Z',
    ...overrides,
  }
}

export function makeEssential(id: string, name: string, overrides: Partial<EssentialLocation> = {}): EssentialLocation {
  return {
    id,
    name,
    type: 'pharmacy',
    location: { type: 'Point', coordinates: [68.88, 27.72] },
    created_at: '2026-09-01T00:00:00Z',
    ...overrides,
  }
}
