import type { ReactNode } from 'react'
import { CrosshairIcon } from '@phosphor-icons/react'
import { Button } from '@/components/ui/button'
import { LocationStatusNote } from '@/features/map/LocationNote'
import { formatCoordinates, formatDistance, type LatLng } from '@/features/map/mapGeo'
import type { LocationStatus } from '@/features/map/useGeolocation'

export interface ShelterLocationCardProps {
  /** The embedded map — handed in, so this card doesn't own a map library. */
  map: ReactNode
  position: LatLng
  /** Metres from the viewer, once they have been located. */
  distanceMeters: number | null
  locationStatus: LocationStatus
  onLocate: () => void
  /** Something the map couldn't do (its flood zones failing to load), said under it rather than left silent. */
  mapNotice?: string
  /** Anything else to say about the place, under the coordinates. */
  children?: ReactNode
}

/**
 * Where the shelter is: the map, its coordinates (the API has no street address), and — only when the visitor asks — how far it is
 * from them. Nothing asks for the position on load; the button does, and a refusal is said plainly. Purely presentational.
 */
export function ShelterLocationCard({ map, position, distanceMeters, locationStatus, onLocate, mapNotice, children }: ShelterLocationCardProps) {
  const locating = locationStatus === 'locating'
  return (
    <section aria-labelledby="location-heading" className="flex flex-col gap-3 rounded-md border border-surface-border bg-surface-raised p-5 shadow-sm">
      <h2 id="location-heading" className="font-heading text-h3 font-bold text-ink-900">
        Location
      </h2>
      <div className="h-64 overflow-hidden rounded-md border border-surface-border md:h-96">{map}</div>
      {mapNotice && (
        <p role="status" className="rounded-md border border-status-caution bg-status-caution-tint px-3.5 py-2.5 font-body text-body-sm text-ink-900">
          {mapNotice}
        </p>
      )}

      <dl className="flex flex-col gap-1.5 font-body text-body-sm">
        <div className="flex flex-wrap justify-between gap-x-3">
          <dt className="text-ink-500">Coordinates</dt>
          <dd className="font-medium text-ink-900">{formatCoordinates(position)}</dd>
        </div>
        {distanceMeters !== null && (
          <div className="flex flex-wrap justify-between gap-x-3">
            <dt className="text-ink-500">From you</dt>
            <dd className="font-semibold text-ink-900">{formatDistance(distanceMeters)} away</dd>
          </div>
        )}
      </dl>
      {children}

      {distanceMeters === null && (
        <Button type="button" variant="secondary" size="sm" className="self-start" onClick={onLocate} disabled={locating}>
          <CrosshairIcon size={16} aria-hidden="true" />
          Show distance from me
        </Button>
      )}
      <LocationStatusNote status={locationStatus} className="rounded-md border px-3.5 py-3 font-body text-body-sm text-ink-900" deniedText="Location is blocked for this site. Allow it in your browser's site settings to see how far this shelter is from you." />
    </section>
  )
}
