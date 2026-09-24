import { Link } from 'react-router-dom'
import { formatDistanceToNowStrict, parseISO } from 'date-fns'
import { NavigationArrowIcon } from '@phosphor-icons/react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { buttonVariants } from '@/components/ui/button-variants'
import { cn } from '@/lib/utils'
import type { ReportedStatus } from '@/api/facilities'
import { formatDistance } from '@/features/map/mapGeo'
import { capacityInfo, type MapPlace } from '@/features/map/mapModel'
import { TONE_COLOR, placeGlyph } from '@/features/map/placeIcon'
import { navigateHref } from './localResources'

export interface LocalResourceRowProps {
  place: MapPlace
  /** Metres from the viewer, once they have been located. */
  distanceMeters: number | null
  /** Reporting is in flight somewhere on the list — every report button waits, so two can't cross. */
  reportingBusy: boolean
  onReport: (place: MapPlace, status: ReportedStatus) => void
}

const BADGE = { safe: 'safe', caution: 'caution', critical: 'critical', neutral: 'info' } as const
const BAR = { safe: 'bg-status-safe', caution: 'bg-status-caution', critical: 'bg-status-critical', neutral: 'bg-ink-300' } as const

/**
 * One place on the Local Resources list: what it is, how far, whether it is open, and what can be done — Navigate for anything,
 * and for an essential location **Mark as open / closed** (its two buttons when nobody has reported yet, the opposite one when someone
 * has). A shelter shows its occupancy and a link to its page instead: reports about a shelter are advisory and can't be read back, so
 * there is no button for them. Purely presentational.
 */
export function LocalResourceRow({ place, distanceMeters, reportingBusy, onReport }: LocalResourceRowProps) {
  const reported = place.kind === 'essential' ? place.data.current_status : undefined
  const capacity = place.kind === 'shelter' ? capacityInfo(place.data) : null
  const meta = [
    place.typeLabel,
    capacity ? `Capacity ${capacity.current} / ${capacity.total}` : null,
    distanceMeters !== null ? `${formatDistance(distanceMeters)} away` : null,
    place.kind === 'essential' ? (place.data.current_status && place.data.status_reported_at ? `Reported ${place.data.current_status} ${formatDistanceToNowStrict(parseISO(place.data.status_reported_at), { addSuffix: true })}` : 'Nobody has reported yet') : null,
  ]
    .filter(Boolean)
    .join(' · ')

  return (
    <li className="flex flex-col gap-3 border-b border-surface-border px-5 py-4 last:border-b-0 md:grid md:grid-cols-[minmax(0,1fr)_7.5rem_7.5rem_14.5rem] md:items-center md:gap-4">
      <div className="flex min-w-0 items-center gap-3">
        <span className="flex size-10 flex-none items-center justify-center rounded-full border-2 bg-white" style={{ borderColor: TONE_COLOR[place.tone] }} aria-hidden="true">
          {placeGlyph(place, 20, TONE_COLOR[place.tone])}
        </span>
        <div className="min-w-0">
          <p className="font-body text-body-md font-semibold text-ink-900 [overflow-wrap:anywhere]">{place.name}</p>
          <p className="font-body text-body-sm text-ink-500">{meta}</p>
        </div>
      </div>

      <div className="flex flex-col items-start gap-1.5">
        <Badge tone={BADGE[place.tone]}>{place.statusLabel}</Badge>
        {capacity && (
          <div className="h-1.5 w-24 overflow-hidden rounded-full bg-surface-sunken" role="progressbar" aria-label={`${place.name} occupancy`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={capacity.barPercent}>
            <div className={cn('h-full rounded-full', BAR[capacity.tone])} style={{ width: `${capacity.barPercent}%` }} />
          </div>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 md:contents">
        <Link to={navigateHref(place)} aria-label={`Navigate to ${place.name}`} className={cn(buttonVariants({ variant: 'secondary', size: 'sm' }), 'md:justify-self-start')}>
          <NavigationArrowIcon size={14} weight="bold" aria-hidden="true" />
          Navigate
        </Link>
        <div className="flex flex-wrap items-center gap-x-1 gap-y-1">
          {place.kind === 'shelter' && (
            <Link to={`/app/map/shelters/${place.id}`} aria-label={`Details for ${place.name}`} className={cn(buttonVariants({ variant: 'ghost', size: 'sm' }), 'px-2.5')}>
              Details
            </Link>
          )}
          {place.kind === 'essential' && reported !== 'closed' && (
            <Button type="button" variant="ghost" size="sm" className="px-2.5" aria-label={`Mark ${place.name} as closed`} disabled={reportingBusy} onClick={() => onReport(place, 'closed')}>
              Mark as closed
            </Button>
          )}
          {place.kind === 'essential' && reported !== 'open' && (
            <Button type="button" variant="ghost" size="sm" className="px-2.5" aria-label={`Mark ${place.name} as open`} disabled={reportingBusy} onClick={() => onReport(place, 'open')}>
              Mark as open
            </Button>
          )}
        </div>
      </div>
    </li>
  )
}
