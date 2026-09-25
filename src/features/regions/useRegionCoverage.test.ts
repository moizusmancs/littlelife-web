import { describe, expect, it } from 'vitest'
import type { Region } from '@/api/geo'
import { coverageFor } from './useRegionCoverage'

const box = (west: number, south: number, east: number, north: number) => [[[west, south], [east, south], [east, north], [west, north], [west, south]]]
const region = (id: string, name: string, level: Region['level'], boundary: Region['boundary'], parent?: string): Region => ({ id, name, level, boundary, ...(parent ? { parent_region_id: parent } : {}), created_at: '', updated_at: '' })
const regions = [region('p', 'Sindh', 'province', { type: 'Polygon', coordinates: box(66, 24, 71, 29) }), region('d', 'Sukkur', 'district', { type: 'Polygon', coordinates: box(68.5, 27.4, 69.2, 28) }, 'p')]

describe('coverageFor', () => {
  it('names the most specific region a point is in', () => {
    expect(coverageFor(regions, [27.7, 68.9])).toEqual({ status: 'inside', path: 'Sindh › Sukkur' })
    expect(coverageFor(regions, [25, 67])).toEqual({ status: 'inside', path: 'Sindh' })
  })

  it('says "outside" for a point in no region', () => {
    expect(coverageFor(regions, [18.3, 72.3])).toEqual({ status: 'outside' })
  })

  it('claims nothing — neither inside nor outside — without a point, without regions, or before they have loaded', () => {
    expect(coverageFor(regions, null)).toEqual({ status: 'none' })
    expect(coverageFor([], [27.7, 68.9])).toEqual({ status: 'none' })
    expect(coverageFor(undefined, [27.7, 68.9])).toEqual({ status: 'none' })
  })
})
