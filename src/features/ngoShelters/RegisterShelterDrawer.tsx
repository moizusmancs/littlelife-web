import type { FormEvent, ReactNode } from 'react'
import type { FieldErrors, UseFormRegister } from 'react-hook-form'
import { HouseLineIcon, TentIcon } from '@phosphor-icons/react'
import { Button } from '@/components/ui/button'
import { Drawer, DrawerBody, DrawerClose, DrawerContent, DrawerDescription, DrawerFooter, DrawerHeader, DrawerTitle } from '@/components/ui/drawer'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { PointFields } from '@/features/map/PointFields'
import type { LocationStatus } from '@/features/map/useGeolocation'
import type { RegionCoverage } from '@/features/regions/useRegionCoverage'
import type { RegisterShelterFormValues } from './shelterForm'

export interface RegisterShelterDrawerProps {
  onClose: () => void
  register: UseFormRegister<RegisterShelterFormValues>
  errors: FieldErrors<RegisterShelterFormValues>
  /** The map for choosing the point — handed in, so this form doesn't own a map library. */
  map: ReactNode
  coverage: RegionCoverage
  /** "Use my location" — asks the browser only when pressed. */
  onUseMyLocation: () => void
  locationStatus: LocationStatus
  onSubmit: (event: FormEvent<HTMLFormElement>) => void
  isSubmitting: boolean
  serverError: string | null
}

const fieldError = 'mt-1 font-body text-body-sm text-status-critical'

const TYPES = [
  { value: 'shelter', label: 'Shelter', hint: 'A place to stay', Icon: HouseLineIcon },
  { value: 'relief_center', label: 'Relief center', hint: 'Supplies and aid', Icon: TentIcon },
] as const

/**
 * "Register a shelter" (`POST /ngo/shelters`, `ngo_admin` only), in a side drawer. Name, kind, capacity and a point — chosen on the
 * map or typed. Said up front: it starts open, empty and pending certification, and **its name, kind, capacity and place can't
 * be changed afterwards** (the API only edits status and certification, and has no delete), which is the reason to check them here.
 * The API checks none of the coordinates, so the form does (see `registerShelterSchema`), and a note says whether the point is in a
 * region — the only shelters citizens are shown, so a point outside every region can't be saved. Pure presentation: values and validation live in the container's react-hook-form.
 */
export function RegisterShelterDrawer({ onClose, register, errors, map, coverage, onUseMyLocation, locationStatus, onSubmit, isSubmitting, serverError }: RegisterShelterDrawerProps) {
  return (
    <Drawer open onOpenChange={(open) => !open && onClose()}>
      <DrawerContent onInteractOutside={(event) => event.preventDefault()}>
        <DrawerHeader>
          <DrawerTitle>Register a shelter</DrawerTitle>
          <DrawerDescription>A shelter or relief center your organisation runs. It starts open, with nobody in it, and pending certification.</DrawerDescription>
        </DrawerHeader>

        <form onSubmit={onSubmit} noValidate className="flex min-h-0 flex-1 flex-col">
          <DrawerBody className="flex flex-col gap-5">
            {serverError && (
              <div role="alert" className="rounded-sm border border-status-critical bg-status-critical-tint px-3.5 py-2.5 font-body text-body-sm text-ink-900">
                {serverError}
              </div>
            )}

            <div>
              <Label htmlFor="shelterName">Name</Label>
              <Input id="shelterName" autoComplete="off" autoFocus hasError={!!errors.name} aria-describedby={errors.name ? 'shelter-name-error' : undefined} {...register('name')} />
              {errors.name && (
                <p id="shelter-name-error" className={fieldError}>
                  {errors.name.message}
                </p>
              )}
            </div>

            <fieldset>
              <legend className="mb-1.5 font-body text-label font-semibold text-ink-700">Type</legend>
              <div className="grid grid-cols-2 gap-3">
                {TYPES.map(({ value, label, hint, Icon }) => (
                  <label
                    key={value}
                    className="flex cursor-pointer items-center gap-3 rounded-md border border-surface-border bg-surface-raised px-3 py-2.5 has-checked:border-2 has-checked:border-primary-500 has-checked:bg-primary-50 has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-primary-500"
                  >
                    <input type="radio" value={value} className="sr-only" {...register('type')} />
                    <Icon size={22} weight="fill" className="flex-none text-primary-700" aria-hidden="true" />
                    <span className="min-w-0">
                      <span className="block font-body text-label font-semibold text-ink-900">{label}</span>
                      <span className="block font-body text-body-sm text-ink-500">{hint}</span>
                    </span>
                  </label>
                ))}
              </div>
            </fieldset>

            <div>
              <Label htmlFor="shelterCapacity">Capacity</Label>
              <Input
                id="shelterCapacity"
                inputMode="numeric"
                autoComplete="off"
                placeholder="How many people it can hold"
                hasError={!!errors.capacity}
                aria-describedby={errors.capacity ? 'shelter-capacity-error' : 'shelter-capacity-hint'}
                {...register('capacity')}
              />
              {errors.capacity ? (
                <p id="shelter-capacity-error" className={fieldError}>
                  {errors.capacity.message}
                </p>
              ) : (
                <p id="shelter-capacity-hint" className="mt-1 font-body text-body-sm text-ink-500">
                  The most people it holds. Occupancy is updated from the list afterwards.
                </p>
              )}
            </div>

            <PointFields
              register={register}
              errors={errors}
              map={map}
              coverage={coverage}
              coverageDetail="If your shelter is somewhere not shaded, ask an administrator to add that area."
              onUseMyLocation={onUseMyLocation}
              locationStatus={locationStatus}
            />

            <p className="rounded-sm border border-surface-border bg-surface-sunken px-3.5 py-2.5 font-body text-body-sm text-ink-700">
              Check these before you register: a shelter's name, type, capacity and location <span className="font-semibold">can't be changed afterwards</span>. You can change
              whether it is open, its certification, and how many people are in it.
            </p>
          </DrawerBody>

          <DrawerFooter>
            <DrawerClose asChild>
              <Button type="button" variant="ghost" disabled={isSubmitting}>
                Cancel
              </Button>
            </DrawerClose>
            <Button type="submit" isLoading={isSubmitting}>
              Register shelter
            </Button>
          </DrawerFooter>
        </form>
      </DrawerContent>
    </Drawer>
  )
}
