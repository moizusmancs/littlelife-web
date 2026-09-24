import { Link } from 'react-router-dom'
import { formatDistanceToNowStrict, parseISO } from 'date-fns'
import { NavigationArrowIcon, XIcon } from '@phosphor-icons/react'
import { Badge } from '@/components/ui/badge'
import { buttonVariants } from '@/components/ui/button-variants'
import { cn } from '@/lib/utils'
import { CapacityMeter } from '@/features/shelters/CapacityMeter'
import { CertificationBadge } from '@/features/shelters/CertificationBadge'
import { formatDistance } from './mapGeo'
import { capacityInfo, type MapPlace, type Tone } from './mapModel'

export interface PlaceCardProps {
  place: MapPlace
  /** Metres from the viewer, when their location is known. */
  distanceMeters: number | null
  onClose: () => void
}

const BADGE_TONE: Record<Tone, 'safe' | 'caution' | 'critical' | 'info'> = { safe: 'safe', caution: 'caution', critical: 'critical', neutral: 'info' }

const ago = (iso: string) => formatDistanceToNowStrict(parseISO(iso), { addSuffix: true })

/**
 * The selected place, in the pane (mockup §2f's tooltip panel): status badges, name, what it is and how far away, and —
 * for a shelter — its capacity as a bar whose colour rises with how full it is, plus Navigate Here and View Details. Only
 * what the API carries is shown: no street address and no "run by <NGO>" (a shelter has only a managing-NGO id, and no public
 * route turns that into a name). Purely presentational.
 */
export function PlaceCard({ place, distanceMeters, onClose }: PlaceCardProps) {
  const subtitle = [place.typeLabel, distanceMeters !== null ? `${formatDistance(distanceMeters)} away` : null].filter(Boolean).join(' · ')
  const capacity = place.kind === 'shelter' ? capacityInfo(place.data) : null

  return (
    <section className="flex flex-col gap-3 border-b border-surface-border bg-surface-base px-5 py-4" aria-label={`${place.name} details`}>
      <div className="flex items-center gap-2">
        <Badge tone={BADGE_TONE[place.tone]}>{place.statusLabel}</Badge>
        {place.kind === 'shelter' && <CertificationBadge status={place.data.certification_status} />}
        <div className="flex-1" />
        <button type="button" onClick={onClose} aria-label="Close details" className="flex size-8 items-center justify-center rounded-full text-ink-500 hover:bg-surface-sunken">
          <XIcon size={16} />
        </button>
      </div>

      <div>
        <h2 className="font-heading text-h3 font-bold text-ink-900 [overflow-wrap:anywhere]">{place.name}</h2>
        <p className="mt-0.5 font-body text-body-sm text-ink-500">{subtitle}</p>
      </div>

      {capacity && <CapacityMeter info={capacity} />}

      {place.kind === 'infrastructure' && <p className="font-body text-body-sm text-ink-700">Status updated {ago(place.data.last_status_update)}.</p>}
      {place.kind === 'essential' && (
        <p className="font-body text-body-sm text-ink-700">
          {place.data.current_status && place.data.status_reported_at
            ? `Reported ${place.data.current_status} ${ago(place.data.status_reported_at)}.`
            : 'Nobody has reported whether this place is open yet.'}
        </p>
      )}

      {place.kind === 'shelter' && (
        <div className="flex gap-2">
          <Link to={`/app/navigate?destination_shelter_id=${place.id}`} className={cn(buttonVariants({ size: 'sm' }), 'h-10 flex-1 rounded-lg')}>
            <NavigationArrowIcon size={14} weight="bold" aria-hidden="true" />
            Navigate Here
          </Link>
          <Link to={`/app/map/shelters/${place.id}`} className={cn(buttonVariants({ variant: 'secondary', size: 'sm' }), 'h-10 flex-1 rounded-lg')}>
            View Details
          </Link>
        </div>
      )}
    </section>
  )
}
