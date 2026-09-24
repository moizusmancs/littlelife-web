import { Button } from '@/components/ui/button'

export interface InvitationsLoadStateProps {
  /** `null` while `GET /volunteer-invitations` is in flight (skeleton); a message once it has
   *  failed. An empty list is NOT a failure — it's `[]` and handled as an empty state upstream. */
  error: string | null
  onRetry: () => void
}

/** Loading skeleton / load-failure card for /app/profile/invitations. Purely presentational. */
export function InvitationsLoadState({ error, onRetry }: InvitationsLoadStateProps) {
  if (error) {
    return (
      <div className="max-w-3xl rounded-md border border-surface-border bg-surface-raised p-6 md:p-8">
        <h1 className="font-heading text-h2 font-bold text-ink-900">Volunteer invitations</h1>
        <div
          role="alert"
          className="mt-4 rounded-sm border border-status-critical bg-status-critical-tint px-3.5 py-2.5 font-body text-body-sm text-ink-900"
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
    <div className="flex max-w-3xl flex-col gap-5" aria-busy="true" aria-label="Loading your invitations">
      <div aria-hidden="true">
        <div className="h-7 w-64 max-w-full animate-pulse rounded-sm bg-surface-sunken" />
        <div className="mt-3 h-4 w-full animate-pulse rounded-sm bg-surface-sunken" />
        <div className="mt-2 h-4 w-2/3 animate-pulse rounded-sm bg-surface-sunken" />
      </div>
      {[0, 1].map((i) => (
        <div
          key={i}
          className="flex items-center gap-4 rounded-md border border-surface-border bg-surface-raised p-4.5 sm:px-5"
          aria-hidden="true"
        >
          <div className="size-12 flex-none animate-pulse rounded-full bg-surface-sunken" />
          <div className="min-w-0 flex-1">
            <div className="h-5 w-48 max-w-full animate-pulse rounded-sm bg-surface-sunken" />
            <div className="mt-2 h-4 w-28 animate-pulse rounded-sm bg-surface-sunken" />
          </div>
        </div>
      ))}
    </div>
  )
}
