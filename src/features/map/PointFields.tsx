import { useEffect, type ReactNode } from 'react'
import type { FieldErrors, UseFormRegister } from 'react-hook-form'
import { CrosshairIcon } from '@phosphor-icons/react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { CoverageNote } from '@/features/regions/CoverageNote'
import type { RegionCoverage } from '@/features/regions/useRegionCoverage'
import { LocationStatusNote } from './LocationNote'
import type { PointFormValues } from './pointForm'
import type { LocationStatus } from './useGeolocation'

export interface PointFieldsProps<T extends PointFormValues> {
  register: UseFormRegister<T>
  errors: FieldErrors<T>
  /** The map for choosing the point — handed in, so this section doesn't own a map library. */
  map: ReactNode
  coverage: RegionCoverage
  /** Said after the region warning, for a screen with more to add. */
  coverageDetail?: string
  /** "Use my location" — asks the browser only when pressed. */
  onUseMyLocation: () => void
  locationStatus: LocationStatus
}

const fieldError = 'mt-1 font-body text-body-sm text-status-critical'

/**
 * The "Location" section of any form that places something on the map: a small map to click or drag a pin on (which sizes itself and shows the
 * regions the place can go in), "Use my location", the two coordinate fields (the source of truth — the map only writes them), the browser's
 * answer if it refused, and whether the point is inside a region — and so whether it can be saved (see `CoverageNote`). Used by the NGO's
 * Register Shelter drawer and the admin's Add Infrastructure / Add Essential Location drawers. Purely presentational: the fields and validation
 * live in the caller's react-hook-form.
 */
export function PointFields<T extends PointFormValues>({ register, errors, map, coverage, coverageDetail, onUseMyLocation, locationStatus }: PointFieldsProps<T>) {
  // The fields are named by the contract every caller's values satisfy; TypeScript can't see that through a generic form type.
  const field = register as unknown as UseFormRegister<PointFormValues>
  const problems = errors as FieldErrors<PointFormValues>
  // A save refused because the point is in no region puts focus on the latitude (see the hooks), which the browser only just scrolls into view — its message sits below it, so bring that
  // into view too. Keyed on the error object, so a second refusal after scrolling away brings it back.
  const refused = problems.latitude?.type === 'coverage' ? problems.latitude : undefined
  useEffect(() => {
    if (refused) document.getElementById('point-latitude-error')?.scrollIntoView?.({ block: 'center' })
  }, [refused])
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-end justify-between gap-3">
        <span className="font-body text-label font-semibold text-ink-700">Location</span>
        <Button type="button" variant="secondary" size="sm" onClick={onUseMyLocation} disabled={locationStatus === 'locating'}>
          <CrosshairIcon size={16} aria-hidden="true" />
          Use my location
        </Button>
      </div>
      {map}
      <CoverageNote coverage={coverage} detail={coverageDetail} blocking />
      <p className="font-body text-body-sm text-ink-500">Click the map, or drag the pin, to set the point — or type the coordinates.</p>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label htmlFor="pointLatitude">Latitude</Label>
          <Input
            id="pointLatitude"
            inputMode="decimal"
            autoComplete="off"
            placeholder="24.8607"
            hasError={!!problems.latitude}
            aria-describedby={problems.latitude ? 'point-latitude-error' : undefined}
            {...field('latitude')}
          />
        </div>
        <div>
          <Label htmlFor="pointLongitude">Longitude</Label>
          <Input
            id="pointLongitude"
            inputMode="decimal"
            autoComplete="off"
            placeholder="67.0011"
            hasError={!!problems.longitude}
            aria-describedby={problems.longitude ? 'point-longitude-error' : undefined}
            {...field('longitude')}
          />
        </div>
      </div>
      {problems.latitude && (
        <p id="point-latitude-error" className={fieldError}>
          {problems.latitude.message}
        </p>
      )}
      {problems.longitude && (
        <p id="point-longitude-error" className={fieldError}>
          {problems.longitude.message}
        </p>
      )}
      <LocationStatusNote
        status={locationStatus}
        className="rounded-md border px-3.5 py-2.5 font-body text-body-sm text-ink-900"
        deniedText="Location is blocked for this site. Allow it in your browser's site settings, or set the point on the map."
      />
    </div>
  )
}
