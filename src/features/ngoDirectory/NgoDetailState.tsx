import { Link } from 'react-router-dom'
import { Button } from '@/components/ui/button'

export interface NgoDetailStateProps {
  kind: 'loading' | 'not-found' | 'error'
  /** For `error`: the message to show. */
  message?: string
  onRetry: () => void
  backTo: string
}

/** The detail page before it has an organisation: skeleton, "no such organisation", or a failed load. */
export function NgoDetailState({ kind, message, onRetry, backTo }: NgoDetailStateProps) {
  if (kind === 'loading') {
    return (
      <div className="flex max-w-5xl flex-col gap-5" aria-busy="true" aria-label="Loading organisation">
        <div className="h-4 w-56 animate-pulse rounded-sm bg-surface-sunken" aria-hidden="true" />
        <div className="h-24 animate-pulse rounded-md bg-surface-sunken" aria-hidden="true" />
        <div className="grid gap-5 lg:grid-cols-2" aria-hidden="true">
          <div className="h-64 animate-pulse rounded-md bg-surface-sunken" />
          <div className="h-64 animate-pulse rounded-md bg-surface-sunken" />
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-5xl rounded-md border border-surface-border bg-surface-raised p-6">
      {kind === 'not-found' ? (
        <>
          <h1 className="font-heading text-h2 font-bold text-ink-900">Organisation not found</h1>
          <p className="mt-2 font-body text-body-md text-ink-500">
            There's no organisation with that ID. The link may be wrong.
          </p>
        </>
      ) : (
        <>
          <h1 className="font-heading text-h2 font-bold text-ink-900">Organisation</h1>
          <div
            role="alert"
            className="mt-4 rounded-sm border border-status-critical bg-status-critical-tint px-3.5 py-2.5 font-body text-body-sm text-ink-900"
          >
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
        <Link to={backTo} className="inline-flex h-11 items-center font-body text-label font-semibold text-primary-700 hover:underline">
          Back to NGOs
        </Link>
      </div>
    </div>
  )
}
