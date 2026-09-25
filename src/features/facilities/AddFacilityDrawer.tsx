import type { FormEvent, ReactNode } from 'react'
import type { FieldErrors, UseFormRegister } from 'react-hook-form'
import { BankIcon, BridgeIcon, HospitalIcon, LightningIcon, PillIcon, ShoppingCartIcon, type Icon } from '@phosphor-icons/react'
import { Button } from '@/components/ui/button'
import { Drawer, DrawerBody, DrawerClose, DrawerContent, DrawerDescription, DrawerFooter, DrawerHeader, DrawerTitle } from '@/components/ui/drawer'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { PointFields } from '@/features/map/PointFields'
import type { LocationStatus } from '@/features/map/useGeolocation'
import type { RegionCoverage } from '@/features/regions/useRegionCoverage'
import type { AddableKind, FacilityFormValues } from './facilityForm'

export interface AddFacilityDrawerProps {
  kind: AddableKind
  onClose: () => void
  register: UseFormRegister<FacilityFormValues>
  errors: FieldErrors<FacilityFormValues>
  /** The map for choosing the point — handed in, so this form doesn't own a map library. */
  map: ReactNode
  coverage: RegionCoverage
  onUseMyLocation: () => void
  locationStatus: LocationStatus
  onSubmit: (event: FormEvent<HTMLFormElement>) => void
  isSubmitting: boolean
  serverError: string | null
}

interface KindCopy {
  title: string
  description: string
  submit: string
  namePlaceholder: string
  types: ReadonlyArray<{ value: string; label: string; Icon: Icon }>
  /** What can't be undone, said before saving. */
  permanent: string
}

const COPY: Record<AddableKind, KindCopy> = {
  infrastructure: {
    title: 'Add infrastructure',
    description: 'A hospital, bridge or utility. It starts as Safe — set its status from the list once it is added.',
    submit: 'Add infrastructure',
    namePlaceholder: 'General Hospital',
    types: [
      { value: 'hospital', label: 'Hospital', Icon: HospitalIcon },
      { value: 'bridge', label: 'Bridge', Icon: BridgeIcon },
      { value: 'utility', label: 'Utility', Icon: LightningIcon },
    ],
    permanent: "Check these before you add it: its name, type and position can't be changed afterwards, and there is no way to remove it. Only its status can be updated.",
  },
  essential: {
    title: 'Add essential location',
    description: 'An ATM, grocery store or pharmacy. This is the manual fallback — these are meant to be bulk-imported. It starts with no status; only citizens\' reports give it one.',
    submit: 'Add essential location',
    namePlaceholder: 'Corner Pharmacy',
    types: [
      { value: 'atm', label: 'ATM', Icon: BankIcon },
      { value: 'grocery_store', label: 'Grocery store', Icon: ShoppingCartIcon },
      { value: 'pharmacy', label: 'Pharmacy', Icon: PillIcon },
    ],
    permanent: "Check these before you add it: its name, type and position can't be changed afterwards, and there is no way to remove it.",
  },
}

const fieldError = 'mt-1 font-body text-body-sm text-status-critical'

/**
 * "Add infrastructure" / "Add essential location" (`POST /admin/infrastructure`, `POST /admin/essential-locations`), in a side drawer — one form for both, since they take the same three things:
 * a name, a type and a point, chosen on the map or typed (the shared `PointFields`). **The API checks none of the coordinates**, so the form does, and the region note says whether the
 * point is inside a region — outside every region the API would accept the place but no route could ever list it again, so the form refuses it and the note says how to fix that. Said up front: what can't be undone.
 * Pure presentation: the values and validation live in the container's react-hook-form.
 */
export function AddFacilityDrawer({ kind, onClose, register, errors, map, coverage, onUseMyLocation, locationStatus, onSubmit, isSubmitting, serverError }: AddFacilityDrawerProps) {
  const copy = COPY[kind]
  return (
    <Drawer open onOpenChange={(open) => !open && onClose()}>
      <DrawerContent onInteractOutside={(event) => event.preventDefault()}>
        <DrawerHeader>
          <DrawerTitle>{copy.title}</DrawerTitle>
          <DrawerDescription>{copy.description}</DrawerDescription>
        </DrawerHeader>

        <form onSubmit={onSubmit} noValidate className="flex min-h-0 flex-1 flex-col">
          <DrawerBody className="flex flex-col gap-5">
            {serverError && (
              <div role="alert" className="rounded-sm border border-status-critical bg-status-critical-tint px-3.5 py-2.5 font-body text-body-sm text-ink-900">
                {serverError}
              </div>
            )}

            <div>
              <Label htmlFor="facilityName">Name</Label>
              <Input id="facilityName" autoComplete="off" autoFocus placeholder={copy.namePlaceholder} hasError={!!errors.name} aria-describedby={errors.name ? 'facility-name-error' : undefined} {...register('name')} />
              {errors.name && (
                <p id="facility-name-error" className={fieldError}>
                  {errors.name.message}
                </p>
              )}
            </div>

            <fieldset>
              <legend className="mb-1.5 font-body text-label font-semibold text-ink-700">Type</legend>
              <div className="grid grid-cols-3 gap-3">
                {copy.types.map(({ value, label, Icon }) => (
                  <label
                    key={value}
                    className="flex cursor-pointer flex-col items-center gap-1.5 rounded-md border border-surface-border bg-surface-raised px-2 py-2.5 text-center has-checked:border-2 has-checked:border-primary-500 has-checked:bg-primary-50 has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-primary-500"
                  >
                    <input type="radio" value={value} className="sr-only" {...register('type')} />
                    <Icon size={22} weight="fill" className="text-primary-700" aria-hidden="true" />
                    <span className="font-body text-body-sm font-semibold text-ink-900">{label}</span>
                  </label>
                ))}
              </div>
            </fieldset>

            <PointFields
              register={register}
              errors={errors}
              map={map}
              coverage={coverage}
              coverageDetail="To cover a new area, add a region under Regions first."
              onUseMyLocation={onUseMyLocation}
              locationStatus={locationStatus}
            />

            <p className="rounded-sm border border-surface-border bg-surface-sunken px-3.5 py-2.5 font-body text-body-sm text-ink-700">{copy.permanent}</p>
          </DrawerBody>

          <DrawerFooter>
            <DrawerClose asChild>
              <Button type="button" variant="ghost" disabled={isSubmitting}>
                Cancel
              </Button>
            </DrawerClose>
            <Button type="submit" isLoading={isSubmitting}>
              {copy.submit}
            </Button>
          </DrawerFooter>
        </form>
      </DrawerContent>
    </Drawer>
  )
}
