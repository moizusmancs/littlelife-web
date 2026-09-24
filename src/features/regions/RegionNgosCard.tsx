import { Link } from 'react-router-dom'
import { format, parseISO } from 'date-fns'
import { Button } from '@/components/ui/button'
import { getInitials } from '@/lib/utils'
import type { RegionNgo } from '@/api/geo'
import { NgoStatusBadge } from '@/features/ngoDirectory/NgoStatusBadge'

export interface RegionNgosCardProps {
  /** The organisations assigned to this region; `undefined` while they load. */
  ngos: RegionNgo[] | undefined
  error: string | null
  onRetry: () => void
}

/**
 * "Assigned NGOs" from Batch 5 §5f, read-only: the organisations that explicitly cover this region
 * (`GET /admin/regions/{id}/ngos`), each linking to its page with its status, how many regions it
 * covers in all, how many volunteers it has, and when *this* region was assigned. **Direct
 * assignments only** — an organisation assigned to a parent region isn't listed under its children,
 * and the card says so, because an empty list here doesn't mean nobody can act in the region. The
 * mockup's "+ Assign" and remove buttons aren't built: the API only lets an NGO's own admin change
 * its coverage. Purely presentational.
 */
export function RegionNgosCard({ ngos, error, onRetry }: RegionNgosCardProps) {
  return (
    <section className="rounded-md border border-surface-border bg-surface-raised p-5 shadow-sm" aria-labelledby="region-ngos-heading">
      <h3 id="region-ngos-heading" className="font-heading text-h3 font-bold text-ink-900">
        NGOs covering this region
        {ngos && ngos.length > 0 && <span className="ms-1.5 font-body text-body-md font-normal text-ink-500">{ngos.length}</span>}
      </h3>
      <p className="mt-1 font-body text-body-sm text-ink-500">
        Organisations assigned to this exact region. One assigned to a parent region isn't listed here.
      </p>

      {error ? (
        <div className="mt-3">
          <p role="alert" className="font-body text-body-sm text-status-critical">
            {error}
          </p>
          <Button type="button" variant="secondary" size="sm" className="mt-3" onClick={onRetry}>
            Try again
          </Button>
        </div>
      ) : !ngos ? (
        <div className="mt-4 flex flex-col gap-3" aria-busy="true" aria-label="Loading organisations">
          {[0, 1].map((i) => (
            <div key={i} className="h-12 animate-pulse rounded-sm bg-surface-sunken" aria-hidden="true" />
          ))}
        </div>
      ) : ngos.length === 0 ? (
        <p className="mt-3 font-body text-body-md text-ink-500">No organisation has been assigned to this region.</p>
      ) : (
        <ul className="mt-3 divide-y divide-surface-border">
          {ngos.map((ngo) => (
            <li key={ngo.id} className="flex items-center gap-3 py-3 first:pt-1">
              <div
                className="flex size-10 flex-none items-center justify-center rounded-lg bg-status-trust-tint font-heading text-label font-bold text-status-trust"
                aria-hidden="true"
              >
                {getInitials(ngo.name) || '?'}
              </div>
              <div className="min-w-0 flex-1">
                <Link to={`/admin/ngos/${ngo.id}`} className="font-body text-body-md font-semibold text-primary-700 [overflow-wrap:anywhere] hover:underline">
                  {ngo.name}
                </Link>
                <p className="font-body text-body-sm text-ink-500">
                  Assigned {format(parseISO(ngo.assigned_at), 'd MMM yyyy')} · covers {ngo.region_count} {ngo.region_count === 1 ? 'region' : 'regions'} ·{' '}
                  {ngo.volunteer_count} {ngo.volunteer_count === 1 ? 'volunteer' : 'volunteers'}
                </p>
              </div>
              <NgoStatusBadge status={ngo.status} />
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
