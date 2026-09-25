import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { CheckCircleIcon, WarningIcon } from '@phosphor-icons/react'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import type { MapOverlayEntry } from '@/api/floodIntel'
import { formatCoordinates } from '@/features/map/mapGeo'
import { hazardBasis, hazardTitle, type MapPlace } from '@/features/map/mapModel'
import { CoverageNote } from '@/features/regions/CoverageNote'
import type { RegionCoverage } from '@/features/regions/useRegionCoverage'
import { BADGE_TONE } from './facilityModel'

/** Whether the place lies inside an active hazard zone, as far as it has been worked out. */
export type ZoneCheck = { state: 'checking' } | { state: 'error' } | { state: 'clear' } | { state: 'inside'; zone: MapOverlayEntry }

export interface FacilityLocationDialogProps {
  /** The place shown; `null` closes the dialog. */
  place: MapPlace | null
  onClose: () => void
  /** The map — handed in, so this dialog doesn't own a map library. */
  map: ReactNode
  coverage: RegionCoverage
  zone: ZoneCheck
}

/**
 * Where a facility is, and what is around it (the mockup's map-pin action): a map with the place and the active hazard zones, its coordinates, which region it is in — or the plain
 * warning that it is in none, so no citizen is shown it and no admin route lists it — and whether it sits **inside an active hazard zone** (the answer the mockup's "Hazard" column
 * gave, asked for one place at a time because the API can only check a point at a time). A zone found links to its page. Purely presentational.
 */
export function FacilityLocationDialog({ place, onClose, map, coverage, zone }: FacilityLocationDialogProps) {
  return (
    <Dialog open={place !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[calc(100dvh-2rem)] max-w-2xl overflow-y-auto">
        {place && (
          <>
            <DialogTitle className="[overflow-wrap:anywhere]">{place.name}</DialogTitle>
            <DialogDescription className="flex flex-wrap items-center gap-2">
              <span>{place.typeLabel}</span>
              <Badge tone={BADGE_TONE[place.tone]}>{place.statusLabel}</Badge>
            </DialogDescription>

            <div className="mt-4 h-72 overflow-hidden rounded-md border border-surface-border">{map}</div>

            <div className="mt-4 flex flex-col gap-3 font-body text-body-sm">
              <div className="flex flex-wrap justify-between gap-x-3">
                <span className="text-ink-500">Coordinates</span>
                <span className="font-medium text-ink-900">{formatCoordinates(place.position)}</span>
              </div>
              <CoverageNote coverage={coverage} detail="No admin route can list it either." />
              {zone.state === 'checking' && <p role="status" className="text-ink-500">Checking active hazard zones…</p>}
              {zone.state === 'error' && <p role="status" className="rounded-sm border border-status-caution bg-status-caution-tint px-3 py-2 text-ink-900">Couldn't check the hazard zones around this place.</p>}
              {zone.state === 'clear' && (
                <p role="status" className="flex items-start gap-2 text-ink-700">
                  <CheckCircleIcon size={16} weight="fill" className="mt-px flex-none text-status-safe" aria-hidden="true" />
                  Not inside any active hazard zone.
                </p>
              )}
              {zone.state === 'inside' && (
                <div role="status" className="flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-sm border border-status-critical bg-status-critical-tint px-3 py-2 text-ink-900">
                  <WarningIcon size={16} weight="fill" className="flex-none text-status-critical" aria-hidden="true" />
                  <span className="min-w-0 flex-1">
                    Inside a <span className="font-semibold">{hazardTitle(zone.zone).toLowerCase()}</span> — {hazardBasis(zone.zone)}.
                  </span>
                  <Link to={`/admin/hazard-zones/${zone.zone.hazard_zone_id}`} className="font-semibold text-primary-700 hover:underline">
                    View zone
                  </Link>
                </div>
              )}
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}
