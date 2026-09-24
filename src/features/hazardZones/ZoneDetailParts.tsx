import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { format, parseISO } from 'date-fns'
import { ArrowLeftIcon, CheckCircleIcon } from '@phosphor-icons/react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import type { HazardZoneDetail } from '@/api/floodIntel'
import { RISK_LABEL, confidencePercent, probabilityToColor } from '@/features/map/floodColor'
import { riskTone } from '@/features/map/mapModel'
import { polygonFromGeometry, summarizePolygon } from '@/features/regions/geojson'
import { SOURCE_LABEL, shortId, zoneTitle } from './zoneModel'

const TONE = { critical: 'critical', caution: 'caution', safe: 'safe', neutral: 'info' } as const
const when = (iso: string) => format(parseISO(iso), 'd MMM yyyy, HH:mm')
const card = 'flex flex-col gap-3 rounded-md border border-surface-border bg-surface-raised p-5 shadow-sm'

/** Breadcrumb back to the table, the zone's title and badges, and **Resolve** — only while it is active. Purely presentational. */
export function ZoneDetailHeader({ zone, onResolve }: { zone: HazardZoneDetail; onResolve: () => void }) {
  return (
    <div className="flex flex-col gap-4">
      <Link to="/admin/hazard-zones" className="inline-flex h-8 w-fit items-center gap-1.5 font-body text-label font-semibold text-primary-700 hover:underline">
        <ArrowLeftIcon size={16} weight="bold" aria-hidden="true" />
        Hazard zones
      </Link>
      <div className="flex flex-col gap-4 rounded-md border border-surface-border bg-surface-raised p-5 shadow-sm md:flex-row md:items-center md:justify-between">
        <div className="min-w-0">
          <h1 className="font-heading text-h2 font-bold text-ink-900">{zoneTitle(zone)}</h1>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <Badge tone={TONE[riskTone(zone.risk_level)]}>{RISK_LABEL[zone.risk_level]} risk</Badge>
            <Badge tone="info">{SOURCE_LABEL[zone.source]}</Badge>
            <Badge tone={zone.status === 'active' ? 'critical' : 'safe'}>{zone.status === 'active' ? 'Active' : 'Resolved'}</Badge>
            <span className="font-body text-body-sm text-ink-500">#{shortId(zone.id)}</span>
          </div>
        </div>
        {zone.status === 'active' && (
          <Button type="button" variant="secondary" onClick={onResolve}>
            <CheckCircleIcon size={18} aria-hidden="true" />
            Resolve zone
          </Button>
        )}
      </div>
    </div>
  )
}

/** What the zone is: source, level, status, when it was detected and resolved, its id and the size of its outline. Purely presentational. */
export function ZoneFactsCard({ zone }: { zone: HazardZoneDetail }) {
  const polygon = polygonFromGeometry(zone.boundary)
  const rows: Array<[string, ReactNode]> = [
    ['Source', SOURCE_LABEL[zone.source]],
    ['Risk level', RISK_LABEL[zone.risk_level]],
    ['Status', zone.status === 'active' ? 'Active' : 'Resolved'],
    ['Detected', when(zone.detected_at)],
    ...(zone.resolved_at ? ([['Resolved', when(zone.resolved_at)]] as Array<[string, ReactNode]>) : []),
    ['Outline', polygon ? `A polygon of ${summarizePolygon(polygon).points} points` : 'Not a simple polygon'],
    ['Zone id', <span key="id" className="font-mono text-[12px] break-all">{zone.id}</span>],
  ]
  return (
    <section aria-labelledby="zone-facts-heading" className={card}>
      <h2 id="zone-facts-heading" className="font-heading text-h3 font-bold text-ink-900">
        Zone
      </h2>
      <dl className="flex flex-col gap-2 font-body text-body-sm">
        {rows.map(([label, value]) => (
          <div key={label} className="flex justify-between gap-4">
            <dt className="flex-none text-ink-500">{label}</dt>
            <dd className="text-end font-medium text-ink-900">{value}</dd>
          </div>
        ))}
      </dl>
    </section>
  )
}

/**
 * The prediction behind a model zone — its confidence (a bar on the map's own colour ramp), model version, the window it is valid for and
 * when it was generated. A declared zone has none of these, and says so, and who declared it is only known by role: the route the page reads doesn't
 * return the account. Purely presentational.
 */
export function ZonePredictionCard({ zone }: { zone: HazardZoneDetail }) {
  const model = zone.source === 'ai_prediction'
  const rows: Array<[string, string]> = [
    ...(zone.model_version ? ([['Model', zone.model_version]] as Array<[string, string]>) : []),
    ...(zone.valid_from && zone.valid_until ? ([['Valid', `${when(zone.valid_from)} – ${when(zone.valid_until)}`]] as Array<[string, string]>) : []),
    ...(zone.generated_at ? ([['Forecast made', when(zone.generated_at)]] as Array<[string, string]>) : []),
  ]
  return (
    <section aria-labelledby="zone-prediction-heading" className={card}>
      <h2 id="zone-prediction-heading" className="font-heading text-h3 font-bold text-ink-900">
        Prediction
      </h2>
      {typeof zone.confidence_score === 'number' ? (
        <div className="flex flex-col gap-1.5">
          <div className="flex justify-between font-body text-body-sm font-medium text-ink-900">
            <span>Model confidence</span>
            <span className="font-bold">{confidencePercent(zone.confidence_score)}%</span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-surface-sunken" role="progressbar" aria-label="Model confidence" aria-valuemin={0} aria-valuemax={100} aria-valuenow={confidencePercent(zone.confidence_score)}>
            <div className="h-full rounded-full" style={{ width: `${confidencePercent(zone.confidence_score)}%`, background: probabilityToColor(zone.confidence_score) }} />
          </div>
        </div>
      ) : (
        <p className="font-body text-body-sm text-ink-700">{model ? 'This zone has no prediction attached.' : `${SOURCE_LABEL[zone.source]} — there is no model prediction behind it, so it has no confidence.`}</p>
      )}
      {rows.length > 0 && (
        <dl className="flex flex-col gap-2 font-body text-body-sm">
          {rows.map(([label, value]) => (
            <div key={label} className="flex justify-between gap-4">
              <dt className="flex-none text-ink-500">{label}</dt>
              <dd className="text-end font-medium text-ink-900">{value}</dd>
            </div>
          ))}
        </dl>
      )}
    </section>
  )
}
