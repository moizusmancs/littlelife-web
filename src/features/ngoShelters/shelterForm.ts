import { z } from 'zod'
import { MAX_SHELTER_CAPACITY, type RegisterShelterInput, type Shelter, type ShelterChanges } from '@/api/facilities'
import { addPointIssues, toPointGeometry } from '@/features/map/pointForm'

export const SHELTER_TYPES = ['shelter', 'relief_center'] as const

const baseSchema = z.object({
  name: z.string().trim().min(1, 'Enter the name of the shelter.'),
  type: z.enum(SHELTER_TYPES),
  /** Typed text, read below — a number input would let `e` and `-` through and hide what was actually typed. */
  capacity: z.string(),
  latitude: z.string(),
  longitude: z.string(),
})

export type RegisterShelterFormValues = z.infer<typeof baseSchema>

export const EMPTY_SHELTER_FORM: RegisterShelterFormValues = { name: '', type: 'shelter', capacity: '', latitude: '', longitude: '' }

/**
 * What the register form checks: the name, the capacity, and the coordinates (`addPointIssues` — **the API checks none of them**; a capacity over
 * 2,147,483,647 is a bare `500` there too). Every problem is named at once.
 */
export const registerShelterSchema = baseSchema.superRefine((values, ctx) => {
  const capacity = values.capacity.trim()
  if (capacity === '') {
    ctx.addIssue({ code: 'custom', path: ['capacity'], message: 'Enter how many people it can hold.' })
  } else if (!/^\d+$/.test(capacity)) {
    ctx.addIssue({ code: 'custom', path: ['capacity'], message: 'Use a whole number, like 200.' })
  } else if (Number(capacity) < 1) {
    ctx.addIssue({ code: 'custom', path: ['capacity'], message: 'It has to hold at least one person.' })
  } else if (Number(capacity) > MAX_SHELTER_CAPACITY) {
    ctx.addIssue({ code: 'custom', path: ['capacity'], message: `The largest capacity is ${MAX_SHELTER_CAPACITY.toLocaleString('en-US')}.` })
  }
  addPointIssues(values, ctx)
})

/** The request for a form that passed the schema. */
export function toRegisterInput(values: RegisterShelterFormValues): RegisterShelterInput {
  return {
    name: values.name.trim(),
    type: values.type,
    location: toPointGeometry(values),
    capacityTotal: Number(values.capacity.trim()),
  }
}

export interface EditShelterFormValues {
  status: Shelter['status']
  certification: Shelter['certification_status']
}

/**
 * The fields to PATCH: only those that differ from what is stored — the route is a real partial patch and an empty body is a
 * `400`, so an unchanged form yields `{}` and the caller makes no request.
 */
export function shelterChanges(shelter: Pick<Shelter, 'status' | 'certification_status'>, values: EditShelterFormValues): ShelterChanges {
  const changes: ShelterChanges = {}
  if (values.status !== shelter.status) changes.status = values.status
  if (values.certification !== shelter.certification_status) changes.certification_status = values.certification
  return changes
}
