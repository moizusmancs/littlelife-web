import { format, formatDistanceToNowStrict, parseISO } from 'date-fns'
import { XIcon } from '@phosphor-icons/react'
import type { HazardSource, HazardZoneDetail, MapOverlayEntry } from '@/api/floodIntel'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { confidencePercent, probabilityToColor, RISK_LABEL } from './floodColor'
import { hazardTitle, riskTone } from './mapModel'

export interface HazardCardProps {
  entry: MapOverlayEntry
  /** The tooltip-shape detail (`GET /hazard-zones/{id}`) — model version, validity window; `undefined` until it loads. */
  detail: HazardZoneDetail | undefined
  detailLoading: boolean
  detailError: boolean
  onClose: () => void
  onZoom: () => void
}

const SOURCE: Record<HazardSource, string> = { ai_prediction: 'Model forecast', manual_admin: 'Declared by an admin', manual_ngo: 'Declared by an NGO' }
const BADGE_TONE = { critical: 'critical', caution: 'caution', safe: 'safe', neutral: 'info' } as const
const when = (iso: string) => format(parseISO(iso), 'd MMM, HH:mm')

/**
 * A selected hazard zone: its level, whether a model or a person made it, how sure the model is (with a bar on the same
 * colour ramp as the map), and — once the detail loads — the model version and the window the forecast is valid for.
 * The overview fields come from the overlay entry, so the card is useful immediately and only the extras wait; if the detail
 * fails it says so and keeps what it has. "Confidence" is the model's confidence in this zone's risk level, not how much of
 * the zone is flooded. Purely presentational.
 */
export function HazardCard({ entry, detail, detailLoading, detailError, onClose, onZoom }: HazardCardProps) {
  const confidence = entry.confidence_score
  const sourceLabel = detail ? SOURCE[detail.source] : typeof confidence === 'number' ? SOURCE.ai_prediction : 'Declared by staff'

  return (
    <section className="flex flex-col gap-3 border-b border-surface-border bg-surface-base px-5 py-4" aria-label="Hazard zone details">
      <div className="flex items-center gap-2">
        <Badge tone={BADGE_TONE[riskTone(entry.risk_level)]}>{RISK_LABEL[entry.risk_level]} risk</Badge>
        <Badge tone="info">{sourceLabel}</Badge>
        <div className="flex-1" />
        <button type="button" onClick={onClose} aria-label="Close details" className="flex size-8 items-center justify-center rounded-full text-ink-500 hover:bg-surface-sunken">
          <XIcon size={16} />
        </button>
      </div>

      <div>
        <h2 className="font-heading text-h3 font-bold text-ink-900">{hazardTitle(entry)}</h2>
        <p className="mt-0.5 font-body text-body-sm text-ink-500">Detected {formatDistanceToNowStrict(parseISO(entry.detected_at), { addSuffix: true })}</p>
      </div>

      {typeof confidence === 'number' && (
        <div className="flex flex-col gap-1.5">
          <div className="flex justify-between font-body text-body-sm font-medium text-ink-900">
            <span>Model confidence</span>
            <span className="font-bold">{confidencePercent(confidence)}%</span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-surface-sunken" role="progressbar" aria-label="Model confidence" aria-valuemin={0} aria-valuemax={100} aria-valuenow={confidencePercent(confidence)}>
            <div className="h-full rounded-full" style={{ width: `${confidencePercent(confidence)}%`, background: probabilityToColor(confidence) }} />
          </div>
        </div>
      )}

      {detail && (detail.model_version || detail.valid_from) && (
        <dl className="flex flex-col gap-1 font-body text-body-sm text-ink-700">
          {detail.model_version && (
            <div className="flex justify-between gap-3">
              <dt className="text-ink-500">Model</dt>
              <dd className="font-medium">{detail.model_version}</dd>
            </div>
          )}
          {detail.valid_from && detail.valid_until && (
            <div className="flex justify-between gap-3">
              <dt className="text-ink-500">Valid</dt>
              <dd className="text-end font-medium">
                {when(detail.valid_from)} – {when(detail.valid_until)}
              </dd>
            </div>
          )}
          {detail.generated_at && (
            <div className="flex justify-between gap-3">
              <dt className="text-ink-500">Forecast made</dt>
              <dd className="font-medium">{when(detail.generated_at)}</dd>
            </div>
          )}
        </dl>
      )}
      {detailLoading && <p className="font-body text-body-sm text-ink-500">Loading forecast details…</p>}
      {detailError && <p className="font-body text-body-sm text-ink-500">Forecast details couldn't be loaded.</p>}

      <Button type="button" variant="secondary" size="sm" className="h-10 rounded-lg" onClick={onZoom}>
        Zoom to zone
      </Button>
    </section>
  )
}
