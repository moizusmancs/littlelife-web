import { Link } from 'react-router-dom'
import { formatDistanceToNowStrict, parseISO } from 'date-fns'
import { CheckCircleIcon, MapPinIcon } from '@phosphor-icons/react'
import { Badge } from '@/components/ui/badge'
import type { AdminHazardZone } from '@/api/floodIntel'
import { RISK_COLOR } from '@/features/map/floodColor'
import { SOURCE_LABEL, shortId, zoneTitle } from './zoneModel'

export interface ZoneListProps {
  zones: readonly AdminHazardZone[]
  /** The zone the map was last pointed at. */
  focusedId: string | null
  onShowOnMap: (zone: AdminHazardZone) => void
  onResolve: (zone: AdminHazardZone) => void
}

const ago = (iso: string) => formatDistanceToNowStrict(parseISO(iso), { addSuffix: true })
const icon = 'flex size-8 flex-none items-center justify-center rounded-full text-ink-500 hover:bg-surface-sunken hover:text-ink-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-500'

/**
 * The admin's zones, one row each: risk colour, what it is (a link to its page), who made it and when, its status, and two actions —
 * point the map at it, and (for an active one) resolve it. Rows with the same title are told apart by the start of their id. Purely presentational.
 */
export function ZoneList({ zones, focusedId, onShowOnMap, onResolve }: ZoneListProps) {
  return (
    <ul aria-label="Hazard zones">
      {zones.map((zone) => {
        const title = zoneTitle(zone)
        const id = shortId(zone.id)
        return (
          <li key={zone.id} aria-current={zone.id === focusedId ? 'true' : undefined} className={`flex items-center gap-3 border-b border-surface-border px-4 py-3 last:border-b-0 ${zone.id === focusedId ? 'bg-primary-50' : ''}`}>
            <span className="size-3 flex-none rounded-xs" style={{ background: RISK_COLOR[zone.risk_level] }} aria-hidden="true" />
            <div className="min-w-0 flex-1">
              <Link to={`/admin/hazard-zones/${zone.id}`} className="block font-body text-body-md font-semibold text-ink-900 [overflow-wrap:anywhere] hover:text-primary-700 hover:underline">
                {title}
              </Link>
              <p className="font-body text-body-sm text-ink-500">
                {SOURCE_LABEL[zone.source]} · detected {ago(zone.detected_at)}
                {zone.resolved_at ? ` · resolved ${ago(zone.resolved_at)}` : ''} · #{id}
              </p>
            </div>
            <Badge tone={zone.status === 'active' ? 'critical' : 'safe'}>{zone.status === 'active' ? 'Active' : 'Resolved'}</Badge>
            <button type="button" className={icon} aria-label={`Show ${title} ${id} on the map`} onClick={() => onShowOnMap(zone)}>
              <MapPinIcon size={18} aria-hidden="true" />
            </button>
            {zone.status === 'active' && (
              <button type="button" className={icon} aria-label={`Resolve ${title} ${id}`} onClick={() => onResolve(zone)}>
                <CheckCircleIcon size={18} aria-hidden="true" />
              </button>
            )}
          </li>
        )
      })}
    </ul>
  )
}
