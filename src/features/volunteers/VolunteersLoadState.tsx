import { Button } from '@/components/ui/button'

export interface VolunteersLoadStateProps {
  /** `null` while `GET /ngo/volunteers` is in flight (skeleton rows); a message once it has
   *  failed. An empty roster is NOT a failure — it's `[]`, handled as its own empty state. */
  error: string | null
  onRetry: () => void
}

/** Loading skeleton / load-failure card for the roster area of /ngo/volunteers. Purely
 *  presentational; the page header stays put around it so Invite is usable either way. */
export function VolunteersLoadState({ error, onRetry }: VolunteersLoadStateProps) {
  if (error) {
    return (
      <div className="rounded-md border border-surface-border bg-surface-raised p-6">
        <div
          role="alert"
          className="rounded-sm border border-status-critical bg-status-critical-tint px-3.5 py-2.5 font-body text-body-sm text-ink-900"
        >
          {error}
        </div>
        <Button type="button" variant="secondary" className="mt-4" onClick={onRetry}>
          Try again
        </Button>
      </div>
    )
  }

  return (
    <div
      className="overflow-hidden rounded-md border border-surface-border bg-surface-raised"
      aria-busy="true"
      aria-label="Loading your volunteers"
    >
      {[0, 1, 2].map((i) => (
        <div
          key={i}
          className="flex items-center gap-3 border-b border-surface-border px-4 py-3.5 last:border-b-0 md:px-5"
          aria-hidden="true"
        >
          <div className="size-9 flex-none animate-pulse rounded-full bg-surface-sunken" />
          <div className="h-4 w-56 max-w-full animate-pulse rounded-sm bg-surface-sunken" />
        </div>
      ))}
    </div>
  )
}
