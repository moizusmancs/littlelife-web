import type { FormEvent } from 'react'
import type { UseFormRegister } from 'react-hook-form'
import { Button } from '@/components/ui/button'
import { Drawer, DrawerBody, DrawerClose, DrawerContent, DrawerDescription, DrawerFooter, DrawerHeader, DrawerTitle } from '@/components/ui/drawer'
import type { Shelter } from '@/api/facilities'
import { formatCoordinates } from '@/features/map/mapGeo'
import { CERTIFICATION_LABEL } from '@/features/map/mapModel'
import type { EditShelterFormValues } from './shelterForm'
import { shelterTypeLabel } from './shelterModel'

export interface EditShelterDrawerProps {
  shelter: Shelter
  onClose: () => void
  register: UseFormRegister<EditShelterFormValues>
  /** Whether anything differs from what is stored — Save is only possible then (an empty patch is a `400`). */
  changed: boolean
  onSubmit: (event: FormEvent<HTMLFormElement>) => void
  isSubmitting: boolean
  serverError: string | null
}

const STATUSES = [
  { value: 'open', label: 'Open', hint: 'Taking people in' },
  { value: 'closed', label: 'Closed', hint: 'Not taking people in' },
] as const

const CERTIFICATIONS = ['certified', 'pending', 'uncertified'] as const

const choice =
  'flex cursor-pointer items-start gap-3 rounded-md border border-surface-border bg-surface-raised px-3 py-2.5 has-checked:border-2 has-checked:border-primary-500 has-checked:bg-primary-50 has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-primary-500'

/**
 * "Edit shelter" (`PATCH /shelters/{id}`, `ngo_admin` only), in a side drawer. The API changes exactly two things — whether the shelter is
 * open and its certification — so those are the only controls; the name, type, capacity and place are shown, read-only, with the
 * reason. Only what changed is sent. Pure presentation: the choices live in the container's react-hook-form.
 */
export function EditShelterDrawer({ shelter, onClose, register, changed, onSubmit, isSubmitting, serverError }: EditShelterDrawerProps) {
  const facts: Array<[string, string]> = [
    ['Type', shelterTypeLabel(shelter.type)],
    ['Capacity', shelter.capacity_total.toLocaleString('en-US')],
    ['Location', formatCoordinates([shelter.location.coordinates[1], shelter.location.coordinates[0]])],
  ]
  return (
    <Drawer open onOpenChange={(open) => !open && onClose()}>
      <DrawerContent onInteractOutside={(event) => event.preventDefault()}>
        <DrawerHeader>
          <DrawerTitle>Edit shelter</DrawerTitle>
          <DrawerDescription>{shelter.name}. Only what you change is saved.</DrawerDescription>
        </DrawerHeader>

        <form onSubmit={onSubmit} noValidate className="flex min-h-0 flex-1 flex-col">
          <DrawerBody className="flex flex-col gap-5">
            {serverError && (
              <div role="alert" className="rounded-sm border border-status-critical bg-status-critical-tint px-3.5 py-2.5 font-body text-body-sm text-ink-900">
                {serverError}
              </div>
            )}

            <fieldset>
              <legend className="mb-1.5 font-body text-label font-semibold text-ink-700">Status</legend>
              <div className="grid grid-cols-2 gap-3">
                {STATUSES.map(({ value, label, hint }) => (
                  <label key={value} className={choice}>
                    <input type="radio" value={value} className="sr-only" {...register('status')} />
                    <span>
                      <span className="block font-body text-label font-semibold text-ink-900">{label}</span>
                      <span className="block font-body text-body-sm text-ink-500">{hint}</span>
                    </span>
                  </label>
                ))}
              </div>
              <p className="mt-1.5 font-body text-body-sm text-ink-500">Citizens see a closed shelter marked Closed on the map and in their lists.</p>
            </fieldset>

            <fieldset>
              <legend className="mb-1.5 font-body text-label font-semibold text-ink-700">Certification</legend>
              <div className="flex flex-col gap-2">
                {CERTIFICATIONS.map((value) => (
                  <label key={value} className={choice}>
                    <input type="radio" value={value} className="sr-only" {...register('certification')} />
                    <span className="block font-body text-label font-semibold text-ink-900">{CERTIFICATION_LABEL[value]}</span>
                  </label>
                ))}
              </div>
            </fieldset>

            <div className="rounded-sm border border-surface-border bg-surface-sunken px-3.5 py-3">
              <dl className="flex flex-col gap-1.5 font-body text-body-sm">
                {facts.map(([label, value]) => (
                  <div key={label} className="flex justify-between gap-3">
                    <dt className="text-ink-500">{label}</dt>
                    <dd className="text-end font-medium text-ink-900">{value}</dd>
                  </div>
                ))}
              </dl>
              <p className="mt-2 font-body text-body-sm text-ink-500">
                A shelter's name, type, capacity and location can't be changed once it is registered — the API only edits its status and certification. The number
                of people in it is updated from the list.
              </p>
            </div>
          </DrawerBody>

          <DrawerFooter>
            <DrawerClose asChild>
              <Button type="button" variant="ghost" disabled={isSubmitting}>
                Cancel
              </Button>
            </DrawerClose>
            <Button type="submit" isLoading={isSubmitting} disabled={!changed}>
              Save changes
            </Button>
          </DrawerFooter>
        </form>
      </DrawerContent>
    </Drawer>
  )
}
