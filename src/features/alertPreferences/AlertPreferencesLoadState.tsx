import { Button } from '@/components/ui/button'

export interface AlertPreferencesLoadStateProps {
  /** `null` while `GET /profile/alert-preferences` is in flight (skeleton); a message once it has failed. */
  error: string | null
  onRetry: () => void
}

/** Loading skeleton / load-failure card for /app/profile/alert-preferences. Purely presentational. */
export function AlertPreferencesLoadState({ error, onRetry }: AlertPreferencesLoadStateProps) {
  if (error) {
    return (
      <div className="max-w-140 rounded-md border border-surface-border bg-surface-raised p-6 md:p-8">
        <h1 className="font-heading text-h2 font-bold text-ink-900">Alert preferences</h1>
        <div role="alert" className="mt-4 rounded-sm border border-status-critical bg-status-critical-tint px-3.5 py-2.5 font-body text-body-sm text-ink-900">
          {error}
        </div>
        <Button type="button" variant="secondary" className="mt-4" onClick={onRetry}>
          Try again
        </Button>
      </div>
    )
  }

  return (
    <div className="flex max-w-140 flex-col gap-5" aria-busy="true" aria-label="Loading your alert preferences">
      <div aria-hidden="true">
        <div className="h-7 w-52 max-w-full animate-pulse rounded-sm bg-surface-sunken" />
        <div className="mt-3 h-4 w-full animate-pulse rounded-sm bg-surface-sunken" />
      </div>
      {[0, 1, 2].map((i) => (
        <div key={i} className="h-36 animate-pulse rounded-md bg-surface-sunken" aria-hidden="true" />
      ))}
    </div>
  )
}
