import { Button } from '@/components/ui/button'

export interface MyNgoLoadStateProps {
  /** `null` while `GET /ngos/mine` is still in flight (skeleton); a message once it has failed
   *  for a real reason — a `404` is NOT a failure here (it means "never submitted", handled
   *  upstream as an empty state), so this only ever shows 401/403/network errors. */
  error: string | null
  onRetry: () => void
}

/** Loading skeleton / load-failure card for /app/profile/ngo. Purely presentational. */
export function MyNgoLoadState({ error, onRetry }: MyNgoLoadStateProps) {
  if (error) {
    return (
      <div className="max-w-140 rounded-md border border-surface-border bg-surface-raised p-6 md:p-8">
        <h1 className="font-heading text-h2 font-bold text-ink-900">My NGO</h1>
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
    <div
      className="max-w-140 rounded-md border border-surface-border bg-surface-raised p-6 md:p-8"
      aria-busy="true"
      aria-label="Loading your NGO registration"
    >
      <div className="flex items-start gap-4">
        <div className="size-11 flex-none animate-pulse rounded-full bg-surface-sunken" aria-hidden="true" />
        <div className="min-w-0 flex-1">
          <div className="h-5 w-48 max-w-full animate-pulse rounded-sm bg-surface-sunken" aria-hidden="true" />
          <div className="mt-3 h-4 w-full animate-pulse rounded-sm bg-surface-sunken" aria-hidden="true" />
          <div className="mt-2 h-4 w-3/4 animate-pulse rounded-sm bg-surface-sunken" aria-hidden="true" />
        </div>
      </div>
    </div>
  )
}
