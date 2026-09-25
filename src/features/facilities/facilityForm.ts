import { z } from 'zod'
import type { AddEssentialLocationInput, AddInfrastructureInput, EssentialType, InfrastructureType } from '@/api/facilities'
import { addPointIssues, toPointGeometry, type PointFormValues } from '@/features/map/pointForm'

/** What an admin adds by hand: infrastructure, or an essential location. (Shelters are registered by their own organisation.) */
export type AddableKind = 'infrastructure' | 'essential'

export const ADDABLE_TYPES = {
  infrastructure: ['hospital', 'bridge', 'utility'],
  essential: ['atm', 'grocery_store', 'pharmacy'],
} as const satisfies Record<AddableKind, readonly string[]>

export interface FacilityFormValues extends PointFormValues {
  name: string
  type: string
}

export const EMPTY_FACILITY_FORM = (kind: AddableKind): FacilityFormValues => ({ name: '', type: ADDABLE_TYPES[kind][0], latitude: '', longitude: '' })

/**
 * What the Add drawers check. The API checks the name and the type, and **none of the coordinates** (longitude 200, a swapped pair and a point outside every region are all
 * `201`) — so those are checked here, every problem at once.
 */
export const facilityFormSchema = (kind: AddableKind) =>
  z
    .object({
      name: z.string().trim().min(1, 'Enter the name.'),
      type: z.string().refine((value) => (ADDABLE_TYPES[kind] as readonly string[]).includes(value), 'Choose a type.'),
      latitude: z.string(),
      longitude: z.string(),
    })
    .superRefine((values, ctx) => addPointIssues(values, ctx))

export function toInfrastructureInput(values: FacilityFormValues): AddInfrastructureInput {
  return { name: values.name.trim(), type: values.type as InfrastructureType, location: toPointGeometry(values) }
}

export function toEssentialInput(values: FacilityFormValues): AddEssentialLocationInput {
  return { name: values.name.trim(), type: values.type as EssentialType, location: toPointGeometry(values) }
}
