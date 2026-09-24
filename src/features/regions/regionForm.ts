import { z } from 'zod'
import type { Region, RegionLevel, UpdateRegionInput } from '@/api/geo'
import { parseBoundary, type PolygonGeometry } from './geojson'
import { PARENT_LEVEL, REGION_LEVELS, REGION_LEVEL_LABEL } from './regionTree'

export interface RegionFormRules {
  /** A new region must come with a boundary; when editing, leaving it blank keeps the stored one. */
  boundaryRequired: boolean
  /** Whether a district or tehsil may be saved with no parent — only a region that already has none. */
  parentOptional: boolean
}

const baseSchema = z.object({
  name: z.string().trim().min(1, 'Enter the name of the region.'),
  level: z.enum(REGION_LEVELS as [RegionLevel, ...RegionLevel[]]),
  parentRegionId: z.string(),
  boundaryText: z.string(),
})

export type RegionFormValues = z.infer<typeof baseSchema>

/**
 * What the create/edit form checks. The API checks almost none of this (see `createRegion`), so the
 * hierarchy rule and the boundary rules live here: a district or tehsil needs a parent, and the
 * boundary must be a sound Polygon — the full list of problems is shown under the field as the
 * text changes, so the message here only has to stop the submit.
 */
export const regionFormSchema = ({ boundaryRequired, parentOptional }: RegionFormRules) =>
  baseSchema.superRefine((values, ctx) => {
    const parentLevel = PARENT_LEVEL[values.level]
    if (parentLevel && !values.parentRegionId && !parentOptional) {
      ctx.addIssue({
        code: 'custom',
        path: ['parentRegionId'],
        message: `Choose the ${REGION_LEVEL_LABEL[parentLevel].toLowerCase()} this ${values.level} belongs to.`,
      })
    }
    if (values.boundaryText.trim() === '') {
      if (boundaryRequired) ctx.addIssue({ code: 'custom', path: ['boundaryText'], message: 'Add the region’s boundary as a GeoJSON polygon.' })
    } else if (!parseBoundary(values.boundaryText).ok) {
      ctx.addIssue({ code: 'custom', path: ['boundaryText'], message: 'Fix the boundary problems listed above.' })
    }
  })

/**
 * The fields to PATCH: only those that differ from what's stored. Sending an unchanged
 * `parent_region_id: ""` would detach the region from its parent, and an empty patch is a `400`,
 * so an unchanged form yields `{}`. A province has no parent, whatever the select last held.
 */
export function regionChanges(original: Region, values: RegionFormValues, boundary: PolygonGeometry | null): UpdateRegionInput {
  const patch: UpdateRegionInput = {}
  const name = values.name.trim()
  if (name !== original.name) patch.name = name
  if (values.level !== original.level) patch.level = values.level
  const parent = values.level === 'province' ? '' : values.parentRegionId
  if (parent !== (original.parent_region_id ?? '')) patch.parentRegionId = parent
  if (boundary) patch.boundary = boundary
  return patch
}
