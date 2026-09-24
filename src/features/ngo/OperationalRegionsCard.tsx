import { PlusIcon, XIcon } from '@phosphor-icons/react'
import { Button } from '@/components/ui/button'
import type { Region } from '@/api/geo'
import { REGION_LEVEL_LABEL } from '@/features/regions/regionTree'

export interface OperationalRegionsCardProps {
  /** The regions the organisation covers; `undefined` while they load. */
  regions: Region[] | undefined
  /** Why they couldn't be loaded, if they couldn't. */
  error: string | null
  onRetry: () => void
  onAdd: () => void
  onRemove: (region: Region) => void
}

/**
 * Batch 4 NGO §4l's "Operational regions" row: the regions this organisation covers as removable
 * chips, and a way to add one. Unlike the mockup (which says NDMA assigns them), the API lets an
 * NGO's own admin add and remove coverage, so that is what's offered. A region can be any level, so
 * a chip carries its level. The list is the organisation's own coverage only — there's no route that
 * shows which NGOs cover a region. Purely presentational.
 */
export function OperationalRegionsCard({ regions, error, onRetry, onAdd, onRemove }: OperationalRegionsCardProps) {
  return (
    <section className="rounded-md border border-surface-border bg-surface-raised p-5 shadow-sm" aria-labelledby="operational-regions-heading">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 id="operational-regions-heading" className="font-heading text-h3 font-bold text-ink-900">
            Operational regions
          </h2>
          <p className="mt-1 font-body text-body-sm text-ink-500">The provinces, districts and tehsils your organisation covers.</p>
        </div>
        {regions && (
          <Button type="button" variant="secondary" size="sm" className="flex-none" onClick={onAdd}>
            <PlusIcon size={14} weight="bold" aria-hidden="true" />
            Add region
          </Button>
        )}
      </div>

      {error ? (
        <div className="mt-4">
          <div role="alert" className="rounded-sm border border-status-critical bg-status-critical-tint px-3.5 py-2.5 font-body text-body-sm text-ink-900">
            {error}
          </div>
          <Button type="button" variant="secondary" size="sm" className="mt-3" onClick={onRetry}>
            Try again
          </Button>
        </div>
      ) : !regions ? (
        <div className="mt-4 flex gap-2" aria-busy="true" aria-label="Loading regions">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-9 w-28 animate-pulse rounded-full bg-surface-sunken" aria-hidden="true" />
          ))}
        </div>
      ) : regions.length === 0 ? (
        <p className="mt-4 font-body text-body-md text-ink-500">No regions yet. Add the areas your organisation works in.</p>
      ) : (
        <ul className="mt-4 flex flex-wrap gap-2">
          {regions.map((region) => (
            <li key={region.id} className="inline-flex min-h-9 max-w-full items-center gap-1.5 rounded-full border border-surface-border bg-surface-sunken ps-3.5 pe-1">
              <span className="min-w-0 font-body text-label font-semibold text-ink-900 [overflow-wrap:anywhere]">{region.name}</span>
              <span className="flex-none font-body text-body-sm text-ink-500">{REGION_LEVEL_LABEL[region.level]}</span>
              <button
                type="button"
                onClick={() => onRemove(region)}
                aria-label={`Remove ${region.name}`}
                className="flex size-7 flex-none items-center justify-center rounded-full text-ink-500 hover:bg-surface-border hover:text-ink-900"
              >
                <XIcon size={12} weight="bold" aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
