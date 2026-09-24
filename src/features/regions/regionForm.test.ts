import { describe, expect, it } from 'vitest'
import type { Region } from '@/api/geo'
import { regionChanges, regionFormSchema, type RegionFormValues } from './regionForm'

const square = JSON.stringify({ type: 'Polygon', coordinates: [[[0, 0], [1, 0], [1, 1], [0, 1], [0, 0]]] })
const values = (patch: Partial<RegionFormValues> = {}): RegionFormValues => ({
  name: 'Sukkur',
  level: 'district',
  parentRegionId: 'sindh',
  boundaryText: square,
  ...patch,
})
const messages = (result: ReturnType<ReturnType<typeof regionFormSchema>['safeParse']>) =>
  result.success ? {} : Object.fromEntries(result.error.issues.map((issue) => [issue.path.join('.'), issue.message]))

const create = regionFormSchema({ boundaryRequired: true, parentOptional: false })
const edit = regionFormSchema({ boundaryRequired: false, parentOptional: false })

describe('regionFormSchema', () => {
  it('accepts a complete district', () => {
    expect(create.safeParse(values()).success).toBe(true)
  })

  it('requires a non-blank name', () => {
    expect(messages(create.safeParse(values({ name: '   ' })))).toEqual({ name: 'Enter the name of the region.' })
  })

  it('requires a parent for a district or tehsil, naming the level it belongs under', () => {
    expect(messages(create.safeParse(values({ parentRegionId: '' })))).toEqual({ parentRegionId: 'Choose the province this district belongs to.' })
    expect(messages(create.safeParse(values({ level: 'tehsil', parentRegionId: '' })))).toEqual({ parentRegionId: 'Choose the district this tehsil belongs to.' })
  })

  it('needs no parent for a province, or for a parentless region being edited', () => {
    expect(create.safeParse(values({ level: 'province', parentRegionId: '' })).success).toBe(true)
    const grandfathered = regionFormSchema({ boundaryRequired: false, parentOptional: true })
    expect(grandfathered.safeParse(values({ parentRegionId: '', boundaryText: '' })).success).toBe(true)
  })

  it('requires a boundary when creating, but not when editing', () => {
    expect(messages(create.safeParse(values({ boundaryText: '' })))).toEqual({ boundaryText: 'Add the region’s boundary as a GeoJSON polygon.' })
    expect(edit.safeParse(values({ boundaryText: '  ' })).success).toBe(true)
  })

  it('rejects an unsound boundary in both modes, pointing at the list of problems', () => {
    const open = JSON.stringify({ type: 'Polygon', coordinates: [[[0, 0], [1, 0], [1, 1], [0, 1]]] })
    for (const schema of [create, edit]) {
      expect(messages(schema.safeParse(values({ boundaryText: open })))).toEqual({ boundaryText: 'Fix the boundary problems listed above.' })
    }
  })
})

describe('regionChanges', () => {
  const original: Region = {
    id: 'r',
    name: 'Sukkur',
    level: 'district',
    parent_region_id: 'sindh',
    boundary: { type: 'Polygon', coordinates: [] },
    created_at: '',
    updated_at: '',
  }
  const polygon = { type: 'Polygon' as const, coordinates: [[[0, 0], [1, 0], [1, 1], [0, 1], [0, 0]] as [number, number][]] }

  it('is empty when nothing changed — an empty PATCH would be a 400', () => {
    expect(regionChanges(original, values({ boundaryText: '' }), null)).toEqual({})
  })

  it('sends only the fields that differ, and trims the name', () => {
    expect(regionChanges(original, values({ name: '  Sukkur District ' }), null)).toEqual({ name: 'Sukkur District' })
    expect(regionChanges(original, values({ parentRegionId: 'punjab' }), null)).toEqual({ parentRegionId: 'punjab' })
    expect(regionChanges(original, values(), polygon)).toEqual({ boundary: polygon })
  })

  it('clears the parent when a region becomes a province, and never sends a stray "" for a parentless one', () => {
    expect(regionChanges(original, values({ level: 'province', parentRegionId: 'sindh' }), null)).toEqual({ level: 'province', parentRegionId: '' })
    const parentless: Region = { ...original, parent_region_id: undefined }
    expect(regionChanges(parentless, values({ parentRegionId: '' }), null)).toEqual({})
  })
})
