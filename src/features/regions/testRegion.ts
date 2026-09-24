import type { Region, RegionLevel } from '@/api/geo'

export const SQUARE_BOUNDARY = {
  type: 'Polygon',
  coordinates: [[[67, 24], [68, 24], [68, 25], [67, 25], [67, 24]]],
}

/** A region as the API returns it, for tests. `parent` is omitted (not `""`) for a top-level one. */
export function makeRegion(id: string, name: string, level: RegionLevel, parent?: string, overrides: Partial<Region> = {}): Region {
  return {
    id,
    name,
    level,
    ...(parent ? { parent_region_id: parent } : {}),
    boundary: SQUARE_BOUNDARY,
    created_at: '2026-03-01T09:30:00Z',
    updated_at: '2026-03-02T10:45:00Z',
    ...overrides,
  }
}

/** Sindh › (Sukkur › Sukkur City, Larkana), Punjab, and one district with no parent. */
export const sampleRegions: Region[] = [
  makeRegion('sindh', 'Sindh', 'province'),
  makeRegion('punjab', 'Punjab', 'province'),
  makeRegion('sukkur', 'Sukkur', 'district', 'sindh'),
  makeRegion('larkana', 'Larkana', 'district', 'sindh'),
  makeRegion('sukkur-city', 'Sukkur City', 'tehsil', 'sukkur'),
  makeRegion('orphan', 'Orphan District', 'district'),
]
