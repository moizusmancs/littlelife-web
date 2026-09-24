import { WarningIcon } from '@phosphor-icons/react'
import type { RiskCheckResult } from '@/api/floodIntel'
import { Button } from '@/components/ui/button'
import { RISK_LABEL } from './floodColor'
import { formatDistance } from './mapGeo'
import type { LocationStatus } from './useGeolocation'

export interface LocationNoteProps {
  status: LocationStatus
  risk: { isPending: boolean; isError: boolean; data: RiskCheckResult | undefined }
  onShowZone: (hazardZoneId: string) => void
}

const box = 'mx-5 mt-3 rounded-md border px-3.5 py-3 font-body text-body-sm text-ink-900'

const DENIED = "Location is blocked for this site. Allow it in your browser's site settings to see where you are and whether a hazard is near."

/**
 * What the browser said about the viewer's position, in plain words — "Finding your location…", blocked, no fix, no
 * support — and nothing at all before anyone has asked or once there is a position. `deniedText` lets a screen say what
 * the blocked permission costs *it* (the shelter page: the distance). Purely presentational.
 */
export function LocationStatusNote({ status, deniedText = DENIED, className = box }: { status: LocationStatus; deniedText?: string; className?: string }) {
  if (status === 'locating') return <p role="status" className={`${className} border-surface-border bg-surface-sunken`}>Finding your location…</p>
  if (status === 'denied') return <p role="status" className={`${className} border-status-caution bg-status-caution-tint`}>{deniedText}</p>
  if (status === 'unavailable') return <p role="status" className={`${className} border-status-caution bg-status-caution-tint`}>Couldn't get your location. Try the location button again.</p>
  if (status === 'unsupported') return <p role="status" className={`${className} border-surface-border bg-surface-sunken`}>This browser can't share its location.</p>
  return null
}

/**
 * What the pane says about the viewer's own position once they have pressed "Go to my location": the browser's answer
 * (denied / unavailable / unsupported are each their own plain sentence) and then the *server's* risk check for it — inside
 * a zone, how far the nearest active one is, or that there is none anywhere. The server computes this; nothing here
 * decides whether someone is in danger. A "Show zone" button jumps to the zone the answer names. Renders nothing before
 * anyone has asked for their location. Purely presentational.
 */
export function LocationNote({ status, risk, onShowZone }: LocationNoteProps) {
  if (status === 'idle') return null
  if (status !== 'ready') return <LocationStatusNote status={status} />

  if (risk.isPending) return <p role="status" className={`${box} border-surface-border bg-surface-sunken`}>Checking your surroundings…</p>
  if (risk.isError || !risk.data) return <p role="status" className={`${box} border-status-caution bg-status-caution-tint`}>Couldn't check hazards near you.</p>

  const { data } = risk
  const zoneId = data.hazard_zone_id
  const level = data.risk_level ? RISK_LABEL[data.risk_level].toLowerCase() : null
  const show = zoneId ? (
    <Button type="button" variant="secondary" size="sm" className="mt-2" onClick={() => onShowZone(zoneId)}>
      Show zone
    </Button>
  ) : null

  if (data.inside_hazard_zone) {
    return (
      <div role="status" className={`${box} border-status-critical bg-status-critical-tint`}>
        <p className="flex items-center gap-1.5 font-semibold">
          <WarningIcon size={16} weight="fill" className="text-status-critical" aria-hidden="true" />
          You're inside {level ? `a ${level}-risk` : 'an active'} hazard zone.
        </p>
        {show}
      </div>
    )
  }
  if (zoneId) {
    return (
      <div role="status" className={`${box} border-surface-border bg-surface-raised`}>
        <p>
          The nearest active hazard is <span className="font-semibold">{formatDistance(data.distance_meters)}</span> away{level ? ` (${level} risk)` : ''}.
        </p>
        {show}
      </div>
    )
  }
  return <p role="status" className={`${box} border-status-safe bg-status-safe-tint`}>No active hazards are reported anywhere right now.</p>
}
