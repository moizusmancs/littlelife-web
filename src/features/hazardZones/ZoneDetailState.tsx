import { Link } from 'react-router-dom'
import { Button } from '@/components/ui/button'

/** The zone page before it has a zone: skeleton, "no such zone", or a failed load. Purely presentational. */
export function ZoneDetailState({ kind, message, onRetry }: { kind: 'loading' | 'not-found' | 'error'; message?: string; onRetry: () => void }) {
  if (kind === 'loading') {
    return (
      <div className="flex max-w-5xl flex-col gap-5" aria-busy="true" aria-label="Loading hazard zone">
        <div className="h-4 w-28 animate-pulse rounded-sm bg-surface-sunken" aria-hidden="true" />
        <div className="h-24 animate-pulse rounded-md bg-surface-sunken" aria-hidden="true" />
        <div className="grid gap-5 md:grid-cols-2" aria-hidden="true">
          <div className="h-72 animate-pulse rounded-md bg-surface-sunken" />
          <div className="h-72 animate-pulse rounded-md bg-surface-sunken" />
        </div>
      </div>
    )
  }
  return (
    <div className="max-w-5xl rounded-md border border-surface-border bg-surface-raised p-6">
      {kind === 'not-found' ? (
        <>
          <h1 className="font-heading text-h2 font-bold text-ink-900">Hazard zone not found</h1>
          <p className="mt-2 font-body text-body-md text-ink-500">There's no hazard zone with that ID. The link may be wrong.</p>
        </>
      ) : (
        <>
          <h1 className="font-heading text-h2 font-bold text-ink-900">Hazard zone</h1>
          <div role="alert" className="mt-4 rounded-sm border border-status-critical bg-status-critical-tint px-3.5 py-2.5 font-body text-body-sm text-ink-900">
            {message}
          </div>
        </>
      )}
      <div className="mt-4 flex flex-wrap gap-3">
        {kind === 'error' && (
          <Button type="button" variant="secondary" onClick={onRetry}>
            Try again
          </Button>
        )}
        <Link to="/admin/hazard-zones" className="inline-flex h-11 items-center font-body text-label font-semibold text-primary-700 hover:underline">
          Back to hazard zones
        </Link>
      </div>
    </div>
  )
}
