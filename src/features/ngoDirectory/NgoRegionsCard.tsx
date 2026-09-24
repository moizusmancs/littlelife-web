import { Link } from 'react-router-dom'
import { format, parseISO } from 'date-fns'
import { Button } from '@/components/ui/button'
import type { AdminNgoRegion } from '@/api/geo'
import { REGION_LEVEL_LABEL } from '@/features/regions/regionTree'

export interface NgoRegionsCardProps {
  /** The regions the organisation covers; `undefined` while they load. */
  regions: AdminNgoRegion[] | undefined
  error: string | null
  onRetry: () => void
}

/**
 * The organisation's operational regions, read-only (`GET /admin/ngos/{id}/regions`) — the list
 * form of the mockup's regions map, which needs Phase 3's shared map component. Each region links to
 * its Regions page, shows its level, where it sits (the API supplies the full path, so no region list
 * has to be loaded to find parents) and when it was assigned. An admin can't change an
 * organisation's coverage from here — the API only lets the NGO's own admin do that. Purely
 * presentational.
 */
export function NgoRegionsCard({ regions, error, onRetry }: NgoRegionsCardProps) {
  return (
    <section className="rounded-md border border-surface-border bg-surface-raised p-5 shadow-sm" aria-labelledby="ngo-regions-heading">
      <h2 id="ngo-regions-heading" className="font-heading text-h3 font-bold text-ink-900">
        Operational regions
        {regions && regions.length > 0 && <span className="ms-1.5 font-body text-body-md font-normal text-ink-500">{regions.length}</span>}
      </h2>

      {error ? (
        <div className="mt-3">
          <p role="alert" className="font-body text-body-sm text-status-critical">
            {error}
          </p>
          <Button type="button" variant="secondary" size="sm" className="mt-3" onClick={onRetry}>
            Try again
          </Button>
        </div>
      ) : !regions ? (
        <div className="mt-4 flex flex-col gap-3" aria-busy="true" aria-label="Loading regions">
          {[0, 1].map((i) => (
            <div key={i} className="h-10 animate-pulse rounded-sm bg-surface-sunken" aria-hidden="true" />
          ))}
        </div>
      ) : regions.length === 0 ? (
        <p className="mt-3 font-body text-body-md text-ink-500">This organisation doesn't cover any region yet.</p>
      ) : (
        <ul className="mt-3 divide-y divide-surface-border">
          {regions.map((region) => (
            <li key={region.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 py-3 first:pt-1">
              <div className="min-w-0 flex-1 basis-56">
                <Link to={`/admin/regions/${region.id}`} className="font-body text-body-md font-semibold text-primary-700 [overflow-wrap:anywhere] hover:underline">
                  {region.name}
                </Link>
                <p className="font-body text-body-sm text-ink-500 [overflow-wrap:anywhere]">
                  {REGION_LEVEL_LABEL[region.level]}
                  {region.path !== region.name && ` · ${region.path}`}
                </p>
              </div>
              <span className="font-body text-body-sm text-ink-500">Assigned {format(parseISO(region.assigned_at), 'd MMM yyyy')}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
