import { Link } from 'react-router-dom'
import { Button } from '@/components/ui/button'

export interface ShelterDetailStateProps {
  kind: 'loading' | 'not-found' | 'error'
  /** For `error`: the message to show. */
  message?: string
  onRetry: () => void
  /** Where "back" goes — the map by default; the organisation's page points it at its own list. */
  back?: { to: string; label: string }
}

/** The shelter page before it has a shelter: skeleton, "no such shelter", or a failed load. Purely presentational. */
export function ShelterDetailState({ kind, message, onRetry, back = { to: '/app/map', label: 'Back to map' } }: ShelterDetailStateProps) {
  if (kind === 'loading') {
    return (
      <div className="mx-auto flex max-w-5xl flex-col gap-5" aria-busy="true" aria-label="Loading shelter">
        <div className="h-4 w-28 animate-pulse rounded-sm bg-surface-sunken" aria-hidden="true" />
        <div className="h-64 animate-pulse rounded-md bg-surface-sunken" aria-hidden="true" />
        <div className="grid gap-5 lg:grid-cols-3" aria-hidden="true">
          <div className="h-72 animate-pulse rounded-md bg-surface-sunken lg:col-span-2" />
          <div className="h-72 animate-pulse rounded-md bg-surface-sunken" />
        </div>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-5xl rounded-md border border-surface-border bg-surface-raised p-6">
      {kind === 'not-found' ? (
        <>
          <h1 className="font-heading text-h2 font-bold text-ink-900">Shelter not found</h1>
          <p className="mt-2 font-body text-body-md text-ink-500">There's no shelter with that ID. The link may be wrong, or the shelter may have been removed.</p>
        </>
      ) : (
        <>
          <h1 className="font-heading text-h2 font-bold text-ink-900">Shelter</h1>
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
        <Link to={back.to} className="inline-flex h-11 items-center font-body text-label font-semibold text-primary-700 hover:underline">
          {back.label}
        </Link>
      </div>
    </div>
  )
}
