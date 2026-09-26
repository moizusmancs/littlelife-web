import type { ReactNode } from 'react'
import { CrosshairIcon, MapPinIcon } from '@phosphor-icons/react'
import { Button } from '@/components/ui/button'
import { LocationStatusNote } from '@/features/map/LocationNote'
import { formatCoordinates, formatDistance, type LatLng } from '@/features/map/mapGeo'
import type { LocationStatus } from '@/features/map/useGeolocation'

export interface IncidentLocationCardProps {
  /** The report's point, or `null` when the stored coordinates aren't a place on the globe (the API doesn't check them). */
  position: LatLng | null
  /** The map, drawn by the page (so tests can stand it in). */
  map: ReactNode
  /** Metres from the viewer, once they have asked. */
  distance: number | null
  locationStatus: LocationStatus
  onLocate: () => void
}

/**
 * Where the report was made: a small map, the coordinates (a report has no address), and — only when asked — how far it is from the viewer.
 * Purely presentational.
 */
export function IncidentLocationCard({ position, map, distance, locationStatus, onLocate }: IncidentLocationCardProps) {
  return (
    <section aria-labelledby="incident-location" className="flex flex-col gap-3 rounded-md border border-surface-border bg-surface-raised p-5 shadow-sm">
      <h2 id="incident-location" className="font-heading text-h3 font-bold text-ink-900">
        Location
      </h2>
      {position ? (
        <>
          {map}
          <p className="flex items-center gap-1.5 font-body text-body-sm text-ink-700">
            <MapPinIcon size={16} className="flex-none text-primary-500" aria-hidden="true" />
            {formatCoordinates(position)}
          </p>
          {distance !== null ? (
            <p className="flex items-center gap-1.5 font-body text-body-md font-semibold text-ink-900">
              <CrosshairIcon size={16} className="flex-none text-ink-500" aria-hidden="true" />
              {formatDistance(distance)} from you
            </p>
          ) : (
            <Button type="button" variant="secondary" size="sm" onClick={onLocate} isLoading={locationStatus === 'locating'} className="self-start">
              <CrosshairIcon size={14} aria-hidden="true" />
              Show distance from me
            </Button>
          )}
          <LocationStatusNote
            status={locationStatus}
            className="rounded-md border px-3.5 py-3 font-body text-body-sm text-ink-900"
            deniedText="Location is blocked for this site. Allow it in your browser's site settings to see how far this report is from you."
          />
        </>
      ) : (
        <p className="font-body text-body-md text-ink-500">This report's stored location isn't a real place on the map, so it can't be shown.</p>
      )}
    </section>
  )
}
